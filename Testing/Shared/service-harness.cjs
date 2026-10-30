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
const ts = require('./paths.cjs').requireMobile('typescript');

const root = require('./paths.cjs').mobile;
const store = new Map();
let generatedId = 0;
let timestampTick = 0;

const listenerQueries = [];

class TestTimestamp {
  constructor(ms) { this.ms = ms; this.seconds = Math.floor(ms / 1000); }
  toDate() { return new Date(this.ms); }
  static now() { return new TestTimestamp(TestTimestamp.base + timestampTick++ * 1000); }
}
TestTimestamp.base = Date.UTC(2026, 9, 10, 12);
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
  if (typeof parent === 'object' && parent?.kind === 'db') { if (!maybeId && name.includes('/')) { const parts = name.split('/'); return { kind: 'doc', collection: parts.slice(0, -1).join('/'), id: parts.at(-1) }; } return { kind: 'doc', collection: name, id: maybeId || `local-${++generatedId}` }; }
  return { kind: 'doc', collection: parent, id: name || `local-${++generatedId}` };
}
const db = { kind: 'db' };
function snapshot(ref) {
  const data = store.get(key(ref.collection, ref.id));
  return { id: ref.id, ref, exists: () => data !== undefined, data: () => data === undefined ? undefined : clone(data) };
}
function applyValue(oldValue, value) {
  if (value instanceof Increment) return (Number(oldValue) || 0) + value.amount;
  if (value && value.__arrayUnion) return [...new Set([...(oldValue || []), ...value.values])];
  if (value && value.__arrayRemove) return (oldValue || []).filter(v => !value.values.includes(v));
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
    emitSnapshots();
    return result;
  } finally { unlock(); }
}

function query(...parts) { return { kind: 'query', parts }; }
function where(...args) { return { kind: 'where', args }; }
function orderBy(...args) { return { kind: 'orderBy', args }; }
function limit(value) { return { kind: 'limit', value }; }
function queryDocs(target) {
  const collectionName = target.kind === 'query' ? target.parts[0].name : target.name || target.collection;
  let docs = [...store.entries()].filter(([k]) => k.startsWith(collectionName + '/')).map(([k, data]) => ({ ref: doc(db, collectionName, k.slice(collectionName.length + 1)), id: k.slice(collectionName.length + 1), data: () => clone(data), exists: () => true }));
  for (const part of target.parts || []) if (part.kind === 'where') {
    const [field, op, value] = part.args;
    docs = docs.filter(d => op === 'in' ? value.includes(d.data()[field]) : d.data()[field] === value);
  }
  const ordering = (target.parts || []).find(p => p.kind === 'orderBy');
  if (ordering) docs.sort((a, b) => {
    const field = ordering.args[0], direction = ordering.args[1] === 'desc' ? -1 : 1;
    const av = field === '__name__' ? a.id : a.data()[field]?.ms || 0, bv = field === '__name__' ? b.id : b.data()[field]?.ms || 0;
    return av === bv ? a.id.localeCompare(b.id) : (av < bv ? -1 : 1) * direction;
  });
  const cursor = (target.parts || []).find(p => p.kind === 'cursor');
  if (cursor) docs = docs.slice(docs.findIndex(d => d.id === cursor.id) + 1);
  const bound = (target.parts || []).find(p => p.kind === 'limit');
  if (bound) docs = docs.slice(0, bound.value);
  return { docs, empty: !docs.length, size: docs.length, forEach: callback => docs.forEach(callback) };
}

