import { initializeApp } from 'firebase/app';
import { initializeAuth, inMemoryPersistence, signInAnonymously } from 'firebase/auth';

const firebaseConfig = {
  apiKey:            'AIzaSyBkFWe2PEcJpJh_V51C6sYyuEvueLXGs4k',
  authDomain:        'anandhi-stores.firebaseapp.com',
  projectId:         'anandhi-stores',
  storageBucket:     'anandhi-stores.firebasestorage.app',
  messagingSenderId: '36431070330',
  appId:             '1:36431070330:web:ae9fd7ddb350c9b3d967c3',
};

const app = initializeApp(firebaseConfig);
const auth = initializeAuth(app, { persistence: inMemoryPersistence });

async function main() {
  try {
    const cred = await signInAnonymously(auth);
    console.log('Anonymous sign-in SUCCESS:', cred.user.uid);
  } catch (e) {
    console.log('Anonymous sign-in FAILED:', e.code, e.message);
  }
  process.exit(0);
}

main();
