import { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, FlatList, Dimensions
} from 'react-native';
import { useRef } from 'react';
import { useRouter, Stack } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { ENDPOINTS } from '../../config/api';

const PRICE_PER_CAN = 30;

export default function OrderScreen() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [activeOrder, setActiveOrder] = useState(null);
  
  const [offers, setOffers] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [categories, setCategories] = useState([]);
  const [cart, setCart] = useState({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef(null);
  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    if (viewableItems.length > 0) {
      setCurrentIndex(viewableItems[0].index);
    }
  }).current;
  const { width } = Dimensions.get('window');
  const BANNER_WIDTH = width - 40;
  
  useEffect(() => {
    const load = async () => {
      const data = await AsyncStorage.getItem('user');
      if (data) {
        const parsed = JSON.parse(data);
        const u = parsed.user || parsed;
        setUser(u);
        try {
          const res = await axios.get(`${ENDPOINTS.orders}?user_id=${u.id}`);
          const active = res.data.find(o => o.status !== 'delivered');
          if (active) setActiveOrder(active);
          else setActiveOrder(null);
          
          try {
            const [offersRes, invRes] = await Promise.all([
              axios.get(ENDPOINTS.offers),
              axios.get(ENDPOINTS.inventory)
            ]);
            setOffers(offersRes.data.filter(o => o.is_active));
            
            const activeInv = invRes.data.filter(i => i.in_stock);
            setInventory(activeInv);
            const cats = [...new Set(activeInv.map(i => i.category))];
            setCategories(cats);
          } catch (err) {}
          
        } catch (e) {
          console.log('Error fetching active order', e);
        }
      } else {
        router.replace('/auth/login');
      }
      setLoading(false);
    };
    load();
    const poll = setInterval(load, 5000);
    return () => clearInterval(poll);
  }, []);

  useEffect(() => {
    if (offers.length > 1) {
      const interval = setInterval(() => {
        let nextIndex = currentIndex + 1;
        if (nextIndex >= offers.length) nextIndex = 0;
        setCurrentIndex(nextIndex);
        flatListRef.current?.scrollToIndex({ index: nextIndex, animated: true });
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [offers, currentIndex]);

  if (loading || !user) return <ActivityIndicator style={{ flex: 1, backgroundColor: '#f0f9ff' }} color="#0ea5e9" />;

  const cartItems = Object.values(cart);
  const cartTotal = cartItems.reduce((sum, item) => sum + (item.price * item.qty), 0);
  const cartQty = cartItems.reduce((sum, item) => sum + item.qty, 0);
  const finalTotal = cartTotal + (user?.delivery_fee || 0);

  const addToCart = (item) => {
    setCart(prev => ({ ...prev, [item.id]: { ...item, qty: (prev[item.id]?.qty || 0) + 1 } }));
  };

  const removeFromCart = (itemId) => {
    setCart(prev => {
      const newCart = { ...prev };
      if (newCart[itemId].qty > 1) {
        newCart[itemId].qty -= 1;
      } else {
        delete newCart[itemId];
      }
      return newCart;
    });
  };

  const placeOrder = async () => {
    if (cartItems.length === 0) return Alert.alert('Cart empty');
    setPlacing(true);
    try {
      const res = await axios.post(ENDPOINTS.orders, {
        user_id: user.id,
        items: cartItems
      });
      setCart({});
      router.push(`/track/${res.data.id}`);
    } catch (e) {
      Alert.alert('Order Failed', e.response?.data?.error || 'Check your connection and try again.');
    } finally { setPlacing(false); }
  };

  const getStatusText = (status) => {
    switch(status) {
      case 'placed': return 'Order Placed';
      case 'assigned': return 'Agent Assigned';
      case 'out_for_delivery': return 'Out for Delivery';
      default: return 'Active Order';
    }
  };

  return (
    <>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
          
          {offers.length > 0 ? (
            <View style={styles.carouselContainer}>
              <FlatList
                ref={flatListRef}
                data={offers}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                keyExtractor={item => String(item.id)}
                onScrollToIndexFailed={() => {}}
                viewabilityConfig={viewabilityConfig}
                onViewableItemsChanged={onViewableItemsChanged}
                renderItem={({ item }) => (
                  <View style={[styles.swipeBanner, { width: BANNER_WIDTH, backgroundColor: item.bg_color }]}>
                    <Text style={styles.bannerTitle}>{item.title}</Text>
                    <Text style={styles.bannerSub}>{item.subtitle}</Text>
                  </View>
                )}
              />
              <View style={styles.dotsContainer}>
                {offers.map((_, i) => (
                  <View key={i} style={[styles.dot, currentIndex === i && styles.dotActive]} />
                ))}
              </View>
            </View>
          ) : (
            <View style={[styles.swipeBanner, { backgroundColor: '#0ea5e9' }]}>
              <Text style={styles.bannerTitle}>🚀 15-Min Delivery Guaranteed</Text>
              <Text style={styles.bannerSub}>Fresh Groceries • Cash on Delivery</Text>
          )}

          {/* Dynamic Inventory Categories */}
          {categories.map(cat => (
            <View key={cat} style={styles.catSection}>
              <Text style={styles.catTitle}>{cat}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.prodScroll}>
                {inventory.filter(i => i.category === cat).map(item => (
                  <View key={item.id} style={styles.prodCard}>
                    <View style={styles.prodImgPlaceholder}>
                      <Ionicons name="basket-outline" size={32} color="#94a3b8" />
                    </View>
                    <Text style={styles.prodName} numberOfLines={2}>{item.name}</Text>
                    <Text style={styles.prodUnit}>{item.unit}</Text>
                    
                    <View style={styles.prodBottom}>
                      <Text style={styles.prodPrice}>₹{item.price}</Text>
                      {cart[item.id] ? (
                        <View style={styles.addedBtn}>
                          <TouchableOpacity style={styles.qtyAction} onPress={() => removeFromCart(item.id)}>
                            <Text style={styles.qtyActionTxt}>-</Text>
                          </TouchableOpacity>
                          <Text style={styles.qtyCount}>{cart[item.id].qty}</Text>
                          <TouchableOpacity style={styles.qtyAction} onPress={() => addToCart(item)}>
                            <Text style={styles.qtyActionTxt}>+</Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <TouchableOpacity style={styles.addBtn} onPress={() => addToCart(item)}>
                          <Text style={styles.addBtnTxt}>ADD</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                ))}
              </ScrollView>
            </View>
          ))}

          <View style={{ height: activeOrder || cartQty > 0 ? 120 : 40 }} />
        </ScrollView>

        {/* Floating Cart / Checkout Bar */}
        {!activeOrder && cartQty > 0 && (
          <View style={styles.floatingCart}>
            <View style={styles.cartInfo}>
              <Ionicons name="cart" size={24} color="#fff" />
              <View>
                <Text style={styles.cartItemsTxt}>{cartQty} item{cartQty > 1 ? 's' : ''}</Text>
                <Text style={styles.cartTotalTxt}>₹{finalTotal} <Text style={{fontSize: 11, fontWeight: '500'}}>inc. Delivery</Text></Text>
              </View>
            </View>
            <TouchableOpacity style={styles.checkoutBtn} onPress={placeOrder} disabled={placing}>
              {placing ? <ActivityIndicator color="#0ea5e9" size="small" /> : <Text style={styles.checkoutBtnTxt}>Place Order</Text>}
              <Ionicons name="arrow-forward" size={18} color="#0ea5e9" />
            </TouchableOpacity>
          </View>
        )}

        {activeOrder && (
          <TouchableOpacity 
            style={styles.floatingTracker} 
            activeOpacity={0.9} 
            onPress={() => router.push(`/track/${activeOrder.id}`)}
          >
            <View style={styles.trackerLeft}>
              <Ionicons name="bicycle" size={28} color="#0ea5e9" />
              <View style={styles.trackerText}>
                <Text style={styles.trackerStatus}>{getStatusText(activeOrder.status)}</Text>
                <Text style={styles.trackerSub}>Tap to view live tracking</Text>
              </View>
            </View>
            <Ionicons name="chevron-up" size={24} color="#0ea5e9" />
          </TouchableOpacity>
        )}
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f9ff' },
  content:   { padding: 20 },
  carouselContainer: { marginBottom: 24 },
  swipeBanner: { borderRadius: 14, padding: 24, alignItems: 'center', justifyContent: 'center', minHeight: 130 },
  bannerTitle:{ color: '#fff', fontSize: 20, fontWeight: '900', marginBottom: 4 },
  bannerSub: { color: 'rgba(255,255,255,0.9)', fontSize: 14, fontWeight: '500' },
  dotsContainer: { flexDirection: 'row', justifyContent: 'center', marginTop: 12, gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#cbd5e1' },
  dotActive: { backgroundColor: '#0ea5e9', width: 24 },
  
  catSection: { marginBottom: 24 },
  catTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a', marginBottom: 12 },
  prodScroll: { paddingRight: 20, gap: 12 },
  prodCard: { width: 140, backgroundColor: '#fff', borderRadius: 12, padding: 10, borderWidth: 1, borderColor: '#e2e8f0', elevation: 1 },
  prodImgPlaceholder: { height: 80, backgroundColor: '#f1f5f9', borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  prodName: { fontSize: 13, fontWeight: '700', color: '#1e293b', minHeight: 34 },
  prodUnit: { fontSize: 11, color: '#64748b', marginBottom: 8 },
  prodBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' },
  prodPrice: { fontSize: 14, fontWeight: '800', color: '#10b981' },
  addBtn: { borderColor: '#8b5cf6', borderWidth: 1, backgroundColor: '#f5f3ff', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  addBtnTxt: { color: '#8b5cf6', fontSize: 12, fontWeight: '800' },
  addedBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#8b5cf6', borderRadius: 6, overflow: 'hidden' },
  qtyAction: { paddingHorizontal: 8, paddingVertical: 6 },
  qtyActionTxt: { color: '#fff', fontSize: 14, fontWeight: '800' },
  qtyCount: { color: '#fff', fontSize: 13, fontWeight: '800', paddingHorizontal: 4 },

  floatingCart: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    backgroundColor: '#8b5cf6',
    borderRadius: 16,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    elevation: 8,
    shadowColor: '#8b5cf6', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10
  },
  cartInfo: { flexDirection: 'row', alignItems: 'center', gap: 12, marginLeft: 4 },
  cartItemsTxt: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '600' },
  cartTotalTxt: { color: '#fff', fontSize: 18, fontWeight: '900' },
  checkoutBtn: { backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, gap: 6 },
  checkoutBtnTxt: { color: '#0ea5e9', fontSize: 15, fontWeight: '800' },

  floatingTracker: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    borderWidth: 1,
    borderColor: '#e0f2fe'
  },
  trackerLeft: { flexDirection: 'row', alignItems: 'center' },
  trackerText: { marginLeft: 16 },
  trackerStatus: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  trackerSub: { fontSize: 12, color: '#64748b', marginTop: 2 }
});
