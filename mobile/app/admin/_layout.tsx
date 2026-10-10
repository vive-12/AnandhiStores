import React, { useEffect, useState, useRef } from 'react';
import { Text, View, StyleSheet, TouchableOpacity, Modal, PanResponder, Platform } from 'react-native';
import { Redirect, Tabs, usePathname, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSession } from '../../hooks/useSession';
import { Colors, FontSize, Spacing, Radius } from '../../theme';
import { listenAdminOrders } from '../../services/orders';
import type { Order } from '../../types';

const ADMIN_TABS = [
  'alerts',     // Dashboard
  'analytics',  // Analytics
  'profiles',   // Profiles (Customers + Delivery Agents)
  'inventory',  // Inventory (Products & Stock + Offers)
  'cans',       // Cans
  'qr',         // QR
];

export default function AdminLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const currentTab = pathname.split('/').filter(Boolean)[1] || 'alerts';
  const currentTabRef = useRef(currentTab);

  useEffect(() => {
    currentTabRef.current = currentTab;
  }, [currentTab]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return (
          Math.abs(gestureState.dx) > 35 &&
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 2
        );
      },
      onMoveShouldSetPanResponderCapture: (_, gestureState) => {
        return (
          Math.abs(gestureState.dx) > 35 &&
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 2
        );
      },
      onPanResponderRelease: (_, gestureState) => {
        const threshold = 40;
        const curTab = currentTabRef.current;
        const idx = ADMIN_TABS.indexOf(curTab);
        if (idx === -1) return;

        // Swiping right-to-left: finger moves towards left (dx < 0) -> Go to NEXT tab
        if (gestureState.dx < -threshold || (gestureState.dx < -25 && gestureState.vx < -0.3)) {
          if (idx < ADMIN_TABS.length - 1) {
            const nextTab = ADMIN_TABS[idx + 1];
            Haptics.selectionAsync();
            router.navigate(`/admin/${nextTab}` as any);
          }
        }
        // Swiping left-to-right: finger moves towards right (dx > 0) -> Go to PREVIOUS tab
        else if (gestureState.dx > threshold || (gestureState.dx > 25 && gestureState.vx > 0.3)) {
          if (idx > 0) {
            const prevTab = ADMIN_TABS[idx - 1];
            Haptics.selectionAsync();
            router.navigate(`/admin/${prevTab}` as any);
          }
        }
      },
    })
  ).current;

  const { uid, role, isLoading } = useSession();
  const [newOrderAlert, setNewOrderAlert] = useState<Order | null>(null);
  const dismissedIdsRef = useRef<Set<string>>(new Set());

  // ── New order alert (sync row 4) ─────────────────────────────────────────
  useEffect(() => {
    if (isLoading || !uid || role !== 'admin') return;

    let isInitialSnapshot = true;

    return listenAdminOrders(
      placed => {
        if (isInitialSnapshot) {
          // On login / app launch, mark already existing placed orders as seen
          // so admin is NOT interrupted by popups for past orders
          placed.forEach(o => dismissedIdsRef.current.add(o.id));
          isInitialSnapshot = false;
          return;
        }

        const fresh = placed.find(o => !dismissedIdsRef.current.has(o.id));
        if (fresh) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          setNewOrderAlert(fresh);
        }
      },
      () => {},
      'placed',
    );
  }, [uid, role, isLoading]);

  const dismiss = () => {
    if (newOrderAlert) {
      dismissedIdsRef.current.add(newOrderAlert.id);
    }
    setNewOrderAlert(null);
  };

  // ── Auth guard (strictly after all hooks) ─────────────────────────────────
  if (isLoading) return <View style={{ flex: 1, backgroundColor: Colors.green900 }} />;
  if (!uid || role !== 'admin') return <Redirect href="/auth/login" />;

  return (
    <View style={{ flex: 1 }} {...panResponder.panHandlers}>
      <Tabs screenOptions={{
        headerShown:             false,
        tabBarActiveTintColor:   Colors.amber,
        tabBarInactiveTintColor: 'rgba(255,255,255,0.6)',
        tabBarStyle: {
          backgroundColor: Colors.green900,
          borderTopColor: Colors.green700,
          height: Platform.OS === 'ios' ? 88 : 66,
          paddingBottom: Platform.OS === 'ios' ? 24 : 8,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontFamily: 'Manrope_700Bold',
          marginTop: 2,
        },
      }}>
        <Tabs.Screen name="alerts"    options={{ tabBarLabel: 'Dashboard', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 24 }}>📊</Text> }} />
        <Tabs.Screen name="analytics" options={{ tabBarLabel: 'Analytics',  tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 24 }}>📈</Text> }} />
        <Tabs.Screen name="profiles"  options={{ tabBarLabel: 'Profiles',   tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 24 }}>👥</Text> }} />
        <Tabs.Screen name="inventory" options={{ tabBarLabel: 'Inventory',  tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 24 }}>📦</Text> }} />
        <Tabs.Screen name="cans"      options={{ tabBarLabel: 'Cans',       tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 24 }}>💧</Text> }} />
        <Tabs.Screen name="qr"        options={{ tabBarLabel: 'QR',         tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 24 }}>📱</Text> }} />
        <Tabs.Screen name="agents"    options={{ href: null }} />
        <Tabs.Screen name="offers"    options={{ href: null }} />
        <Tabs.Screen name="settings"  options={{ href: null }} />
      </Tabs>

      {/* New-order in-app alert (sync row 4) */}
      {newOrderAlert && (
        <Modal
          transparent
          animationType="fade"
          statusBarTranslucent
          onRequestClose={dismiss}
        >
          <View style={s.overlay}>
            <View style={s.card}>
              <Text style={s.bell}>🔔</Text>
              <Text style={s.alertTitle}>New order!</Text>
              <Text style={s.alertMsg}>
                {newOrderAlert.orderNo ?? `Order #${newOrderAlert.id.slice(-4)}`}
                {' — '}{newOrderAlert.customerName}
              </Text>
              <Text style={s.alertSub}>Rs {newOrderAlert.total}</Text>
              <TouchableOpacity style={s.btn} onPress={dismiss}>
                <Text style={s.btnTxt}>View orders</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  overlay:    { flex: 1, backgroundColor: 'rgba(18,53,36,0.85)', justifyContent: 'center', alignItems: 'center', padding: Spacing.xl },
  card:       { backgroundColor: Colors.card, borderRadius: Radius.card, padding: Spacing.xxl, width: '100%', alignItems: 'center' },
  bell:       { fontSize: 56, marginBottom: Spacing.md },
  alertTitle: { fontSize: FontSize.xl, fontFamily: 'Manrope_800ExtraBold', color: Colors.ink, marginBottom: Spacing.sm },
  alertMsg:   { fontSize: FontSize.md, fontFamily: 'Manrope_600SemiBold', color: Colors.ink, textAlign: 'center' },
  alertSub:   { fontSize: FontSize.sm, fontFamily: 'Manrope_500Medium', color: Colors.inkSoft, marginTop: 4, marginBottom: Spacing.xl },
  btn:        { backgroundColor: Colors.amber, borderRadius: Radius.button, paddingVertical: 14, paddingHorizontal: Spacing.xl, width: '100%', alignItems: 'center' },
  btnTxt:     { color: '#fff', fontSize: FontSize.md, fontFamily: 'Manrope_800ExtraBold' },
});
