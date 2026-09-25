import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, RefreshControl, Linking, ActivityIndicator, Modal } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { ENDPOINTS } from '../../config/api';

export default function AdminAlerts() {
  const router = useRouter();
  const [data, setData] = useState({ urgent: [], pending: [] });
  const [stats, setStats] = useState(null);
  const [allOrders, setAllOrders] = useState([]);
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState('all');

  const [assignModalOrder, setAssignModalOrder] = useState(null);

  const fetch = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const [aRes, sRes, oRes, agRes] = await Promise.all([
        axios.get(ENDPOINTS.adminAlerts), 
        axios.get(ENDPOINTS.adminStats),
        axios.get(ENDPOINTS.orders),
        axios.get(ENDPOINTS.agentAvail)
      ]);
      setData(aRes.data);
      setStats(sRes.data);
      setAllOrders(oRes.data);
      setAgents(agRes.data);
    } catch (e) { 
      Alert.alert('Error', 'Could not load dashboard data.'); 
    }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { fetch(); const t = setInterval(() => fetch(), 10000); return () => clearInterval(t); }, []);

  const handleAssignOrder = async (orderId, agentId) => {
    try {
      await axios.patch(ENDPOINTS.orderStatus(orderId), { status: 'assigned', agent_id: agentId });
      Alert.alert('Success', 'Order assigned to delivery agent!');
      setAssignModalOrder(null);
      fetch();
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || 'Failed to assign order');
    }
  };

  const getStatusColor = (status) => {
    switch(status) {
      case 'delivered': return '#10b981';
      case 'out_for_delivery': return '#f59e0b';
      case 'assigned': return '#6366f1';
      default: return '#0ea5e9';
    }
  };

  const GenericOrderCard = ({ item }) => {
    const elapsedMins = Math.floor((Date.now() - new Date(item.placed_at)) / 60000);
    const elapsedText = elapsedMins > 60 ? `${Math.floor(elapsedMins/60)}h ${elapsedMins%60}m ago` : `${elapsedMins}m ago`;
    
    return (
      <View style={[styles.alertCard, { borderColor: getStatusColor(item.status), borderWidth: 2 }]}>
        <View style={styles.alertHead}>
          <View>
            <Text style={styles.alertId}>Order #{item.id}</Text>
            <Text style={{ fontSize: 12, color: getStatusColor(item.status), fontWeight: '700', textTransform: 'capitalize' }}>
              {item.status.replace(/_/g, ' ')}
            </Text>
            <Text style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
              Placed: {new Date(item.placed_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} ({elapsedText})
            </Text>
          </View>
          <Text style={{ fontWeight: '900', fontSize: 16, color: '#10b981' }}>₹{item.cod_amount}</Text>
        </View>
        
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
          <View style={[styles.callBox, { flex: 1, marginBottom: 0 }]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.callName} numberOfLines={1}>{item.customer_name}</Text>
              <Text style={styles.callRole}>Customer</Text>
            </View>
            <TouchableOpacity onPress={() => Linking.openURL(`tel:${item.customer_phone}`)} style={styles.callBtnAction}>
              <Ionicons name="call" size={16} color="#fff" />
            </TouchableOpacity>
          </View>

          {item.agent_name && (
            <View style={[styles.callBox, { flex: 1, marginBottom: 0, backgroundColor: '#eef2ff' }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.callName, {color: '#4f46e5'}]} numberOfLines={1}>{item.agent_name}</Text>
                <Text style={styles.callRole}>Agent</Text>
              </View>
              <TouchableOpacity onPress={() => Linking.openURL(`tel:${item.agent_phone}`)} style={[styles.callBtnAction, {backgroundColor: '#4f46e5'}]}>
                <Ionicons name="call" size={16} color="#fff" />
              </TouchableOpacity>
            </View>
          )}
        </View>

        <Text style={styles.alertAddr} numberOfLines={2}>{item.delivery_address}</Text>
        <View style={[styles.cansBadge, { backgroundColor: '#e0f2fe', flexWrap: 'wrap' }]}>
          <Ionicons name="cart" size={14} color="#0ea5e9" />
          {item.items && item.items.length > 0 ? (
            <Text style={[styles.cansBadgeTxt, { color: '#0ea5e9', flexShrink: 1 }]}>
              {item.items.map(i => `${i.qty}x ${i.name}`).join(', ')}
            </Text>
          ) : (
            <Text style={[styles.cansBadgeTxt, { color: '#0ea5e9' }]}>{item.cans_qty} can</Text>
          )}
        </View>
        {item.status === 'placed' && (
          <TouchableOpacity style={styles.assignBtn} onPress={() => setAssignModalOrder(item.id)}>
            <Text style={styles.assignBtnTxt}>Assign to Delivery Agent</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const AlertCard = ({ item, urgent }) => (
    <View style={[styles.alertCard, urgent && styles.urgentCard]}>
      <View style={styles.alertHead}>
        <View>
          <Text style={styles.alertId}>Order #{item.id}</Text>
          <Text style={[styles.alertDays, { color: urgent ? '#ef4444' : '#f59e0b' }]}>
            {urgent ? `🚨 ${item.days_since_delivery} days overdue` : `⏳ ${item.days_since_delivery} days since delivery`}
          </Text>
        </View>
        <TouchableOpacity style={[styles.callBtn, urgent && { backgroundColor: '#ef4444' }]} onPress={() => Linking.openURL(`tel:${item.customer_phone}`)}>
          <Ionicons name="call" size={16} color="#fff" />
          <Text style={styles.callBtnTxt}>Call</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.alertName}>{item.customer_name}</Text>
      <Text style={styles.alertPhone}>{item.customer_phone}</Text>
      <Text style={styles.alertAddr} numberOfLines={2}>{item.delivery_address}</Text>
      <View style={styles.cansBadge}>
        <Ionicons name="water-outline" size={14} color="#92400e" />
        <Text style={styles.cansBadgeTxt}>{item.cans_qty} empty can not returned</Text>
      </View>
    </View>
  );

  const AgentCard = ({ agent }) => (
    <View style={styles.alertCard}>
       <Text style={styles.alertId}>{agent.name}</Text>
       <Text style={styles.alertPhone}>{agent.phone}</Text>
       <Text style={{ fontSize: 13, color: '#10b981', fontWeight: '700', marginTop: 4 }}>Available for delivery</Text>
    </View>
  );

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#8b5cf6" /></View>;

  // Computed views
  const newOrders = allOrders.filter(o => o.status === 'placed');
  
  const getFilteredItems = () => {
    if (activeFilter === 'Total Orders') return allOrders.map(o => <GenericOrderCard key={`o-${o.id}`} item={o} />);
    if (activeFilter === 'Active') return allOrders.filter(o => o.status !== 'delivered').map(o => <GenericOrderCard key={`a-${o.id}`} item={o} />);
    if (activeFilter === 'Today Delivered') return allOrders.filter(o => o.status === 'delivered').map(o => <GenericOrderCard key={`d-${o.id}`} item={o} />);
    if (activeFilter === 'Cans Pending') return [...data.urgent, ...data.pending].map(a => <AlertCard key={`c-${a.id}`} item={a} urgent={a.days_since_delivery > 10} />);
    if (activeFilter === '🚨 Urgent') return data.urgent.map(a => <AlertCard key={`u-${a.id}`} item={a} urgent />);
    if (activeFilter === 'Free Agents') return agents.map(a => <AgentCard key={`ag-${a.id}`} agent={a} />);
    return null;
  };

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetch(true)} tintColor="#8b5cf6" />}>

        {/* Stats Grid */}
        {stats && (
          <View style={styles.statsGrid}>
            {[
              { label: 'Total Orders', value: stats.totalOrders, color: '#0ea5e9' },
              { label: 'Active', value: stats.activeOrders, color: '#6366f1' },
              { label: 'Today Delivered', value: stats.deliveredToday, color: '#10b981' },
              { label: 'Cans Pending', value: stats.emptyCansPending, color: '#f59e0b' },
              { label: '🚨 Urgent', value: stats.urgentAlerts, color: '#ef4444' },
              { label: 'Free Agents', value: stats.availableAgents, color: '#64748b' }
            ].map((stat) => (
              <TouchableOpacity 
                key={stat.label} 
                activeOpacity={0.7}
                onPress={() => setActiveFilter(activeFilter === stat.label ? 'all' : stat.label)}
                style={[styles.statBox, { borderLeftColor: stat.color }, activeFilter === stat.label && styles.statBoxActive]}
              >
                <Text style={[styles.statVal, { color: stat.color }]}>{stat.value}</Text>
                <Text style={styles.statLabel}>{stat.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Filtered View OR Default View */}
        {activeFilter !== 'all' ? (
          <>
             <View style={styles.sectionHead}>
               <Ionicons name="filter" size={18} color="#334155" />
               <Text style={[styles.sectionTitle, { color: '#334155' }]}>Viewing: {activeFilter}</Text>
             </View>
             {getFilteredItems()}
             {getFilteredItems().length === 0 && <Text style={{textAlign: 'center', color: '#64748b', marginTop: 20}}>No items found.</Text>}
          </>
        ) : (
          <>
            {/* Default Dashboard View */}
            {newOrders.length > 0 && (
              <>
                <View style={styles.sectionHead}>
                  <Ionicons name="bicycle" size={18} color="#8b5cf6" />
                  <Text style={[styles.sectionTitle, { color: '#8b5cf6' }]}>Unassigned Orders ({newOrders.length})</Text>
                </View>
                {newOrders.map(item => <GenericOrderCard key={`def-${item.id}`} item={item} />)}
              </>
            )}

            {data.urgent.length > 0 && (
              <>
                <View style={[styles.sectionHead, { marginTop: 16 }]}>
                  <Ionicons name="warning" size={18} color="#ef4444" />
                  <Text style={[styles.sectionTitle, { color: '#ef4444' }]}>🚨 Urgent — Over 10 Days ({data.urgent.length})</Text>
                </View>
                {data.urgent.map(item => <AlertCard key={`defu-${item.id}`} item={item} urgent />)}
              </>
            )}

            {data.pending.length > 0 && (
              <>
                <View style={[styles.sectionHead, { marginTop: 8 }]}>
                  <Ionicons name="time-outline" size={18} color="#f59e0b" />
                  <Text style={[styles.sectionTitle, { color: '#f59e0b' }]}>⏳ Watching — Under 10 Days ({data.pending.length})</Text>
                </View>
                {data.pending.map(item => <AlertCard key={`defp-${item.id}`} item={item} urgent={false} />)}
              </>
            )}

            {data.urgent.length === 0 && data.pending.length === 0 && newOrders.length === 0 && (
              <View style={styles.empty}>
                <Text style={{ fontSize: 60 }}>✅</Text>
                <Text style={styles.emptyTitle}>All Caught Up!</Text>
                <Text style={{ fontSize: 14, color: '#94a3b8', marginTop: 6 }}>No unassigned orders or alerts.</Text>
              </View>
            )}
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Assign Agent Modal */}
      {assignModalOrder && (
        <Modal transparent animationType="fade">
          <View style={styles.modalBg}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Select Delivery Agent</Text>
              {!agents.length && <Text style={{marginBottom:10}}>No agents available.</Text>}
              {agents.map(a => (
                <TouchableOpacity key={a.id} style={styles.agentItem} onPress={() => handleAssignOrder(assignModalOrder, a.id)}>
                  <Text style={styles.agentItemTxt}>{a.name} ({a.phone})</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={[styles.cancelBtn, { marginTop: 10 }]} onPress={() => setAssignModalOrder(null)}>
                <Text style={styles.cancelTxt}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#f5f3ff' },
  content:      { padding: 16 },
  center:       { flex: 1, justifyContent: 'center', alignItems: 'center' },
  statsGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  statBox:      { flex: 1, minWidth: '28%', backgroundColor: '#fff', borderRadius: 10, padding: 12, borderLeftWidth: 3 },
  statBoxActive:{ backgroundColor: '#f8fafc', elevation: 4, borderColor: '#cbd5e1', borderWidth: 1 },
  statVal:      { fontSize: 24, fontWeight: '900' },
  statLabel:    { fontSize: 11, color: '#64748b', marginTop: 2 },
  sectionHead:  { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 },
  sectionTitle: { fontSize: 15, fontWeight: '700' },
  alertCard:    { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  urgentCard:   { borderColor: '#fca5a5', borderWidth: 2, backgroundColor: '#fff7f7' },
  alertHead:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  alertId:      { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  alertDays:    { fontSize: 12, marginTop: 2 },
  callBtn:      { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#10b981', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  callBtnTxt:   { color: '#fff', fontWeight: '700', fontSize: 13 },
  alertName:    { fontSize: 15, fontWeight: '700', color: '#334155' },
  alertPhone:   { fontSize: 13, color: '#0ea5e9', marginBottom: 4 },
  alertAddr:    { fontSize: 12, color: '#64748b', marginBottom: 8 },
  cansBadge:    { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fef3c7', borderRadius: 6, padding: 6, marginBottom: 8 },
  cansBadgeTxt: { fontSize: 12, color: '#92400e', fontWeight: '600' },
  empty:        { alignItems: 'center', marginTop: 80 },
  emptyTitle:   { fontSize: 22, fontWeight: '700', color: '#334155', marginTop: 12 },
  assignBtn:    { backgroundColor: '#8b5cf6', padding: 12, borderRadius: 8, alignItems: 'center', marginTop: 8 },
  assignBtnTxt: { color: '#fff', fontWeight: '700' },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { backgroundColor: '#fff', padding: 24, borderRadius: 16, width: '100%', alignItems: 'center' },
  modalTitle: { fontSize: 20, fontWeight: '800', marginBottom: 20 },
  cancelBtn: { padding: 14, width: '100%', alignItems: 'center' },
  cancelTxt: { color: '#64748b', fontWeight: '600' },
  agentItem: { backgroundColor: '#f1f5f9', padding: 14, borderRadius: 8, width: '100%', marginBottom: 8, alignItems: 'center' },
  agentItemTxt: { color: '#1e293b', fontWeight: '600', fontSize: 16 },
  callBox:     { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f1f5f9', padding: 10, borderRadius: 8, marginBottom: 10 },
  callName:    { fontSize: 13, fontWeight: '700', color: '#334155' },
  callRole:    { fontSize: 10, color: '#64748b', marginTop: 2, textTransform: 'uppercase', fontWeight: '800' },
  callBtnAction: { backgroundColor: '#10b981', width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' }
});
