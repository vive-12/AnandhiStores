// config/firebase.ts — Firebase initialisation
// Auth is initialised here ready for P4.
// NOTE: Firebase 12 removed getReactNativePersistence from firebase/auth.
// We use inMemoryPersistence here; session persistence via AsyncStorage is
// implemented in the auth service (P4) by storing tokens manually.
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { initializeAuth, inMemoryPersistence } from 'firebase/auth';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey:            process.env.EXPO_PUBLIC_FIREBASE_API_KEY || 'AIzaSyBkFWe2PEcJpJh_V51C6sYyuEvueLXGs4k',
  authDomain:        process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || 'anandhi-stores.firebaseapp.com',
  projectId:         process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || 'anandhi-stores',
  storageBucket:     process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || 'anandhi-stores.firebasestorage.app',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '36431070330',
  appId:             process.env.EXPO_PUBLIC_FIREBASE_APP_ID || '1:36431070330:web:ae9fd7ddb350c9b3d967c3',
};

// Guard against hot-reload double init
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const db      = getFirestore(app);
export const storage = getStorage(app);

// initializeAuth with inMemoryPersistence — P4 will add AsyncStorage-based
// persistence once we confirm the correct approach for Firebase 12 + Expo.
export const auth = initializeAuth(app, {
  persistence: inMemoryPersistence,
});
