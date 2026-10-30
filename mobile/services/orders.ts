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
  limit, increment, Unsubscribe, Timestamp, addDoc, updateDoc, getDocs, startAfter, QueryConstraint, QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { getISTDateKey } from './stats';
import { normalizeSettings } from './settings';
import { canUseSlot } from '../utils/compute';
import type {
  Order, OrderStatus, OrderItem, Actor,
  AddressSnapshot, OrderSlot, OrderSource,
  AppNotification, NotificationType, PaymentMethod,
} from '../types';
import { log } from '../utils/logger';
import { getAdminRecipients } from './notifications';

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
  { from: ['placed'], to: 'cancelled', allowedRoles: ['customer'] },
  { from: ['placed', 'packed'], to: 'cancelled', allowedRoles: ['admin'] },
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
  return { toUid, toRole, type, orderId, title, body, read: false, pushStatus: 'pending', createdAt: Timestamp.now() };
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


/** Fetch active work independently of terminal history. Each live page is bounded. */
function listenOrderPages(
  filters: QueryConstraint[],
  onData: (orders: Order[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const pages = new Map<number, Order[]>();
  const stops = new Map<number, Unsubscribe>();
  const boundaries = new Map<number, string>();
  let stopped = false;
  function trim(after: number) {
    for (const [page, stop] of stops) if (page > after) { stop(); stops.delete(page); pages.delete(page); boundaries.delete(page); }
  }
  function subscribe(page: number, cursor?: QueryDocumentSnapshot) {
    const q = query(collection(db, ORDERS_COL), ...filters, orderBy('createdAt', 'desc'), ...(cursor ? [startAfter(cursor)] : []), limit(100));
    stops.set(page, onSnapshot(q, snap => {
      if (stopped) return;
      pages.set(page, snap.docs.map(d => ({ id: d.id, ...d.data() } as Order)));
      const last = snap.docs[snap.docs.length - 1];
      const boundary = snap.size === 100 ? last.id : '';
      if (boundaries.get(page) !== boundary) {
        trim(page); boundaries.set(page, boundary);
        if (boundary) subscribe(page + 1, last);
      }
      onData(sortOrdersDesc([...new Map([...pages.values()].flat().map(o => [o.id, o])).values()]));
    }, onError));
  }
  subscribe(0);
  return () => { stopped = true; for (const stop of stops.values()) stop(); };
}

function listenWorkAndHistory(
  filters: QueryConstraint[], onData: (orders: Order[]) => void, onError: (e: Error) => void, historyLimit: number,
): Unsubscribe {
  let active: Order[] = [], history: Order[] = [];
  const emit = () => onData(sortOrdersDesc([...new Map([...active, ...history].map(o => [o.id, o])).values()]));
  const stopActive = listenOrderPages([...filters, where('status', 'in', ['placed', 'packed', 'out_for_delivery'])], data => { active = data; emit(); }, onError);
  const stopHistory = onSnapshot(query(collection(db, ORDERS_COL), ...filters, where('status', 'in', ['delivered', 'cancelled']), orderBy('createdAt', 'desc'), limit(historyLimit)),
    snap => { history = snap.docs.map(d => ({ id: d.id, ...d.data() } as Order)); emit(); }, onError);
  return () => { stopActive(); stopHistory(); };
}

export function listenCustomerOrders(customerId: string, onData: (orders: Order[]) => void, onError: (e: Error) => void, maxCount = 50): Unsubscribe {
  return listenWorkAndHistory([where('customerId', '==', customerId)], onData, onError, maxCount);
}
export function listenAgentOrders(agentId: string, onData: (orders: Order[]) => void, onError: (e: Error) => void, maxCount = 100): Unsubscribe {
  return listenWorkAndHistory([where('agentId', '==', agentId)], onData, onError, maxCount);
}
export function listenAdminOrders(onData: (orders: Order[]) => void, onError: (e: Error) => void, statusFilter?: OrderStatus, maxCount = 100): Unsubscribe {
  if (statusFilter) return listenOrderPages([where('status', '==', statusFilter)], onData, onError);
  return listenWorkAndHistory([], onData, onError, maxCount);
}
export function listenRecoveryOrders(onData: (orders: Order[]) => void, onError: (e: Error) => void, maxCount = 50): Unsubscribe {
  return listenWorkAndHistory([where('type', '==', 'recovery')], onData, onError, maxCount);
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
  const adminUids = await getAdminRecipients();
  if (params.type === 'recovery' && !params.customerId) throw new Error('Choose the customer for this collection.');
  const recoveryCustomerRef = params.type === 'recovery' ? doc(db, 'users', params.customerId!) : null;
  const existingRecoveries = recoveryCustomerRef ? await getDocs(query(collection(db, ORDERS_COL), where('customerId', '==', params.customerId!), where('type', '==', 'recovery'), where('status', 'in', ['placed', 'packed', 'out_for_delivery']), limit(1000))) : null;
  const reservedBefore = existingRecoveries?.docs.reduce((n, d) => n + Number(d.data().pendingCansToCollect || 0), 0) || 0;
  const counterRef = doc(db, COUNTERS_COL, 'orders');
  const ordersRef  = collection(db, ORDERS_COL);
  let createdOrderNo = '';

  const orderId = await runTransaction(db, async tx => {
    const counterSnap = await tx.get(counterRef);
    const actorSnap = await tx.get(doc(db, 'users', params.actor.uid));
    if (!actorSnap.exists() || actorSnap.data().role !== params.actor.role || !['approved', 'active'].includes(actorSnap.data().status) || !['customer', 'admin'].includes(params.actor.role)) throw new Error('This account is not approved to create orders.');
    const settingsSnap = params.actor.role === 'customer' ? await tx.get(doc(db, 'settings', 'store')) : null;
    if (settingsSnap && !canUseSlot(normalizeSettings(settingsSnap.exists() ? settingsSnap.data() : null), params.slot.label)) throw new Error('That delivery window changed. Choose an available window.');
    const customerSnap = recoveryCustomerRef ? await tx.get(recoveryCustomerRef) : null;
    if (recoveryCustomerRef) {
      const qty = Number(params.pendingCansToCollect || 0);
      if (!customerSnap?.exists() || !Number.isInteger(qty) || qty <= 0) throw new Error('Choose a customer and a positive whole number of cans.');
      const reserved = Number(customerSnap.data().recoveryReservedCans ?? reservedBefore);
      if (qty > Number(customerSnap.data().pendingCans || 0) - reserved) throw new Error('These cans already have an open recovery run.');
      tx.update(recoveryCustomerRef, { recoveryReservedCans: reserved + qty });
    }
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
      items:           params.type === 'recovery' ? [] : params.items,
      subtotal:        params.type === 'recovery' ? 0 : params.subtotal,
      deliveryFee:     params.type === 'recovery' ? 0 : params.deliveryFee,
      total:           params.type === 'recovery' ? 0 : params.total,
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
      ...(params.type === 'recovery' ? { type: 'recovery', originalCansToCollect: params.pendingCansToCollect ?? 0, pendingCansToCollect: params.pendingCansToCollect ?? 0, emptyCansCollected: 0 } : { type: 'order' }),
    };

    tx.set(newOrderRef, orderData);

    // Notify admin (row 4)
    for (const adminUid of adminUids) tx.set(doc(collection(db, NOTIFICATIONS_COL)), notifDoc(
      adminUid,
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
  const adminUids = await getAdminRecipients();
  const orderRef = doc(db, ORDERS_COL, params.orderId);
  let committedOrder: Order = params.order;
  await runTransaction(db, async tx => {
    const snap = await tx.get(orderRef);
    if (!snap.exists()) throw new Error('Order no longer exists.');
    const current = { id: snap.id, ...snap.data() } as Order;
    const agentRef = doc(db, 'users', params.agent.uid);
    const agentSnap = await tx.get(agentRef);
    if (!agentSnap.exists() || agentSnap.data().role !== 'agent' || agentSnap.data().status === 'blocked' || !agentSnap.data().isOnline) throw new Error('Choose an approved online agent.');
    const oldAgentRef = current.agentId && current.agentId !== params.agent.uid ? doc(db, 'users', current.agentId) : null;
    const oldAgentSnap = oldAgentRef ? await tx.get(oldAgentRef) : null;
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
      agentFee: current.agentId === params.agent.uid ? current.agentFee : params.agentFee,
      statusHistory: [...(current.statusHistory || []), { status: current.status, at: now, byUid: params.adminUid, byRole: 'admin', event: current.agentId ? 'reassigned' : 'assigned', note: params.agent.name }],
      updatedAt: now,
    });
    const isRecovery = current.type === 'recovery';
    if (current.agentId !== params.agent.uid) {
      const busyDelta = !isRecovery || current.status === 'out_for_delivery' ? 1 : 0;
      tx.update(agentRef, { assignedRunCount: Math.max(0, Number(agentSnap.data().assignedRunCount || 0)) + 1, activeOrderCount: Math.max(0, Number(agentSnap.data().activeOrderCount || 0)) + busyDelta });
      if (oldAgentRef && oldAgentSnap?.exists()) tx.update(oldAgentRef, { assignedRunCount: Math.max(0, Number(oldAgentSnap.data().assignedRunCount || 0) - 1), activeOrderCount: Math.max(0, Number(oldAgentSnap.data().activeOrderCount || 0) - busyDelta) });
    }
    for (const uid of adminUids) tx.set(doc(collection(db, NOTIFICATIONS_COL)), notifDoc(uid, 'admin', 'order_assigned', params.orderId, isRecovery ? 'Collection assigned' : 'Delivery assigned', current.orderNo + ' assigned to ' + params.agent.name));
    tx.set(doc(collection(db, NOTIFICATIONS_COL)), notifDoc(
      params.agent.uid, 'agent', 'order_assigned', params.orderId,
      isRecovery ? `Can recovery ${current.orderNo}` : `New order ${current.orderNo}`,
      isRecovery
        ? `Collect ${current.pendingCansToCollect || 0} empty cans from ${current.customerName}`
        : `You've been assigned to deliver to ${current.customerName}`,
    ));
    tx.set(doc(collection(db, NOTIFICATIONS_COL)), notifDoc(
      current.customerId, 'customer', 'order_assigned', params.orderId,
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
  qrUpiId?: string | null;
}): Promise<void> {
  const { orderId, toStatus, actor } = params;
  const adminUids = await getAdminRecipients();
  const orderRef = doc(db, ORDERS_COL, orderId);

  await runTransaction(db, async tx => {
    const orderSnap = await tx.get(orderRef);
    if (!orderSnap.exists()) throw new Error('Order no longer exists.');
    const order = { id: orderSnap.id, ...orderSnap.data() } as Order;
    validateTransition(order.status, toStatus, actor);
    if (actor.role === 'customer' && (order.customerId !== actor.uid || order.type === 'recovery')) throw new Error('Only your placed purchases can be cancelled.');
    if (actor.role === 'agent' && order.agentId !== actor.uid) throw new Error('This run is no longer assigned to you.');
    if (actor.role === 'admin' && toStatus === 'cancelled' && !params.cancelReason?.trim()) throw new Error('Enter a cancellation reason.');

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
      ? (order.items || []).filter(i => i.isWaterCan === true || i.unit?.toLowerCase() === 'can').reduce((n, i) => n + i.qty, 0)
      : 0;
    if (params.emptyCansCollected !== undefined && (!Number.isFinite(params.emptyCansCollected) || !Number.isInteger(params.emptyCansCollected) || params.emptyCansCollected < 0)) throw new Error('Enter a non-negative whole number of empty cans.');
    const cansCollected = isDelivered
      ? Math.max(0, Math.min(Number(params.emptyCansCollected || 0), isRecovery ? Number(order.pendingCansToCollect || 0) : cansDelivered))
      : 0;
    if (!Number.isInteger(cansCollected)) throw new Error('Enter a whole number of cans.');
    const recoveryRemaining = isRecovery ? Math.max(0, Number(order.pendingCansToCollect || 0) - cansCollected) : 0;
    if (isRecovery && isDelivered && cansCollected <= 0) throw new Error('No cans collected yet. Keep this recovery open and try another day.');
    const completed = isDelivered && (!isRecovery || recoveryRemaining === 0);
    const nextStatus: OrderStatus = isRecovery && isDelivered && !completed ? 'placed' : toStatus;
    const newCansToRecover = Math.max(0, cansDelivered - cansCollected);
    const shouldCreateRecovery = isDelivered && !isRecovery && newCansToRecover > 0;

    // Read the counter and customer before writes. These reads make the
    // recovery order number and can balance safe under concurrent deliveries.
    const counterRef = doc(db, COUNTERS_COL, 'orders');
    const counterSnap = shouldCreateRecovery ? await tx.get(counterRef) : null;
    const customerRef = isDelivered && order.customerId ? doc(db, 'users', order.customerId) : null;
    const customerSnap = customerRef ? await tx.get(customerRef) : null;
    const recoveryRef = shouldCreateRecovery ? doc(collection(db, ORDERS_COL)) : null;
    const agentRef = order.agentId ? doc(db, 'users', order.agentId) : null;
    const agentSnap = agentRef ? await tx.get(agentRef) : null;
    if (actor.role === 'agent' && (!agentSnap?.exists() || agentSnap.data().status === 'blocked')) throw new Error('This agent is unavailable.');
    if (agentSnap?.exists()) {
      const wasBusy = order.type !== 'recovery' || order.status === 'out_for_delivery';
      const nowBusy = !['delivered', 'cancelled'].includes(nextStatus) && (order.type !== 'recovery' || nextStatus === 'out_for_delivery');
      if (completed || nextStatus === 'cancelled') tx.update(agentRef!, { assignedRunCount: Math.max(0, Math.max(1, Number(agentSnap.data().assignedRunCount || 0)) - 1 + (shouldCreateRecovery ? 1 : 0)) });
      if (wasBusy !== nowBusy) tx.update(agentRef!, { activeOrderCount: Math.max(0, Number(agentSnap.data().activeOrderCount || 0) + (nowBusy ? 1 : -1)) });
    }

    tx.update(orderRef, {
      status: nextStatus,
      updatedAt: now,
      statusHistory: [...(order.statusHistory || []), { status: nextStatus, at: now, byUid: actor.uid, byRole: actor.role, ...(isRecovery && isDelivered ? { event: 'collection', note: cansCollected + ' collected; ' + recoveryRemaining + ' outstanding' } : {}) }],
      ...(params.checkedItems !== undefined ? { checkedItems: params.checkedItems } : {}),
      ...(toStatus === 'cancelled' ? { cancelReason: params.cancelReason ?? null, cancelledBy: actor.uid, cancelledAt: now } : {}),
      ...(toStatus === 'packed' ? { packedAt: now } : {}),
      ...(toStatus === 'out_for_delivery' ? { pickedUpAt: now } : {}),
      ...(isDelivered ? {
        deliveredAt: completed ? now : null,
        ...(isRecovery ? { pendingCansToCollect: recoveryRemaining, originalCansToCollect: order.originalCansToCollect ?? Number(order.pendingCansToCollect || 0) + Number(order.emptyCansCollected || 0), emptyCansCollected: Number(order.emptyCansCollected || 0) + cansCollected, lastCollectionAt: now, collectionHistory: [...(order.collectionHistory || []), { id: doc(collection(db, 'orders')).id, qty: cansCollected, at: now, byUid: actor.uid }], ...(!completed ? { pickedUpAt: null } : {}) } : {}),
        paymentMethod: params.paymentMethod || order.paymentMethod || 'COD',
        ...(!isRecovery ? { emptyCansCollected: cansCollected } : {}),
        ...(params.qrId !== undefined ? { qrId: params.qrId } : {}),
        ...(params.qrLabel !== undefined ? { qrLabel: params.qrLabel } : {}),
        ...(params.qrUpiId !== undefined ? { qrUpiId: params.qrUpiId } : {}),
      } : {}),
    });

    const addNotif = (uid: string | null | undefined, role: Actor['role'], type: NotificationType, title: string, body: string, targetOrderId = orderId) => {
      if (role === 'admin') {
        for (const adminUid of adminUids) tx.set(doc(collection(db, NOTIFICATIONS_COL)), notifDoc(adminUid, role, type, targetOrderId, title, body));
        return;
      }
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
      addNotif(order.customerId, 'customer', isRecovery ? 'can_collection' : 'order_delivered', isRecovery ? (completed ? 'All empty cans collected' : 'Partial can collection') : 'Delivered!', isRecovery ? cansCollected + ' collected; ' + recoveryRemaining + ' still outstanding' : `Order ${order.orderNo} has been delivered`);
      addNotif(params.adminUid, 'admin', isRecovery ? 'can_collection' : 'order_delivered', isRecovery ? (completed ? 'Recovery completed' : 'Partial collection recorded') : `Order ${order.orderNo} delivered`, isRecovery ? `${order.orderNo}: ${cansCollected} collected; ${recoveryRemaining} outstanding` : `${order.agentName || 'The agent'} delivered to ${order.customerName}`);

      const statsUpdate: Record<string, unknown> = isRecovery
        ? {
            recoveryOrders: increment(1),
            ...(order.agentId ? { recoveryRunsByAgent: { [order.agentId]: increment(1) } } : {}),
          }
        : {
            orders: increment(1),
            revenue: increment(order.total),
            ...(params.paymentMethod === 'upi_qr'
              ? { upiRevenue: increment(order.total), upiOrders: increment(1), ...(params.qrId ? { qrSales: { [params.qrId]: increment(order.total) }, qrOrders: { [params.qrId]: increment(1) } } : {}) }
              : { cashRevenue: increment(order.total), cashOrders: increment(1), ...(order.agentId ? { cashCollectedByAgent: { [order.agentId]: increment(order.total) } } : {}) }),
            ...(order.agentId ? { deliveriesByAgent: { [order.agentId]: increment(1) } } : {}),
            itemQty: Object.fromEntries(Object.entries((order.items || []).reduce((counts, item) => { counts[item.itemId] = (counts[item.itemId] || 0) + item.qty; return counts; }, {} as Record<string, number>)).map(([id, qty]) => [id, increment(qty)])),
          };
      if (!isRecovery || completed) tx.set(statsRef, statsUpdate, { merge: true });

      if (!isRecovery && params.qrId) {
        tx.set(doc(db, 'qr_codes', params.qrId), { totalSales: increment(order.total), orderCount: increment(1), lastUsedAt: now, updatedAt: now }, { merge: true });
      }

      if (customerRef && customerSnap?.exists()) {
        const oldPending = Math.max(0, Number(customerSnap.data().pendingCans || 0));
        const nextPending = Math.max(0, oldPending + (isRecovery ? 0 : cansDelivered) - cansCollected);
        tx.update(customerRef, { pendingCans: nextPending, recoveryReservedCans: Math.max(0, Number(customerSnap.data().recoveryReservedCans ?? (isRecovery ? order.pendingCansToCollect || 0 : 0)) + (shouldCreateRecovery ? newCansToRecover : 0) - (isRecovery ? cansCollected : 0)) });
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
          type: 'recovery', parentOrderId: orderId, originalCansToCollect: newCansToRecover, pendingCansToCollect: newCansToRecover, emptyCansCollected: 0,
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
      if (isRecovery) throw new Error('Recovery balances must remain open until collected.');
      tx.set(statsRef, isRecovery ? { cancelledRecoveryOrders: increment(1) } : { cancelledOrders: increment(1) }, { merge: true });
    }
  });

  log.orders.info(`Status transition committed: ${params.order.status} → ${toStatus}`, {
    orderNo: params.order.orderNo,
    orderId,
    actorRole: actor.role,
    actorUid: actor.uid,
  });

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
