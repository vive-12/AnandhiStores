// services/notifications.ts — Notification service
import {
  collection, doc, updateDoc, deleteDoc, writeBatch, onSnapshot,
  query, where, orderBy, limit, Unsubscribe, getDocs, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { AppNotification } from '../types';

const COL = 'notifications';

/** Create bounded in-app alerts for admins after a pending customer signs up. */
export async function notifyAdminsOfCustomerSignup(user: { id: string; name: string; phone: string }): Promise<void> {
  const adminsQuery = query(collection(db, 'users'), where('role', '==', 'admin'), limit(100));
  const admins = await getDocs(adminsQuery);
  if (admins.empty) return;

  const batch = writeBatch(db);
  admins.docs.forEach(admin => {
    batch.set(doc(db, COL, `signup_${user.id}_${admin.id}`), {
      toUid: admin.id,
      toRole: 'admin',
      type: 'customer_registered',
      orderId: null,
      title: 'New customer signup',
      body: `${user.name} (+${user.phone}) is waiting for approval.`,
      read: false,
      createdAt: serverTimestamp(),
    });
  });
  await batch.commit();
}

function sortNotifsDesc(notifications: AppNotification[]): AppNotification[] {
  return notifications.sort((a, b) => {
    const tA = (a.createdAt as any)?.seconds ?? (a.createdAt ? new Date(a.createdAt as any).getTime() / 1000 : 0);
    const tB = (b.createdAt as any)?.seconds ?? (b.createdAt ? new Date(b.createdAt as any).getTime() / 1000 : 0);
    return tB - tA;
  });
}

/** Live listener for the newest bounded set of a user's notifications. */
export function listenNotifications(
  uid: string,
  onData: (notifications: AppNotification[]) => void,
  onError: (e: Error) => void,
  maxCount = 50,
): Unsubscribe {
  const q = query(
    collection(db, COL),
    where('toUid', '==', String(uid)),
    orderBy('createdAt', 'desc'),
    limit(maxCount),
  );
  return onSnapshot(
    q,
    snap => {
      const notifs = snap.docs.map(d => ({ id: d.id, ...d.data() } as AppNotification));
      onData(sortNotifsDesc(notifs));
    },
    onError,
  );
}

/** Mark a single notification as read */
export async function markRead(notificationId: string): Promise<void> {
  await updateDoc(doc(db, COL, notificationId), { read: true });
}

/** Mark all unread notifications for a user as read */
export async function markAllRead(notifications: AppNotification[]): Promise<void> {
  const unread = notifications.filter(n => !n.read);
  await Promise.all(unread.map(n => markRead(n.id)));
}

/** Delete a single notification */
export async function deleteNotification(notificationId: string): Promise<void> {
  await deleteDoc(doc(db, COL, notificationId));
}

/** Clear / delete all notifications for a user */
export async function clearAllNotifications(notifications: AppNotification[]): Promise<void> {
  if (!notifications.length) return;
  const batch = writeBatch(db);
  notifications.forEach(n => {
    batch.delete(doc(db, COL, n.id));
  });
  await batch.commit();
}
