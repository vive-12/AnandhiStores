import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { API_BASE } from '../../config/api';

export default function OrderHistoryScreen() {
  const router = useRouter();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchOrders = async () => {
      const data = await AsyncStorage.getItem('user');
      if (data) {
        const parsed = JSON.parse(data);
        const u = parsed.user || parsed;
        try {
          const res = await axios.get(`${API_BASE}/orders?user_id=${u.id}`);
          setOrders(res.data);
        } catch (e) {
          console.error('Error fetching order history', e);
        }
      }
      setLoading(false);
    };
    fetchOrders();
  }, []);

  const getStatusColor = (status) => {
    switch(status) {
      case 'delivered': return '#10b981';
      case 'out_for_delivery': return '#f59e0b';
      case 'assigned': return '#6366f1';
      default: return '#0ea5e9';
    }
  };

  const getStatusLabel = (status) => {
    switch(status) {
      case 'delivered': return 'Delivered';
      case 'out_for_delivery': return 'Out for Delivery';
      case 'assigned': return 'Agent Assigned';
      default: return 'Order Placed';
    }
  };

  if (loading) return <ActivityIndicator style={{ flex: 1, backgroundColor: '#f0f9ff' }} color="#0ea5e9" />;

  return (
    <>
      <View style={styles.container}>
        {orders.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="receipt-outline" size={64} color="#cbd5e1" />
            <Text style={styles.emptyText}>No orders yet</Text>
            <TouchableOpacity style={styles.orderBtn} onPress={() => router.push('/order')}>
              <Text style={styles.orderBtnTxt}>Place an Order</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            contentContainerStyle={styles.list}
            data={orders}
            keyExtractor={(item) => item.id.toString()}
            renderItem={({ item }) => {
              const date = new Date(item.placed_at);
              const dateStr = isNaN(date.getTime()) ? 'Unknown Date' : date.toLocaleDateString('en-IN', {
                month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
              });
              
              return (
                <TouchableOpacity 
                  style={styles.card} 
                  activeOpacity={0.7}
                  onPress={() => item.status !== 'delivered' && router.push(`/track/${item.id}`)}
                >
                  <View style={styles.cardHeader}>
                    <Text style={styles.orderId}>Order #{item.id}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '20' }]}>
                      <Text style={[styles.statusTxt, { color: getStatusColor(item.status) }]}>
                        {getStatusLabel(item.status)}
                      </Text>
                    </View>
                  </View>
                  
                  <View style={styles.cardBody}>
                    <View style={styles.row}>
                      <Text style={styles.label}>Date</Text>
                      <Text style={styles.val}>{dateStr}</Text>
                    </View>
                    <View style={styles.row}>
                      <Text style={styles.label}>Items</Text>
                      <Text style={styles.val}>{item.cans_qty} × 20L Can</Text>
                    </View>
                    <View style={styles.row}>
                      <Text style={styles.label}>Total Amount</Text>
                      <Text style={[styles.val, { fontWeight: '700', color: '#0f172a' }]}>₹{item.cod_amount}</Text>
                    </View>
                  </View>

                  {item.status !== 'delivered' && (
                    <View style={styles.cardFooter}>
                      <Text style={styles.footerTxt}>Tap to track live order</Text>
                      <Ionicons name="arrow-forward" size={16} color="#0ea5e9" />
                    </View>
                  )}
                </TouchableOpacity>
              );
            }}
          />
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f9ff' },
  list: { padding: 16 },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  emptyText: { fontSize: 18, color: '#64748b', marginTop: 12, marginBottom: 24, fontWeight: '600' },
  orderBtn: { backgroundColor: '#0ea5e9', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  orderBtnTxt: { color: '#fff', fontSize: 16, fontWeight: '700' },
  
  card: { backgroundColor: '#fff', borderRadius: 16, marginBottom: 16, borderWidth: 1, borderColor: '#e2e8f0', overflow: 'hidden' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  orderId: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusTxt: { fontSize: 12, fontWeight: '700' },
  
  cardBody: { padding: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  label: { fontSize: 14, color: '#64748b' },
  val: { fontSize: 14, color: '#334155', fontWeight: '500' },
  
  cardFooter: { backgroundColor: '#f8fafc', padding: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  footerTxt: { fontSize: 13, color: '#0ea5e9', fontWeight: '600' }
});