const subscriptions = new Set();
function emitSnapshots() { for (const listener of subscriptions) queueMicrotask(() => { if (subscriptions.has(listener)) listener.emit(); }); }
function onSnapshot(target, next, error) {
  listenerQueries.push(target);
  const listener = { emit() { try { next(target.kind === 'doc' ? snapshot(target) : queryDocs(target)); } catch (e) { error?.(e); } } };
  subscriptions.add(listener); listener.emit(); return () => subscriptions.delete(listener);
}
async function updateDoc(ref, data) { commitWrite({ type: 'update', ref, data }); emitSnapshots(); }
async function getDoc(ref) { return snapshot(ref); }
const firestoreMock = {
  collection, doc, getDoc, onSnapshot, runTransaction,
  getDocs: async target => queryDocs(target), startAfter: cursor => ({ kind: 'cursor', id: cursor.id }), documentId: () => '__name__',
  serverTimestamp: () => TestTimestamp.now(), query, where, orderBy, limit,
  increment: amount => new Increment(amount), Timestamp: TestTimestamp,
  addDoc: async (ref, data) => { const target = doc(ref); commitWrite({ type: 'set', ref: target, data }); emitSnapshots(); return target; },
  updateDoc,
  setDoc: async (ref, data, options = {}) => { commitWrite({ type: 'set', ref, data, merge: !!options.merge }); emitSnapshots(); },
  deleteDoc: async ref => { commitWrite({ type: 'delete', ref }); emitSnapshots(); },
  arrayUnion: (...values) => ({ __arrayUnion: true, values }), arrayRemove: (...values) => ({ __arrayRemove: true, values }),
  writeBatch: () => { const writes = []; const batch = { set(ref, data, options = {}) { writes.push({type:'set',ref,data,merge:!!options.merge}); return batch; }, update(ref,data) { writes.push({type:'update',ref,data}); return batch; }, delete(ref) { writes.push({type:'delete',ref}); return batch; }, async commit() { const before = new Map(store); try { for (const write of writes) commitWrite(write); } catch (e) { store.clear(); for (const [k,v] of before) store.set(k,v); throw e; } emitSnapshots(); } }; return batch; },
};

// Compile the repository's service files on demand while replacing only the
// Firestore SDK and Firebase app initialization with local in-memory adapters.
require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  module._compile(output, filename);
};
const storageMap = new Map();
const storage = { getItem: async k => storageMap.get(k) ?? null, setItem: async (k,v) => { storageMap.set(k,v); }, removeItem: async k => { storageMap.delete(k); } };
let demoConfig = { enabled:true, admin:{phone:'9000000001',pin:'1234',name:'Test Admin'}, customer:{phone:'9000000002',pin:'1211',name:'Test Customer'}, agent:{phone:'9000000003',pin:'1211',name:'Test Agent'} };
const authStub = { currentUser:null, authStateReady:async()=>{} };
const unavailable = async () => { throw Object.assign(new Error('Native/Firebase Auth not configured in service harness'),{code:'auth/configuration-not-found'}); };
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === 'firebase/firestore') return firestoreMock;
  if (request === '@react-native-async-storage/async-storage') return { __esModule:true, default:storage };
  if (request === 'expo-crypto') return { CryptoDigestAlgorithm:{SHA256:'sha256'}, digestStringAsync: async (_, text) => require('node:crypto').createHash('sha256').update(text).digest('hex') };
  if (request === 'expo-constants') return { __esModule:true, default:{expoConfig:{extra:{demoCredentials:demoConfig}}} };
  if (request === 'firebase/auth') return { signOut:async()=>{authStub.currentUser=null;}, createUserWithEmailAndPassword:unavailable, signInWithEmailAndPassword:unavailable, deleteUser:unavailable };
  if (request === 'firebase/functions') return { httpsCallable:()=>unavailable };
  if (request === 'react-native') return { Platform:{OS:'web'} };
  if (request === '../config/firebase' && parent?.filename.includes(`${path.sep}services${path.sep}`)) return { db, auth:authStub, functions:{} };
  if (request === '../utils/logger' && parent?.filename.includes(`${path.sep}services${path.sep}`)) {
    const noop = () => {};
    return { log: new Proxy({}, {get:()=>new Proxy({}, {get:()=>noop})}) };
  }
  return originalLoad.call(this, request, parent, isMain);
};


module.exports = { root, store, db, firestore:firestoreMock, TestTimestamp, storage, storageMap, subscriptions, listenerQueries, clone, snapshot, key, commitWrite, emitSnapshots, setDemoConfig(config) { demoConfig = config; }, service(name) { return require(path.join(root, 'services', name+'.ts')); }, hook(name) { return require(path.join(root, 'hooks', name+'.ts')); } };
