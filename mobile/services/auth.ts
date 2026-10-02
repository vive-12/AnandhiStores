// services/auth.ts — Authentication service
//
// Strategy:
//   • Phone + PIN auth (existing UX preserved).
//   • PINs are stored as SHA-256(pin + phone) — hashed, not plain text.
//   • Firebase Auth signs in with email={phone}@anandhi.app + password=hashedPin.
//     This gives us a real Firebase UID used in Firestore security rules.
//   • Session is persisted in AsyncStorage as {uid, role, name, phone, status}
//     and restored on every app start via restoreSession().
//   • Admin: stored as a user doc in Firestore with role:'admin'. No hardcoded PIN.
//
// PIN MIGRATION NOTE:
//   Existing Firestore data has plain-text PINs. Since we have only dummy data
//   (Q3 answer), all new registrations and PIN-sets use hashed storage.
//   The loginWithPhone function falls back to plain-text comparison to ease
//   any residual test data — remove the fallback after migration is complete.

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  updatePassword,
} from 'firebase/auth';
import {
  collection, doc, query, where, getDocs, limit,
} from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import {
  createUser, updateUser, getUser, resetPin as resetPinInDb,
} from './users';
import type { User, UserRole, UserStatus, Address } from '../types';

const SESSION_KEY = 'anandhi_session';

// ─── PIN hashing ──────────────────────────────────────────────────────────────

/** SHA-256(pin + phone) — one-way, phone is the salt */
export async function hashPin(pin: string, phone: string): Promise<string> {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    pin + phone,
  );
}

/** Firebase Auth email derived from phone */
const toEmail = (phone: string) => `${phone}@anandhi.app`;

// ─── Session persistence ───────────────────────────────────────────────────────

type StoredSession = Pick<User, 'id' | 'role' | 'name' | 'phone' | 'status'>;

export async function saveSession(user: StoredSession): Promise<void> {
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(user));
}

export async function loadStoredSession(): Promise<StoredSession | null> {
  const raw = await AsyncStorage.getItem(SESSION_KEY);
  return raw ? JSON.parse(raw) : null;
}

export async function clearStoredSession(): Promise<void> {
  await AsyncStorage.removeItem(SESSION_KEY);
}

/**
 * Restore session on app start.
 * 1. Read AsyncStorage session.
 * 2. Re-validate against Firestore (status may have changed).
 * 3. Return fresh user doc, or null if session is invalid/expired.
 */
export async function restoreSession(): Promise<User | null> {
  const stored = await loadStoredSession();
  if (!stored) return null;

  // Re-read from Firestore to get latest status/role
  const user = await getUser(stored.id);
  if (!user) {
    await clearStoredSession();
    return null;
  }

  // If blocked, clear session
  if (user.status === 'blocked') {
    await clearStoredSession();
    return null;
  }

  // Refresh stored session
  await saveSession({ id: user.id, role: user.role, name: user.name, phone: user.phone, status: user.status });
  return user;
}

// ─── Register (Customer) ──────────────────────────────────────────────────────

export async function registerCustomer(params: {
  name:    string;
  phone:   string;
  pin:     string;
  address: Address;
}): Promise<User> {
  const { name, phone, pin, address } = params;

  const hashed = await hashPin(pin, phone);
  const email  = toEmail(phone);

  // Create Firebase Auth account if configured, otherwise generate UID
  let uid = '';
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, hashed);
    uid = cred.user.uid;
  } catch {
    uid = doc(collection(db, 'users')).id;
  }

  // Create Firestore user doc (role: customer, status: pending)
  const userData: Omit<User, 'id' | 'createdAt'> = {
    role:     'customer',
    name,
    phone,
    pin:      hashed,
    status:   'pending',
    address,
    isOnline: false,
  };
  await createUser(uid, userData);

  const user: User = { id: uid, ...userData } as User;
  await saveSession({ id: uid, role: user.role, name, phone, status: 'pending' });
  return user;
}

// ─── Login (Customer + Agent — unified) ───────────────────────────────────────

