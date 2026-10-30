// app/_layout.tsx — Root layout: fonts, providers, session restoration, role routing
import { useEffect, useRef } from 'react';
import { Platform, View, StatusBar } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  useFonts,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
} from '@expo-google-fonts/manrope';
import * as SplashScreen from 'expo-splash-screen';
import { ToastProvider } from '../components/ui/Toast';
import { Colors } from '../theme';
import { useSession } from '../hooks/useSession';
import { restoreSession, saveSession, logout } from '../services/auth';
import { listenUser } from '../services/users';
import { useCart } from '../hooks/useCart';
import { onIdTokenChanged } from 'firebase/auth';
import { auth } from '../config/firebase';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { OfflineBanner } from '../components/ui/OfflineBanner';
import { initLogger, log } from '../utils/logger';
import { registerDevicePushToken, startPushRelay } from '../services/notifications';

SplashScreen.preventAutoHideAsync();

// Ensure notifications show alerts and play sound at module scope
try {
  const Notifications = require('expo-notifications');
  if (Notifications?.setNotificationHandler) {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });
  }
} catch {
  // Gracefully ignored in environments without expo-notifications
}

// ─── Role → root route mapping ────────────────────────────────────────────────
const ROLE_HOME = {
  customer: '/(customer)',
  agent:    '/agent/dashboard',
  admin:    '/admin/alerts',
} as const;

// ─── Route guard: redirect based on session state ─────────────────────────────
function RouteGuard() {
  const router   = useRouter();
  const segments = useSegments();
  const { uid, role, status, mustChangePin, isLoading } = useSession();

  useEffect(() => {
    if (isLoading) return;

    const inAuth      = segments[0] === 'auth';
    const inDev       = segments[0] === 'dev';
    const isLoggedIn  = !!uid;
    const isRoot      = !segments.length || segments[0] === 'index';

    if (isLoggedIn) {
      // Register device for background push notifications with sound

      if (mustChangePin && segments.join('/') !== 'auth/reset-pin') {
        router.replace('/auth/reset-pin');
        return;
      }
      if (role === 'customer' && status === 'pending') {
        // Pending customers go to awaiting-approval
        if (segments.join('/') !== 'auth/awaiting-approval') {
          router.replace('/auth/awaiting-approval');
        }
        return;
      }
      if (role === 'customer' && status === 'blocked') {
        if (segments.join('/') !== 'auth/login') {
          router.replace('/auth/login');
        }
        return;
      }
      // Logged-in users → their role home (unless already there, in dev, or intentionally resetting/changing PIN)
      const inResetPin = segments.join('/') === 'auth/reset-pin';
      if ((inAuth && !inResetPin) || isRoot) {
        router.replace(ROLE_HOME[role!] ?? '/auth/login');
      }
    } else {
      // Not logged in → go to login (unless already in auth or dev)
      if (!inAuth && !inDev) {
        router.replace('/auth/login');
      }
    }
  }, [uid, role, status, mustChangePin, isLoading, segments]);

  return null;
}

// ─── Session restoration on startup ──────────────────────────────────────────

function SessionMonitor() {
  const router = useRouter();
  const lastResponse = useRef<string | null>(null);
  const role = useSession(s => s.role);
  const uid = useSession(s => s.uid);
  const version = useSession(s => s.sessionVersion);
  const isDemo = useSession(s => s.isDemo);
  useEffect(() => {
    if (!uid) return;
    if (useCart.persist.hasHydrated()) useCart.getState().initForUser(uid);
    const stopHydration = useCart.persist.onFinishHydration(() => { if (useSession.getState().uid === uid) useCart.getState().initForUser(uid); });
    const stop = listenUser(uid, user => {
      if (useSession.getState().uid !== uid) return;
      if (!user || user.status === 'blocked' || (user.sessionVersion ?? 0) !== version) {
        useSession.getState().clearSession();
        logout().catch(() => {});
        return;
      }
      useSession.getState().setSession({ ...user, isDemo });
      saveSession({ ...user, isDemo }).catch(() => {});
    }, () => {
      // Keep persisted work intact. Subsequent server snapshots/foreground restore retry.
    });
    return () => { stop(); stopHydration(); };
  }, [uid, version, isDemo]);
  useEffect(() => {
    if (!uid || isDemo) return;
    return onIdTokenChanged(auth, user => {
      if (useSession.getState().uid === uid && (!user || user.uid !== uid)) {
        useSession.getState().clearSession();
        logout().catch(() => {});
      }
    });
  }, [uid, isDemo]);
  useEffect(() => { if (!uid || role !== 'admin' || process.env.EXPO_PUBLIC_SERVER_PUSH === 'true') return; return startPushRelay(); }, [uid, role]);
  useEffect(() => {
    if (!uid || Platform.OS === 'web') return;
    let stop: { remove: () => void } | undefined;
    try {
      const notifications = require('expo-notifications');
      const handle = (response: any) => {
        const state = useSession.getState();
        if (!response || state.uid !== uid || state.mustChangePin || state.status !== 'approved') return;
        const request = response.notification.request;
        if (lastResponse.current === request.identifier) return;
        lastResponse.current = request.identifier;
        const data = request.content.data || {};
        if (role === 'admin') router.push(['account_help', 'customer_registered'].includes(data.type) ? '/admin/profiles' : '/admin/alerts');
        else if (typeof data.orderId === 'string') router.push((role === 'agent' ? '/agent/delivery/' : '/track/') + data.orderId as any);
      };
      stop = notifications.addNotificationResponseReceivedListener(handle);
      notifications.getLastNotificationResponseAsync?.().then(handle).catch(() => {});
    } catch {}
    return () => stop?.remove();
  }, [uid, role]);
  useEffect(() => {
    if (uid) registerDevicePushToken(uid).catch(() => {});
  }, [uid]);
  return null;
}

function SessionRestorer() {
  const { setSession, clearSession, setLoading } = useSession();

  useEffect(() => {
    // Load previous-session logs from AsyncStorage FIRST, then restore auth.
    initLogger().then(() => {
      log.auth.info('App started — logger initialised');
      return restoreSession();
    }).then(user => {
      if (user) {
        setSession(user);
      } else {
        clearSession();
      }
    }).catch(() => {
      clearSession();
    });
  }, []);

  return null;
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync();
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: Colors.green900 }} />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ErrorBoundary>
          <BottomSheetModalProvider>
            <ToastProvider>
              <StatusBar barStyle="light-content" {...(Platform.OS === 'android' ? { backgroundColor: Colors.green900 } : {})} />
              <OfflineBanner />
              <SessionRestorer />
              <SessionMonitor />
              <RouteGuard />
              <Stack
                id="root-stack"
                screenOptions={{
                  headerShown: false,
                  headerStyle: { backgroundColor: Colors.green900 },
                  headerTintColor: '#fff',
                  headerTitleStyle: {
                    fontFamily: 'Manrope_800ExtraBold',
                    fontSize: 18,
                  },
                  contentStyle: { backgroundColor: Colors.cream },
                }}
              />
            </ToastProvider>
          </BottomSheetModalProvider>
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
