/** One-off, owner-authorized Firestore fresh start. Defaults to a read-only plan. */
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore, Timestamp, GeoPoint, DocumentReference } = require('firebase-admin/firestore');
const { mkdir, writeFile, readFile } = require('node:fs/promises');
const path = require('node:path');
const PROJECT = 'anandhi-stores';
const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const repo = path.resolve(__dirname, '../..');

function encode(value) {
  if (value instanceof Timestamp) return { __type: 'timestamp', seconds: value.seconds, nanoseconds: value.nanoseconds };
  if (value instanceof GeoPoint) return { __type: 'geopoint', latitude: value.latitude, longitude: value.longitude };
  if (value instanceof DocumentReference) return { __type: 'reference', path: value.path };
  if (Buffer.isBuffer(value)) return { __type: 'bytes', base64: value.toString('base64') };
  if (Array.isArray(value)) return value.map(encode);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, encode(v)]));
  return value;
}
const legacyZeroFields = ['pending_cans', 'recovery_reserved_cans', 'active_order_count', 'assigned_run_count', 'totalSales', 'orderCount', 'totalOrders', 'total_orders', 'totalDeliveries', 'total_deliveries', 'completedOrders', 'completed_orders', 'totalEarnings', 'total_earnings', 'earnings', 'cashCollected', 'cash_collected', 'totalRevenue', 'total_revenue', 'ratingCount', 'reviewCount'];
function balancePatch(collection, data) {
  const patch = {};
  if (collection === 'users' && data.role === 'customer') Object.assign(patch, { pendingCans: 0, recoveryReservedCans: 0 });
  if (collection === 'agents' || data.role === 'agent') Object.assign(patch, { activeOrderCount: 0, assignedRunCount: 0 });
  for (const key of legacyZeroFields) if (Object.hasOwn(data, key)) patch[key] = 0;
  if (collection === 'qr_codes') Object.assign(patch, { totalSales: 0, orderCount: 0, lastUsedAt: null });
  return patch;
}
function orderNotice(data) {
  return Boolean(data.orderId || data.order_id || data.orderNo || data.order_no || /order|deliver|can_collection|recovery|review|rating/.test(String(data.type || '')));
}
async function main() {
  for (const flag of args) if (!['--apply', '--confirm=anandhi-stores', '--writes-paused'].includes(flag)) throw new Error('Unknown flag: ' + flag);
  if (process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Remove FIRESTORE_EMULATOR_HOST; this tool targets the explicitly authorized project.');
  if (apply && (!args.has('--confirm=' + PROJECT) || !args.has('--writes-paused'))) throw new Error('Apply requires --confirm=anandhi-stores --writes-paused. Stop app/order writers first.');
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const credential = JSON.parse(await readFile(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8'));
    if (credential.project_id && credential.project_id !== PROJECT) throw new Error('Credential belongs to another project.');
  }
  initializeApp({ projectId: PROJECT, credential: applicationDefault() });
  const db = getFirestore();
  const roots = await db.listCollections();
  const fullDeletes = ['orders', 'stats_daily', 'reviews', 'sales', 'order_history', 'can_recoveries'];
  const documents = new Map();
  async function capture(ref) {
    const snap = await ref.get();
    if (snap.exists) documents.set(ref.path, { path: ref.path, data: encode(snap.data()) });
    for (const child of await ref.listCollections()) for (const childRef of await child.listDocuments()) await capture(childRef);
  }
  const deletes = [];
  for (const name of fullDeletes) {
    if (!roots.some(r => r.id === name)) continue;
    for (const ref of await db.collection(name).listDocuments()) { deletes.push(ref); await capture(ref); }
  }
  for (const notice of (await db.collection('notifications').get()).docs) if (orderNotice(notice.data())) { deletes.push(notice.ref); await capture(notice.ref); }
  const counter = await db.doc('counters/orders').get();
  if (counter.exists) { deletes.push(counter.ref); await capture(counter.ref); }
  const updates = [];
  for (const name of ['users', 'agents', 'qr_codes']) for (const doc of (await db.collection(name).get()).docs) {
    const patch = balancePatch(name, doc.data());
    if (Object.keys(patch).length) { updates.push({ ref: doc.ref, patch }); await capture(doc.ref); }
  }
  const folder = path.join(repo, '.verify', 'fresh-start', new Date().toISOString().replace(/[:.]/g, '-'));
  await mkdir(folder, { recursive: true });
  const plan = { projectId: PROJECT, mode: apply ? 'apply' : 'dry-run', capturedAt: new Date().toISOString(), collections: roots.map(r => r.id), deleteRoots: deletes.map(r => r.path), updates: updates.map(u => ({ path: u.ref.path, patch: u.patch })), capturedDocuments: documents.size };
  await writeFile(path.join(folder, 'backup.json'), JSON.stringify({ projectId: PROJECT, documents: [...documents.values()] }, null, 2), { mode: 0o600 });
  await writeFile(path.join(folder, 'plan.json'), JSON.stringify(plan, null, 2));
  console.log(JSON.stringify({ ...plan, backupFolder: folder }, null, 2));
  if (!apply) return;
  // Sequential work keeps requests small and makes an interrupted reset safely rerunnable.
  for (const ref of deletes) await db.recursiveDelete(ref);
  for (const { ref, patch } of updates) await ref.update(patch);
  const failures = [];
  for (const name of fullDeletes) if (!(await db.collection(name).limit(1).get()).empty) failures.push(name + ' still has documents');
  for (const notice of (await db.collection('notifications').get()).docs) if (orderNotice(notice.data())) failures.push('order notification remains');
  if ((await db.doc('counters/orders').get()).exists) failures.push('order counter remains');
  for (const { ref, patch } of updates) { const data = (await ref.get()).data(); for (const [key, value] of Object.entries(patch)) if (!data || data[key] !== value) failures.push(ref.path + '/' + key); }
  await writeFile(path.join(folder, 'result.json'), JSON.stringify({ verifiedAt: new Date().toISOString(), success: failures.length === 0, failures }, null, 2));
  if (failures.length) throw new Error('Reset verification failed. See private result.json.');
  console.log('Fresh start verified: orders/recoveries, sales statistics and related balances cleared. Accounts/catalog/settings preserved.');
}
main().catch(error => { console.error(error.message || error); process.exitCode = 1; });
