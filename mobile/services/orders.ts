// services/orders.ts — Order service: the heart of the sync contract.
//
// GOLDEN RULES enforced here:
// 1. One order document = single source of truth.
// 4. Every state change is ONE batch: order update + statusHistory + notifications + stats.
// 5. Orders store snapshots — customer/agent info never changes on existing orders.
// 6. Items are soft-deleted only; this service uses item snapshots, not live data.

import {
  collection, doc, getDoc, onSnapshot, runTransaction,
  writeBatch, serverTimestamp, query, where, orderBy,
  limit, increment, Unsubscribe, Timestamp, addDoc, updateDoc,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type {
  Order, OrderStatus, OrderItem, Actor,
  AddressSnapshot, OrderSlot, OrderSource,
  AppNotification, NotificationType,
} from '../types';

const ORDERS_COL       = 'orders';
const COUNTERS_COL     = 'counters';
const NOTIFICATIONS_COL = 'notifications';
const STATS_COL        = 'stats_daily';

// ─── Status Machine ──────────────────────────────────────────────────────────
//
// Valid transitions per actor role:
// customer: placed → cancelled
// admin:    placed → packed, placed → cancelled, packed → cancelled, packed → out_for_delivery (via agent)
// agent:    packed → out_for_delivery, out_for_delivery → delivered
//
// Note: admin assigns agent separately via assignAgent() which does NOT change status.

type Transition = {
  from:        OrderStatus[];
  to:          OrderStatus;
  allowedRoles: Actor['role'][];
};

const TRANSITIONS: Transition[] = [
  { from: ['placed'],           to: 'packed',           allowedRoles: ['admin'] },
  { from: ['placed', 'packed'], to: 'out_for_delivery', allowedRoles: ['agent'] },
  { from: ['out_for_delivery'], to: 'delivered',        allowedRoles: ['agent'] },
  { from: ['placed', 'packed'], to: 'cancelled',        allowedRoles: ['customer', 'admin'] },
];

function validateTransition(from: OrderStatus, to: OrderStatus, actor: Actor): void {
  const match = TRANSITIONS.find(
    t => t.to === to && t.from.includes(from) && t.allowedRoles.includes(actor.role),
  );
  if (!match) {
    throw new Error(
      `Invalid transition: ${from} → ${to} by role ${actor.role}`,
    );
  }
}

// ─── Notification helpers ─────────────────────────────────────────────────────

function notifDoc(
  toUid: string,
  toRole: Actor['role'],
  type: NotificationType,
  orderId: string,
  title: string,
  body: string,
): Omit<AppNotification, 'id'> {
  return { toUid, toRole, type, orderId, title, body, read: false, createdAt: Timestamp.now() };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** One-shot get */
export async function getOrder(orderId: string): Promise<Order | null> {
  const snap = await getDoc(doc(db, ORDERS_COL, orderId));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Order) : null;
}

/** Live listener for a single order */
export function listenOrder(
  orderId: string,
  onData: (order: Order | null) => void,
  onError: (e: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, ORDERS_COL, orderId),
    snap => onData(snap.exists() ? ({ id: snap.id, ...snap.data() } as Order) : null),
    onError,
  );
}

function sortOrdersDesc(orders: Order[]): Order[] {
  return orders.sort((a, b) => {
    const tA = (a.createdAt as any)?.seconds ?? (a.createdAt ? new Date(a.createdAt as any).getTime() / 1000 : 0);
    const tB = (b.createdAt as any)?.seconds ?? (b.createdAt ? new Date(b.createdAt as any).getTime() / 1000 : 0);
    return tB - tA;
  });
}

/** Live listener for customer's orders */
export function listenCustomerOrders(
  customerId: string,
  onData: (orders: Order[]) => void,
  onError: (e: Error) => void,
  maxCount = 50,
): Unsubscribe {
  const q = query(
    collection(db, ORDERS_COL),
    where('customerId', '==', String(customerId)),
  );
  return onSnapshot(
    q,
    snap => {
      const orders = snap.docs.map(d => ({ id: d.id, ...d.data() } as Order));
      onData(sortOrdersDesc(orders).slice(0, maxCount));
    },
    onError,
  );
}

