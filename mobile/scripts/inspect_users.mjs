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

const app = initializeApp(config, 'inspector');
const db = getFirestore(app);

async function run() {
  console.log('--- USERS COLLECTION ---');
  const usersSnap = await getDocs(collection(db, 'users'));
  const users = [];
  usersSnap.forEach(doc => {
    const data = doc.data();
    users.push({
      id: doc.id,
      phone: data.phone,
      name: data.name,
      role: data.role,
      status: data.status,
      pin: data.pin ? `${String(data.pin).slice(0, 8)}... (len ${String(data.pin).length})` : undefined,
      plainPin: data.plainPin,
      createdAt: data.createdAt,
    });
  });
  console.log(`Found ${users.length} users:`);
  console.log(JSON.stringify(users, null, 2));

  console.log('--- AGENTS COLLECTION ---');
  const agentsSnap = await getDocs(collection(db, 'agents'));
  const agents = [];
  agentsSnap.forEach(doc => {
    const data = doc.data();
    agents.push({
      id: doc.id,
      phone: data.phone,
      name: data.name,
      role: data.role,
      status: data.status,
      pin: data.pin ? `${String(data.pin).slice(0, 8)}... (len ${String(data.pin).length})` : undefined,
      plainPin: data.plainPin,
    });
  });
  console.log(`Found ${agents.length} legacy agents:`);
  console.log(JSON.stringify(agents, null, 2));

  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
