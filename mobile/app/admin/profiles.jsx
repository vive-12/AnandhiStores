import { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, RefreshControl, Modal, TextInput, KeyboardAvoidingView, Platform, Linking } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { ENDPOINTS, API_BASE } from '../../config/api';
import { openMapChoice } from '../../utils/openMap';

const STATUS_COLOR = { pending_review: '#f59e0b', approved: '#10b981', rejected: '#ef4444' };
const STATUS_LABEL = { pending_review: 'Pending', approved: 'Approved', rejected: 'Rejected' };

export default function AdminProfiles() {
  const [tab, setTab] = useState('Pending');       // 'Pending' | 'All' | 'Recent'
  const [profiles, setProfiles] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [recentUsers, setRecentUsers] = useState([]);
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [resetModalUser, setResetModalUser] = useState(null);
  const [assignModalUser, setAssignModalUser] = useState(null);
  const [newPin, setNewPin] = useState('');

  const fetchData = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const [pendingRes, allRes, recentRes, agentRes] = await Promise.all([
        axios.get(`${API_BASE}/admin/users/pending`),
        axios.get(`${API_BASE}/admin/users/all`),
        axios.get(`${API_BASE}/admin/users/recent`),
        axios.get(ENDPOINTS.agentAvail),
      ]);
      setProfiles(pendingRes.data);
      setAllUsers(allRes.data);
      setRecentUsers(recentRes.data);
      setAgents(agentRes.data);
    } catch (e) {
      console.log('Error', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const assignAgent = async (userId, agentId) => {
    try {
      await axios.patch(`${API_BASE}/admin/users/${userId}/assign`, { agent_id: agentId });
      Alert.alert('Success', 'Agent assigned');
      setAssignModalUser(null);
      fetchData();
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || e.message);
    }
  };

  const resetPin = async () => {
    if (newPin.length !== 4) return Alert.alert('Error', 'PIN must be 4 digits');
    try {
      await axios.patch(`${API_BASE}/admin/users/${resetModalUser.id}/reset_pin`, { pin: newPin });
      Alert.alert('Success', 'PIN Reset Successful');
      setResetModalUser(null);
      setNewPin('');
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || e.message);
    }
  };

  const renderProfile = ({ item }) => {
    const isPending = item.status === 'pending_review';
    const statusColor = STATUS_COLOR[item.status] || '#94a3b8';
    const statusLabel = STATUS_LABEL[item.status] || item.status;
    const joinedDate = item.created_at
      ? new Date(item.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
      : '';

    return (
      <View style={styles.card}>
        {/* Header row — name + status + reset PIN icon */}
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{item.name}</Text>
            <View style={[styles.statusBadge, { backgroundColor: statusColor, alignSelf: 'flex-start', marginTop: 4 }]}>
              <Text style={styles.statusTxt}>{statusLabel}</Text>
            </View>
          </View>
          <TouchableOpacity onPress={() => { setResetModalUser(item); setNewPin(''); }} style={styles.pinIconBtn}>
            <Ionicons name="key-outline" size={20} color="#f59e0b" />
          </TouchableOpacity>
        </View>

        {/* Contact */}
        <View style={styles.section}>
          <View style={styles.infoRow}>
            <Ionicons name="call-outline" size={14} color="#6366f1" />
            <Text style={styles.infoTxt}>{item.phone}</Text>
          </View>
          {joinedDate ? (
            <View style={styles.infoRow}>
              <Ionicons name="calendar-outline" size={14} color="#6366f1" />
              <Text style={styles.infoTxt}>Joined: <Text style={{ fontWeight: '700', color: '#1e293b' }}>{joinedDate}</Text></Text>
            </View>
          ) : null}
        </View>

        {/* Address breakdown */}
        <View style={[styles.section, { backgroundColor: '#f8fafc', borderRadius: 10, padding: 10, marginTop: 4 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <Text style={{ fontSize: 11, fontWeight: '800', color: '#94a3b8', letterSpacing: 0.5 }}>ADDRESS</Text>
            <TouchableOpacity
              onPress={() => openMapChoice(item.lat, item.lng, item.name || `${item.first_name} ${item.last_name}`)}
              style={styles.mapBtn}
            >
              <Ionicons name="map" size={13} color="#fff" />
              <Text style={styles.mapBtnTxt}>🗺  Open in Maps</Text>
            </TouchableOpacity>
          </View>
          {[
            ['home-outline',      'Door / House', [item.door_number, item.flat_house_name].filter(Boolean).join(', ')],
            ['map-outline',       'Street',        item.street_number],
            ['location-outline',  'Locality',      item.locality],
            ['business-outline',  'City',          item.city],
            ['flag-outline',      'Landmark',      item.landmark],
          ].filter(([,, v]) => v).map(([icon, label, value]) => (
            <View key={label} style={styles.addrRow}>
              <Ionicons name={icon} size={13} color="#6366f1" style={{ marginTop: 1 }} />
              <Text style={styles.addrLabel}>{label}: </Text>
              <Text style={styles.addrValue}>{value}</Text>
            </View>
          ))}
          {item.lat && item.lng ? (
            <View style={styles.addrRow}>
              <Ionicons name="navigate-outline" size={13} color="#10b981" style={{ marginTop: 1 }} />
              <Text style={[styles.addrLabel, { color: '#10b981' }]}>GPS: </Text>
              <Text style={[styles.addrValue, { color: '#10b981' }]}>{Number(item.lat).toFixed(5)}, {Number(item.lng).toFixed(5)}</Text>
            </View>
          ) : null}
        </View>

        {/* Extra fee */}
        {item.delivery_fee > 0 ? (
          <View style={[styles.infoRow, { marginTop: 8 }]}>
            <Ionicons name="cash-outline" size={14} color="#f59e0b" />
            <Text style={[styles.infoTxt, { color: '#b45309', fontWeight: '700' }]}>Extra delivery fee: ₹{item.delivery_fee}</Text>
          </View>
        ) : null}

        {/* Assign Agent (pending only) */}
        {isPending && (
          <View style={{ marginTop: 12 }}>
            {item.assigned_agent ? (
              <View style={[styles.assignBtn, { backgroundColor: '#10b981', flexDirection: 'row', justifyContent: 'center' }]}>
                <Ionicons name="location-outline" size={16} color="#fff" style={{ marginRight: 4 }} />
                <Text style={styles.btnTxt}>Assigned: {item.assigned_agent.name}</Text>
              </View>
            ) : (
              <TouchableOpacity style={styles.assignBtn} onPress={() => setAssignModalUser(item.id)}>
                <Ionicons name="person-add-outline" size={16} color="#fff" style={{ marginRight: 4 }} />
                <Text style={styles.btnTxt}>Assign Agent</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    );
  };

  const currentData = tab === 'Pending' ? profiles : tab === 'Recent' ? recentUsers : allUsers;
  const emptyMsg = tab === 'Pending' ? 'No pending profiles' : tab === 'Recent' ? 'No users onboarded in last 30 days' : 'No users found';

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#8b5cf6" /></View>;

  return (
    <>
      <Stack.Screen options={{ title: '👥 Profiles' }} />
      <View style={{ flex: 1, backgroundColor: '#f5f3ff' }}>

        {/* Tab Bar */}
        <View style={styles.tabBar}>
          {[
            ['Pending', 'time-outline', '#f59e0b', profiles.length],
            ['All Users', 'people-outline', '#6366f1', allUsers.length],
            ['Recent', 'sparkles-outline', '#10b981', recentUsers.length],
          ].map(([label, icon, color, count]) => {
            const key = label === 'All Users' ? 'All' : label;
            const active = tab === key;
            return (
              <TouchableOpacity
                key={label}
                onPress={() => setTab(key)}
                style={[styles.tabBtn, active && { backgroundColor: color, borderColor: color }]}
              >
                <Ionicons name={icon} size={16} color={active ? '#fff' : color} />
                <Text style={[styles.tabTxt, { color: active ? '#fff' : color }]}>{label}</Text>
                <View style={[styles.tabBadge, { backgroundColor: active ? 'rgba(255,255,255,0.3)' : color + '22' }]}>
                  <Text style={[styles.tabBadgeTxt, { color: active ? '#fff' : color }]}>{count}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <FlatList
          data={currentData}
          keyExtractor={i => String(i.id)}
          renderItem={renderProfile}
          contentContainerStyle={{ padding: 16 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchData(true)} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={{ fontSize: 48 }}>{tab === 'Pending' ? '📋' : tab === 'Recent' ? '🆕' : '👥'}</Text>
              <Text style={styles.emptyTxt}>{emptyMsg}</Text>
            </View>
          }
        />

        {/* Reset PIN Modal */}
        {resetModalUser && (
          <Modal transparent animationType="slide">
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
              <View style={styles.modalBg}>
                <View style={styles.modalContent}>
                  <Text style={styles.modalTitle}>Reset PIN</Text>
                  <Text style={{ color: '#64748b', marginBottom: 16, textAlign: 'center' }}>{resetModalUser.name}</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="number-pad"
                    value={newPin}
                    onChangeText={setNewPin}
                    placeholder="New 4-digit PIN"
                    maxLength={4}
                  />
                  <TouchableOpacity style={styles.approveBtn} onPress={resetPin}>
                    <Text style={styles.approveTxt}>Reset PIN</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.cancelBtn} onPress={() => { setResetModalUser(null); setNewPin(''); }}>
                    <Text style={styles.cancelTxt}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </KeyboardAvoidingView>
          </Modal>
        )}

        {/* Assign Agent Modal */}
        {assignModalUser && (
          <Modal transparent animationType="fade">
            <View style={styles.modalBg}>
              <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>Select an Agent</Text>
                {!agents.length && <Text style={{ marginBottom: 10, color: '#64748b' }}>No agents available.</Text>}
                {agents.map(a => (
                  <TouchableOpacity key={a.id} style={styles.agentItem} onPress={() => assignAgent(assignModalUser, a.id)}>
                    <Text style={styles.agentItemTxt}>{a.name}</Text>
                    <Text style={{ color: '#94a3b8', fontSize: 13 }}>{a.phone}</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity style={[styles.cancelBtn, { marginTop: 10 }]} onPress={() => setAssignModalUser(null)}>
                  <Text style={styles.cancelTxt}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  center:       { flex: 1, justifyContent: 'center', alignItems: 'center' },
  tabBar:       { flexDirection: 'row', gap: 8, padding: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  tabBtn:       { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, paddingHorizontal: 6, borderRadius: 10, borderWidth: 1.5, borderColor: '#e2e8f0' },
  tabTxt:       { fontSize: 11, fontWeight: '700' },
  tabBadge:     { borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1, marginLeft: 2 },
  tabBadgeTxt:  { fontSize: 11, fontWeight: '800' },
  card:         { backgroundColor: '#fff', padding: 16, borderRadius: 14, marginBottom: 12, borderWidth: 1, borderColor: '#e2e8f0', elevation: 2 },
  cardHeader:   { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  name:         { fontSize: 17, fontWeight: '800', color: '#1e293b' },
  statusBadge:  { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  statusTxt:    { color: '#fff', fontSize: 11, fontWeight: '700' },
  pinIconBtn:   { width: 38, height: 38, borderRadius: 10, backgroundColor: '#fef9c3', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#fde68a' },
  section:      { marginBottom: 6 },
  infoRow:      { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  infoTxt:      { fontSize: 13, color: '#64748b', flex: 1 },
  addrRow:      { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 4 },
  addrLabel:    { fontSize: 12, fontWeight: '700', color: '#64748b', marginLeft: 5, marginRight: 2 },
  addrValue:    { fontSize: 12, color: '#334155', flex: 1, flexWrap: 'wrap' },
  mapBtn:       { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#6366f1', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  mapBtnTxt:    { color: '#fff', fontSize: 11, fontWeight: '700' },
  assignBtn:    { backgroundColor: '#6366f1', padding: 12, borderRadius: 10, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
  btnTxt:       { color: '#fff', fontWeight: '700', fontSize: 13 },
  empty:        { alignItems: 'center', marginTop: 80 },
  emptyTxt:     { fontSize: 16, fontWeight: '700', color: '#94a3b8', marginTop: 12 },
  modalBg:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { backgroundColor: '#fff', padding: 24, borderRadius: 16, width: '100%', alignItems: 'center' },
  modalTitle:   { fontSize: 20, fontWeight: '800', marginBottom: 8 },
  input:        { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 12, width: '100%', fontSize: 16, marginBottom: 16, textAlign: 'center' },
  approveBtn:   { backgroundColor: '#ef4444', padding: 14, borderRadius: 8, width: '100%', alignItems: 'center', marginBottom: 8 },
  approveTxt:   { color: '#fff', fontWeight: '700', fontSize: 16 },
  cancelBtn:    { padding: 14, width: '100%', alignItems: 'center' },
  cancelTxt:    { color: '#64748b', fontWeight: '600' },
  agentItem:    { backgroundColor: '#f1f5f9', padding: 14, borderRadius: 8, width: '100%', marginBottom: 8, alignItems: 'center' },
  agentItemTxt: { color: '#1e293b', fontWeight: '700', fontSize: 15 },
});
