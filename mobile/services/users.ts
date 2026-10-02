// services/users.ts — User / agent read/write service
import {
  collection, doc, getDoc, setDoc, updateDoc, onSnapshot,
  query, where, orderBy, limit, serverTimestamp, Unsubscribe,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { User, UserRole, UserStatus, Address } from '../types';

const COL = 'users';

/** Get a single user by UID (one-shot) */
export async function getUser(uid: string): Promise<User | null> {
  const sUid = String(uid);
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
export function listenUser(uid: string, onData: (u: User | null) => void): Unsubscribe {
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
  });
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

/** Admin: approve customer and set their PIN */
export async function approveUserWithPin(uid: string, pin: string): Promise<void> {
  await updateDoc(doc(db, COL, String(uid)), {
    status: 'approved' as UserStatus,
    pin,               // plain text until P4 hashing migration
  });
}

/** Admin: block a user */
export async function blockUser(uid: string): Promise<void> {
  await updateDoc(doc(db, COL, String(uid)), { status: 'blocked' as UserStatus });
}

/** Admin: reset a user/agent PIN (invalidates session in P4) */
export async function resetPin(uid: string, newPin: string, plainPin?: string): Promise<void> {
  const sUid = String(uid);
  const userRef = doc(db, COL, sUid);
  const snap = await getDoc(userRef);
  const updateData: any = {
    pin:      newPin,
    plainPin: plainPin || newPin,
    status:   'approved' as UserStatus,
  };
  if (plainPin) {
    updateData.plainPin = plainPin;
  }

  if (snap.exists()) {
    await updateDoc(userRef, updateData);
  } else {
    await setDoc(userRef, {
      ...updateData,
      role:      'agent',
      createdAt: serverTimestamp(),
    }, { merge: true });
  }

  // Also sync to legacy agents collection if present
  try {
    const agentRef = doc(db, 'agents', sUid);
    const aSnap = await getDoc(agentRef);
    if (aSnap.exists()) {
      await updateDoc(agentRef, { pin: plainPin || newPin });
    }
  } catch (err) {
    console.warn('Could not update legacy agents doc:', err);
  }
}

/** Update delivery address */
export async function updateAddress(uid: string, address: Address): Promise<void> {
  await updateDoc(doc(db, COL, String(uid)), { address });
}

/** Agent: toggle online status */
export async function setAgentOnline(uid: string, isOnline: boolean): Promise<void> {
  const sUid = String(uid);
  const userRef = doc(db, COL, sUid);
  const snap = await getDoc(userRef);
  if (snap.exists()) {
    await updateDoc(userRef, { isOnline });
  } else {
    // Check legacy agents collection
    const agentRef = doc(db, 'agents', sUid);
    const aSnap = await getDoc(agentRef);
    if (aSnap.exists()) {
      await updateDoc(agentRef, { isOnline, is_available: isOnline });
      const aData = aSnap.data();
      await setDoc(userRef, {
        ...aData,
        name: aData.name || 'Agent',
        phone: aData.phone || '',
        role: 'agent',
        status: 'approved',
        isOnline,
        createdAt: serverTimestamp(),
      }, { merge: true });
    } else {
      await setDoc(userRef, {
        role: 'agent',
        status: 'approved',
        isOnline,
        createdAt: serverTimestamp(),
      }, { merge: true });
    }
  }
}

/** Live listener for all users of a given role (in-memory sort avoids composite index requirement) */
export function listenUsersByRole(
  role: UserRole,
  onData: (users: User[]) => void,
  onError: (e: Error) => void,
  maxCount = 200,
): Unsubscribe {
  const q = query(
    collection(db, COL),
    where('role', '==', role),
  );
  return onSnapshot(
    q,
    snap => {
      const list = snap.docs.map(d => {
        const data = d.data();
        const rawStatus = data.status;
        const normalizedStatus: UserStatus =
          (rawStatus === 'active' || rawStatus === 'approved') ? 'approved' :
          rawStatus === 'pending' ? 'pending' :
          rawStatus === 'blocked' ? 'blocked' : 'approved';
        const resolvedName = data.name || (data.first_name ? `${data.first_name} ${data.last_name || ''}`.trim() : 'Customer');

        return {
          ...data,
          id: String(d.id),
          name: resolvedName,
          status: normalizedStatus,
        } as User;
      });
      list.sort((a: any, b: any) => {
        const getMillis = (t: any) => (t?.toMillis ? t.toMillis() : t ? new Date(t).getTime() : 0);
        return getMillis(b.createdAt) - getMillis(a.createdAt);
      });
      onData(list.slice(0, maxCount));
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
    where('status', '==', 'pending'),
  );
  return onSnapshot(
    q,
    snap => {
      const list = snap.docs
        .map(d => {
          const data = d.data();
          const resolvedName = data.name || (data.first_name ? `${data.first_name} ${data.last_name || ''}`.trim() : 'Customer');
          return {
            ...data,
            id: String(d.id),
            name: resolvedName,
          } as User;
        })
        .filter(u => u.role === 'customer');
      list.sort((a: any, b: any) => {
        const getMillis = (t: any) => (t?.toMillis ? t.toMillis() : t ? new Date(t).getTime() : 0);
        return getMillis(b.createdAt) - getMillis(a.createdAt);
      });
      onData(list.slice(0, maxCount));
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
