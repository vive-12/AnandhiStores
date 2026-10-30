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
  deleteUser,
} from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import {
  collection, query, where, getDocs, limit, doc, setDoc, updateDoc, increment, Timestamp,
} from 'firebase/firestore';
import { auth, db, functions } from '../config/firebase';
import { getDemoAgentName, getDemoCredentials, isDemoCredential } from '../config/demoCredentials';
import {
  createUser, getUser,
} from './users';
import { notifyAdminsOfCustomerSignup, unregisterDevicePushToken } from './notifications';
import type { User, UserStatus, Address } from '../types';
import { recordPinFailure, clearPinFailures } from './accountHelp';
import { useSession } from '../hooks/useSession';
import { useCart } from '../hooks/useCart';
import { log } from '../utils/logger';

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

function firebaseAuthSetupError(error: any): boolean {
  return error?.code === 'auth/configuration-not-found' || error?.code === 'auth/operation-not-allowed';
}

async function waitForFirebaseAuth(): Promise<void> {
  await auth.authStateReady();
  if (!auth.currentUser) throw new Error('Sign in to Firebase before using this account action.');
}

async function signInWithPhonePin(phone: string, hashedPin: string, pin: string): Promise<void> {
  // Demo accounts may use verified Firestore-backed sessions while Firebase Email/Password is being configured.
  if (isDemoCredential(phone, pin)) return;
  const email = toEmail(phone);
  try {
    await signInWithEmailAndPassword(auth, email, hashedPin);
  } catch (signInError: any) {
    try {
      await createUserWithEmailAndPassword(auth, email, hashedPin);
    } catch (createError: any) {
      log.auth.error('Firebase Auth sign-in/account recovery failed', {
        signInCode: signInError?.code,
        createCode: createError?.code,
      });
      if (firebaseAuthSetupError(createError) || firebaseAuthSetupError(signInError)) {
        throw new Error('Firebase Authentication is not configured for this app project. Check the Firebase project and enable Email/Password sign-in, then try again.');
      }
      throw new Error('PIN is valid, but Firebase sign-in could not be completed. Ask an admin to reset this PIN.');
    }
  }
}

// ─── Session persistence ───────────────────────────────────────────────────────

type StoredSession = Pick<User, 'id' | 'role' | 'name' | 'phone' | 'status'> & Partial<Pick<User, 'mustChangePin' | 'sessionVersion' | 'isDemo'>>;

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
  if (!stored) {
    log.auth.debug('restoreSession: no stored session');
    return null;
  }

  log.auth.info('restoreSession: found stored session', { uid: stored.id, role: stored.role });

  await auth.authStateReady();
  const user = await getUser(stored.id);
  const demoAllowed = stored.isDemo && getDemoCredentials().length > 0;
  if (!demoAllowed && auth.currentUser?.uid !== stored.id) { await clearStoredSession(); return null; }
  if (user && (stored.sessionVersion ?? 0) !== (user.sessionVersion ?? 0)) { await clearStoredSession(); return null; }
  if (!user) {
    log.auth.warn('restoreSession: user doc missing in Firestore — clearing session', { uid: stored.id });
    await clearStoredSession();
    return null;
  }

  if (user.status === 'blocked') {
    log.auth.warn('restoreSession: account blocked — clearing session', { uid: user.id });
    await clearStoredSession();
    return null;
  }

  await saveSession({ id: user.id, role: user.role, name: user.name, phone: user.phone, status: user.status, mustChangePin: user.mustChangePin, sessionVersion: user.sessionVersion ?? 0, isDemo: user.isDemo });
  log.auth.info('restoreSession: session restored OK', { uid: user.id, role: user.role, status: user.status });
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

  // A profile without a matching Firebase Auth account cannot securely use
  // authenticated services, so fail registration instead of creating a local UID.
  const development = getDemoCredentials().length > 0;
  const cred = development ? null : await createUserWithEmailAndPassword(auth, email, hashed);
  const uid = cred?.user.uid || doc(collection(db, 'users')).id;

  // Create Firestore user doc (role: customer, status: pending)
  const userData: Omit<User, 'id' | 'createdAt'> = {
    isDemo: development,
    sessionVersion: 0,
    role:     'customer',
    name,
    phone,
    pin:      hashed,
    status:   'pending',
    address,
    isOnline: false,
  };
  try {
    await createUser(uid, userData);
  } catch (error) {
    if (cred) await deleteUser(cred.user).catch(() => {});
    throw error;
  }

  // The registration is already committed. A notification failure must not
  // report the whole signup as failed and strand the new customer's login.
  await notifyAdminsOfCustomerSignup({ id: uid, name, phone }).catch(error => {
    log.auth.warn('Could not notify admins about customer signup', { uid, error });
  });

  const user: User = { id: uid, ...userData } as User;
  await saveSession({ id: uid, role: user.role, name, phone, status: 'pending', isDemo: development, sessionVersion: 0 });
  return user;
}