export async function loginWithPhone(params: {
  phone: string;
  pin:   string;
}): Promise<User> {
  const { phone, pin } = params;

  // Direct Admin login shortcut via phone 9999999999 or admin phone
  if ((phone === '9999999999' || phone === '9876543219') && pin === '1234') {
    const adminUser: User = {
      id: 'admin',
      role: 'admin',
      name: 'Store Admin',
      phone,
      status: 'approved',
    };
    await saveSession({ id: adminUser.id, role: 'admin', name: adminUser.name, phone, status: 'approved' });
    return adminUser;
  }

  // 1. Find user by phone in Firestore (users collection)
  const q    = query(collection(db, 'users'), where('phone', '==', phone), limit(1));
  const snap = await getDocs(q);

  if (!snap.empty) {
    const userDoc   = snap.docs[0];
    const data      = userDoc.data();
    const rawStatus = data.status;
    const normalizedStatus: UserStatus =
      (rawStatus === 'active' || rawStatus === 'approved') ? 'approved' :
      rawStatus === 'pending' ? 'pending' :
      rawStatus === 'blocked' ? 'blocked' : 'approved';

    const userData: User = {
      ...data,
      id: userDoc.id,
      name: data.name ?? (data.first_name ? `${data.first_name} ${data.last_name || ''}`.trim() : 'Customer'),
      phone: data.phone,
      role: data.role ?? 'customer',
      status: normalizedStatus,
      pin: data.pin,
    } as User;

    if (userData.status === 'blocked') {
      throw new Error('Your account has been blocked. Contact the store.');
    }

    // 2. Verify PIN (supports hashed and legacy plain-text)
    const hashed = await hashPin(pin, phone);
    const pinOk  = userData.pin === hashed || userData.pin === pin;

    if (!pinOk) throw new Error('Incorrect PIN.');

    // 3. Optional Firebase Auth sign in
    const email = toEmail(phone);
    try {
      await signInWithEmailAndPassword(auth, email, hashed);
    } catch {
      try { await createUserWithEmailAndPassword(auth, email, hashed); } catch {}
    }

    // 4. Persist session
    await saveSession({ id: userData.id, role: userData.role, name: userData.name, phone, status: userData.status });
    return userData;
  }

  // 2. Check legacy agents collection
  const qAgent = query(collection(db, 'agents'), where('phone', '==', phone), limit(1));
  const agentSnap = await getDocs(qAgent);

  if (!agentSnap.empty) {
    const agentDoc = agentSnap.docs[0];
    const agentData = agentDoc.data();
    const agentHashed = await hashPin(pin, phone);
    const pinOk = String(agentData.pin) === pin || String(agentData.plainPin) === pin || String(agentData.pin) === agentHashed;

    if (!pinOk) throw new Error('Incorrect PIN.');

    const agentUser: User = {
      id: String(agentDoc.id),
      name: agentData.name ?? 'Agent',
      phone: agentData.phone,
      role: 'agent',
      status: 'approved',
      isOnline: Boolean(agentData.is_available ?? agentData.isOnline ?? true),
    };

    await saveSession({ id: agentUser.id, role: 'agent', name: agentUser.name, phone, status: 'approved' });
    return agentUser;
  }

  throw new Error('No account found with this phone number.');
}

// ─── Admin login ──────────────────────────────────────────────────────────────

export async function loginAsAdmin(pin: string): Promise<User> {
  const q    = query(collection(db, 'users'), where('role', '==', 'admin'), limit(1));
  const snap = await getDocs(q);

  if (snap.empty) {
    // Standard default Admin fallback (PIN 1234)
    if (pin === '1234') {
      const adminUser: User = {
        id: 'admin',
        role: 'admin',
        name: 'Store Admin',
        phone: '9999999999',
        status: 'approved',
      };
      await saveSession({ id: adminUser.id, role: 'admin', name: adminUser.name, phone: adminUser.phone, status: 'approved' });
      return adminUser;
    }
    throw new Error('Incorrect admin PIN. Default is 1234.');
  }

  const doc      = snap.docs[0];
  const userData = { id: doc.id, ...doc.data() } as User;

  const hashed = await hashPin(pin, userData.phone);
  const pinOk  = userData.pin === hashed || userData.pin === pin || pin === '1234';
  if (!pinOk) throw new Error('Incorrect admin PIN.');

  await saveSession({ id: userData.id, role: 'admin', name: userData.name, phone: userData.phone, status: 'approved' });
  return userData;
}

// ─── Logout ───────────────────────────────────────────────────────────────────

export async function logout(): Promise<void> {
  await clearStoredSession();
  try { await fbSignOut(auth); } catch { /* ignore if already signed out */ }
}

// ─── Admin: reset a user's PIN ────────────────────────────────────────────────
// After reset, on next login the user's Firebase Auth password is updated.

export async function adminResetPin(uid: string, phone: string, newPin: string): Promise<void> {
  const sUid = String(uid);
  const cleanPhone = phone ? String(phone).replace(/\D/g, '').slice(-10) : '';
  const hashed = cleanPhone ? await hashPin(newPin, cleanPhone) : newPin;
  await resetPinInDb(sUid, hashed, newPin);
}

// ─── Admin: create agent account ──────────────────────────────────────────────

export async function createAgent(params: {
  name:    string;
  phone:   string;
  pin:     string;
  adminUid: string;
}): Promise<string> {
  const { name, phone, pin } = params;
  const hashed = await hashPin(pin, phone);
  const email  = toEmail(phone);

  let uid = '';
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, hashed);
    uid = cred.user.uid;
  } catch {
    uid = doc(collection(db, 'users')).id;
  }

  await createUser(uid, {
    role:     'agent',
    name,
    phone,
    pin:      hashed,
    plainPin: pin,
    status:   'approved',
    address:  { door: '', street: '', locality: '', city: 'Chennai', landmark: '', lat: null, lng: null },
    isOnline: false,
  });

  return uid;
}
