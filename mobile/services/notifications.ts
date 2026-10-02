// services/notifications.ts — Notification service
import {
  collection, doc, updateDoc, deleteDoc, writeBatch, onSnapshot,
  query, where, Unsubscribe,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { AppNotification } from '../types';

const COL = 'notifications';

function sortNotifsDesc(notifications: AppNotification[]): AppNotification[] {
  return notifications.sort((a, b) => {
    const tA = (a.createdAt as any)?.seconds ?? (a.createdAt ? new Date(a.createdAt as any).getTime() / 1000 : 0);
    const tB = (b.createdAt as any)?.seconds ?? (b.createdAt ? new Date(b.createdAt as any).getTime() / 1000 : 0);
    return tB - tA;
  });
}

/** Live listener for a user's notifications (sorted in memory to avoid composite index error) */
export function listenNotifications(
  uid: string,
  onData: (notifications: AppNotification[]) => void,
  onError: (e: Error) => void,
  maxCount = 50,
): Unsubscribe {
  const q = query(
    collection(db, COL),
    where('toUid', '==', String(uid)),
  );
  return onSnapshot(
    q,
    snap => {
      const notifs = snap.docs.map(d => ({ id: d.id, ...d.data() } as AppNotification));
      onData(sortNotifsDesc(notifs).slice(0, maxCount));
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
