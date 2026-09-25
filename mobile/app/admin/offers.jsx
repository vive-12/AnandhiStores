import { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Modal, TextInput, Alert, ActivityIndicator, Switch, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { ENDPOINTS } from '../../config/api';

const COLORS = ['#8b5cf6', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899'];

export default function OffersScreen() {
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ title: '', subtitle: '', bg_color: '#8b5cf6', is_active: true });
  const [saving, setSaving] = useState(false);

  const fetchOffers = async () => {
    try {
      const { data } = await axios.get(ENDPOINTS.offers);
      setOffers(data);
    } catch (e) {
      console.log('Error fetching offers', e);
    }
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => {
    fetchOffers();
  }, []);

  const handleSave = async () => {
    if (!form.title || !form.subtitle) {
      return Alert.alert('Error', 'Title and Subtitle are required.');
    }
    setSaving(true);
    try {
      if (editingId) {
        await axios.patch(`${ENDPOINTS.offers}/${editingId}`, form);
      } else {
        await axios.post(ENDPOINTS.offers, form);
      }
      setModalVisible(false);
      fetchOffers();
    } catch (e) {
      Alert.alert('Error', 'Could not save offer.');
    }
    setSaving(false);
  };

  const handleDelete = (id) => {
    Alert.alert('Delete Offer', 'Are you sure you want to delete this banner?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await axios.delete(`${ENDPOINTS.offers}/${id}`);
            fetchOffers();
          } catch (e) {
            Alert.alert('Error', 'Could not delete offer.');
          }
        }
      }
    ]);
  };

  const openAdd = () => {
    setEditingId(null);
    setForm({ title: '', subtitle: '', bg_color: '#8b5cf6', is_active: true });
    setModalVisible(true);
  };

  const openEdit = (item) => {
    setEditingId(item.id);
    setForm({
      title: item.title,
      subtitle: item.subtitle,
      bg_color: item.bg_color,
      is_active: Boolean(item.is_active)
    });
    setModalVisible(true);
  };

  const toggleActive = async (item) => {
    try {
      await axios.patch(`${ENDPOINTS.offers}/${item.id}`, { is_active: !item.is_active });
      fetchOffers();
    } catch (e) {
      Alert.alert('Error', 'Could not update status.');
    }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#8b5cf6" /></View>;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Banners / Offers</Text>
        <TouchableOpacity style={styles.addBtn} onPress={openAdd}>
          <Ionicons name="add" size={20} color="#fff" />
          <Text style={styles.addBtnTxt}>Add Banner</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={offers}
        keyExtractor={item => String(item.id)}
        refreshing={refreshing}
        onRefresh={() => { setRefreshing(true); fetchOffers(); }}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>No banners found.</Text>}
        renderItem={({ item }) => (
          <View style={[styles.card, !item.is_active && styles.inactiveCard]}>
            {/* Banner Preview */}
            <View style={[styles.bannerPreview, { backgroundColor: item.bg_color }]}>
              <Text style={styles.bannerTitle}>{item.title}</Text>
              <Text style={styles.bannerSub}>{item.subtitle}</Text>
            </View>

            <View style={styles.cardMain}>
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ fontSize: 12, color: '#64748b', marginRight: 8 }}>Active Status</Text>
                <Switch 
                  value={Boolean(item.is_active)} 
                  onValueChange={() => toggleActive(item)}
                  trackColor={{ true: '#10b981', false: '#cbd5e1' }}
                />
              </View>
              <View style={styles.cardActions}>
                <TouchableOpacity style={styles.actionBtn} onPress={() => openEdit(item)}>
                  <Ionicons name="create-outline" size={16} color="#0ea5e9" />
                  <Text style={[styles.actionTxt, { color: '#0ea5e9' }]}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionBtn} onPress={() => handleDelete(item.id)}>
                  <Ionicons name="trash-outline" size={16} color="#ef4444" />
                  <Text style={[styles.actionTxt, { color: '#ef4444' }]}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      />

      {/* Add / Edit Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalBg}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingId ? 'Edit Banner' : 'New Banner'}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close-circle" size={28} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            <ScrollView>
              {/* Live Preview */}
              <View style={[styles.bannerPreview, { backgroundColor: form.bg_color, marginBottom: 20 }]}>
                <Text style={styles.bannerTitle}>{form.title || 'Banner Title'}</Text>
                <Text style={styles.bannerSub}>{form.subtitle || 'Banner Subtitle text goes here...'}</Text>
              </View>

              <Text style={styles.label}>Title</Text>
              <TextInput style={styles.input} value={form.title} onChangeText={t => setForm({...form, title: t})} placeholder="e.g. FLAT 50% OFF" />
              
              <Text style={styles.label}>Subtitle</Text>
              <TextInput style={styles.input} value={form.subtitle} onChangeText={t => setForm({...form, subtitle: t})} placeholder="e.g. On all fresh vegetables today" />
              
              <Text style={styles.label}>Background Color</Text>
              <View style={styles.colorRow}>
                {COLORS.map(color => (
                  <TouchableOpacity 
                    key={color} 
                    style={[styles.colorCircle, { backgroundColor: color }, form.bg_color === color && styles.colorActive]} 
                    onPress={() => setForm({...form, bg_color: color})}
                  >
                    {form.bg_color === color && <Ionicons name="checkmark" size={20} color="#fff" />}
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.switchRow}>
                <Text style={styles.label}>Show to customers?</Text>
                <Switch value={form.is_active} onValueChange={v => setForm({...form, is_active: v})} />
              </View>

              <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnTxt}>Save Banner</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  title: { fontSize: 24, fontWeight: '800', color: '#0f172a' },
  addBtn: { flexDirection: 'row', backgroundColor: '#8b5cf6', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, alignItems: 'center', gap: 4 },
  addBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 14 },
  list: { padding: 16 },
  card: { backgroundColor: '#fff', borderRadius: 12, marginBottom: 16, borderWidth: 1, borderColor: '#e2e8f0', elevation: 2, overflow: 'hidden' },
  inactiveCard: { opacity: 0.6 },
  bannerPreview: { padding: 20, justifyContent: 'center', alignItems: 'flex-start', minHeight: 120 },
  bannerTitle: { color: '#fff', fontSize: 22, fontWeight: '900', marginBottom: 4 },
  bannerSub: { color: 'rgba(255,255,255,0.9)', fontSize: 14, fontWeight: '500' },
  cardMain: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, backgroundColor: '#fff' },
  cardActions: { flexDirection: 'row', gap: 16 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionTxt: { fontSize: 14, fontWeight: '600' },
  empty: { textAlign: 'center', color: '#94a3b8', marginTop: 40, fontSize: 16 },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#0f172a' },
  label: { fontSize: 14, fontWeight: '700', color: '#334155', marginBottom: 8, marginTop: 8 },
  input: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, padding: 12, fontSize: 16, color: '#1e293b', marginBottom: 12 },
  colorRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  colorCircle: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  colorActive: { borderWidth: 3, borderColor: '#334155' },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, marginBottom: 24 },
  saveBtn: { backgroundColor: '#8b5cf6', padding: 16, borderRadius: 12, alignItems: 'center' },
  saveBtnTxt: { color: '#fff', fontSize: 16, fontWeight: '700' }
});
