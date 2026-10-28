import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { initializeApp } from 'firebase/app';
import { collection, getDocs, getFirestore } from 'firebase/firestore';

function firebaseConfigValue(name, envName) {
  if (process.env[envName]) return process.env[envName];
  const source = readFileSync(resolve(process.cwd(), 'config/firebase.ts'), 'utf8');
  const match = source.match(new RegExp(`${name}:\\s*process\\.env\\.${envName}\\s*\\|\\|\\s*'([^']+)'`));
  if (!match) throw new Error(`Firebase config value ${envName} is missing.`);
  return match[1];
}

const config = {
  apiKey: firebaseConfigValue('apiKey', 'EXPO_PUBLIC_FIREBASE_API_KEY'),
  authDomain: firebaseConfigValue('authDomain', 'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN'),
  projectId: firebaseConfigValue('projectId', 'EXPO_PUBLIC_FIREBASE_PROJECT_ID'),
  storageBucket: firebaseConfigValue('storageBucket', 'EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: firebaseConfigValue('messagingSenderId', 'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID'),
  appId: firebaseConfigValue('appId', 'EXPO_PUBLIC_FIREBASE_APP_ID'),
};

const app = initializeApp(config, 'inspector2');
const db = getFirestore(app);

async function run() {
  const usersSnap = await getDocs(collection(db, 'users'));
  console.log('--- FULL USER DETAILS ---');
  usersSnap.forEach(d => console.log(d.id, JSON.stringify(d.data(), null, 2)));

  const ordersSnap = await getDocs(collection(db, 'orders'));
  console.log(`\n--- ORDERS (${ordersSnap.size} total) ---`);
  const agentRefs = new Set();
  const customerRefs = new Set();
  ordersSnap.forEach(d => {
    const data = d.data();
    if (data.agentId) agentRefs.add(data.agentId);
    if (data.customerId) customerRefs.add(data.customerId);
  });
  console.log('Referenced agentIds:', Array.from(agentRefs));
  console.log('Referenced customerIds:', Array.from(customerRefs));

  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
