'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { root, store, key, clone, TestTimestamp, listenerQueries } = require('../Shared/service-harness.cjs');
let assertions = 0;
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
    deliveryFee: 20, total: 200, slot: { type: 'asap', label: '5 min' }, notes: '', source: 'customer', adminUid: admin.uid,
  };

  store.set(key('users', customer.uid), { role: 'customer', status: 'approved', pendingCans: 0, name: customer.name });
  store.set(key('users', admin.uid), { role: 'admin', status: 'approved', name: admin.name });
  store.set(key('users', agentA.uid), { role: 'agent', status: 'approved', isOnline: true, activeOrderCount: 0 });
  store.set(key('users', agentB.uid), { role: 'agent', status: 'approved', isOnline: true, activeOrderCount: 0 });
  store.set(key('settings', 'store'), { minOrderValue: 99, deliveryFee: 20, freeDeliveryAbove: 299, openTime: '07:00', closeTime: '21:00', isStoreOpenOverride: true, instantDeliveryEnabled: true, slots: ['5 min', 'Evening'], agentFeePerDelivery: 25 });
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

  // Pickup checklist validation tests
  await expectReject(
    transitionOrder({ orderId, order: current, toStatus: 'out_for_delivery', actor: agentA, adminUid: admin.uid }),
    'agent pickup without checklist rejected',
  );
  await expectReject(
    transitionOrder({ orderId, order: current, toStatus: 'out_for_delivery', actor: agentA, adminUid: admin.uid, checkedItems: { 0: true } }),
    'agent pickup with incomplete checklist rejected',
  );

  // Transition with complete checklist (all 2 items checked)
  await transitionOrder({
    orderId,
    order: current,
    toStatus: 'out_for_delivery',
    actor: agentA,
    adminUid: admin.uid,
    checkedItems: { 0: true, 1: true },
  });
  current = await getOrder(orderId);
  check(current.status === 'out_for_delivery' && !!current.pickedUpAt, 'agent pickup persists state and timestamp');
  check(!!current.checkedItems && (current.checkedItems[0] === true || current.checkedItems['0'] === true), 'pickup checklist persisted to order document');

  console.log('\n3. Deliver with two cans outstanding: exact metric delta and automatic recovery');
  store.set(key('users', customer.uid), { role: 'customer', status: 'approved', pendingCans: 0, name: customer.name });
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


  console.log('\n9. Partial recovery remains outstanding and replay-safe');
  const partialId = await createOrder(base);
  let partial = await getOrder(partialId);
  await assignAgent({ orderId: partialId, order: partial, agent: { ...agentA, phone: '9000000002' }, agentFee: 25, customerId: customer.uid, adminUid: admin.uid, oldAgentUid: null });
  await transitionOrder({ orderId: partialId, order: partial, toStatus: 'out_for_delivery', actor: agentA, checkedItems: { 0: true, 1: true } });
  await transitionOrder({ orderId: partialId, order: await getOrder(partialId), toStatus: 'delivered', actor: agentA, emptyCansCollected: 0 });
  const runEntry = [...store.entries()].find(([k, o]) => k.startsWith('orders/') && o.parentOrderId === partialId);
  const partialRunId = runEntry[0].split('/')[1];
  await transitionOrder({ orderId: partialRunId, order: await getOrder(partialRunId), toStatus: 'out_for_delivery', actor: agentA });
  const beforePartial = read('stats_daily', '2026-10-10');
  await transitionOrder({ orderId: partialRunId, order: await getOrder(partialRunId), toStatus: 'delivered', actor: agentA, emptyCansCollected: 1 });
  let partialRun = await getOrder(partialRunId);
  check(partialRun.status === 'placed' && partialRun.pendingCansToCollect === 1 && partialRun.emptyCansCollected === 1 && !partialRun.deliveredAt, 'partial collection keeps one can outstanding on same open run');
  check(read('users', customer.uid).pendingCans === 1 && JSON.stringify(beforePartial) === JSON.stringify(read('stats_daily', '2026-10-10')), 'partial collection reduces balance without any sales or completed-recovery delta');
  await expectReject(transitionOrder({ orderId: partialRunId, order: partialRun, toStatus: 'delivered', actor: agentA, emptyCansCollected: 1 }), 'duplicate partial-collection tap cannot collect twice');
  await expectReject(createOrder({ ...base, actor: admin, type: 'recovery', items: [], pendingCansToCollect: 1 }), 'manual recovery requires explicit customer ownership');
  await expectReject(createOrder({ ...base, actor: admin, customerId: customer.uid, type: 'recovery', items: [], pendingCansToCollect: 1 }), 'already reserved cans cannot create a duplicate run');
  await transitionOrder({ orderId: partialRunId, order: partialRun, toStatus: 'out_for_delivery', actor: agentA });
  await transitionOrder({ orderId: partialRunId, order: await getOrder(partialRunId), toStatus: 'delivered', actor: agentA, emptyCansCollected: 1 });
  check(read('users', customer.uid).pendingCans === 0 && read('orders', partialRunId).emptyCansCollected === 2, 'later visit closes exactly the remaining balance with cumulative collection history');

  console.log('\n10. Packing race, wrong agent, and durable admin recipients');
  const packedId = await createOrder({ ...base, adminUid: undefined });
  await transitionOrder({ orderId: packedId, order: await getOrder(packedId), toStatus: 'packed', actor: admin });
  await expectReject(transitionOrder({ orderId: packedId, order: { ...(await getOrder(packedId)), status: 'placed' }, toStatus: 'cancelled', actor: customer }), 'customer placed-button race cannot cancel packed order');
  await expectReject(transitionOrder({ orderId: packedId, order: await getOrder(packedId), toStatus: 'out_for_delivery', actor: agentB, checkedItems: { 0: true, 1: true } }), 'unassigned agent cannot pick up another run');
  check([...store.values()].some(o => o.toUid === admin.uid && o.orderId === packedId && o.pushStatus === 'pending'), 'new order without caller admin UID creates durable notice for actual admin');

  console.log('\n11. Terminal history cannot evict old active work');
  for (let i = 0; i < 240; i++) store.set(key('orders', 'historic-' + i), { ...placed, agentId: agentA.uid, customerId: customer.uid, status: 'delivered', createdAt: new TestTimestamp(Date.UTC(2026, 10, 1) + i * 1000) });
  const ancient = { ...placed, status: 'placed', agentId: agentA.uid, createdAt: new TestTimestamp(1) };
  store.set(key('orders', 'ancient-active'), ancient);
  let feed = [];
  const stopFeed = listenAgentOrders(agentA.uid, data => { feed = data; }, error => { throw error; }, 25);
  check(feed.some(o => o.id === 'ancient-active') && feed.filter(o => o.status === 'delivered').length === 25, 'all active work survives a separately bounded completed-history feed');
  stopFeed();


  console.log('\n12. Store availability and blocking do not erase existing work');
  const stateBeforeBlock = read('orders', 'ancient-active');
  store.set(key('users', customer.uid), { ...read('users', customer.uid), status: 'blocked' });
  await expectReject(createOrder(base), 'blocked customer cannot create an order even if checkout was already open');
  check(JSON.stringify(stateBeforeBlock) === JSON.stringify(read('orders', 'ancient-active')), 'blocking leaves existing run data unchanged');
  store.set(key('users', customer.uid), { ...read('users', customer.uid), status: 'approved' });
  store.set(key('settings', 'store'), { ...read('settings', 'store'), instantDeliveryEnabled: false });
  await expectReject(createOrder(base), 'instant order is rejected if admin disables it during checkout');
  const scheduled = await createOrder({ ...base, slot: { type: 'scheduled', label: 'Evening' } });
  check(read('orders', scheduled).slot.label === 'Evening', 'scheduled order still succeeds while instant delivery is off');

  console.log(`\nPASS: ${assertions} assertions across real service transactions. Network calls: 0. Production writes: 0.`);
}

main().catch(error => {
  console.error('\nFAIL:', error.stack || error.message || error);
  process.exitCode = 1;
});
