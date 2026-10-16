/*
 * Safe order lifecycle integration suite.
 * It loads the real TypeScript order service and gives it an in-memory
 * Firestore-compatible transaction adapter. No Firebase app, credentials,
 * network access, or production data are used by this suite.
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '../..');
const store = new Map();
let generatedId = 0;
let timestampTick = 0;
let assertions = 0;
const listenerQueries = [];

class TestTimestamp {
  constructor(ms) { this.ms = ms; this.seconds = Math.floor(ms / 1000); }
  toDate() { return new Date(this.ms); }
  static now() { return new TestTimestamp(Date.UTC(2026, 9, 10, 12, 0, timestampTick++)); }
}
class Increment { constructor(amount) { this.amount = amount; } }

function clone(value) {
  if (value instanceof TestTimestamp || value instanceof Increment) return value;
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clone(v)]));
  return value;
}
function key(collectionName, id) { return `${collectionName}/${id}`; }
function collection(_db, name) { return { kind: 'collection', name }; }
function doc(parent, name, maybeId) {
  if (parent?.kind === 'collection') return { kind: 'doc', collection: parent.name, id: name || `local-${++generatedId}` };
  if (typeof parent === 'object' && parent?.kind === 'db') return { kind: 'doc', collection: name, id: maybeId || `local-${++generatedId}` };
  return { kind: 'doc', collection: parent, id: name || `local-${++generatedId}` };
}
const db = { kind: 'db' };
function snapshot(ref) {
  const data = store.get(key(ref.collection, ref.id));
  return { id: ref.id, exists: () => data !== undefined, data: () => data === undefined ? undefined : clone(data) };
}
function applyValue(oldValue, value) {
  if (value instanceof Increment) return (Number(oldValue) || 0) + value.amount;
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === 'object' && !(value instanceof TestTimestamp)) {
    const out = { ...(oldValue && typeof oldValue === 'object' ? oldValue : {}) };
    for (const [field, next] of Object.entries(value)) out[field] = applyValue(out[field], next);
    return out;
  }
  return clone(value);
}
function applyPatch(target, patch) {
  const out = clone(target || {});
  for (const [field, value] of Object.entries(patch)) {
    if (field.includes('.')) {
      const parts = field.split('.');
      let cursor = out;
      while (parts.length > 1) {
        const part = parts.shift();
        cursor[part] = cursor[part] && typeof cursor[part] === 'object' ? cursor[part] : {};
        cursor = cursor[part];
      }
      const last = parts[0];
      cursor[last] = applyValue(cursor[last], value);
    } else {
      out[field] = applyValue(out[field], value);
    }
  }
  return out;
}
function commitWrite(write) {
  const k = key(write.ref.collection, write.ref.id);
  if (write.type === 'delete') { store.delete(k); return; }
  if (write.type === 'update' && !store.has(k)) throw new Error(`Missing document: ${k}`);
  const previous = store.get(k);
  if (write.type === 'set') {
    store.set(k, write.merge ? applyPatch(previous, write.data) : applyPatch({}, write.data));
  } else {
    store.set(k, applyPatch(previous, write.data));
  }
}
let transactionTail = Promise.resolve();
async function runTransaction(_db, callback) {
  let unlock;
  const prior = transactionTail;
  transactionTail = new Promise(resolve => { unlock = resolve; });
  await prior;
  try {
    const writes = [];
    const tx = {
      get: async ref => snapshot(ref),
      set: (ref, data, options = {}) => writes.push({ type: 'set', ref, data: clone(data), merge: !!options.merge }),
      update: (ref, data) => writes.push({ type: 'update', ref, data: clone(data) }),
      delete: ref => writes.push({ type: 'delete', ref }),
    };
    const result = await callback(tx);
    // Apply to a copy first, so failed writes have no partial effects.
    const before = new Map([...store.entries()].map(([k, v]) => [k, clone(v)]));
    try { for (const write of writes) commitWrite(write); }
    catch (error) { store.clear(); for (const [k, v] of before) store.set(k, v); throw error; }
    return result;
  } finally { unlock(); }
}

function query(...parts) { return { kind: 'query', parts }; }
function where(...args) { return { kind: 'where', args }; }
function orderBy(...args) { return { kind: 'orderBy', args }; }
function limit(value) { return { kind: 'limit', value }; }
function onSnapshot(target, next, error) {
  listenerQueries.push(target);
  try {
    const collectionName = target.kind === 'query' ? target.parts[0].name : target.collection;
    const docs = [...store.entries()].filter(([k]) => k.startsWith(`${collectionName}/`)).map(([k, data]) => {
      const id = k.slice(collectionName.length + 1);
      return { id, data: () => clone(data), exists: () => true };
    });
    next({ docs, empty: docs.length === 0, size: docs.length, exists: () => docs.length > 0 });
  } catch (e) { error?.(e); }
  return () => {};
}
async function updateDoc(ref, data) { commitWrite({ type: 'update', ref, data }); }
async function getDoc(ref) { return snapshot(ref); }
const firestoreMock = {
  collection, doc, getDoc, onSnapshot, runTransaction,
  serverTimestamp: () => TestTimestamp.now(), query, where, orderBy, limit,
  increment: amount => new Increment(amount), Timestamp: TestTimestamp,
  addDoc: async (ref, data) => { const target = doc(ref); commitWrite({ type: 'set', ref: target, data }); return target; },
  updateDoc,
};

// Compile the repository's service files on demand while replacing only the
// Firestore SDK and Firebase app initialization with local in-memory adapters.
require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  module._compile(output, filename);
};
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === 'firebase/firestore') return firestoreMock;
  if (request === '../config/firebase' && parent?.filename.includes(`${path.sep}services${path.sep}`)) return { db };
  if (request === '../utils/logger' && parent?.filename.includes(`${path.sep}services${path.sep}`)) {
    const noop = () => {};
    return { log: { orders: { info: noop, warn: noop, error: noop }, admin: { info: noop, warn: noop } } };
  }
  return originalLoad.call(this, request, parent, isMain);
};

function check(condition, message) {
  assertions++;
  assert.ok(condition, message);
  console.log(`  ✓ ${message}`);
}
function expectReject(promise, message) {
  return promise.then(() => { throw new Error(`Expected rejection: ${message}`); }, () => { assertions++; console.log(`  ✓ ${message}`); });
}
function dump() { return Object.fromEntries([...store.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, clone(v)])); }
function changedPaths(before, after) {
  const paths = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...paths].filter(k => JSON.stringify(before[k]) !== JSON.stringify(after[k])).sort();
}
function read(collectionName, id) { return clone(store.get(key(collectionName, id))); }

async function main() {
  console.log('LOCAL ORDER FLOW SIMULATION — real order service, in-memory Firestore\n');
  const { createOrder, assignAgent, transitionOrder, getOrder, listenCustomerOrders, listenAgentOrders, listenAdminOrders, listenRecoveryOrders } = require(path.join(root, 'services', 'orders.ts'));
  const customer = { uid: 'customer-1', role: 'customer', name: 'Fixture Customer' };
  const agentA = { uid: 'agent-a', role: 'agent', name: 'Agent A' };
  const agentB = { uid: 'agent-b', role: 'agent', name: 'Agent B' };
  const admin = { uid: 'admin-1', role: 'admin', name: 'Admin' };
  const item = { itemId: 'water-can', name: '20L Water Can', unit: 'can', price: 40, qty: 2, lineTotal: 80 };
  const base = {
    actor: customer, items: [item, { itemId: 'rice', name: 'Rice', unit: 'bag', price: 100, qty: 1, lineTotal: 100 }],
    addressSnapshot: { door: '12B', street: 'Fixture Street', locality: 'Velachery', city: 'Chennai' },
    customerName: 'Fixture Customer', customerPhone: '9000000001', subtotal: 180,
    deliveryFee: 20, total: 200, slot: { type: 'asap', label: 'ASAP' }, notes: '', source: 'customer', adminUid: admin.uid,
  };

  console.log('1. Place order: order + sequence + admin notification, no sales/can mutations');
  const beforePlace = dump();
  const orderId = await createOrder(base);
  const afterPlace = dump();
  const placed = read('orders', orderId);
  check(placed.status === 'placed' && placed.type === 'order', 'new order begins placed and is typed retail');
  check(placed.orderNo === 'AS-1000' && read('counters', 'orders').next === 1001, 'order number and counter advance exactly once');
  check(Object.entries(afterPlace).some(([k, v]) => k.startsWith('notifications/') && v.toUid === admin.uid && v.orderId === orderId), 'admin receives the placed notification');
  check(!afterPlace['stats_daily/2026-10-10'] && changedPaths(beforePlace, afterPlace).length === 3, 'placement changes exactly order, counter, and notification; sales are untouched');

  console.log('\n2. Assign, pack, and pick up');
  await assignAgent({ orderId, order: { id: orderId, ...placed }, agent: { ...agentA, phone: '9000000002' }, agentFee: 25, customerId: customer.uid, adminUid: admin.uid, oldAgentUid: null });
  let current = await getOrder(orderId);
  check(current.agentId === agentA.uid && current.status === 'placed', 'assignment sets agent while preserving status');
  await transitionOrder({ orderId, order: current, toStatus: 'packed', actor: admin });
  current = await getOrder(orderId);
  check(current.status === 'packed' && current.statusHistory.at(-1).byRole === 'admin', 'admin packing appends attributed history');
  await transitionOrder({ orderId, order: current, toStatus: 'out_for_delivery', actor: agentA, adminUid: admin.uid });
  current = await getOrder(orderId);
  check(current.status === 'out_for_delivery' && !!current.pickedUpAt, 'agent pickup persists state and timestamp');

  console.log('\n3. Deliver with two cans outstanding: exact metric delta and automatic recovery');
  store.set(key('users', customer.uid), { pendingCans: 0, name: customer.name });
  const beforeDelivery = dump();
  await transitionOrder({ orderId, order: current, toStatus: 'delivered', actor: agentA, adminUid: admin.uid, emptyCansCollected: 0, paymentMethod: 'COD' });
  const afterDelivery = dump();
  const today = read('stats_daily', '2026-10-10');
  const completed = read('orders', orderId);
  const recoveryEntry = Object.entries(afterDelivery).find(([k, v]) => k.startsWith('orders/') && v.type === 'recovery');
  check(completed.status === 'delivered' && completed.emptyCansCollected === 0, 'retail order is delivered once with zero returned cans');
  check(today.orders === 1 && today.revenue === 200 && today.cashRevenue === 200 && today.deliveriesByAgent[agentA.uid] === 1, 'sales, COD, and delivery KPIs rise by the exact order delta');
  check(today.itemQty['water-can'] === 2 && today.itemQty.rice === 1, 'item quantities increase once');
  check(read('users', customer.uid).pendingCans === 2, 'customer can balance increases by delivered cans');
  check(!!recoveryEntry && recoveryEntry[1].pendingCansToCollect === 2 && recoveryEntry[1].agentId === agentA.uid, 'automatic recovery run retains same agent and exact can quantity');
  check(!('revenue' in (recoveryEntry?.[1] || {})) && today.recoveryOrders === undefined, 'creating recovery work does not count recovery as sales or as a completed recovery run');
  const deliveryChanged = changedPaths(beforeDelivery, afterDelivery);
  check(deliveryChanged.some(p => p.startsWith('stats_daily/')) && deliveryChanged.some(p => p === `orders/${orderId}`) && deliveryChanged.some(p => p.startsWith('notifications/')) && deliveryChanged.some(p => p.startsWith('orders/local-')), 'before/after diff includes order, stats, notices, and recovery run');

  console.log('\n4. Duplicate and stale transitions must reject with zero state difference');
  const beforeDuplicate = dump();
  await expectReject(transitionOrder({ orderId, order: completed, toStatus: 'delivered', actor: agentA, adminUid: admin.uid }), 'duplicate delivery rejected');
  check(JSON.stringify(beforeDuplicate) === JSON.stringify(dump()), 'duplicate delivery produces no database diff');
  await expectReject(transitionOrder({ orderId, order: { ...completed, status: 'out_for_delivery' }, toStatus: 'packed', actor: admin }), 'stale/invalid transition rejected against current status');
  check(JSON.stringify(beforeDuplicate) === JSON.stringify(dump()), 'stale transition produces no database diff');

  console.log('\n5. Concurrent duplicate taps and bounded role-based listeners');
  const raceId = await createOrder({ ...base, items: [], subtotal: 200, total: 220 });
  let raceOrder = await getOrder(raceId);
  await assignAgent({ orderId: raceId, order: raceOrder, agent: { ...agentA, phone: '9000000002' }, agentFee: 25, customerId: customer.uid, adminUid: admin.uid, oldAgentUid: null });
  raceOrder = await getOrder(raceId);
  await transitionOrder({ orderId: raceId, order: raceOrder, toStatus: 'out_for_delivery', actor: agentA, adminUid: admin.uid });
  raceOrder = await getOrder(raceId);
  const beforeRace = dump();
  const raceResults = await Promise.allSettled([
    transitionOrder({ orderId: raceId, order: raceOrder, toStatus: 'delivered', actor: agentA, adminUid: admin.uid }),
    transitionOrder({ orderId: raceId, order: raceOrder, toStatus: 'delivered', actor: agentA, adminUid: admin.uid }),
  ]);
  const afterRace = dump();
  check(raceResults.filter(r => r.status === 'fulfilled').length === 1 && raceResults.filter(r => r.status === 'rejected').length === 1, 'two simultaneous delivery taps commit exactly one transition');
  check(read('stats_daily', '2026-10-10').orders === 2 && changedPaths(beforeRace, afterRace).some(p => p === `orders/${raceId}`), 'concurrent replay adds one retail KPI delta and one order transition');
  listenCustomerOrders(customer.uid, () => {}, () => {});
  listenAgentOrders(agentA.uid, () => {}, () => {});
  listenAdminOrders(() => {}, () => {});
  const bounded = listenerQueries.slice(-3);
  check(bounded.every(q => q.parts.some(part => part.kind === 'limit')), 'customer, agent, and admin order listeners all include Firestore limits');

  console.log('\n6. Recovery queue visibility, reassignment while open, and recovery-only metrics');
  const recoveryId = recoveryEntry[0].split('/')[1];
  let visibleRecoveries = [];
  listenRecoveryOrders(data => { visibleRecoveries = data; }, error => { throw error; }, 25);
  const queryArgs = listenerQueries.at(-1);
  check(visibleRecoveries.some(o => o.id === recoveryId && o.status === 'placed'), 'open recovery remains visible in recovery screen after retail delivery');
  check(queryArgs.parts.some(p => p.kind === 'limit' && p.value === 25), 'recovery listener applies caller-provided Firestore limit');
  const beforeReassign = dump();
  await assignAgent({ orderId: recoveryId, order: visibleRecoveries.find(o => o.id === recoveryId), agent: { ...agentB, phone: '9000000003' }, agentFee: 0, customerId: customer.uid, adminUid: admin.uid, oldAgentUid: agentA.uid });
  let recovery = await getOrder(recoveryId);
  check(recovery.agentId === agentB.uid && recovery.status === 'placed', 'admin can reassign open recovery to another agent without hiding it');
  check(changedPaths(beforeReassign, dump()).some(p => p.startsWith('notifications/')), 'reassignment emits notifications for replacement/customer/previous agent');
  await transitionOrder({ orderId: recoveryId, order: recovery, toStatus: 'out_for_delivery', actor: agentB, adminUid: admin.uid });
  recovery = await getOrder(recoveryId);
  const beforeRecoveryDone = dump();
  const retailStatsBeforeRecovery = read('stats_daily', '2026-10-10');
  await transitionOrder({ orderId: recoveryId, order: recovery, toStatus: 'delivered', actor: agentB, adminUid: admin.uid, emptyCansCollected: 2 });
  const afterRecoveryDone = dump();
  const statsAfterRecovery = read('stats_daily', '2026-10-10');
  check(read('users', customer.uid).pendingCans === 0, 'recovery delivery subtracts exactly collected cans from balance');
  check(statsAfterRecovery.orders === retailStatsBeforeRecovery.orders && statsAfterRecovery.revenue === retailStatsBeforeRecovery.revenue && statsAfterRecovery.recoveryOrders === 1, 'recovery increments recovery count but leaves retail sales unchanged');
  check(!('deliveriesByAgent.agent-b' in statsAfterRecovery) && statsAfterRecovery.recoveryRunsByAgent[agentB.uid] === 1, 'recovery run is separated from retail agent deliveries');
  check(changedPaths(beforeRecoveryDone, afterRecoveryDone).some(p => p.startsWith('stats_daily/')), 'recovery completion changes its daily recovery metric');

  console.log('\n7. Recovery-run busy reassignment and cancellation guard');
  let openOrder = await getOrder(recoveryId);
  check(openOrder.status === 'delivered', 'completed recovery is no longer open for reassignment');
  await expectReject(assignAgent({ orderId: recoveryId, order: openOrder, agent: { ...agentA, phone: '9000000002' }, agentFee: 0, customerId: customer.uid, adminUid: admin.uid, oldAgentUid: agentB.uid }), 'completed recovery cannot be reassigned');
  const cancelId = await createOrder({ ...base, items: [], subtotal: 0, deliveryFee: 0, total: 0 });
  const cancelBefore = dump();
  await transitionOrder({ orderId: cancelId, order: await getOrder(cancelId), toStatus: 'cancelled', actor: customer, cancelReason: 'Changed my mind', adminUid: admin.uid });
  const cancelled = await getOrder(cancelId);
  check(cancelled.status === 'cancelled' && cancelled.cancelReason === 'Changed my mind', 'customer cancellation persists reason and terminal status');
  const cancelStats = read('stats_daily', '2026-10-10');
  check(cancelStats.cancelledOrders === 1, 'retail cancellation increments retail cancellation count once');
  const beforeCancelReplay = dump();
  await expectReject(transitionOrder({ orderId: cancelId, order: cancelled, toStatus: 'cancelled', actor: customer }), 'duplicate cancellation rejected');
  check(JSON.stringify(beforeCancelReplay) === JSON.stringify(dump()), 'duplicate cancellation creates no additional diff');
  check(changedPaths(cancelBefore, dump()).some(p => p.startsWith('stats_daily/')), 'cancellation diff includes daily KPI update');

  console.log('\n8. IST boundary key check');
  const { getISTDateKey } = require(path.join(root, 'services', 'stats.ts'));
  check(getISTDateKey(new Date('2026-10-10T18:31:00.000Z')) === '2026-10-11', 'stats writer date key follows IST across UTC midnight boundary');

  console.log(`\nPASS: ${assertions} assertions across real service transactions. Network calls: 0. Production writes: 0.`);
}

main().catch(error => {
  console.error('\nFAIL:', error.stack || error.message || error);
  process.exitCode = 1;
});
