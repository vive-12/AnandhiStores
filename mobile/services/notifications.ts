import {
  collection, doc, getDoc, updateDoc, deleteDoc, writeBatch, onSnapshot,
  query, where, orderBy, limit, Unsubscribe, getDocs, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { AppNotification } from '../types';

const COL = 'notifications';
const EAS_PROJECT_ID = '89170e22-3b73-4828-a94e-172135ffe4f9';

export interface SendRemotePushParams {
  toUid?: string | null;
  toRole?: 'admin' | 'agent' | 'customer';
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default' | null;
}

/**
 * Dispatch remote push notifications via the Expo Push API.
 * This guarantees notifications and sound are delivered even when
 * the application is closed or in the background.
 */
export async function sendRemotePushNotification(params: SendRemotePushParams): Promise<void> {
  try {
    if (typeof getDoc !== 'function' || typeof getDocs !== 'function') return;
    const tokens: string[] = [];

    // 1. If targeted to a specific UID
    if (params.toUid && params.toUid !== 'admin') {
      const userSnap = await getDoc(doc(db, 'users', params.toUid));
      if (userSnap.exists()) {
        const token = userSnap.data()?.pushToken;
        if (typeof token === 'string' && token.startsWith('ExponentPushToken[')) {
          tokens.push(token);
        }
      }
    }

    // 2. If targeted to admins (or toRole is admin)
    if (params.toRole === 'admin' || params.toUid === 'admin') {
      const adminsQuery = query(collection(db, 'users'), where('role', '==', 'admin'), limit(25));
      const adminSnaps = await getDocs(adminsQuery);
      adminSnaps.forEach(d => {
        const token = d.data()?.pushToken;
        if (typeof token === 'string' && token.startsWith('ExponentPushToken[')) {
          if (!tokens.includes(token)) {
            tokens.push(token);
          }
        }
      });
    }

    if (!tokens.length) {
      return;
    }

    const messages = tokens.map(to => ({
      to,
      sound: params.sound === null ? null : 'default',
      title: params.title,
      body: params.body,
      data: params.data || {},
      priority: 'high',
      channelId: 'default',
      _displayInForeground: true,
    }));

    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });
  } catch (err) {
    // Non-fatal: background push error must never crash or disrupt primary order flow
    console.warn('[Push Notification] Error sending remote push notification:', err);
  }
}

/**
 * Register the device for native push notifications with high-priority Android channel.
 * Saves the token to users/{uid}.pushToken.
 */
export async function registerDevicePushToken(uid: string): Promise<string | null> {
  try {
    const { Platform } = require('react-native');
    if (Platform?.OS === 'web') return null;

    // Dynamically require to prevent breaking environments where native modules aren't available
    const Notifications = require('expo-notifications');
    if (!Notifications?.getPermissionsAsync) return null;

    if (Platform?.OS === 'android' && Notifications.setNotificationChannelAsync) {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Orders & Deliveries',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#1B4332',
        sound: 'default',
        enableVibrate: true,
        showBadge: true,
      });
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      return null;
    }

    const tokenResult = await Notifications.getExpoPushTokenAsync({
      projectId: EAS_PROJECT_ID,
    }).catch(async () => {
      return await Notifications.getExpoPushTokenAsync();
    });

    const pushToken = tokenResult?.data;
    if (pushToken && typeof pushToken === 'string') {
      await updateDoc(doc(db, 'users', uid), {
        pushToken,
        pushTokenUpdatedAt: serverTimestamp(),
      }).catch(() => {});
      return pushToken;
    }
    return null;
  } catch (err) {
    console.log('[PUSH] Registration skipped:', err);
    return null;
  }
}

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

  // Dispatch push notification to admin devices
  sendRemotePushNotification({
    toRole: 'admin',
    title: '👤 New Customer Signup',
    body: `${user.name} (+${user.phone}) is waiting for approval.`,
    data: { type: 'customer_registered', userId: user.id },
  }).catch(() => {});
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
