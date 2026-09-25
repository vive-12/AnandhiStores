import { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, RefreshControl, Linking, TextInput, Modal, KeyboardAvoidingView, ScrollView, Platform } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { ENDPOINTS, API_BASE } from '../../config/api';
import { openMapChoice } from '../../utils/openMap';

const STATUS_COLOR = { placed: '#0ea5e9', assigned: '#6366f1', out_for_delivery: '#f59e0b', delivered: '#10b981' };
const STATUS_LABEL = { placed: 'New Order', assigned: 'Assigned to You', out_for_delivery: 'Out for Delivery', delivered: 'Delivered' };

export default function AgentDashboard() {
  const router = useRouter();
  const [allOrders, setAllOrders] = useState([]);
  const [emptyCans, setEmptyCans] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [agent, setAgent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedCanId, setExpandedCanId] = useState(null);
  const [selectedReview, setSelectedReview] = useState(null);
  const [deliveryFee, setDeliveryFee] = useState('0');
  const [generatedPin, setGeneratedPin] = useState(null);
  const [editedUser, setEditedUser] = useState(null);
  
  // 'Assigned', 'Out for Delivery', 'Completed', 'Empty Cans', 'Reviews', or 'Active' (default)
  const [activeTab, setActiveTab] = useState('Active'); 

  const checkAuthAndFetch = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const stored = await AsyncStorage.getItem('agent');
      if (!stored) {
        setLoading(false);
        return router.replace('/auth/agent-login');
      }
      const parsedAgent = JSON.parse(stored);
      setAgent(parsedAgent);
      
      const [ordersRes, alertsRes, reviewsRes] = await Promise.all([
        axios.get(`${API_BASE}/agents/${parsedAgent.id}/orders`),
        axios.get(ENDPOINTS.adminAlerts),
        axios.get(`${API_BASE}/agents/${parsedAgent.id}/reviews`)
      ]);
      
      setAllOrders(ordersRes.data);
      const allCans = [...(alertsRes.data.urgent || []), ...(alertsRes.data.pending || [])];
      setEmptyCans(allCans);
      setReviews(reviewsRes.data);
    } catch (e) { 
      Alert.alert('Error', e.message || 'Could not load orders.'); 
    }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { checkAuthAndFetch(); const t = setInterval(() => checkAuthAndFetch(), 10000); return () => clearInterval(t); }, []);

  const logout = async () => {
    await AsyncStorage.removeItem('agent');
    router.replace('/auth/agent-login');
  };

  const markCanReturned = async (alertId) => {
    try {
      await axios.patch(`${API_BASE}/orders/${alertId}/empty-returned`);
      Alert.alert('Success', 'Marked as collected');
      checkAuthAndFetch();
    } catch (e) {
      Alert.alert('Error', e.message);
    }
  };

  const openReviewModal = (item) => {
    setSelectedReview(item);
    setDeliveryFee('0');
    setEditedUser({
      first_name: item.user?.first_name || '',
      last_name: item.user?.last_name || '',
      phone: item.user?.phone || '',
      door_number: item.user?.door_number || '',
      flat_house_name: item.user?.flat_house_name || '',
      street_number: item.user?.street_number || '',
      locality: item.user?.locality || '',
      city: item.user?.city || '',
      landmark: item.user?.landmark || '',
    });
  };

  const handleApproveReview = async () => {
    if (!selectedReview) return;
    try {
      const res = await axios.patch(`${API_BASE}/agents/reviews/${selectedReview.user_id}/approve`, {
        delivery_fee: Number(deliveryFee),
        ...editedUser,
      });
      setGeneratedPin(res.data.tempPin);
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || e.message);
    }
  };

  const closeModals = () => {
    setSelectedReview(null);
    setGeneratedPin(null);
    setEditedUser(null);
    checkAuthAndFetch();
  };

  const renderOrder = ({ item }) => {
    if (item.is_can_alert) {
      const isExpanded = expandedCanId === item.id;
      return (
        <TouchableOpacity activeOpacity={0.8} onPress={() => setExpandedCanId(isExpanded ? null : item.id)} style={styles.canCard}>
          <View style={styles.canHead}>
            <View>
              <Text style={styles.canTitle}>Collect : {item.cans_qty} can</Text>
              <Text style={styles.canAddr} numberOfLines={2}>{item.delivery_address}</Text>
              <Text style={{ fontSize: 11, color: item.days_since_delivery > 10 ? '#ef4444' : '#b45309', marginTop: 4, fontWeight: '700' }}>
                ⏳ {item.days_since_delivery} days since delivery
              </Text>
            </View>
            <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={24} color="#be185d" />
          </View>
          
          {isExpanded && (
            <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: '#fbcfe8', paddingTop: 12 }}>
              <View style={styles.callBox}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.callName}>{item.customer_name}</Text>
                  <Text style={styles.callPhone}>{item.customer_phone}</Text>
                </View>
                <TouchableOpacity onPress={() => Linking.openURL(`tel:${item.customer_phone}`)} style={styles.callBtnAction}>
                  <Ionicons name="call" size={20} color="#fff" />
                </TouchableOpacity>
              </View>
              
              <TouchableOpacity onPress={() => markCanReturned(item.id)} style={[styles.markBtn, { justifyContent: 'center', paddingVertical: 12, marginTop: 8 }]}>
                <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
                <Text style={styles.markBtnTxt}>MARK GET COMPLETED</Text>
              </TouchableOpacity>
            </View>
          )}
        </TouchableOpacity>
      );
    }

    if (item.is_review) {
      const u = item.user;
      const addressParts = [u?.door_number, u?.flat_house_name, u?.street_number, u?.locality, u?.city].filter(Boolean).join(', ');
      return (
        <View style={[styles.orderCard, { borderColor: '#6366f1', borderWidth: 2 }]}>
          <View style={styles.orderHead}>
            <View style={{ flex: 1 }}>
              <Text style={styles.orderId}>📋 Profile Review</Text>
              <Text style={styles.orderTime}>Tap to verify & approve</Text>
            </View>
            <View style={[styles.badge, { backgroundColor: '#6366f1' }]}>
              <Text style={styles.badgeTxt}>Review</Text>
            </View>
          </View>

          <View style={styles.callBox}>
            <View style={{ flex: 1 }}>
              <Text style={styles.callName}>{u?.first_name} {u?.last_name}</Text>
              <Text style={styles.callPhone}>{u?.phone}</Text>
            </View>
            <TouchableOpacity onPress={() => Linking.openURL(`tel:${u?.phone}`)} style={styles.callBtnAction}>
              <Ionicons name="call" size={20} color="#fff" />
            </TouchableOpacity>
          </View>

          {[['location-outline', addressParts || u?.address || 'No address'],
            ['flag-outline', u?.landmark ? `Landmark: ${u.landmark}` : 'No landmark']
          ].map(([icon, txt]) => (
            <View key={icon} style={styles.infoRow}>
              <Ionicons name={icon} size={15} color="#64748b" />
              <Text style={styles.infoTxt}>{txt}</Text>
            </View>
          ))}

          {/* Map button */}
          <TouchableOpacity
            style={styles.mapBtn}
          onPress={() => openMapChoice(u?.lat, u?.lng, `${u?.first_name} ${u?.last_name}, ${addressParts || u?.address || ''}`)}
          >
            <Ionicons name="map" size={16} color="#fff" />
            <Text style={styles.mapBtnTxt}>🗺  Open in Maps</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.acceptBtn, { backgroundColor: '#6366f1', marginTop: 8 }]} onPress={() => openReviewModal(item)}>
            <Ionicons name="person-circle-outline" size={20} color="#fff" />
            <Text style={styles.acceptBtnTxt}>Review & Approve</Text>
          </TouchableOpacity>
        </View>
      );
    }

    const color = STATUS_COLOR[item.status] || '#64748b';
    return (
      <View style={[styles.orderCard, item.status === 'placed' && styles.newCard]}>
        <View style={styles.orderHead}>
          <View>
            <Text style={styles.orderId}>Order #{item.id}</Text>
            <Text style={styles.orderTime}>{new Date(item.placed_at).toLocaleTimeString('en-IN')}</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: color }]}>
            <Text style={styles.badgeTxt}>{STATUS_LABEL[item.status]}</Text>
          </View>
        </View>
        
        <View style={styles.callBox}>
          <View style={{ flex: 1 }}>
            <Text style={styles.callName}>{item.customer_name}</Text>
            <Text style={styles.callPhone}>{item.customer_phone}</Text>
          </View>
          <TouchableOpacity onPress={() => Linking.openURL(`tel:${item.customer_phone}`)} style={styles.callBtnAction}>
            <Ionicons name="call" size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        <View style={{ marginBottom: 8, marginTop: 10 }}>
          {[['location-outline', item.delivery_address],
            ['cart-outline', item.items && item.items.length > 0 ? `${item.items.map(i => `${i.qty}x ${i.name}`).join(', ')} · ₹${item.cod_amount} COD` : `${item.cans_qty} can · ₹${item.cod_amount} COD`]
          ].map(([icon, txt]) => (
            <View key={icon} style={styles.infoRow}>
              <Ionicons name={icon} size={15} color="#64748b" />
              <Text style={styles.infoTxt} numberOfLines={2}>{txt}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.mapBtn, { marginBottom: 10 }]}
          onPress={() => openMapChoice(item.customer_lat, item.customer_lng, `${item.customer_name}, ${item.delivery_address || ''}`)}
        >
          <Ionicons name="map" size={16} color="#fff" />
          <Text style={styles.mapBtnTxt}>{Platform.OS === 'ios' ? '🗺 Open in Apple Maps' : '🗺 Open in Google Maps'}</Text>
        </TouchableOpacity>
        
        {item.status === 'assigned' && (
          <TouchableOpacity style={[styles.acceptBtn, { backgroundColor: '#6366f1' }]} onPress={() => router.push(`/agent/delivery/${item.id}?agent_id=${agent.id}`)}>
            <Ionicons name="bicycle" size={20} color="#fff" />
            <Text style={styles.acceptBtnTxt}>Start Delivery</Text>
          </TouchableOpacity>
        )}
        {item.status === 'out_for_delivery' && (
          <TouchableOpacity style={[styles.acceptBtn, { backgroundColor: '#f59e0b' }]} onPress={() => router.push(`/agent/delivery/${item.id}?agent_id=${agent.id}`)}>
            <Ionicons name="map" size={20} color="#fff" />
            <Text style={styles.acceptBtnTxt}>Continue Delivery</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#0ea5e9" /></View>;

  const activeOrders = allOrders.filter(o => o.status !== 'delivered');
  const assignedCount = allOrders.filter(o => o.status === 'assigned').length;
  const outCount = allOrders.filter(o => o.status === 'out_for_delivery').length;
  const completedCount = allOrders.filter(o => o.status === 'delivered').length;
  const emptyCount = emptyCans.length;
  const reviewsCount = reviews.length;

  let listData = [];
  if (activeTab === 'Assigned') listData = allOrders.filter(o => o.status === 'assigned');
  else if (activeTab === 'Out for Delivery' || activeTab === 'Out') listData = allOrders.filter(o => o.status === 'out_for_delivery');
  else if (activeTab === 'Completed') listData = allOrders.filter(o => o.status === 'delivered');
  else if (activeTab === 'Empty' || activeTab === 'Empty Cans') listData = emptyCans.map(c => ({ ...c, is_can_alert: true }));
  else if (activeTab === 'Reviews') listData = reviews.map(r => ({ ...r, is_review: true }));
  else listData = activeOrders;

  return (
    <>
      <Stack.Screen options={{ 
        title: '🚴 Dashboard',
        headerRight: () => (
          <TouchableOpacity onPress={logout} style={{ marginRight: 15 }}>
            <Ionicons name="log-out-outline" size={24} color="#ef4444" />
          </TouchableOpacity>
        ) 
      }} />
      <View style={{ flex: 1, backgroundColor: '#f0f9ff' }}>
        <View style={styles.statsBar}>
          {[['Assigned', assignedCount, '#6366f1'],
            ['Out', outCount, '#f59e0b'],
            ['Completed', completedCount, '#10b981'],
            ['Empty', emptyCount, '#f43f5e'],
            ['Reviews', reviewsCount, '#8b5cf6']
           ].map(([l, c, col]) => (
            <TouchableOpacity 
              key={l} 
              activeOpacity={0.7}
              onPress={() => setActiveTab(activeTab === l ? 'Active' : l)}
              style={[styles.chip, { borderColor: col }, activeTab === l && { backgroundColor: col }]}
            >
              <Text style={[styles.chipCount, { color: activeTab === l ? '#fff' : col }]}>{c}</Text>
              <Text style={[styles.chipLabel, activeTab === l && { color: '#fff' }]} numberOfLines={1}>{l}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {activeTab !== 'Active' && (
           <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
             <Text style={{ fontSize: 15, fontWeight: '700', color: '#334155' }}>
               <Ionicons name="filter" size={16} /> Viewing: {activeTab}
             </Text>
           </View>
        )}

        <FlatList data={listData} keyExtractor={i => String(i.is_can_alert ? `can-${i.id}` : i.is_review ? `rev-${i.id}` : i.id)} renderItem={renderOrder}
          contentContainerStyle={{ padding: 16 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => checkAuthAndFetch(true)} tintColor="#0ea5e9" />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={{ fontSize: 56 }}>✅</Text>
              <Text style={styles.emptyTxt}>No items here!</Text>
            </View>
          }
        />
      </View>

      {/* Review Modal — full user details + editable fields + fee */}
      {selectedReview && editedUser && !generatedPin && (
        <Modal transparent animationType="slide">
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View style={styles.modalBg}>
              <View style={[styles.modalContent, { maxHeight: '90%', width: '100%' }]}>
                <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                  <Text style={styles.modalTitle}>👤 Profile Review</Text>
                  <Text style={styles.modalDesc}>Verify and edit details, then set delivery fee.</Text>

                  {[['First Name','first_name','default'],['Last Name','last_name','default'],['Phone','phone','phone-pad']].map(([label, key, kbType]) => (
                    <View key={key}>
                      <Text style={styles.fieldLabel}>{label}</Text>
                      <TextInput style={styles.input} value={editedUser[key]} onChangeText={t => setEditedUser(p => ({...p, [key]: t}))} placeholder={label} keyboardType={kbType} />
                    </View>
                  ))}

                  <Text style={[styles.fieldLabel, { marginTop: 8, fontWeight: '800', color: '#334155' }]}>— Address —</Text>
                  {[['Door No.','door_number'],['Flat / House Name','flat_house_name'],['Street','street_number'],['Locality / Area','locality'],['City','city'],['Landmark','landmark']].map(([label, key]) => (
                    <View key={key}>
                      <Text style={styles.fieldLabel}>{label}</Text>
                      <TextInput style={styles.input} value={editedUser[key]} onChangeText={t => setEditedUser(p => ({...p, [key]: t}))} placeholder={label} />
                    </View>
                  ))}

                  <Text style={[styles.fieldLabel, { marginTop: 12, color: '#6366f1', fontWeight: '800' }]}>Additional Delivery Fee (₹)</Text>
                  <TextInput
                    style={[styles.input, { textAlign: 'center', fontSize: 20, fontWeight: '700' }]}
                    keyboardType="number-pad"
                    value={deliveryFee}
                    onChangeText={setDeliveryFee}
                    placeholder="0"
                  />

                  <TouchableOpacity style={[styles.acceptBtn, { width: '100%', marginBottom: 8, backgroundColor: '#10b981' }]} onPress={handleApproveReview}>
                    <Ionicons name="checkmark-circle" size={20} color="#fff" />
                    <Text style={styles.acceptBtnTxt}>Approve & Generate PIN</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={{ padding: 14, alignItems: 'center' }} onPress={closeModals}>
                    <Text style={{ color: '#64748b', fontWeight: '600' }}>Cancel</Text>
                  </TouchableOpacity>
                </ScrollView>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      )}

      {generatedPin && (
        <Modal transparent animationType="fade">
          <View style={styles.modalBg}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Profile Approved!</Text>
              <Text style={styles.modalDesc}>Share this 4-digit PIN with the customer to login:</Text>
              <Text style={styles.pinTxt}>{generatedPin}</Text>
              <TouchableOpacity style={[styles.acceptBtn, { width: '100%', backgroundColor: '#10b981' }]} onPress={closeModals}>
                <Text style={styles.acceptBtnTxt}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  center:      { flex: 1, justifyContent: 'center', alignItems: 'center' },
  statsBar:    { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 10, paddingVertical: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  chip:        { flex: 1, marginHorizontal: 3, alignItems: 'center', borderWidth: 1.5, borderRadius: 10, paddingVertical: 6 },
  chipCount:   { fontSize: 18, fontWeight: '800' },
  chipLabel:   { fontSize: 10, color: '#64748b' },
  orderCard:   { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#e2e8f0', elevation: 2 },
  newCard:     { borderColor: '#0ea5e9', borderWidth: 2 },
  orderHead:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  orderId:     { fontSize: 17, fontWeight: '800', color: '#0f172a' },
  orderTime:   { fontSize: 12, color: '#94a3b8', marginTop: 2 },
  badge:       { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  badgeTxt:    { color: '#fff', fontSize: 12, fontWeight: '700' },
  infoRow:     { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 },
  infoTxt:     { fontSize: 13, color: '#334155', marginLeft: 8, flex: 1 },
  acceptBtn:   { backgroundColor: '#0ea5e9', borderRadius: 10, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 12, gap: 8 },
  acceptBtnTxt:{ color: '#fff', fontWeight: '700', fontSize: 15 },
  empty:       { alignItems: 'center', marginTop: 80 },
  emptyTxt:    { fontSize: 20, fontWeight: '700', color: '#334155', marginTop: 12 },
  canCard:     { backgroundColor: '#fdf2f8', borderRadius: 14, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#fbcfe8' },
  canHead:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  canTitle:    { fontSize: 16, fontWeight: '800', color: '#be185d', marginBottom: 4 },
  canAddr:     { fontSize: 12, color: '#db2777', maxWidth: '80%' },
  markBtn:     { backgroundColor: '#be185d', borderRadius: 8, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, gap: 4 },
  markBtnTxt:  { color: '#fff', fontSize: 11, fontWeight: '700' },
  callBox:     { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f1f5f9', padding: 10, borderRadius: 8, marginBottom: 10 },
  callName:    { fontSize: 14, fontWeight: '700', color: '#334155' },
  callPhone:   { fontSize: 13, color: '#64748b' },
  callBtnAction: { backgroundColor: '#10b981', width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  mapBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#6366f1', borderRadius: 10, paddingVertical: 10, marginTop: 6, marginBottom: 2 },
  mapBtnTxt:   { color: '#fff', fontWeight: '700', fontSize: 14 },
  modalBg:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', padding: 24, borderTopLeftRadius: 24, borderTopRightRadius: 24, width: '100%' },
  modalTitle:  { fontSize: 20, fontWeight: '800', marginBottom: 8 },
  modalDesc:   { textAlign: 'center', color: '#64748b', marginBottom: 16 },
  fieldLabel:  { fontSize: 12, fontWeight: '700', color: '#64748b', marginBottom: 4 },
  input:       { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 12, width: '100%', fontSize: 15, marginBottom: 10, color: '#1e293b', backgroundColor: '#f8fafc' },
  pinTxt:      { fontSize: 48, fontWeight: '900', color: '#0ea5e9', letterSpacing: 8, marginVertical: 20 }
});
