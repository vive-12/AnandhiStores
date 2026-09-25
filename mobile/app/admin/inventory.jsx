import { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Modal, TextInput, Alert, ActivityIndicator, Switch, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { ENDPOINTS } from '../../config/api';

const CATEGORIES = ['Vegetables', 'Fruits', 'Groceries', 'Water', 'Other'];
const UNITS = ['kg', 'g', 'ltr', 'ml', 'piece', 'bunch', 'can'];

export default function InventoryScreen() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('All');

  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ name: '', category: 'Vegetables', price: '', unit: 'kg', in_stock: true });
  const [saving, setSaving] = useState(false);

  const fetchInventory = async () => {
    try {
      const { data } = await axios.get(ENDPOINTS.inventory);
      setItems(data);
    } catch (e) {
      console.log('Error fetching inventory', e);
    }
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => {
    fetchInventory();
  }, []);

  const handleSave = async () => {
    if (!form.name || !form.price) {
      return Alert.alert('Error', 'Name and Price are required.');
    }
    setSaving(true);
    try {
      if (editingId) {
        await axios.patch(`${ENDPOINTS.inventory}/${editingId}`, form);
      } else {
        await axios.post(ENDPOINTS.inventory, form);
      }
      setModalVisible(false);
      fetchInventory();
    } catch (e) {
      Alert.alert('Error', 'Could not save item.');
    }
    setSaving(false);
  };

  const handleDelete = (id) => {
    Alert.alert('Delete Item', 'Are you sure you want to delete this item?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await axios.delete(`${ENDPOINTS.inventory}/${id}`);
            fetchInventory();
          } catch (e) {
            Alert.alert('Error', 'Could not delete item.');
          }
        }
      }
    ]);
  };

  const openAdd = () => {
    setEditingId(null);
    setForm({ name: '', category: activeTab !== 'All' ? activeTab : 'Vegetables', price: '', unit: 'kg', in_stock: true });
    setModalVisible(true);
  };

  const openEdit = (item) => {
    setEditingId(item.id);
    setForm({
      name: item.name,
      category: item.category,
      price: String(item.price),
      unit: item.unit,
      in_stock: Boolean(item.in_stock)
    });
    setModalVisible(true);
  };

  const toggleStock = async (item) => {
    try {
      await axios.patch(`${ENDPOINTS.inventory}/${item.id}`, { in_stock: !item.in_stock });
      fetchInventory();
    } catch (e) {
      Alert.alert('Error', 'Could not update stock status.');
    }
  };

  const filteredItems = activeTab === 'All' ? items : items.filter(i => i.category === activeTab);

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#8b5cf6" /></View>;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Inventory</Text>
        <TouchableOpacity style={styles.addBtn} onPress={openAdd}>
          <Ionicons name="add" size={20} color="#fff" />
          <Text style={styles.addBtnTxt}>Add Item</Text>
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabs} contentContainerStyle={styles.tabsContent}>
        {['All', ...CATEGORIES].map(cat => (
          <TouchableOpacity key={cat} style={[styles.tab, activeTab === cat && styles.activeTab]} onPress={() => setActiveTab(cat)}>
            <Text style={[styles.tabTxt, activeTab === cat && styles.activeTabTxt]}>{cat}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <FlatList
        data={filteredItems}
        keyExtractor={item => String(item.id)}
        refreshing={refreshing}
        onRefresh={() => { setRefreshing(true); fetchInventory(); }}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>No items found in this category.</Text>}
        renderItem={({ item }) => (
          <View style={[styles.card, !item.in_stock && styles.outOfStockCard]}>
            <View style={styles.cardMain}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName}>{item.name}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                  <View style={styles.catBadge}><Text style={styles.catTxt}>{item.category}</Text></View>
                  <Text style={styles.itemPrice}>₹{item.price} <Text style={{ color: '#64748b' }}>/ {item.unit}</Text></Text>
                </View>
              </View>
              <View style={{ alignItems: 'center', marginLeft: 10 }}>
                <Text style={{ fontSize: 10, color: '#64748b', marginBottom: 2 }}>In Stock</Text>
                <Switch 
                  value={Boolean(item.in_stock)} 
                  onValueChange={() => toggleStock(item)}
                  trackColor={{ true: '#10b981', false: '#cbd5e1' }}
                />
              </View>
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
        )}
      />

      {/* Add / Edit Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalBg}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingId ? 'Edit Item' : 'New Item'}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close-circle" size={28} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            <ScrollView>
              <Text style={styles.label}>Item Name</Text>
              <TextInput style={styles.input} value={form.name} onChangeText={t => setForm({...form, name: t})} placeholder="e.g. Tomato, Mango, Rice" />
              
              <Text style={styles.label}>Category</Text>
              <View style={styles.chipRow}>
                {CATEGORIES.map(cat => (
                  <TouchableOpacity key={cat} style={[styles.chip, form.category === cat && styles.chipActive]} onPress={() => setForm({...form, category: cat})}>
                    <Text style={[styles.chipTxt, form.category === cat && styles.chipTxtActive]}>{cat}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Price (₹)</Text>
                  <TextInput style={styles.input} value={form.price} onChangeText={t => setForm({...form, price: t})} keyboardType="numeric" placeholder="0" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Unit</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                    {UNITS.map(u => (
                      <TouchableOpacity key={u} style={[styles.chip, form.unit === u && styles.chipActive]} onPress={() => setForm({...form, unit: u})}>
                        <Text style={[styles.chipTxt, form.unit === u && styles.chipTxtActive]}>{u}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              </View>

              <View style={styles.switchRow}>
                <Text style={styles.label}>Currently in stock?</Text>
                <Switch value={form.in_stock} onValueChange={v => setForm({...form, in_stock: v})} />
              </View>

              <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnTxt}>Save Item</Text>}
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
  tabs: { maxHeight: 50, backgroundColor: '#fff' },
  tabsContent: { paddingHorizontal: 16, alignItems: 'center' },
  tab: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#f1f5f9', marginRight: 8 },
  activeTab: { backgroundColor: '#8b5cf6' },
  tabTxt: { color: '#64748b', fontWeight: '600' },
  activeTabTxt: { color: '#fff' },
  list: { padding: 16 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#e2e8f0', elevation: 2 },
  outOfStockCard: { opacity: 0.6 },
  cardMain: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  itemName: { fontSize: 18, fontWeight: '700', color: '#1e293b' },
  catBadge: { backgroundColor: '#f1f5f9', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  catTxt: { fontSize: 10, fontWeight: '700', color: '#64748b', textTransform: 'uppercase' },
  itemPrice: { fontSize: 15, fontWeight: '700', color: '#10b981' },
  cardActions: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 12, gap: 16 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionTxt: { fontSize: 14, fontWeight: '600' },
  empty: { textAlign: 'center', color: '#94a3b8', marginTop: 40, fontSize: 16 },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#0f172a' },
  label: { fontSize: 14, fontWeight: '700', color: '#334155', marginBottom: 8, marginTop: 16 },
  input: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, padding: 12, fontSize: 16, color: '#1e293b' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0' },
  chipActive: { backgroundColor: '#8b5cf6', borderColor: '#8b5cf6' },
  chipTxt: { color: '#64748b', fontSize: 13, fontWeight: '600' },
  chipTxtActive: { color: '#fff' },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, marginBottom: 24 },
  saveBtn: { backgroundColor: '#8b5cf6', padding: 16, borderRadius: 12, alignItems: 'center' },
  saveBtnTxt: { color: '#fff', fontSize: 16, fontWeight: '700' }
});
