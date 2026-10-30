import { collection, doc, getDoc, getDocs, query, where, limit, onSnapshot, runTransaction, Timestamp, updateDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { getAdminRecipients } from './notifications';

export const SUPPORT_PHONE = '9003115101';
export type AccountHelp = { id: string; name?: string; phone: string; attempts: number; status: 'open' | 'resolved'; context: string; updatedAt: any };
export async function recordPinFailure(phone: string, context: 'login' | 'change_pin', name?: string): Promise<number> {
  if (!/^[6-9]\d{9}$/.test(phone)) return 0;
  const admins = await getAdminRecipients();
  const ref = doc(db, 'account_help', phone);
  return runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    const previous = snap.exists() ? snap.data() : {};
    const attempts = Number(previous.attempts || 0) + 1;
    const now = Timestamp.now();
    tx.set(ref, { phone, name: name || previous.name || phone, context, attempts, status: attempts >= 3 ? 'open' : 'resolved', updatedAt: now, createdAt: previous.createdAt || now }, { merge: true });
    if (attempts === 3) for (const uid of admins) {
      tx.set(doc(collection(db, 'notifications')), { toUid: uid, toRole: 'admin', type: 'account_help', orderId: null, title: 'PIN help needed', body: (name || phone) + ' (' + phone + ') has failed 3 PIN attempts (' + context + '). Please contact them.', read: false, pushStatus: 'pending', createdAt: now });
    }
    return attempts;
  });
}
export async function clearPinFailures(phone: string): Promise<void> {
  const ref = doc(db, 'account_help', phone);
  const snap = await getDoc(ref);
  if (snap.exists()) await updateDoc(ref, { attempts: 0, status: 'resolved', updatedAt: Timestamp.now() });
}
export function listenAccountHelp(onData: (rows: AccountHelp[]) => void, onError: (e: Error) => void) {
  return onSnapshot(query(collection(db, 'account_help'), where('status', '==', 'open'), limit(100)), snap => onData(snap.docs.map(d => ({ id: d.id, ...d.data() } as AccountHelp))), onError);
}
