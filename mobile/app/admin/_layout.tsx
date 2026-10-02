// app/admin/_layout.tsx — Admin tabs with auth guard
import React, { useEffect, useState } from 'react';
import { Text, View, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { Redirect, Tabs } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSession } from '../../hooks/useSession';
import { Colors, FontSize, Spacing, Radius } from '../../theme';
import { listenAdminOrders } from '../../services/orders';
import type { Order } from '../../types';

export default function AdminLayout() {
  const { uid, role, isLoading } = useSession();
  const [newOrderAlert, setNewOrderAlert] = useState<Order | null>(null);
  const dismissedIdsRef = React.useRef<Set<string>>(new Set());

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
  if (isLoading) return null;
  if (!uid || role !== 'admin') return <View style={{ flex: 1, backgroundColor: Colors.green900 }} />;

  return (
    <>
      <Tabs screenOptions={{
        headerShown:             false,
        tabBarActiveTintColor:   Colors.amber,
        tabBarInactiveTintColor: 'rgba(255,255,255,0.6)',
        tabBarStyle:             { backgroundColor: Colors.green900, borderTopColor: Colors.green700 },
        tabBarLabelStyle:        { fontSize: 10, fontFamily: 'Manrope_600SemiBold' },
      }}>
        <Tabs.Screen name="alerts"    options={{ tabBarLabel: 'Dashboard', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>📊</Text> }} />
        <Tabs.Screen name="analytics" options={{ tabBarLabel: 'Analytics',  tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>📈</Text> }} />
        <Tabs.Screen name="profiles"  options={{ tabBarLabel: 'Profiles',   tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>👥</Text> }} />
        <Tabs.Screen name="agents"    options={{ tabBarLabel: 'Agents',     tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>🚴</Text> }} />
        <Tabs.Screen name="inventory" options={{ tabBarLabel: 'Inventory',  tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>📦</Text> }} />
        <Tabs.Screen name="offers"    options={{ tabBarLabel: 'Offers',     tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>🏷️</Text> }} />
        <Tabs.Screen name="cans"      options={{ tabBarLabel: 'Cans',       tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>💧</Text> }} />
        <Tabs.Screen name="settings"  options={{ href: null }} />
      </Tabs>

      {/* New-order in-app alert (sync row 4) */}
      {newOrderAlert && (
        <Modal transparent animationType="fade">
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
    </>
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
