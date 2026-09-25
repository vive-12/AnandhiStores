import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView, Linking } from 'react-native';
import { useLocalSearchParams, Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { ENDPOINTS } from '../../../config/api';

const FLOW = ['placed', 'assigned', 'out_for_delivery', 'delivered'];
const NEXT_COLOR = { assigned: '#f59e0b', out_for_delivery: '#10b981' };

export default function ActiveDelivery() {
  const { id, agent_id } = useLocalSearchParams();
  const router = useRouter();
  const [order, setOrder] = useState(null);
  const [updating, setUpdating] = useState(false);
  const [emptyCollected, setEmptyCollected] = useState(false);

  const load = async () => {
    try {
      const r = await axios.get(ENDPOINTS.order(id));
      setOrder(r.data);
      setEmptyCollected(r.data.empty_can_returned === 1);
    } catch (e) {}
  };

  useEffect(() => { load(); const t = setInterval(load, 8000); return () => clearInterval(t); }, [id]);

  const advance = async () => {
    if (!order) return;
    const curr = FLOW.indexOf(order.status);
    if (curr >= FLOW.length - 1) return;
    const next = FLOW[curr + 1];
    const msg = next === 'delivered'
      ? `Mark as DELIVERED?\nCollect ₹${order?.cod_amount} cash from customer!`
      : `Mark as "${next.replace(/_/g, ' ')}"?`;
    Alert.alert('Update Status', msg, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Confirm', onPress: async () => {
        setUpdating(true);
        try {
          await axios.patch(ENDPOINTS.orderStatus(id), { status: next, agent_id: agent_id || undefined });
          await load();
        } catch (e) { Alert.alert('Error', 'Could not update status.'); }
        finally { setUpdating(false); }
      }},
    ]);
  };

  const markEmpty = () => {
    if (emptyCollected) return;
    Alert.alert('♻️ Empty Can', 'Mark empty 20L can as collected from customer?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Yes, Collected', onPress: async () => {
        try {
          await axios.patch(ENDPOINTS.emptyReturned(id));
          setEmptyCollected(true);
          Alert.alert('✅ Done!', 'Empty can marked as collected.');
        } catch (e) { Alert.alert('Error', 'Could not update.'); }
      }},
    ]);
  };

  const openMaps = () => {
    if (order?.lat && order?.lng) return Linking.openURL(`https://maps.google.com/?q=${order.lat},${order.lng}`);
    Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(order?.delivery_address || '')}`);
  };

  if (!order) return <View style={styles.center}><Text style={{ color: '#64748b' }}>Loading order... 💧</Text></View>;

  const delivered = order.status === 'delivered';
  const curr = FLOW.indexOf(order.status);
  const nextLabel = delivered ? null : FLOW[curr + 1]?.replace(/_/g, ' ');

  return (
    <>
      <Stack.Screen options={{ title: `Delivery #${id}` }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>

        {/* Customer Card */}
        <View style={styles.card}>
          <View style={styles.custHead}>
            <View>
              <Text style={styles.custName}>{order.customer_name}</Text>
              <Text style={styles.custPhone}>{order.customer_phone}</Text>
            </View>
            <View style={{ flexDirection: 'row' }}>
              <TouchableOpacity style={styles.iconBtn} onPress={() => Linking.openURL(`tel:${order.customer_phone}`)}>
                <Ionicons name="call" size={20} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity style={[styles.iconBtn, { backgroundColor: '#10b981', marginLeft: 8 }]} onPress={openMaps}>
                <Ionicons name="navigate" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.addrBox}>
            <Ionicons name="location" size={16} color="#0ea5e9" />
            <Text style={styles.addrTxt}>{order.delivery_address}</Text>
          </View>
        </View>

        {/* Summary */}
        <View style={styles.card}>
          <View style={styles.row}><Ionicons name="water-outline" size={18} color="#64748b" /><Text style={styles.rowLabel}>Cans</Text><Text style={styles.rowVal}>{order.cans_qty} × 20L</Text></View>
          <View style={styles.row}><Ionicons name="cash-outline" size={18} color="#64748b" /><Text style={styles.rowLabel}>Collect Cash</Text><Text style={[styles.rowVal, { color: '#10b981', fontWeight: '800', fontSize: 17 }]}>₹{order.cod_amount}</Text></View>
        </View>

        {/* Status */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Current Status</Text>
          <View style={styles.statusBox}>
            <Text style={styles.statusTxt}>{order.status.replace(/_/g, ' ').toUpperCase()}</Text>
          </View>
          {!delivered && (
            <TouchableOpacity style={[styles.nextBtn, { backgroundColor: NEXT_COLOR[order.status] || '#0ea5e9' }, updating && { opacity: 0.6 }]} onPress={advance} disabled={updating}>
              <Ionicons name="arrow-forward-circle" size={22} color="#fff" />
              <Text style={styles.nextBtnTxt}>{updating ? 'Updating...' : `Mark: ${nextLabel?.toUpperCase()}`}</Text>
            </TouchableOpacity>
          )}
          {delivered && (
            <View style={{ backgroundColor: '#f0fdf4', borderRadius: 10, padding: 16, alignItems: 'center' }}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: '#10b981' }}>✅ Delivered!</Text>
              <Text style={{ color: '#64748b', marginTop: 4 }}>Collect ₹{order.cod_amount} in cash.</Text>
            </View>
          )}
        </View>

        {/* Empty Can */}
        <View style={[styles.card, { borderColor: emptyCollected ? '#86efac' : '#fde68a', borderWidth: 1.5 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
            <Ionicons name="refresh-circle-outline" size={24} color={emptyCollected ? '#10b981' : '#f59e0b'} />
            <Text style={styles.emptyTitle}>Empty Can Return</Text>
          </View>
          <Text style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>Did the customer return the empty 20L can?</Text>
          <TouchableOpacity style={[styles.emptyBtn, emptyCollected && { backgroundColor: '#10b981' }]} onPress={markEmpty} disabled={emptyCollected}>
            <Ionicons name={emptyCollected ? 'checkmark-circle' : 'cube-outline'} size={20} color="#fff" />
            <Text style={styles.emptyBtnTxt}>{emptyCollected ? '✅ Empty Can Collected' : 'Tap when collected'}</Text>
          </TouchableOpacity>
          {!emptyCollected && delivered && (
            <Text style={{ fontSize: 12, color: '#ef4444', textAlign: 'center', marginTop: 8 }}>
              ⚠️ Admin will be alerted if not collected within 10 days.
            </Text>
          )}
        </View>

        {delivered && (
          <TouchableOpacity style={styles.doneBtn} onPress={() => router.replace('/agent/dashboard')}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>← Back to Dashboard</Text>
          </TouchableOpacity>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f9ff' },
  content:   { padding: 16 },
  center:    { flex: 1, justifyContent: 'center', alignItems: 'center' },
  card:      { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#e2e8f0' },
  cardLabel: { fontSize: 13, fontWeight: '600', color: '#64748b', marginBottom: 10 },
  custHead:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  custName:  { fontSize: 20, fontWeight: '800', color: '#0f172a' },
  custPhone: { fontSize: 14, color: '#64748b', marginTop: 2 },
  iconBtn:   { width: 40, height: 40, borderRadius: 20, backgroundColor: '#0ea5e9', justifyContent: 'center', alignItems: 'center' },
  addrBox:   { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#f0f9ff', borderRadius: 8, padding: 10 },
  addrTxt:   { marginLeft: 8, flex: 1, color: '#334155', fontSize: 14 },
  row:       { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  rowLabel:  { color: '#64748b', fontSize: 14, marginLeft: 8, flex: 1 },
  rowVal:    { color: '#0f172a', fontSize: 15, fontWeight: '600' },
  statusBox: { backgroundColor: '#f1f5f9', borderRadius: 8, padding: 10, alignItems: 'center', marginBottom: 14 },
  statusTxt: { color: '#334155', fontWeight: '800', fontSize: 15, letterSpacing: 1 },
  nextBtn:   { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', borderRadius: 12, padding: 14, gap: 8 },
  nextBtnTxt:{ color: '#fff', fontWeight: '700', fontSize: 15 },
  emptyTitle:{ fontSize: 16, fontWeight: '700', color: '#0f172a', marginLeft: 8 },
  emptyBtn:  { backgroundColor: '#f59e0b', borderRadius: 10, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 12, gap: 8 },
  emptyBtnTxt:{ color: '#fff', fontWeight: '700', fontSize: 14 },
  doneBtn:   { backgroundColor: '#6366f1', borderRadius: 12, padding: 16, alignItems: 'center' },
});
