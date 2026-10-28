// app/_layout.tsx — Root layout: fonts, providers, session restoration, role routing
import { useEffect } from 'react';
import { Platform, View, StatusBar } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  useFonts,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_800ExtraBold,
} from '@expo-google-fonts/manrope';
import * as SplashScreen from 'expo-splash-screen';
import { ToastProvider } from '../components/ui/Toast';
import { Colors } from '../theme';
import { useSession } from '../hooks/useSession';
import { restoreSession } from '../services/auth';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { OfflineBanner } from '../components/ui/OfflineBanner';
import { initOutboxListener } from '../services/outbox';
import { initLogger, log } from '../utils/logger';
import { registerDevicePushToken } from '../services/notifications';

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
      registerDevicePushToken(uid).catch(() => {});
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
function SessionRestorer() {
  const { setSession, clearSession, setLoading } = useSession();

  useEffect(() => {
    // Load previous-session logs from AsyncStorage FIRST, then restore auth.
    initLogger().then(() => {
      log.auth.info('App started — logger initialised');
      return restoreSession();
    }).then(user => {
      if (user) {
        setSession({ id: user.id, role: user.role, name: user.name, phone: user.phone, status: user.status, mustChangePin: user.mustChangePin });
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
    Manrope_800ExtraBold,
  });

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync();
  }, [fontsLoaded]);

  useEffect(() => {
    const cleanupOutbox = initOutboxListener();
    return () => {
      cleanupOutbox();
    };
  }, []);

  useEffect(() => {
    if (Platform.OS === 'android') {
      try {
        const Notifications = require('expo-notifications');
        if (Notifications?.setNotificationChannelAsync) {
          Notifications.setNotificationChannelAsync('default', {
            name: 'Orders & Deliveries',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#123524',
            sound: 'default',
            enableVibrate: true,
            showBadge: true,
          }).catch(() => {});
        }
        if (Notifications?.requestPermissionsAsync) {
          Notifications.requestPermissionsAsync().catch(() => {});
        }
      } catch {}
    }
  }, []);

  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: Colors.green900 }} />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ErrorBoundary>
          <BottomSheetModalProvider>
            <ToastProvider>
              <StatusBar barStyle="light-content" backgroundColor={Colors.green900} />
              <OfflineBanner />
              <SessionRestorer />
              <RouteGuard />
              <Stack
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