// ─── Login (Customer + Agent — unified) ───────────────────────────────────────

export async function loginWithPhone(params: {
  phone: string;
  pin:   string;
}): Promise<User> {
  const { phone, pin } = params;

  const hashed = await hashPin(pin, phone);
  const demo = getDemoCredentials().find(d => d.credential.phone === phone && d.credential.pin === pin);
  if (demo) {
    const candidates = await getDocs(query(collection(db, 'users'), where('phone', '==', phone), limit(10)));
    const match = candidates.docs.find(d => d.data().role === demo.role);
    if (!match) await setDoc(doc(db, 'users', 'demo-' + demo.role), { name: demo.credential.name || demo.role, phone, role: demo.role, status: 'approved', pin: hashed, isDemo: true, isOnline: demo.role === 'agent', sessionVersion: 0, createdAt: Timestamp.now() });
    else if (!match.data().isDemo) {
      // Reuse the profile ID to preserve all existing order links; never overwrite its PIN.
      await updateDoc(match.ref, { name: demo.credential.name || match.data().name, isDemo: true });
    }
  }
  const usersQuery = query(collection(db, 'users'), where('phone', '==', phone), limit(10));
  const usersSnap = await getDocs(usersQuery);
  const matchesPin = (data: Record<string, any>) =>
    data.pin === hashed || data.pin === pin || data.plainPin === pin;
  let userMatches = usersSnap.docs.filter(userDoc => matchesPin(userDoc.data()));

  // The development agent may have a duplicate legacy profile. For that
  // specific seeded demo login only, select the explicitly named agent.
  if (userMatches.length > 1 && isDemoCredential(phone, pin)) {
    const preferredAgentName = getDemoAgentName()?.trim().toLowerCase();
    if (preferredAgentName) {
      const preferred = userMatches.filter(doc =>
        doc.data().role === 'agent' && String(doc.data().name ?? '').trim().toLowerCase() === preferredAgentName,
      );
      if (preferred.length === 1) userMatches = preferred;
    }
  }

  if (userMatches.length > 1) {
    log.auth.error('Login blocked: multiple user profiles match one phone and PIN', { count: userMatches.length });
    throw new Error('More than one account matches these details. Contact the store to resolve duplicate profiles.');
  }

  if (userMatches.length === 1) {
    const userDoc = userMatches[0];
    const data = userDoc.data();
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
    } as User;

    if (userData.status === 'blocked') {
      log.auth.warn('Login rejected for a blocked account', { role: userData.role });
      throw new Error('Your account has been blocked. Contact the store.');
    }

    if (userData.isDemo && getDemoCredentials().length > 0) await fbSignOut(auth);
    else await signInWithPhonePin(phone, hashed, pin);
    await clearPinFailures(phone).catch(() => {});
    await saveSession({ id: userData.id, role: userData.role, name: userData.name, phone, status: userData.status, mustChangePin: userData.mustChangePin, sessionVersion: userData.sessionVersion ?? 0, isDemo: userData.isDemo });
    log.auth.info('Phone + PIN login succeeded', { role: userData.role, status: userData.status });
    return userData;
  }

  // Legacy agent collection is a fallback only when no user profile matched.
  const agentsQuery = query(collection(db, 'agents'), where('phone', '==', phone), limit(10));
  const agentsSnap = await getDocs(agentsQuery);
  const agentMatches = agentsSnap.docs.filter(agentDoc => matchesPin(agentDoc.data()));
  if (agentMatches.length > 1) {
    log.auth.error('Login blocked: multiple legacy agent profiles match one phone and PIN', { count: agentMatches.length });
    throw new Error('More than one agent account matches these details. Contact the store to resolve duplicate profiles.');
  }
  if (agentMatches.length === 1) {
    const agentDoc = agentMatches[0];
    const agentData = agentDoc.data();
    const agentUser: User = {
      id: agentDoc.id,
      name: agentData.name ?? 'Agent',
      phone: agentData.phone,
      role: 'agent',
      status: 'approved',
      isOnline: Boolean(agentData.is_available ?? agentData.isOnline ?? true),
      mustChangePin: agentData.mustChangePin === true,
    };

    await signInWithPhonePin(phone, hashed, pin);
    await saveSession({ id: agentUser.id, role: 'agent', name: agentUser.name, phone, status: 'approved', mustChangePin: agentUser.mustChangePin });
    log.auth.info('Legacy agent phone + PIN login succeeded');
    return agentUser;
  }

  if (!usersSnap.empty || !agentsSnap.empty) {
    log.auth.warn('Phone + PIN login rejected: profile exists but PIN did not match');
    const attempts = await recordPinFailure(phone, 'login', usersSnap.docs[0]?.data().name || agentsSnap.docs[0]?.data().name);
    throw Object.assign(new Error(attempts >= 3 ? 'Three unsuccessful attempts. Vivek has been notified; call or WhatsApp for help.' : 'Incorrect PIN.'), { attempts });
  }
  log.auth.warn('Phone + PIN login rejected: no matching profile');
  const attempts = await recordPinFailure(phone, 'login');
  throw Object.assign(new Error('No account found with this phone number. ' + (attempts >= 3 ? 'Vivek has been notified.' : '')), { attempts });
}