/** Live listener for agent's orders */
export function listenAgentOrders(
  agentId: string,
  onData: (orders: Order[]) => void,
  onError: (e: Error) => void,
): Unsubscribe {
  const q = query(
    collection(db, ORDERS_COL),
    where('agentId', '==', String(agentId)),
  );
  return onSnapshot(
    q,
    snap => {
      const orders = snap.docs.map(d => ({ id: d.id, ...d.data() } as Order));
      onData(sortOrdersDesc(orders).slice(0, 100));
    },
    onError,
  );
}

/** Admin: live listener for all orders with optional status filter */
export function listenAdminOrders(
  onData: (orders: Order[]) => void,
  onError: (e: Error) => void,
  statusFilter?: OrderStatus,
  maxCount = 200,
): Unsubscribe {
  const q = statusFilter
    ? query(
        collection(db, ORDERS_COL),
        where('status', '==', statusFilter),
      )
    : query(
        collection(db, ORDERS_COL),
        orderBy('createdAt', 'desc'),
        limit(maxCount),
      );
  return onSnapshot(
    q,
    snap => {
      const orders = snap.docs.map(d => ({ id: d.id, ...d.data() } as Order));
      onData(sortOrdersDesc(orders).slice(0, maxCount));
    },
    onError,
  );
}

/**
 * Create a new order.
 * Uses a transaction to atomically:
 *   1. Increment counters/orders.next → AS-XXXX orderNo
 *   2. Write the order document with item/address/customer snapshots
 *   3. Write placed notification for admin
 * Sync matrix: row 4
 */
export async function createOrder(params: {
  actor:           Actor;
  items:           OrderItem[];
  addressSnapshot: AddressSnapshot;
  customerName:    string;
  customerPhone:   string;
  subtotal:        number;
  deliveryFee:     number;
  total:           number;
  slot:            OrderSlot;
  notes:           string;
  source:          OrderSource;
  adminUid?:       string;    // required for admin_manual
  // can-recovery extension
  type?:               'order' | 'recovery';
  pendingCansToCollect?: number;
}): Promise<string> {
  const counterRef = doc(db, COUNTERS_COL, 'orders');
  const ordersRef  = collection(db, ORDERS_COL);

  return runTransaction(db, async tx => {
    const counterSnap = await tx.get(counterRef);
    const next: number = counterSnap.exists() ? (counterSnap.data().next as number) : 1000;
    const orderNo = `AS-${next}`;

    tx.set(counterRef, { next: next + 1 }, { merge: true });

    const newOrderRef = doc(ordersRef);
    const now = Timestamp.now();

    const orderData: Omit<Order, 'id'> = {
      orderNo,
      customerId:      params.actor.uid,
      customerName:    params.customerName,
      customerPhone:   params.customerPhone,
      addressSnapshot: params.addressSnapshot,
      items:           params.items,
      subtotal:        params.subtotal,
      deliveryFee:     params.deliveryFee,
      total:           params.total,
      paymentMethod:   'COD',
      slot:            params.slot,
      notes:           params.notes,
      status:          'placed',
      agentId:         null,
      agentName:       null,
      agentPhone:      null,
      agentFee:        null,
      source:          params.source,
      cancelReason:    null,
      cancelledBy:     null,
      statusHistory:   [{ status: 'placed', at: now, byUid: params.actor.uid, byRole: params.actor.role }],
      createdAt:       now,
      updatedAt:       now,
      packedAt:        null,
      pickedUpAt:      null,
      deliveredAt:     null,
      cancelledAt:     null,
      ...(params.type === 'recovery' ? { type: 'recovery', pendingCansToCollect: params.pendingCansToCollect ?? 0 } : { type: 'order' }),
    };

    tx.set(newOrderRef, orderData);

    // Notify admin (row 4)
    const notifRef = doc(collection(db, NOTIFICATIONS_COL));
    tx.set(notifRef, notifDoc(
      params.adminUid ?? 'admin',
      'admin',
      'order_placed',
      newOrderRef.id,
      `New order ${orderNo}`,
      `${params.customerName} placed an order for Rs ${params.total}`,
    ));

    return newOrderRef.id;
  });
}

