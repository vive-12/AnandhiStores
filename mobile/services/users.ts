// services/users.ts — User / agent read/write service
import {
  collection, doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot,
  query, where, orderBy, limit, serverTimestamp, Unsubscribe, getDocs, runTransaction, increment,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../config/firebase';
import type { User, UserRole, UserStatus, Address } from '../types';
import { useSession } from '../hooks/useSession';
import { log } from '../utils/logger';

const COL = 'users';

/** Get a single user by UID (one-shot) */
export async function getUser(uid: string): Promise<User | null> {
  const snap = await getDoc(doc(db, COL, String(uid)));
  if (snap.exists()) {
    const d = snap.data();
    const rawStatus = d.status;
    const normalizedStatus: UserStatus =
      (rawStatus === 'active' || rawStatus === 'approved') ? 'approved' :
      rawStatus === 'pending' ? 'pending' :
      rawStatus === 'blocked' ? 'blocked' : 'approved';

    return {
      ...d,
      id: snap.id,
      name: d.name ?? (d.first_name ? `${d.first_name} ${d.last_name || ''}`.trim() : 'Customer'),
      phone: d.phone,
      role: d.role ?? 'customer',
      status: normalizedStatus,
    } as User;
  }

  // Fallback to legacy agents collection
  const agentSnap = await getDoc(doc(db, 'agents', String(uid)));
  if (agentSnap.exists()) {
    const d = agentSnap.data();
    return {
      ...d,
      id: agentSnap.id,
      name: d.name ?? 'Agent',
      phone: d.phone,
      role: 'agent',
      status: 'approved',
      isOnline: Boolean(d.is_available ?? d.isOnline ?? true),
    } as User;
  }
  return null;
}

/** Live listener for a single user */
export function listenUser(uid: string, onData: (u: User | null) => void, onError: (e: Error) => void = () => {}): Unsubscribe {
  return onSnapshot(doc(db, COL, String(uid)), snap => {
    if (snap.exists()) {
      const d = snap.data();
      const rawStatus = d.status;
      const normalizedStatus: UserStatus =
        (rawStatus === 'active' || rawStatus === 'approved') ? 'approved' :
        rawStatus === 'pending' ? 'pending' :
        rawStatus === 'blocked' ? 'blocked' : 'approved';

      onData({
        ...d,
        id: snap.id,
        name: d.name ?? (d.first_name ? `${d.first_name} ${d.last_name || ''}`.trim() : 'Customer'),
        phone: d.phone,
        role: d.role ?? 'customer',
        status: normalizedStatus,
      } as User);
    } else {
      // Check legacy agents collection
      getDoc(doc(db, 'agents', String(uid))).then(aSnap => {
        if (aSnap.exists()) {
          const d = aSnap.data();
          onData({
            id: aSnap.id,
            name: d.name ?? 'Agent',
            phone: d.phone,
            role: 'agent',
            status: 'approved',
            isOnline: Boolean(d.is_available ?? d.isOnline ?? true),
            ...d,
          } as User);
        } else {
          onData(null);
        }
      }).catch(() => onData(null));
    }
  }, onError);
}

/** Create a new user document (called at registration) */
export async function createUser(uid: string, data: Omit<User, 'id' | 'createdAt'>): Promise<void> {
  await setDoc(doc(db, COL, String(uid)), {
    ...data,
    createdAt: serverTimestamp(),
  });
}

/** Update arbitrary fields on a user */
export async function updateUser(uid: string, data: Partial<Omit<User, 'id' | 'createdAt'>>): Promise<void> {
  await updateDoc(doc(db, COL, String(uid)), data);
}

/** Admin: block a user */
export async function blockUser(uid: string): Promise<void> {
  await updateDoc(doc(db, COL, String(uid)), { status: 'blocked' as UserStatus });
}

/** Keep identities and historical links; deactivate only after work is settled. */
export async function deleteAgent(uid: string, phone?: string): Promise<void> {
  if (useSession.getState().role !== 'admin') throw new Error('Admin access required.');
  if (!useSession.getState().isDemo) {
    await httpsCallable(functions, 'adminDeleteAgent')({ uid });
    return;
  }
  const active = await getDocs(query(collection(db, 'orders'), where('agentId', '==', uid), where('status', 'in', ['placed', 'packed', 'out_for_delivery']), limit(1)));
  if (!active.empty) throw new Error('Reassign all delivery and recovery work before deactivating this agent.');
  await runTransaction(db, async tx => {
    const ref = doc(db, COL, uid);
    const snap = await tx.get(ref);
    if (!snap.exists() || snap.data().role !== 'agent') throw new Error('Select a delivery agent.');
    if (Number(snap.data().assignedRunCount || snap.data().activeOrderCount || 0) > 0) throw new Error('Agent has assigned work.');
    tx.update(ref, { status: 'blocked', isOnline: false, isArchived: true, sessionVersion: increment(1), deactivatedAt: serverTimestamp() });
  });
}

/** Update delivery address */
export async function updateAddress(uid: string, address: Address): Promise<void> {
  await updateDoc(doc(db, COL, String(uid)), { address });
}

/** Waiting recoveries stay visible but do not hold an agent on shift for days. */
export async function setAgentOnline(uid: string, isOnline: boolean): Promise<void> {
  const active = await getDocs(query(collection(db, 'orders'), where('agentId', '==', uid), where('status', 'in', ['placed', 'packed', 'out_for_delivery']), limit(1000)));
  const busy = active.docs.some(d => d.data().type !== 'recovery' || d.data().status === 'out_for_delivery');
  await runTransaction(db, async tx => {
    const ref = doc(db, COL, uid);
    const snap = await tx.get(ref);
    if (!snap.exists() || snap.data().role !== 'agent' || snap.data().status === 'blocked') throw new Error('This agent is unavailable.');
    if (!isOnline && (busy || Number(snap.data().activeOrderCount || 0) > 0)) throw new Error('Complete or reassign active deliveries before going offline.');
    tx.update(ref, { isOnline });
  });
}

/** Live listener for users of a given role with a bounded result set. */
export function listenUsersByRole(
  role: UserRole,
  onData: (users: User[]) => void,
  onError: (e: Error) => void,
  maxCount = 200,
): Unsubscribe {
  // Do not order by createdAt: Firestore omits legacy profiles that lack it.
  const q = query(collection(db, COL), where('role', '==', role), limit(maxCount));
  return onSnapshot(
    q,
    snap => {
      const list = snap.docs.filter(d => !d.data().isArchived).map(d => {
        const data = d.data();
        const resolvedRole = data.role ?? role;
        const rawStatus = data.status;
        const normalizedStatus: UserStatus =
          (rawStatus === 'active' || rawStatus === 'approved') ? 'approved' :
          rawStatus === 'pending' ? 'pending' :
          rawStatus === 'blocked' ? 'blocked' : 'approved';
        const resolvedName = data.name || (data.first_name ? `${data.first_name} ${data.last_name || ''}`.trim() : 'Customer');

        return {
          ...data,
          id: String(d.id),
          role: resolvedRole,
          name: resolvedName,
          status: normalizedStatus,
        } as User;
      });
      list.sort((a: any, b: any) => {
        const getMillis = (t: any) => (t?.toMillis ? t.toMillis() : t ? new Date(t).getTime() : 0);
        return getMillis(b.createdAt) - getMillis(a.createdAt);
      });
      onData(list);
    },
    onError,
  );
}

/** Live listener for pending customers (admin dashboard badge) */
export function listenPendingUsers(
  onData: (users: User[]) => void,
  onError: (e: Error) => void,
  maxCount = 100,
): Unsubscribe {
  const q = query(
    collection(db, COL),
    where('role', '==', 'customer'),
    where('status', '==', 'pending'),
    orderBy('createdAt', 'desc'),
    limit(maxCount),
  );
  return onSnapshot(
    q,
    snap => {
      const list = snap.docs.map(d => {
          const data = d.data();
          const resolvedName = data.name || (data.first_name ? `${data.first_name} ${data.last_name || ''}`.trim() : 'Customer');
          return {
            ...data,
            id: String(d.id),
            name: resolvedName,
          } as User;
        });
      list.sort((a: any, b: any) => {
        const getMillis = (t: any) => (t?.toMillis ? t.toMillis() : t ? new Date(t).getTime() : 0);
        return getMillis(b.createdAt) - getMillis(a.createdAt);
      });
      onData(list);
    },
    onError,
  );
}

/** Live listener for online agents (admin assign picker) */
export function listenOnlineAgents(
  onData: (agents: User[]) => void,
  onError: (e: Error) => void,
): Unsubscribe {
  const q = query(
    collection(db, COL),
    where('role', '==', 'agent'),
    where('isOnline', '==', true),
    limit(50),
  );
  return onSnapshot(
    q,
    snap => onData(snap.docs.map(d => ({ id: d.id, ...d.data() } as User))),
    onError,
  );
}

export async function findUserByPhone(phone: string): Promise<User | null> {
  const snap = await getDocs(query(collection(db, COL), where('phone', '==', phone), limit(2)));
  if (snap.size > 1) throw new Error('Duplicate profiles. Resolve the account identity before resetting.');
  return snap.empty ? null : { ...snap.docs[0].data(), id: snap.docs[0].id } as User;
}
