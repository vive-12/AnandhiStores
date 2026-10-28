import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { initializeApp } from 'firebase/app';
import { collection, deleteDoc, deleteField, doc, getDoc, getFirestore, updateDoc } from 'firebase/firestore';

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

const app = initializeApp(config, 'reconciler');
const db = getFirestore(app);

function digest(pin, phone) {
  return createHash('sha256').update(`${pin}${phone}`).digest('hex');
}

async function reconcile() {
  console.log('--- STARTING RECONCILIATION & PIN HYGIENE ---');

  // 1. Reconcile duplicate agent for 9940405016
  const duplicateAgentDocRef = doc(db, 'users', 'zu4vb6bow2RMQdYUET2C');
  const dupSnap = await getDoc(duplicateAgentDocRef);
  if (dupSnap.exists()) {
    console.log('Deleting duplicate agent record users/zu4vb6bow2RMQdYUET2C (phone: 9940405016, name: vivr)...');
    await deleteDoc(duplicateAgentDocRef);
    console.log('Deleted duplicate agent record.');
  } else {
    console.log('Duplicate agent record already removed.');
  }

  // 2. Customer: lClrsyxdfA8Gbh6shIQi (Shivani, 9789042245, PIN 1211)
  const custDocRef = doc(db, 'users', 'lClrsyxdfA8Gbh6shIQi');
  const custSnap = await getDoc(custDocRef);
  if (custSnap.exists()) {
    const data = custSnap.data();
    const phone = '9789042245';
    const pin = '1211';
    const hashed = digest(pin, phone);
    console.log(`Updating customer lClrsyxdfA8Gbh6shIQi: setting hashed PIN, status: approved, removing plainPin...`);
    await updateDoc(custDocRef, {
      pin: hashed,
      plainPin: deleteField(),
      status: 'approved',
      name: data.name || (data.first_name ? `${data.first_name} ${data.last_name || ''}`.trim() : 'Shivani R'),
    });
    console.log('Customer profile updated.');
  }

  // 3. Admin: 47R43Kf4qXkflR3T3k2W (Store Admin, 9876543219, PIN 1234)
  const adminDocRef = doc(db, 'users', '47R43Kf4qXkflR3T3k2W');
  const adminSnap = await getDoc(adminDocRef);
  if (adminSnap.exists()) {
    console.log('Cleaning admin plainPin...');
    await updateDoc(adminDocRef, {
      plainPin: deleteField(),
    });
    console.log('Admin profile cleaned.');
  }

  // 4. Agent 3: Smallvivek (9940405016, PIN 1211)
  const agent3DocRef = doc(db, 'users', '3');
  const agent3Snap = await getDoc(agent3DocRef);
  if (agent3Snap.exists()) {
    console.log('Cleaning Agent 3 plainPin...');
    await updateDoc(agent3DocRef, {
      plainPin: deleteField(),
    });
    console.log('Agent 3 profile cleaned.');
  }

  // 5. Agent 1: Ravi Kumar (9876543210, PIN 1211)
  const agent1DocRef = doc(db, 'users', '1');
  const agent1Snap = await getDoc(agent1DocRef);
  if (agent1Snap.exists()) {
    console.log('Cleaning Agent 1 plainPin...');
    await updateDoc(agent1DocRef, {
      plainPin: deleteField(),
    });
    console.log('Agent 1 profile cleaned.');
  }

  // 6. Agent 2: Suresh Babu (9876543211, PIN 1226)
  const agent2DocRef = doc(db, 'users', '2');
  const agent2Snap = await getDoc(agent2DocRef);
  if (agent2Snap.exists()) {
    const data = agent2Snap.data();
    const phone = '9876543211';
    const pin = data.pin === '1226' ? '1226' : (data.plainPin || '1226');
    const hashed = digest(pin, phone);
    console.log('Updating Agent 2: setting hashed PIN and removing plainPin...');
    await updateDoc(agent2DocRef, {
      pin: hashed,
      plainPin: deleteField(),
    });
    console.log('Agent 2 profile updated.');
  }

  // 7. Legacy agents collection: remove plaintext PINs
  const legacyAgents = [
    { id: '1', phone: '9876543210', pin: '1211' },
    { id: '2', phone: '9876543211', pin: '1226' },
    { id: '3', phone: '9940405016', pin: '1211' },
  ];
  for (const item of legacyAgents) {
    const ref = doc(db, 'agents', item.id);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      console.log(`Updating legacy agent ${item.id} with hashed PIN...`);
      await updateDoc(ref, {
        pin: digest(item.pin, item.phone),
        plainPin: deleteField(),
      });
    }
  }

  console.log('--- RECONCILIATION COMPLETE ---');
  process.exit(0);
}

reconcile().catch(err => {
  console.error(err);
  process.exit(1);
});