/**
 * Assign or reassign an agent to an order.
 * Does NOT change order status — admin marks packed separately.
 * Sync matrix: rows 5, 11
 */
export async function assignAgent(params: {
  orderId:     string;
  order:       Order;
  agent:       { uid: string; name: string; phone: string; };
  agentFee:    number;
  customerId:  string;
  adminUid:    string;
  oldAgentUid: string | null;
}): Promise<void> {
  const batch = writeBatch(db);
  const now   = Timestamp.now();

  batch.update(doc(db, ORDERS_COL, params.orderId), {
    agentId:   params.agent.uid,
    agentName: params.agent.name,
    agentPhone: params.agent.phone,
    agentFee:  params.agentFee,
    updatedAt: now,
  });

  // Notify new agent (row 5)
  batch.set(doc(collection(db, NOTIFICATIONS_COL)), notifDoc(
    params.agent.uid,
    'agent',
    'order_assigned',
    params.orderId,
    `New order ${params.order.orderNo}`,
    `You've been assigned to deliver to ${params.order.customerName}`,
  ));

  // Notify customer (row 5)
  batch.set(doc(collection(db, NOTIFICATIONS_COL)), notifDoc(
    params.customerId,
    'customer',
    'order_assigned',
    params.orderId,
    'Delivery partner assigned',
    `${params.agent.name} will deliver your order`,
  ));

  // Notify old agent if reassigning (row 11)
  if (params.oldAgentUid && params.oldAgentUid !== params.agent.uid) {
    batch.set(doc(collection(db, NOTIFICATIONS_COL)), notifDoc(
      params.oldAgentUid,
      'agent',
      'agent_reassigned',
      params.orderId,
      'Order reassigned',
      `Order ${params.order.orderNo} has been assigned to another agent`,
    ));
  }

  await batch.commit();
}

/**
 * Transition an order's status through the state machine.
 * ONE batch: order update + statusHistory entry + timestamps + notifications + stats (on delivered).
 * Sync matrix: rows 6, 7, 8, 9, 10
 */
