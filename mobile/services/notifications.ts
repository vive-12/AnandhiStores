import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  collection, doc, getDoc, updateDoc, deleteDoc, writeBatch, onSnapshot,
  query, where, orderBy, limit, Unsubscribe, getDocs, serverTimestamp, runTransaction, arrayUnion, arrayRemove, increment,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { AppNotification } from '../types';

const COL = 'notifications';
let adminCache: { until: number; ids: string[] } | null = null;
export async function getAdminRecipients(): Promise<string[]> {
  if (adminCache && adminCache.until > Date.now()) return adminCache.ids;
  const snap = await getDocs(query(collection(db, 'users'), where('role', '==', 'admin'), limit(10)));
  const ids = snap.docs.filter(d => d.data().status !== 'blocked').map(d => d.id);
  adminCache = { ids, until: Date.now() + 60_000 };
  return ids;
}

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
 * Requests are best effort; acceptance does not guarantee delivery when
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
        const registered = Array.isArray(userSnap.data()?.pushTokens) ? userSnap.data().pushTokens : [token];
        for (const device of registered) if (typeof device === 'string' && /^(ExponentPushToken|ExpoPushToken)\[/.test(device) && !tokens.includes(device)) tokens.push(device);
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
      throw Object.assign(new Error('No registered push device. In-app alert remains available.'), { code: 'no-device' });
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

    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });
    if (!response.ok) throw new Error('Push service HTTP ' + response.status);
    const result = await response.json();
    const tickets = Array.isArray(result.data) ? result.data : [result.data];
    if (tickets.some((ticket: any) => !ticket || ticket.status !== 'ok')) throw new Error('Push service did not accept all devices.');
  } catch (err) {
    throw err;
    // Non-fatal: background push error must never crash or disrupt primary order flow

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
        pushTokens: arrayUnion(pushToken),
        pushTokenUpdatedAt: serverTimestamp(),
      }).catch(() => {});
      await AsyncStorage.setItem('anandhi_push_token', pushToken);
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
      pushStatus: 'pending',
      createdAt: serverTimestamp(),
    });
  });
  await batch.commit();

  /* Dispatch is handled from durable notification records.
  // Dispatch push notification to admin devices
  sendRemotePushNotification({
    toRole: 'admin',
    title: '👤 New Customer Signup',
    body: `${user.name} (+${user.phone}) is waiting for approval.`,
    data: { type: 'customer_registered', userId: user.id },
  }).catch(() => {}); */
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

/** Free development relay: durable records are retried while an app is open.
 * An optional server trigger can take over later; no billing/deployment is enabled here.
 */
export function startPushRelay(): () => void {
  let stopped = false;
  let latest: { id: string; data: any }[] = [];
  const busy = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const process = async (row: { id: string; data: any }) => {
    if (stopped || busy.has(row.id) || Number(row.data.retryAfter || 0) > Date.now()) return;
    busy.add(row.id);
    const ref = doc(db, COL, row.id);
    try {
      const claimed = await runTransaction(db, async tx => {
        const snap = await tx.get(ref);
        if (!snap.exists() || snap.data().pushStatus !== 'pending' || Number(snap.data().leaseUntil || 0) > Date.now()) return false;
        tx.update(ref, { leaseUntil: Date.now() + 60_000 });
        return true;
      });
      if (!claimed) return;
      await sendRemotePushNotification({ toUid: row.data.toUid, title: row.data.title, body: row.data.body, data: { orderId: row.data.orderId, notificationId: row.id, type: row.data.type } });
      await updateDoc(ref, { pushStatus: 'sent', leaseUntil: 0, pushAcceptedAt: serverTimestamp() });
    } catch (error) {
      await updateDoc(ref, { pushStatus: (error as any)?.code === 'no-device' || Number(row.data.pushAttempts || 0) >= 4 ? 'failed' : 'pending', pushAttempts: increment(1), leaseUntil: 0, retryAfter: Date.now() + 60_000, pushError: error instanceof Error ? error.message : 'Push unavailable' }).catch(() => {});
    } finally { busy.delete(row.id); }
  };
  const tick = () => {
    if (stopped) return;
    for (const row of latest) process(row).catch(() => {});
    timer = setTimeout(tick, 60_000);
  };
  const stop = onSnapshot(query(collection(db, COL), where('pushStatus', '==', 'pending'), limit(20)), snap => {
    latest = snap.docs.map(d => ({ id: d.id, data: d.data() }));
    for (const row of latest) process(row).catch(() => {});
  }, () => {});
  tick();
  return () => { stopped = true; stop(); if (timer) clearTimeout(timer); };
}

export async function unregisterDevicePushToken(uid: string): Promise<void> {
  const token = await AsyncStorage.getItem('anandhi_push_token');
  if (token) await updateDoc(doc(db, 'users', uid), { pushTokens: arrayRemove(token), pushToken: null }).catch(() => {});
  await AsyncStorage.removeItem('anandhi_push_token');
}