export async function logout(): Promise<void> {
  log.auth.info('logout: clearing session and signing out of Firebase Auth');
  const previous = await loadStoredSession();
  if (previous) await unregisterDevicePushToken(previous.id).catch(() => {});
  await clearStoredSession();
  useCart.getState().clearCart();
  try { await fbSignOut(auth); } catch { /* ignore if already signed out */ }
  log.auth.info('logout: done');
}

// ─── Admin: reset a user's PIN ────────────────────────────────────────────────
// Reset changes both the profile PIN hash and Firebase Auth password on the server.

export async function adminResetPin(uid: string, phone: string, newPin: string): Promise<void> {
  const cleanPhone = String(phone || '').replace(/\D/g, '').slice(-10);
  if (!/^\d{10}$/.test(cleanPhone) || !/^\d{4}$/.test(newPin)) {
    throw new Error('A valid 10-digit phone number and 4-digit PIN are required.');
  }
  const hashed = await hashPin(newPin, cleanPhone);
  const target = await getUser(uid);
  if (useSession.getState().role === 'admin' && useSession.getState().isDemo && target?.isDemo) {
    await updateDoc(doc(db, 'users', uid), { pin: hashed, mustChangePin: true, sessionVersion: increment(1), status: 'approved' });
    await clearPinFailures(cleanPhone);
    return;
  }
  await waitForFirebaseAuth();
  const reset = httpsCallable(functions, 'adminResetPin');
  await reset({ uid: String(uid), phone: cleanPhone, hashedPin: hashed });
}

// ─── Admin: create agent account ──────────────────────────────────────────────

export async function createAgent(params: {
  name:    string;
  phone:   string;
  pin:     string;
  adminUid: string;
}): Promise<string> {
  const { name, phone, pin } = params;
  if (!/^\d{10}$/.test(phone) || !/^\d{4}$/.test(pin)) {
    throw new Error('A valid 10-digit phone number and 4-digit PIN are required.');
  }
  const hashedPin = await hashPin(pin, phone);
  if (useSession.getState().isDemo && useSession.getState().role === 'admin') {
    const existing = await getDocs(query(collection(db, 'users'), where('phone', '==', phone), limit(1)));
    if (!existing.empty) throw new Error('Phone already has a profile.');
    const ref = doc(collection(db, 'users'));
    await createUser(ref.id, { name: name.trim(), phone, pin: hashedPin, role: 'agent', status: 'approved', isDemo: true, sessionVersion: 0, mustChangePin: true, isOnline: false, activeOrderCount: 0 });
    return ref.id;
  }
  await waitForFirebaseAuth();
  const create = httpsCallable<{ name: string; phone: string; hashedPin: string }, { uid: string }>(functions, 'adminCreateAgent');
  const result = await create({ name: name.trim(), phone, hashedPin });
  return result.data.uid;
}

