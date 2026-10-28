// services/orders.ts — Order service: the heart of the sync contract.
//
// GOLDEN RULES enforced here:
// 1. One order document = single source of truth.
// 4. Every status change is one transaction: order, history, notices and metrics.
// 5. Orders store snapshots — customer/agent info never changes on existing orders.
// 6. Items are soft-deleted only; this service uses item snapshots, not live data.

import {
  collection, doc, getDoc, onSnapshot, runTransaction,
  serverTimestamp, query, where, orderBy,
  limit, increment, Unsubscribe, Timestamp, addDoc, updateDoc,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { getISTDateKey } from './stats';
import type {
  Order, OrderStatus, OrderItem, Actor,
  AddressSnapshot, OrderSlot, OrderSource,
  AppNotification, NotificationType, PaymentMethod,
} from '../types';
import { log } from '../utils/logger';
import { sendRemotePushNotification } from './notifications';

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
    const msg = `Invalid transition: ${from} → ${to} by role ${actor.role}`;
    log.orders.warn(msg, { from, to, actorRole: actor.role, actorUid: actor.uid });
    throw new Error(msg);
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
    orderBy('createdAt', 'desc'),
    limit(maxCount),
  );
  return onSnapshot(
    q,
    snap => {
      const orders = snap.docs.map(d => ({ id: d.id, ...d.data() } as Order));
      onData(sortOrdersDesc(orders));
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
    orderBy('createdAt', 'desc'),
    limit(100),
  );
  return onSnapshot(
    q,
    snap => {
      const orders = snap.docs.map(d => ({ id: d.id, ...d.data() } as Order));
      onData(sortOrdersDesc(orders));
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
        orderBy('createdAt', 'desc'),
        limit(maxCount),
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
      onData(sortOrdersDesc(orders));
    },
    onError,
  );
}

