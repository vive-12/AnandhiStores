import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp } from 'firebase/app';
import { collection, getDocs, getFirestore, query, orderBy, documentId, limit, startAfter, Timestamp } from 'firebase/firestore';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const source = await readFile(resolve(repo, 'mobile/config/firebase.ts'), 'utf8');
const projectId = source.match(/projectId:\s*process\.env\.EXPO_PUBLIC_FIREBASE_PROJECT_ID\s*\|\|\s*'([^']+)'/)?.[1];
const apiKey = source.match(/apiKey:\s*process\.env\.EXPO_PUBLIC_FIREBASE_API_KEY\s*\|\|\s*'([^']+)'/)?.[1];
if (projectId !== 'anandhi-stores' || !apiKey) throw new Error('Unexpected Firebase project; refusing access.');
const db = getFirestore(initializeApp({ projectId, apiKey }, 'cleanup-audit'));
const names = ['users', 'agents', 'orders', 'items', 'inventory', 'banners', 'offers', 'settings', 'stats_daily', 'counters', 'notifications', 'qr_codes', 'account_help'];
function encode(value) {
  if (value instanceof Timestamp) return { __timestamp: [value.seconds, value.nanoseconds] };
  if (Array.isArray(value)) return value.map(encode);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v]) => [k,encode(v)]));
  return value;
}
const snapshot = { projectId, capturedAt: new Date().toISOString(), collections: {} };
for (const name of names) {
  const rows = [];
  let cursor;
  do {
    const page = await getDocs(query(collection(db, name), orderBy(documentId()), ...(cursor ? [startAfter(cursor)] : []), limit(200)));
    rows.push(...page.docs.map(d => ({ id: d.id, data: encode(d.data()) })));
    cursor = page.size === 200 ? page.docs.at(-1) : null;
  } while (cursor);
  snapshot.collections[name] = rows;
}
const folder = resolve(repo, '.verify/cleanup', new Date().toISOString().replace(/[:.]/g, '-'));
await mkdir(folder, { recursive: true });
await writeFile(resolve(folder, 'snapshot.json'), JSON.stringify(snapshot, null, 2));
const users = snapshot.collections.users, orders = snapshot.collections.orders;
const duplicatePhones = Object.entries(Object.groupBy(users, row => String(row.data.phone || '').replace(/\D/g,'').slice(-10)))
  .filter(([phone, rows]) => phone && rows.length > 1).map(([phone, rows]) => ({ phoneSuffix: phone.slice(-4), profiles: rows.map(r => ({ id:r.id,role:r.data.role,name:r.data.name,status:r.data.status, references:orders.filter(o => o.data.customerId===r.id || o.data.agentId===r.id || o.data.user_id===r.id || String(o.data.agent_id||'')===r.id).length })) }));
const report = {
  projectId, backup: folder, counts: Object.fromEntries(names.map(n => [n, snapshot.collections[n].length])),
  users: users.map(r => ({ id:r.id, role:r.data.role, name:r.data.name || [r.data.first_name,r.data.last_name].filter(Boolean).join(' '), phoneSuffix:String(r.data.phone||'').slice(-4), status:r.data.status, isDemo:r.data.isDemo, isArchived:r.data.isArchived, pendingCans:r.data.pendingCans ?? r.data.pending_cans, hasPlainPin:'plainPin' in r.data || /^\d{4}$/.test(String(r.data.pin||'')), authUid:r.data.authUid, orderRefs: orders.filter(o => [o.data.customerId,o.data.agentId,o.data.user_id,String(o.data.agent_id||'')].includes(r.id)).length })),
  duplicatePhones,
  orderShapes: Object.entries(Object.groupBy(orders, o => String(o.data.status || 'missing') + '/' + String(o.data.type || 'legacy'))).map(([shape,rows]) => ({ shape, count:rows.length, examples:rows.slice(0,2).map(r => ({id:r.id,keys:Object.keys(r.data),customerId:r.data.customerId,user_id:r.data.user_id,agentId:r.data.agentId,agent_id:r.data.agent_id,orderNo:r.data.orderNo})) })),
  recoveries: orders.filter(o => o.data.type==='recovery').map(r => ({id:r.id,status:r.data.status,customerId:r.data.customerId,phoneSuffix:String(r.data.customerPhone||'').slice(-4),pending:r.data.pendingCansToCollect,collected:r.data.emptyCansCollected,parent:r.data.parentOrderId})),
  danglingCustomers: orders.filter(o => o.data.customerId && !users.some(u => u.id===o.data.customerId) && o.data.customerId!=='walkin-customer').length,
  danglingAgents: orders.filter(o => o.data.agentId && !users.some(u => u.id===o.data.agentId) && !snapshot.collections.agents.some(a=>a.id===o.data.agentId)).length,
  legacyAgents: snapshot.collections.agents.map(r=>({id:r.id,name:r.data.name,phoneSuffix:String(r.data.phone||'').slice(-4),keys:Object.keys(r.data)}))
};
await writeFile(resolve(folder, 'audit.json'), JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
process.exit(0);
