// config/firebase.ts — Firebase initialisation
// Firebase Auth credentials persist in AsyncStorage across app restarts.
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
// Firebase v12 exposes this symbol through its React Native runtime condition,
// but the package's generic TypeScript declarations omit the native export.
// @ts-expect-error Expo Metro resolves the React Native auth entry for iOS/Android.
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
export const functions = getFunctions(app, 'asia-south1');

// Persist Firebase Auth sessions across Expo Go restarts with AsyncStorage.
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});