/** User self-service change PIN (login with reset/temp pwd and change pwd) */
export async function changePin(uid: string, phone: string, oldPin: string, newPin: string): Promise<void> {
  const user = await getUser(uid);
  if (!user) throw new Error('User not found.');
  const cleanPhone = phone ? String(phone).replace(/\D/g, '').slice(-10) : '';
  const hashedOld = cleanPhone ? await hashPin(oldPin, cleanPhone) : oldPin;
  const pinOk = user.pin === hashedOld || user.pin === oldPin || user.plainPin === oldPin;
  if (!pinOk) { const attempts = await recordPinFailure(cleanPhone, 'change_pin', user.name); throw Object.assign(new Error('Incorrect current PIN. ' + (attempts >= 3 ? 'Vivek has been notified.' : '')), { attempts }); }

  const hashedNew = cleanPhone ? await hashPin(newPin, cleanPhone) : newPin;
  if (user.isDemo && getDemoCredentials().length > 0) {
    await updateDoc(doc(db, 'users', uid), { pin: hashedNew, mustChangePin: false });
    await clearPinFailures(cleanPhone);
    return;
  }
  await waitForFirebaseAuth();
  const reset = httpsCallable(functions, 'changeOwnPin');
  await reset({ uid: String(uid), phone: cleanPhone, hashedPin: hashedNew, oldHashedPin: hashedOld });
  await clearPinFailures(cleanPhone).catch(() => {});
}

/** Explicit development setup. Existing document IDs and order links are retained. */
export async function prepareDevelopmentAccounts(): Promise<void> {
  const configured = getDemoCredentials();
  if (!configured.length) throw new Error('Development accounts are disabled for this build.');
  for (const { role, credential } of configured) {
    const snap = await getDocs(query(collection(db, 'users'), where('phone', '==', credential.phone), limit(10)));
    const matches = snap.docs.filter(d => d.data().role === role);
    if (matches.length > 1) throw new Error('Duplicate ' + role + ' profiles for ' + credential.phone + '. Resolve duplicates before preparing this account.');
    if (matches.length === 1) {
      await updateDoc(matches[0].ref, { name: credential.name || role, isDemo: true });
    } else {
      await setDoc(doc(db, 'users', 'demo-' + role), {
        role, name: credential.name || role, phone: credential.phone, pin: await hashPin(credential.pin, credential.phone),
        status: 'approved', isDemo: true, sessionVersion: 0, isOnline: role === 'agent', activeOrderCount: 0,
        address: { door: '', street: '', locality: '', city: 'Chennai', landmark: '', lat: null, lng: null },
        createdAt: Timestamp.now(),
      });
    }
  }
}

export async function adminChangePhone(uid: string, phone: string, temporaryPin: string): Promise<void> {
  if (useSession.getState().role !== 'admin') throw new Error('Only admin can change account phone numbers.');
  if (!/^[6-9]\d{9}$/.test(phone) || !/^\d{4}$/.test(temporaryPin)) throw new Error('Enter a valid phone and 4-digit temporary PIN.');
  const existing = await getDocs(query(collection(db, 'users'), where('phone', '==', phone), limit(2)));
  if (existing.docs.some(d => d.id !== uid)) throw new Error('Phone already belongs to another account.');
  const hashedPin = await hashPin(temporaryPin, phone);
  if (useSession.getState().isDemo) {
    const target = await getUser(uid);
    if (!target?.isDemo) throw new Error('Use an authenticated admin session for this account.');
    await updateDoc(doc(db, 'users', uid), { phone, pin: hashedPin, mustChangePin: true, sessionVersion: increment(1) });
  } else await httpsCallable(functions, 'adminChangePhone')({ uid, phone, hashedPin });
}
