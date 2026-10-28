import { writeFileSync, readFileSync } from 'node:fs';
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

const app = initializeApp(config, 'backup');
const db = getFirestore(app);

async function run() {
  const usersSnap = await getDocs(collection(db, 'users'));
  const users = {};
  usersSnap.forEach(d => {
    users[d.id] = d.data();
  });

  const agentsSnap = await getDocs(collection(db, 'agents'));
  const agents = {};
  agentsSnap.forEach(d => {
    agents[d.id] = d.data();
  });

  const backup = {
    timestamp: new Date().toISOString(),
    users,
    agents,
  };

  const backupPath = resolve(process.cwd(), 'scripts', `backup_users_${Date.now()}.json`);
  writeFileSync(backupPath, JSON.stringify(backup, null, 2), 'utf8');
  console.log(`Backup saved to ${backupPath}`);
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
