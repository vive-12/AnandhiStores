import { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, RefreshControl, Modal, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import axios from 'axios';
import { ENDPOINTS, API_BASE } from '../../config/api';
import { Ionicons } from '@expo/vector-icons';

export default function AdminAgents() {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Modals
  const [createModal, setCreateModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newPin, setNewPin] = useState('');

  const [resetModalAgent, setResetModalAgent] = useState(null);
  const [resetPinValue, setResetPinValue] = useState('');

  const fetchAgents = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const { data } = await axios.get(`${API_BASE}/agents`);
      setAgents(data);
    } catch (e) {
      console.log('Error', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchAgents(); }, []);

  const handleCreateAgent = async () => {
    if (!newName || !newPhone || newPin.length !== 4) return Alert.alert('Error', 'Fill all fields. PIN must be 4 digits.');
    try {
      await axios.post(`${API_BASE}/agents`, { name: newName, phone: newPhone, pin: newPin });
      Alert.alert('Success', 'Agent created successfully');
      setCreateModal(false);
      setNewName(''); setNewPhone(''); setNewPin('');
      fetchAgents();
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || e.message);
    }
  };

  const handleResetPin = async () => {
    if (resetPinValue.length !== 4) return Alert.alert('Error', 'PIN must be 4 digits');
    try {
      await axios.patch(`${API_BASE}/agents/${resetModalAgent.id}/reset_pin`, { pin: resetPinValue });
      Alert.alert('Success', 'Agent PIN Reset');
      setResetModalAgent(null);
      setResetPinValue('');
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || e.message);
    }
  };

  const renderAgent = ({ item }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View>
          <Text style={styles.name}>{item.name}</Text>
          <Text style={styles.phone}>{item.phone}</Text>
        </View>
      </View>

      <Text style={styles.status}>Status: {item.is_available ? 'Available' : 'Busy'}</Text>

      {/* Stats Section */}
      <View style={styles.statsContainer}>
        <View style={styles.statBox}>
          <Text style={styles.statVal}>{item.stats?.today || 0}</Text>
          <Text style={styles.statLabel}>Today</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statVal}>{item.stats?.weekly || 0}</Text>
          <Text style={styles.statLabel}>Weekly</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statVal}>{item.stats?.monthly || 0}</Text>
          <Text style={styles.statLabel}>Monthly</Text>
        </View>
      </View>

      {/* Actions */}
      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.resetBtn} onPress={() => setResetModalAgent(item)}>
          <Ionicons name="key" size={16} color="#fff" style={{ marginRight: 4 }} />
          <Text style={styles.btnTxt}>Reset PIN</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#10b981" /></View>;

  return (
    <View style={{ flex: 1, backgroundColor: '#f0fdf4' }}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.createBtn} onPress={() => setCreateModal(true)}>
          <Text style={styles.createBtnTxt}>+ Add New Agent</Text>
        </TouchableOpacity>
      </View>

      <FlatList data={agents} keyExtractor={i => String(i.id)} renderItem={renderAgent}
        contentContainerStyle={{ padding: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchAgents(true)} />}
        ListEmptyComponent={<Text style={{ textAlign: 'center', marginTop: 40 }}>No agents found</Text>}
      />

      {/* Create Modal */}
      {createModal && (
        <Modal transparent animationType="slide">
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View style={styles.modalBg}>
              <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>Create New Agent</Text>
                <TextInput style={styles.input} value={newName} onChangeText={setNewName} placeholder="Agent Name" />
                <TextInput style={styles.input} value={newPhone} onChangeText={setNewPhone} placeholder="Phone Number" keyboardType="phone-pad" maxLength={10} />
                <TextInput style={styles.input} value={newPin} onChangeText={setNewPin} placeholder="4-Digit PIN" keyboardType="number-pad" maxLength={4} />
                <TouchableOpacity style={styles.approveBtn} onPress={handleCreateAgent}>
                  <Text style={styles.approveTxt}>Create</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setCreateModal(false)}>
                  <Text style={styles.cancelTxt}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      )}

      {/* Reset Modal */}
      {resetModalAgent && (
        <Modal transparent animationType="fade">
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View style={styles.modalBg}>
              <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>Reset PIN for {resetModalAgent.name}</Text>
                <TextInput style={styles.input} value={resetPinValue} onChangeText={setResetPinValue} placeholder="New 4-digit PIN" keyboardType="number-pad" maxLength={4} />
                <TouchableOpacity style={styles.approveBtn} onPress={handleResetPin}>
                  <Text style={styles.approveTxt}>Reset PIN</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setResetModalAgent(null)}>
                  <Text style={styles.cancelTxt}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  createBtn: { backgroundColor: '#10b981', padding: 14, borderRadius: 8, alignItems: 'center' },
  createBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 16 },
  card: { backgroundColor: '#fff', padding: 16, borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  name: { fontSize: 18, fontWeight: '700', color: '#1e293b' },
  phone: { fontSize: 14, color: '#64748b', marginBottom: 4 },
  status: { fontSize: 14, color: '#10b981', marginBottom: 12, fontWeight: '600' },

  statsContainer: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#f8fafc', borderRadius: 8, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: '#f1f5f9' },
  statBox: { alignItems: 'center', flex: 1 },
  statVal: { fontSize: 18, fontWeight: '800', color: '#334155' },
  statLabel: { fontSize: 12, color: '#64748b', marginTop: 2, fontWeight: '600' },

  actionRow: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center' },

  resetBtn: { flexDirection: 'row', backgroundColor: '#f59e0b', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6, alignItems: 'center' },
  btnTxt: { color: '#fff', fontWeight: '700', fontSize: 12 },

  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { backgroundColor: '#fff', padding: 24, borderRadius: 16, width: '100%', alignItems: 'center' },
  modalTitle: { fontSize: 20, fontWeight: '800', marginBottom: 20 },
  input: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 12, width: '100%', fontSize: 16, marginBottom: 16, textAlign: 'center' },
  approveBtn: { backgroundColor: '#10b981', padding: 14, borderRadius: 8, width: '100%', alignItems: 'center', marginBottom: 8 },
  approveTxt: { color: '#fff', fontWeight: '700', fontSize: 16 },
  cancelBtn: { padding: 14, width: '100%', alignItems: 'center' },
  cancelTxt: { color: '#64748b', fontWeight: '600' }
});
