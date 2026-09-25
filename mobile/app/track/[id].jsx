import { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Animated } from 'react-native';
import { useLocalSearchParams, Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { ENDPOINTS } from '../../config/api';

const STEPS = [
  { key: 'placed',           label: 'Order Placed',     icon: 'checkmark-circle', color: '#0ea5e9' },
  { key: 'assigned',         label: 'Agent Assigned',   icon: 'person',           color: '#6366f1' },
  { key: 'out_for_delivery', label: 'Out for Delivery', icon: 'bicycle',          color: '#f59e0b' },
  { key: 'delivered',        label: 'Delivered! 🎉',    icon: 'basket',           color: '#10b981' },
];

function fmt(s) {
  if (s <= 0) return '00:00';
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export default function TrackScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [order, setOrder] = useState(null);
  const [secs, setSecs] = useState(15 * 60);
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1.08, duration: 700, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1,    duration: 700, useNativeDriver: true }),
    ])).start();
  }, []);

  useEffect(() => {
    const fetch = async () => {
      try {
        const r = await axios.get(ENDPOINTS.order(id));
        setOrder(r.data);
        setSecs(r.data.seconds_remaining || 0);
      } catch (e) {}
    };
    fetch();
    const poll = setInterval(fetch, 5000);
    return () => clearInterval(poll);
  }, [id]);

  useEffect(() => {
    if (!order || order.status === 'delivered') return;
    const t = setInterval(() => setSecs(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [order?.status]);

  const idx = STEPS.findIndex(s => s.key === order?.status);
  const delivered = order?.status === 'delivered';
  const timerColor = secs > 300 ? '#10b981' : secs > 120 ? '#f59e0b' : '#ef4444';

  if (!order) return <View style={styles.center}><Text style={{ color: '#64748b', fontSize: 16 }}>Loading... 🛒</Text></View>;

  return (
    <>
      <Stack.Screen options={{ title: `Order #${id}` }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>

        {!delivered ? (
          <View style={styles.timerWrap}>
            <Text style={styles.timerLabel}>Estimated Delivery In</Text>
            <Animated.View style={[styles.timerCircle, { borderColor: timerColor, transform: [{ scale: pulse }] }]}>
              <Text style={[styles.timerTxt, { color: timerColor }]}>{fmt(secs)}</Text>
              <Text style={styles.timerSub}>min : sec</Text>
            </Animated.View>
          </View>
        ) : (
          <View style={styles.delivBanner}>
            <Text style={{ fontSize: 48 }}>🎉</Text>
            <Text style={styles.delivTitle}>Order Delivered!</Text>
            <Text style={styles.delivSub}>Please pay ₹{order.cod_amount} cash to the agent.</Text>
          </View>
        )}

        <View style={styles.card}>
          {STEPS.map((step, i) => {
            const done   = i < idx || delivered;
            const active = i === idx && !delivered;
            const future = i > idx && !delivered;
            return (
              <View key={step.key} style={styles.stepRow}>
                <View style={styles.stepLeft}>
                  <View style={[styles.dot, done && { backgroundColor: '#10b981' }, active && { backgroundColor: step.color }, future && { backgroundColor: '#e2e8f0' }]}>
                    <Ionicons name={done ? 'checkmark' : step.icon} size={16} color={future ? '#94a3b8' : '#fff'} />
                  </View>
                  {i < STEPS.length - 1 && <View style={[styles.line, done && { backgroundColor: '#10b981' }]} />}
                </View>
                <View style={styles.stepContent}>
                  <Text style={[styles.stepLabel, done && { color: '#10b981' }, active && { color: step.color, fontWeight: '700' }, future && { color: '#94a3b8' }]}>
                    {step.label}
                  </Text>
                  {active && <Text style={{ fontSize: 12, color: '#94a3b8' }}>In progress…</Text>}
                </View>
              </View>
            );
          })}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Order Details</Text>
          {[['Order', `#${order.id}`], ['Customer', order.customer_name], ['Phone', order.customer_phone],
            ['Address', order.delivery_address], 
            ['Items', order.items && order.items.length > 0 ? order.items.map(i => `${i.qty}x ${i.name}`).join(', ') : 'Grocery Items'],
            ['Payment', `₹${order.cod_amount} (COD)`],
            ...(order.agent_name ? [['Agent', `${order.agent_name} · ${order.agent_phone}`]] : [])
          ].map(([k, v]) => (
            <View key={k} style={styles.detailRow}>
              <Text style={styles.detailKey}>{k}</Text>
              <Text style={[styles.detailVal, k === 'Payment' && { color: '#10b981', fontWeight: '700' }]} numberOfLines={2}>{v}</Text>
            </View>
          ))}
        </View>

        {delivered && (
          <View style={styles.codCard}>
            <Ionicons name="cash-outline" size={28} color="#10b981" />
            <View style={{ marginLeft: 12, flex: 1 }}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: '#10b981' }}>Pay ₹{order.cod_amount} Cash</Text>
              <Text style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>Hand it over to your delivery agent.</Text>
            </View>
          </View>
        )}

        <TouchableOpacity style={styles.newBtn} onPress={() => router.replace('/order')}>
          <Text style={styles.newBtnTxt}>+ Place Another Order</Text>
        </TouchableOpacity>
        <View style={{ height: 40 }} />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#f0f9ff' },
  content:     { padding: 20 },
  center:      { flex: 1, justifyContent: 'center', alignItems: 'center' },
  timerWrap:   { alignItems: 'center', marginBottom: 28 },
  timerLabel:  { fontSize: 15, color: '#64748b', marginBottom: 12, fontWeight: '600' },
  timerCircle: { width: 140, height: 140, borderRadius: 70, borderWidth: 5, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff', elevation: 4 },
  timerTxt:    { fontSize: 34, fontWeight: '900' },
  timerSub:    { fontSize: 11, color: '#94a3b8', marginTop: 2 },
  delivBanner: { backgroundColor: '#10b981', borderRadius: 18, padding: 24, alignItems: 'center', marginBottom: 24 },
  delivTitle:  { color: '#fff', fontSize: 24, fontWeight: '800', marginTop: 6 },
  delivSub:    { color: 'rgba(255,255,255,0.9)', fontSize: 14, marginTop: 6, textAlign: 'center' },
  card:        { backgroundColor: '#fff', borderRadius: 14, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: '#e2e8f0' },
  cardTitle:   { fontSize: 15, fontWeight: '700', color: '#0f172a', marginBottom: 12 },
  stepRow:     { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 4 },
  stepLeft:    { alignItems: 'center', marginRight: 14 },
  dot:         { width: 32, height: 32, borderRadius: 16, backgroundColor: '#e2e8f0', justifyContent: 'center', alignItems: 'center' },
  line:        { width: 2, height: 28, backgroundColor: '#e2e8f0', marginVertical: 3 },
  stepContent: { flex: 1, paddingTop: 6, paddingBottom: 20 },
  stepLabel:   { fontSize: 15, fontWeight: '500', color: '#334155' },
  detailRow:   { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  detailKey:   { color: '#64748b', fontSize: 13 },
  detailVal:   { color: '#0f172a', fontSize: 13, fontWeight: '500', maxWidth: '60%', textAlign: 'right' },
  codCard:     { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f0fdf4', borderRadius: 14, padding: 16, marginBottom: 20, borderWidth: 1.5, borderColor: '#86efac' },
  newBtn:      { backgroundColor: '#fff', borderRadius: 12, padding: 16, alignItems: 'center', borderWidth: 2, borderColor: '#0ea5e9' },
  newBtnTxt:   { color: '#0ea5e9', fontWeight: '700', fontSize: 15 },
});