/** Admin: complete, bounded recovery queue independent of the retail order feed. */
export function listenRecoveryOrders(
  onData: (orders: Order[]) => void,
  onError: (e: Error) => void,
  maxCount = 500,
): Unsubscribe {
  const q = query(
    collection(db, ORDERS_COL),
    where('type', '==', 'recovery'),
    limit(maxCount),
  );
  return onSnapshot(
    q,
    snap => onData(sortOrdersDesc(snap.docs.map(d => ({ id: d.id, ...d.data() } as Order)))),
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
  customerId?:     string;    // explicit customer UID for admin_manual orders
  // can-recovery extension
  type?:               'order' | 'recovery';
  pendingCansToCollect?: number;
}): Promise<string> {
  const counterRef = doc(db, COUNTERS_COL, 'orders');
  const ordersRef  = collection(db, ORDERS_COL);
  let createdOrderNo = '';

  const orderId = await runTransaction(db, async tx => {
    const counterSnap = await tx.get(counterRef);
    const next: number = counterSnap.exists() ? (counterSnap.data().next as number) : 1000;
    const orderNo = `AS-${next}`;
    createdOrderNo = orderNo;

    tx.set(counterRef, { next: next + 1 }, { merge: true });

    const newOrderRef = doc(ordersRef);
    const now = Timestamp.now();

    const orderData: Omit<Order, 'id'> = {
      orderNo,
      customerId:      params.customerId ?? params.actor.uid,
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

    log.orders.info(`Order created: ${orderNo}`, {
      orderId: newOrderRef.id,
      customer: params.customerName,
      total: params.total,
      type: params.type ?? 'order',
      source: params.source,
    });

    return newOrderRef.id;
  });

  // Dispatch high-priority push notification to admin(s) with sound
  sendRemotePushNotification({
    toRole: 'admin',
    toUid: params.adminUid,
    title: `📦 New Order ${createdOrderNo}`,
    body: `${params.customerName} placed an order for ₹${params.total} (${params.items.length} item${params.items.length > 1 ? 's' : ''})`,
    data: { orderId, orderNo: createdOrderNo, screen: 'admin_order' },
  }).catch(() => {});

  return orderId;
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
  const orderRef = doc(db, ORDERS_COL, params.orderId);
  let committedOrder: Order = params.order;
  await runTransaction(db, async tx => {
    const snap = await tx.get(orderRef);
    if (!snap.exists()) throw new Error('Order no longer exists.');
    const current = { id: snap.id, ...snap.data() } as Order;
    const recoveryInProgress = current.type === 'recovery' && current.status === 'out_for_delivery';
    if (!['placed', 'packed'].includes(current.status) && !recoveryInProgress) {
      throw new Error(`Cannot assign an order in ${current.status} status.`);
    }
    committedOrder = current;
    const now = Timestamp.now();
    tx.update(orderRef, {
      agentId: params.agent.uid,
      agentName: params.agent.name,
      agentPhone: params.agent.phone,
      agentFee: params.agentFee,
      updatedAt: now,
    });
    const isRecovery = current.type === 'recovery';
    tx.set(doc(collection(db, NOTIFICATIONS_COL)), notifDoc(
      params.agent.uid, 'agent', 'order_assigned', params.orderId,
      isRecovery ? `Can recovery ${current.orderNo}` : `New order ${current.orderNo}`,
      isRecovery
        ? `Collect ${current.pendingCansToCollect || 0} empty cans from ${current.customerName}`
        : `You've been assigned to deliver to ${current.customerName}`,
    ));
    tx.set(doc(collection(db, NOTIFICATIONS_COL)), notifDoc(
      params.customerId, 'customer', 'order_assigned', params.orderId,
      isRecovery ? 'Can collection agent assigned' : 'Delivery partner assigned',
      isRecovery ? `${params.agent.name} will collect ${current.pendingCansToCollect || 0} empty cans` : `${params.agent.name} will deliver your order`,
    ));
    if (current.agentId && current.agentId !== params.agent.uid) {
      tx.set(doc(collection(db, NOTIFICATIONS_COL)), notifDoc(
        current.agentId, 'agent', 'agent_reassigned', params.orderId,
        isRecovery ? 'Recovery run reassigned' : 'Order reassigned',
        isRecovery ? `Recovery ${current.orderNo} has been reassigned` : `Order ${current.orderNo} has been assigned to another agent`,
      ));
    }
  });
  log.admin.info(`Agent assigned to order`, {
    orderNo:   committedOrder.orderNo,
    orderId:   params.orderId,
    agentName: params.agent.name,
    agentUid:  params.agent.uid,
    reassigned: !!committedOrder.agentId && committedOrder.agentId !== params.agent.uid,
  });

  // Dispatch high-priority push notifications with sound
  const isRecovery = committedOrder.type === 'recovery';
  sendRemotePushNotification({
    toUid: params.agent.uid,
    title: isRecovery ? `♻️ Can Recovery Assigned: ${committedOrder.orderNo}` : `🚀 New Delivery Assigned: ${committedOrder.orderNo}`,
    body: isRecovery
      ? `Collect ${committedOrder.pendingCansToCollect || 0} empty cans from ${committedOrder.customerName}`
      : `Deliver ${committedOrder.orderNo} to ${committedOrder.customerName} (₹${committedOrder.total})`,
    data: { orderId: params.orderId, screen: 'agent_delivery' },
  }).catch(() => {});

  sendRemotePushNotification({
    toUid: params.customerId,
    title: isRecovery ? '♻️ Can Collection Agent Assigned' : '🚴 Delivery Partner Assigned',
    body: isRecovery
      ? `${params.agent.name} will collect ${committedOrder.pendingCansToCollect || 0} empty cans`
      : `${params.agent.name} will deliver your order ${committedOrder.orderNo}`,
    data: { orderId: params.orderId, screen: 'customer_track' },
  }).catch(() => {});

  if (committedOrder.agentId && committedOrder.agentId !== params.agent.uid) {
    sendRemotePushNotification({
      toUid: committedOrder.agentId,
      title: isRecovery ? 'Recovery Run Reassigned' : 'Order Reassigned',
      body: `Order ${committedOrder.orderNo} has been assigned to another agent`,
      data: { orderId: params.orderId },
    }).catch(() => {});
  }
}

/**
 * Transition an order's status through the state machine.
 * One transaction: order update + history + timestamps + notifications + stats.
 * Sync matrix: rows 6, 7, 8, 9, 10
 */
/**
 * Transition an order only if its status is still the one read inside this
 * transaction. The order, stats, can balance, notifications and any automatic
 * recovery run are committed together, so a repeated delivery tap cannot count
 * twice or create duplicate recovery work.
 */
export async function transitionOrder(params: {
  orderId: string;
  order: Order;
  toStatus: OrderStatus;
  actor: Actor;
  checkedItems?: Record<string | number, boolean>;
  cancelReason?: string;
  adminUid?: string;
  emptyCansCollected?: number;
  paymentMethod?: PaymentMethod;
  qrId?: string | null;
  qrLabel?: string | null;
}): Promise<void> {
  const { orderId, toStatus, actor } = params;
  const orderRef = doc(db, ORDERS_COL, orderId);

  await runTransaction(db, async tx => {
    const orderSnap = await tx.get(orderRef);
    if (!orderSnap.exists()) throw new Error('Order no longer exists.');
    const order = { id: orderSnap.id, ...orderSnap.data() } as Order;
    validateTransition(order.status, toStatus, actor);

    // Strict checklist enforcement: Retail orders with items cannot move to out_for_delivery or delivered without verifying all items
    const isRetail = order.type !== 'recovery' && (order.items || []).length > 0;
    if (isRetail && (toStatus === 'out_for_delivery' || toStatus === 'delivered')) {
      const mergedChecked = {
        ...(order.checkedItems || {}),
        ...(params.checkedItems || {}),
      };
      const totalItems = order.items.length;
      const allChecked = order.items.every((_, idx) => {
        return !!mergedChecked[idx] || !!(mergedChecked as any)[String(idx)];
      });
      if (!allChecked) {
        throw new Error(
          `Cannot transition order to ${toStatus}: All ${totalItems} items on the pickup checklist must be verified and checked first.`
        );
      }
    }

    const now = Timestamp.now();
    const today = getISTDateKey(now.toDate());
    const statsRef = doc(db, STATS_COL, today);
    const isDelivered = toStatus === 'delivered';
    const isRecovery = order.type === 'recovery';
    const cansDelivered = isDelivered && !isRecovery
      ? (order.items || []).filter(i => i.name.toLowerCase().includes('can') || (i.unit && i.unit.toLowerCase().includes('can'))).reduce((n, i) => n + i.qty, 0)
      : 0;
    const cansCollected = isDelivered
      ? Math.max(0, Math.min(Number(params.emptyCansCollected || 0), isRecovery ? Number(order.pendingCansToCollect || 0) : cansDelivered))
      : 0;
    const newCansToRecover = Math.max(0, cansDelivered - cansCollected);
    const shouldCreateRecovery = isDelivered && !isRecovery && newCansToRecover > 0;

    // Read the counter and customer before writes. These reads make the
    // recovery order number and can balance safe under concurrent deliveries.
    const counterRef = doc(db, COUNTERS_COL, 'orders');
    const counterSnap = shouldCreateRecovery ? await tx.get(counterRef) : null;
    const customerRef = isDelivered && order.customerId ? doc(db, 'users', order.customerId) : null;
    const customerSnap = customerRef ? await tx.get(customerRef) : null;
    const recoveryRef = shouldCreateRecovery ? doc(collection(db, ORDERS_COL)) : null;

    tx.update(orderRef, {
      status: toStatus,
      updatedAt: now,
      statusHistory: [...(order.statusHistory || []), { status: toStatus, at: now, byUid: actor.uid, byRole: actor.role }],
      ...(params.checkedItems !== undefined ? { checkedItems: params.checkedItems } : {}),
      ...(toStatus === 'cancelled' ? { cancelReason: params.cancelReason ?? null, cancelledBy: actor.uid, cancelledAt: now } : {}),
      ...(toStatus === 'packed' ? { packedAt: now } : {}),
      ...(toStatus === 'out_for_delivery' ? { pickedUpAt: now } : {}),
      ...(isDelivered ? {
        deliveredAt: now,
        paymentMethod: params.paymentMethod || order.paymentMethod || 'COD',
        emptyCansCollected: cansCollected,
        ...(params.qrId !== undefined ? { qrId: params.qrId } : {}),
        ...(params.qrLabel !== undefined ? { qrLabel: params.qrLabel } : {}),
      } : {}),
    });

    const addNotif = (uid: string | null | undefined, role: Actor['role'], type: NotificationType, title: string, body: string, targetOrderId = orderId) => {
      if (!uid || uid === actor.uid) return;
      tx.set(doc(collection(db, NOTIFICATIONS_COL)), notifDoc(uid, role, type, targetOrderId, title, body));
    };

    if (toStatus === 'packed') {
      addNotif(order.customerId, 'customer', 'order_packed', 'Order packed', `Order ${order.orderNo} is packed and ready`);
      addNotif(order.agentId, 'agent', 'order_packed', 'Ready for pickup', `Order ${order.orderNo} is ready for pickup`);
    } else if (toStatus === 'out_for_delivery') {
      addNotif(order.customerId, 'customer', 'order_picked_up', 'Out for delivery', `${order.agentName ?? 'Your agent'} picked up your order`);
      addNotif(params.adminUid, 'admin', 'order_picked_up', `Order ${order.orderNo} picked up`, `${order.agentName || 'The agent'} is on the way`);
    } else if (isDelivered) {
      addNotif(order.customerId, 'customer', 'order_delivered', 'Delivered!', `Order ${order.orderNo} has been delivered`);
      addNotif(params.adminUid, 'admin', 'order_delivered', `Order ${order.orderNo} delivered`, `${order.agentName || 'The agent'} delivered to ${order.customerName}`);

      const statsUpdate: Record<string, unknown> = isRecovery
        ? {
            recoveryOrders: increment(1),
            ...(order.agentId ? { [`recoveryRunsByAgent.${order.agentId}`]: increment(1) } : {}),
          }
        : {
            orders: increment(1),
            revenue: increment(order.total),
            ...(params.paymentMethod === 'upi_qr'
              ? { upiRevenue: increment(order.total), upiOrders: increment(1), ...(params.qrId ? { [`qrSales.${params.qrId}`]: increment(order.total), [`qrOrders.${params.qrId}`]: increment(1) } : {}) }
              : { cashRevenue: increment(order.total), cashOrders: increment(1), ...(order.agentId ? { [`cashCollectedByAgent.${order.agentId}`]: increment(order.total) } : {}) }),
            ...(order.agentId ? { [`deliveriesByAgent.${order.agentId}`]: increment(1) } : {}),
            ...Object.fromEntries((order.items || []).map(i => [`itemQty.${i.itemId}`, increment(i.qty)])),
          };
      tx.set(statsRef, statsUpdate, { merge: true });

      if (!isRecovery && params.qrId) {
        tx.set(doc(db, 'qr_codes', params.qrId), { totalSales: increment(order.total), orderCount: increment(1), lastUsedAt: now, updatedAt: now }, { merge: true });
      }

      if (customerRef && customerSnap?.exists()) {
        const oldPending = Math.max(0, Number(customerSnap.data().pendingCans || 0));
        const nextPending = Math.max(0, oldPending + (isRecovery ? 0 : cansDelivered) - cansCollected);
        if (nextPending !== oldPending) tx.update(customerRef, { pendingCans: nextPending });
      }

      if (shouldCreateRecovery && recoveryRef && counterSnap) {
        const next = counterSnap.exists() ? Number(counterSnap.data().next || 1000) : 1000;
        const recoveryOrderNo = `AS-${next}`;
        const recoveryAgentId = order.agentId || actor.uid;
        const recoveryAgentName = order.agentName || actor.name;
        tx.set(counterRef, { next: next + 1 }, { merge: true });
        tx.set(recoveryRef, {
          orderNo: recoveryOrderNo,
          customerId: order.customerId,
          customerName: order.customerName,
          customerPhone: order.customerPhone,
          addressSnapshot: order.addressSnapshot,
          items: [], subtotal: 0, deliveryFee: 0, total: 0,
          paymentMethod: 'COD', slot: { type: 'asap', label: 'Can Collection' },
          notes: `Collect ${newCansToRecover} empty 20L water cans`,
          status: 'placed', agentId: recoveryAgentId, agentName: recoveryAgentName,
          agentPhone: order.agentPhone, agentFee: 0, source: 'admin_manual',
          type: 'recovery', pendingCansToCollect: newCansToRecover,
          cancelReason: null, cancelledBy: null,
          statusHistory: [{ status: 'placed', at: now, byUid: actor.uid, byRole: actor.role }],
          createdAt: now, updatedAt: now, packedAt: null, pickedUpAt: null,
          deliveredAt: null, cancelledAt: null,
        });
        addNotif(recoveryAgentId, 'agent', 'order_assigned', 'Can recovery assigned', `Collect ${newCansToRecover} empty cans from ${order.customerName}`, recoveryRef.id);
        addNotif(params.adminUid, 'admin', 'order_placed', `Can recovery ${recoveryOrderNo}`, `${newCansToRecover} empty cans from ${order.customerName}; assigned to ${recoveryAgentName}`, recoveryRef.id);
      }
    } else if (toStatus === 'cancelled') {
      addNotif(order.agentId, 'agent', 'order_cancelled', 'Order cancelled', `Order ${order.orderNo} has been cancelled`);
      if (actor.role !== 'admin') addNotif(params.adminUid, 'admin', 'order_cancelled', `Order ${order.orderNo} cancelled`, `Cancelled by ${actor.role}`);
      if (actor.role !== 'customer') addNotif(order.customerId, 'customer', 'order_cancelled', 'Order cancelled', params.cancelReason ? `Your order was cancelled: ${params.cancelReason}` : 'Your order was cancelled');
      tx.set(statsRef, isRecovery ? { cancelledRecoveryOrders: increment(1) } : { cancelledOrders: increment(1) }, { merge: true });
    }
  });

  log.orders.info(`Status transition committed: ${params.order.status} → ${toStatus}`, {
    orderNo: params.order.orderNo,
    orderId,
    actorRole: actor.role,
    actorUid: actor.uid,
  });

  // Dispatch background remote push notifications with sound
  const orderObj = params.order;
  const isRecoveryOrder = orderObj.type === 'recovery';
  const orderNo = orderObj.orderNo;
  const customerId = orderObj.customerId;
  const agentId = orderObj.agentId;
  const customerName = orderObj.customerName;
  const agentName = orderObj.agentName || actor.name;
  const total = orderObj.total;

  if (toStatus === 'packed') {
    if (customerId) {
      sendRemotePushNotification({
        toUid: customerId,
        title: '📦 Order Packed',
        body: `Order ${orderNo} is packed and ready for delivery`,
        data: { orderId, screen: 'customer_track' },
      }).catch(() => {});
    }
    if (agentId) {
      sendRemotePushNotification({
        toUid: agentId,
        title: '📦 Order Ready for Pickup',
        body: `Order ${orderNo} is packed and ready for pickup at store`,
        data: { orderId, screen: 'agent_delivery' },
      }).catch(() => {});
    }
  } else if (toStatus === 'out_for_delivery') {
    if (customerId) {
      sendRemotePushNotification({
        toUid: customerId,
        title: '🚴 Out for Delivery!',
        body: `${agentName} has picked up your order and is on the way`,
        data: { orderId, screen: 'customer_track' },
      }).catch(() => {});
    }
    sendRemotePushNotification({
      toRole: 'admin',
      toUid: params.adminUid,
      title: `🚴 Order ${orderNo} Out for Delivery`,
      body: `${agentName} picked up order and is on the way to ${customerName}`,
      data: { orderId, screen: 'admin_order' },
    }).catch(() => {});
  } else if (toStatus === 'delivered') {
    if (customerId) {
      sendRemotePushNotification({
        toUid: customerId,
        title: '🎉 Order Delivered!',
        body: `Order ${orderNo} has been delivered. Thank you for choosing Anandhi Stores!`,
        data: { orderId, screen: 'customer_track' },
      }).catch(() => {});
    }
    // Admin notification: Delivery & Cash/UPI Collected
    sendRemotePushNotification({
      toRole: 'admin',
      toUid: params.adminUid,
      title: isRecoveryOrder ? `♻️ Can Recovery ${orderNo} Completed` : `💰 Order ${orderNo} Delivered & Cash Collected`,
      body: isRecoveryOrder
        ? `Empty cans collected from ${customerName} by ${agentName}`
        : params.paymentMethod === 'upi_qr'
        ? `UPI QR Payment recorded for ₹${total} from ${customerName} (${agentName})`
        : `Cash Collected: ₹${total} from ${customerName} by ${agentName}`,
      data: { orderId, screen: 'admin_order' },
    }).catch(() => {});
  } else if (toStatus === 'cancelled') {
    if (agentId) {
      sendRemotePushNotification({
        toUid: agentId,
        title: '❌ Order Cancelled',
        body: `Order ${orderNo} has been cancelled`,
        data: { orderId },
      }).catch(() => {});
    }
    if (actor.role !== 'customer' && customerId) {
      sendRemotePushNotification({
        toUid: customerId,
        title: '❌ Order Cancelled',
        body: params.cancelReason ? `Order ${orderNo} was cancelled: ${params.cancelReason}` : `Order ${orderNo} was cancelled`,
        data: { orderId, screen: 'customer_track' },
      }).catch(() => {});
    }
    if (actor.role !== 'admin') {
      sendRemotePushNotification({
        toRole: 'admin',
        toUid: params.adminUid,
        title: `❌ Order ${orderNo} Cancelled`,
        body: `Order ${orderNo} cancelled by ${actor.role}`,
        data: { orderId, screen: 'admin_order' },
      }).catch(() => {});
    }
  }
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