export async function transitionOrder(params: {
  orderId:             string;
  order:               Order;
  toStatus:            OrderStatus;
  actor:               Actor;
  cancelReason?:        string;
  adminUid?:           string;
  emptyCansCollected?: number;
}): Promise<void> {
  const { orderId, order, toStatus, actor } = params;

  validateTransition(order.status, toStatus, actor);

  const batch = writeBatch(db);
  const now   = Timestamp.now();
  const today = now.toDate().toISOString().slice(0, 10);

  const historyEntry = { status: toStatus, at: now, byUid: actor.uid, byRole: actor.role };

  const orderUpdate: Record<string, unknown> = {
    status:        toStatus,
    updatedAt:     now,
    statusHistory: [...order.statusHistory, historyEntry],
    ...(toStatus === 'cancelled' ? { cancelReason: params.cancelReason ?? null, cancelledBy: actor.uid, cancelledAt: now } : {}),
    ...(toStatus === 'packed'           ? { packedAt: now }    : {}),
    ...(toStatus === 'out_for_delivery' ? { pickedUpAt: now }  : {}),
    ...(toStatus === 'delivered'        ? {
      deliveredAt: now,
      ...(params.emptyCansCollected !== undefined ? { emptyCansCollected: params.emptyCansCollected } : {}),
    } : {}),
  };

  batch.update(doc(db, ORDERS_COL, orderId), orderUpdate);

  // ── Notifications per sync matrix ─────────────────────────────────────────

  const addNotif = (uid: string, role: Actor['role'], type: NotificationType, title: string, body: string) => {
    // Never notify the person who triggered the action
    if (uid === actor.uid) return;
    batch.set(doc(collection(db, NOTIFICATIONS_COL)), notifDoc(uid, role, type, orderId, title, body));
  };

  if (toStatus === 'packed') {
    // Row 6: customer sees packed, agent sees ready
    addNotif(order.customerId,      'customer', 'order_packed', 'Order packed', `Order ${order.orderNo} is packed and ready`);
    if (order.agentId) addNotif(order.agentId, 'agent', 'order_packed', 'Ready for pickup', `Order ${order.orderNo} is ready for pickup`);
  }

  if (toStatus === 'out_for_delivery') {
    // Row 7: customer sees out for delivery
    addNotif(order.customerId, 'customer', 'order_picked_up', 'Out for delivery', `${order.agentName ?? 'Your agent'} picked up your order`);
    if (params.adminUid) addNotif(params.adminUid, 'admin', 'order_picked_up', `Order ${order.orderNo} picked up`, `${order.agentName} is on the way`);
  }

  if (toStatus === 'delivered') {
    // Row 8: customer + admin
    addNotif(order.customerId, 'customer', 'order_delivered', 'Delivered! 🎉', `Order ${order.orderNo} has been delivered`);
    if (params.adminUid) addNotif(params.adminUid, 'admin', 'order_delivered', `Order ${order.orderNo} delivered`, `${order.agentName} delivered to ${order.customerName}`);

    // Row 8: increment stats_daily in same batch
    const statsRef = doc(db, STATS_COL, today);
    batch.set(statsRef, {
      orders:  increment(1),
      revenue: increment(order.total),
      ...(order.agentId ? {
        [`cashCollectedByAgent.${order.agentId}`]: increment(order.total),
        [`deliveriesByAgent.${order.agentId}`]:    increment(1),
      } : {}),
      ...Object.fromEntries(
        order.items.map(i => [`itemQty.${i.itemId}`, increment(i.qty)]),
      ),
    }, { merge: true });

    // Can recovery tracking — adjust customer's pending cans
    if (params.emptyCansCollected !== undefined && order.customerId) {
      if (order.type === 'recovery') {
        if (params.emptyCansCollected > 0) {
          batch.update(doc(db, 'users', order.customerId), {
            pendingCans: increment(-params.emptyCansCollected),
          });
        }
      } else {
        const cansDelivered = (order.items || [])
          .filter(i => i.name.toLowerCase().includes('can') || (i.unit && i.unit.toLowerCase().includes('can')))
          .reduce((sum, i) => sum + i.qty, 0);
        const netCans = cansDelivered - params.emptyCansCollected;
        if (netCans !== 0) {
          batch.update(doc(db, 'users', order.customerId), {
            pendingCans: increment(netCans),
          });
        }
      }
    }
  }

  if (toStatus === 'cancelled') {
    // Row 9/10: notify all affected parties
    if (order.agentId) {
      addNotif(order.agentId, 'agent', 'order_cancelled', 'Order cancelled', `Order ${order.orderNo} has been cancelled`);
    }
    if (params.adminUid && actor.role !== 'admin') {
      addNotif(params.adminUid, 'admin', 'order_cancelled', `Order ${order.orderNo} cancelled`, `Cancelled by ${actor.role}`);
    }
    if (actor.role !== 'customer') {
      addNotif(order.customerId, 'customer', 'order_cancelled', 'Order cancelled', params.cancelReason ? `Your order was cancelled: ${params.cancelReason}` : 'Your order was cancelled');
    }

    // Row 9/10: track cancelled count in stats_daily in same batch
    const statsRef = doc(db, STATS_COL, today);
    batch.set(statsRef, {
      cancelledOrders: increment(1),
    }, { merge: true });
  }

  await batch.commit();
}

/** Update order item checklist (persisted across sessions & devices) */
export async function updateOrderChecklist(
  orderId: string,
  checkedItems: Record<string | number, boolean>,
): Promise<void> {
  await updateDoc(doc(db, ORDERS_COL, orderId), {
    checkedItems,
    updatedAt: Timestamp.now(),
  });
}
