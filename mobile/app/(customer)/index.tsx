// app/(customer)/index.tsx — Customer Home / Shop screen
import React, { useState, useMemo, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  FlatList,
  Dimensions,
  Linking,
  Alert,
  RefreshControl,
  Platform,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import RNBottomSheet from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, Radius, FontSize, Shadow } from '../../theme';
import { useSession } from '../../hooks/useSession';
import { useItems } from '../../hooks/useItems';
import { useCart, useCartCount } from '../../hooks/useCart';
import { useSettings } from '../../hooks/useSettings';
import { useBanners, AppBanner } from '../../hooks/useBanners';
import { useCustomerOrders } from '../../hooks/useOrders';
import { computeTotals, isStoreOpen, storeOpenLabel } from '../../utils/compute';
import { createOrder } from '../../services/orders';
import { getUser } from '../../services/users';
import {
  Button,
  Card,
  Chip,
  QtyStepper,
  Skeleton,
  ItemRowSkeleton,
  EmptyState,
  ErrorState,
  BottomSheet,
  StickyBar,
  StatusPill,
  NotificationBell,
  useToast,
} from '../../components/ui';
import { Image } from 'expo-image';
import { getProductImage } from '../../utils/productImages';
import type { Item, OrderItem, AddressSnapshot, OrderSlot } from '../../types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const BANNER_WIDTH = SCREEN_WIDTH - Spacing.lg * 2;

export default function CustomerHomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const { uid, name, phone } = useSession();

  // Data hooks
  const { items, loading: itemsLoading, error: itemsError, refresh: refreshItems } = useItems();
  const { banners, loading: bannersLoading } = useBanners();
  const { settings, loading: settingsLoading } = useSettings();
  const { orders, loading: ordersLoading } = useCustomerOrders(uid);

  // Cart hook
  const { lines, addItem, removeItem, setQty, clearCart } = useCart();
  const totalCartCount = useCartCount();

  // Local UI State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [sortBy, setSortBy] = useState<'popular' | 'offers' | 'recent'>('popular');
  const [showSortModal, setShowSortModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<string>('ASAP');
  const [orderNotes, setOrderNotes] = useState('');
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);

  // Banner carousel state
  const [currentBannerIndex, setCurrentBannerIndex] = useState(0);
  const bannerFlatListRef = useRef<FlatList>(null);

  // Cart Bottom Sheet Ref
  const cartSheetRef = useRef<RNBottomSheet>(null);

  // Items dictionary for fast lookup
  const itemsMap = useMemo(() => {
    const map: Record<string, Item> = {};
    for (const item of items) {
      map[item.id] = item;
    }
    return map;
  }, [items]);

  // Categories list
  const categories = useMemo(() => {
    const set = new Set<string>();
    items.forEach(i => {
      if (i.category && !i.isDeleted) set.add(i.category);
    });
    return ['All', ...Array.from(set)];
  }, [items]);

  // Set of item names linked to active promotional banners
  const offerItemNames = useMemo(() => {
    const set = new Set<string>();
    for (const b of banners) {
      if (b.linkedItemName) set.add(b.linkedItemName.toLowerCase().trim());
    }
    return set;
  }, [banners]);

  // Map of item popularity based on historical customer orders
  const itemPopularityMap = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const ord of orders) {
      if (ord.items) {
        for (const it of ord.items) {
          counts[it.itemId] = (counts[it.itemId] || 0) + (it.qty || 1);
        }
      }
    }
    return counts;
  }, [orders]);

  // Filtered & sorted items
  const filteredItems = useMemo(() => {
    const list = items.filter(item => {
      if (item.isDeleted) return false;
      const matchesCategory =
        selectedCategory === 'All' || item.category === selectedCategory;
      const matchesSearch =
        item.name.toLowerCase().includes(searchQuery.toLowerCase().trim()) ||
        item.category.toLowerCase().includes(searchQuery.toLowerCase().trim());
      return matchesCategory && matchesSearch;
    });

    list.sort((a, b) => {
      // In-stock items always appear before out-of-stock items
      if (a.inStock && !b.inStock) return -1;
      if (!a.inStock && b.inStock) return 1;

      if (sortBy === 'offers') {
        const aIsOffer = offerItemNames.has(a.name.toLowerCase().trim());
        const bIsOffer = offerItemNames.has(b.name.toLowerCase().trim());
        if (aIsOffer && !bIsOffer) return -1;
        if (!aIsOffer && bIsOffer) return 1;
        return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
      }

      if (sortBy === 'recent') {
        const getMillis = (t: any) =>
          t?.toMillis ? t.toMillis() : t ? new Date(t).getTime() : 0;
        const aTime = Math.max(getMillis(a.updatedAt), getMillis(a.createdAt));
        const bTime = Math.max(getMillis(b.updatedAt), getMillis(b.createdAt));
        return bTime - aTime;
      }

      // 'popular' (Most commonly bought)
      const aCount = itemPopularityMap[a.id] || 0;
      const bCount = itemPopularityMap[b.id] || 0;
      if (bCount !== aCount) return bCount - aCount;
      return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    });

    return list;
  }, [items, selectedCategory, searchQuery, sortBy, offerItemNames, itemPopularityMap]);

  // Cart totals
  const defaultSettings = useMemo(
    () =>
      settings ?? {
        minOrderValue: 99,
        deliveryFee: 20,
        freeDeliveryAbove: 299,
        openTime: '07:00',
        closeTime: '21:00',
        isStoreOpenOverride: null,
        slots: ['ASAP', 'Morning 7–9 AM', 'Evening 5–7 PM'],
        agentFeePerDelivery: 30,
      },
    [settings],
  );

  const cartTotals = useMemo(() => {
    return computeTotals(lines, itemsMap, defaultSettings);
  }, [lines, itemsMap, defaultSettings]);

  // Store open status
  const storeIsOpen = useMemo(() => {
    return isStoreOpen(defaultSettings);
  }, [defaultSettings]);

  // Active customer order (not delivered and not cancelled)
  const activeOrder = useMemo(() => {
    return orders.find(
      o => o.status !== 'delivered' && o.status !== 'cancelled',
    );
  }, [orders]);

  // Pull to refresh
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    refreshItems();
    setRefreshing(false);
  }, [refreshItems]);

  // Handle banner press: take user directly to product and add to cart
  const handleBannerPress = (banner: AppBanner) => {
    if (!banner.linkedItemId && !banner.linkedItemName) return;

    // Search target by ID first, then by name
    const target = items.find(
      i =>
        !i.isDeleted &&
        ((banner.linkedItemId && i.id === banner.linkedItemId) ||
          (banner.linkedItemName &&
            i.name.toLowerCase().trim() === banner.linkedItemName.toLowerCase().trim())),
    );

    if (target) {
      // Set category to All and search query so product is front and center
      setSelectedCategory('All');
      setSearchQuery(target.name);

      if (!target.inStock) {
        showToast(`${target.name} is currently out of stock.`, 'info');
        return;
      }

      addItem(target.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast(`🎉 ${target.name} offer applied & added to cart!`, 'success');
    } else {
      showToast('This offer product is currently unavailable.', 'info');
    }
  };

  // Open Cart
  const handleOpenCart = () => {
    cartSheetRef.current?.expand();
  };

  // Place Order Action
  const handlePlaceOrder = async () => {
    if (isPlacingOrder) return;
    if (lines.length === 0) {
      showToast('Add items before placing order.', 'error');
      return;
    }
    if (!storeIsOpen) {
      showToast(
        `Orders can only be placed when store is open (${storeOpenLabel(defaultSettings)}).`,
        'error',
      );
      return;
    }
    if (!cartTotals.meetsMinimum) {
      showToast(
        `Minimum order value is Rs ${defaultSettings.minOrderValue}.`,
        'error',
      );
      return;
    }

    setIsPlacingOrder(true);

    try {
      if (!uid) throw new Error('Not authenticated');

      // Fetch user profile for latest address
      const userProfile = await getUser(uid);
      if (!userProfile) throw new Error('User profile not found');

      const addr = userProfile.address || {
        door: '',
        street: '',
        locality: '',
        city: 'Chennai',
        landmark: '',
        lat: null,
        lng: null,
      };

      if (!addr.street && !addr.locality && !addr.door) {
        Alert.alert(
          'Address Required',
          'Please set your delivery address in your Account tab before placing an order.',
          [
            { text: 'Go to Account', onPress: () => router.push('/(customer)/account') },
            { text: 'Cancel', style: 'cancel' },
          ],
        );
        setIsPlacingOrder(false);
        return;
      }

      const addressSnapshot: AddressSnapshot = {
        door: addr.door || '',
        street: addr.street || '',
        locality: addr.locality || '',
        city: addr.city || 'Chennai',
        landmark: addr.landmark || '',
        lat: addr.lat ?? null,
        lng: addr.lng ?? null,
      };

      // Snapshot order items
      const orderItems: OrderItem[] = [];
      for (const line of lines) {
        const liveItem = itemsMap[line.itemId];
        if (liveItem && liveItem.inStock && !liveItem.isDeleted) {
          orderItems.push({
            itemId: liveItem.id,
            name: liveItem.name,
            unit: liveItem.unit,
            price: liveItem.price,
            qty: line.qty,
            lineTotal: liveItem.price * line.qty,
          });
        }
      }

      if (orderItems.length === 0) {
        showToast('The items in your cart are currently out of stock.', 'error');
        setIsPlacingOrder(false);
        return;
      }

      const slot: OrderSlot = {
        type: selectedSlot.toLowerCase().includes('asap') ? 'asap' : 'scheduled',
        label: selectedSlot,
      };

      const newOrderId = await createOrder({
        actor: {
          uid,
          role: 'customer',
          name: name || userProfile.name || 'Customer',
        },
        items: orderItems,
        addressSnapshot,
        customerName: name || userProfile.name || 'Customer',
        customerPhone: phone || userProfile.phone || '',
        subtotal: cartTotals.subtotal,
        deliveryFee: cartTotals.deliveryFee,
        total: cartTotals.total,
        slot,
        notes: orderNotes.trim(),
        source: 'customer',
      });

      // Clear local cart
      clearCart();
      cartSheetRef.current?.close();

      showToast('Order placed successfully! 🎉', 'success');

      // Navigate to tracking
      router.push(`/track/${newOrderId}`);
    } catch (err: any) {
      console.error('Order creation error:', err);
      showToast(err.message || 'Please check your connection and try again.', 'error');
    } finally {
      setIsPlacingOrder(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* ─── Curved Top Header ────────────────────────────────────────────── */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.greeting}>
              Hello, {name ? name.split(' ')[0] : 'Shopper'} 👋
            </Text>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => router.push('/(customer)/account')}
              style={styles.addressChip}
            >
              <Text style={styles.addressIcon}>📍</Text>
              <Text style={styles.addressText} numberOfLines={1}>
                Delivering to Home • Tap to edit
              </Text>
            </TouchableOpacity>
          </View>

          <NotificationBell />
        </View>

        {/* Search Bar */}
        <View style={styles.searchBar}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search groceries, water cans..."
            placeholderTextColor={Colors.inkSoft}
            value={searchQuery}
            onChangeText={setSearchQuery}
            clearButtonMode="while-editing"
          />
          {searchQuery.length > 0 && Platform.OS !== 'ios' && (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={8}>
              <Text style={styles.clearSearch}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ─── Scrollable Content ───────────────────────────────────────────── */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: totalCartCount > 0 ? 120 : Spacing.xl },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[Colors.green700]}
            tintColor={Colors.green700}
          />
        }
      >
        {/* Store Closed Banner */}
        {!storeIsOpen && (
          <View style={styles.closedBanner}>
            <Text style={styles.closedIcon}>⏳</Text>
            <View style={styles.closedTextWrap}>
              <Text style={styles.closedTitle}>Store is currently closed</Text>
              <Text style={styles.closedSub}>
                Orders will be processed when store {storeOpenLabel(defaultSettings)}
              </Text>
            </View>
          </View>
        )}

        {/* Active Order Tracker Pill */}
        {activeOrder && (
          <TouchableOpacity
            style={styles.activeOrderCard}
            activeOpacity={0.9}
            onPress={() => router.push(`/track/${activeOrder.id}`)}
          >
            <View style={styles.activeOrderLeft}>
              <Text style={styles.activeOrderIcon}>🚴‍♂️</Text>
              <View>
                <Text style={styles.activeOrderTitle}>
                  Order #{activeOrder.orderNo}
                </Text>
                <Text style={styles.activeOrderSub}>Tap to view live tracking</Text>
              </View>
            </View>
            <StatusPill status={activeOrder.status} />
          </TouchableOpacity>
        )}

        {/* Promotional Carousel */}
        {banners.length > 0 && (
          <View style={styles.bannerSection}>
            <FlatList
              ref={bannerFlatListRef}
              data={banners}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              keyExtractor={item => item.id}
              renderItem={({ item }) => {
                const hasLink = Boolean(item.linkedItemId || item.linkedItemName);
                return (
                  <TouchableOpacity
                    style={[
                      styles.bannerCard,
                      {
                        width: BANNER_WIDTH,
                        backgroundColor: item.color || Colors.green700,
                      },
                    ]}
                    activeOpacity={hasLink ? 0.8 : 1}
                    onPress={() => handleBannerPress(item)}
                  >
                    <Text style={styles.bannerTitle}>{item.title}</Text>
                    {item.subtitle ? (
                      <Text style={styles.bannerSub}>{item.subtitle}</Text>
                    ) : null}
                    {item.linkedItemName && (
                      <View style={styles.bannerTapPrompt}>
                        <Text style={styles.bannerTapText}>
                          ⚡ Special Offer on {item.linkedItemName} • Tap to view & add ➔
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              }}
              onScroll={e => {
                const index = Math.round(
                  e.nativeEvent.contentOffset.x / BANNER_WIDTH,
                );
                setCurrentBannerIndex(index);
              }}
            />
            {banners.length > 1 && (
              <View style={styles.bannerDots}>
                {banners.map((_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.dot,
                      currentBannerIndex === i && styles.dotActive,
                    ]}
                  />
                ))}
              </View>
            )}
          </View>
        )}

        {/* Category Pills */}
        <View style={styles.categoriesSection}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryPillsList}
          >
            {categories.map(cat => (
              <Chip
                key={cat}
                label={cat}
                selected={selectedCategory === cat}
                onPress={() => setSelectedCategory(cat)}
              />
            ))}
          </ScrollView>
        </View>

        {/* WhatsApp & Call Quick Ordering Section */}
        <View style={styles.waSection}>
          <View style={styles.waHeader}>
            <Text style={styles.waTitle}>Have a big list? 📝</Text>
            <Text style={styles.waSub}>
              Send a photo of your list or audio message directly to our store!
            </Text>
          </View>
          <View style={styles.waButtons}>
            <TouchableOpacity
              style={[styles.waBtn, { backgroundColor: '#25D366' }]}
              onPress={() =>
                Linking.openURL(
                  'whatsapp://send?phone=919600102028&text=Hi%20Anandhi%20Stores,%20I%20would%20like%20to%20place%20an%20order.',
                ).catch(() =>
                  Alert.alert('Error', 'WhatsApp is not installed on this device'),
                )
              }
            >
              <Text style={styles.waBtnIcon}>💬</Text>
              <Text style={styles.waBtnTxt}>WhatsApp Us</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.waBtn, { backgroundColor: Colors.green700 }]}
              onPress={() =>
                Linking.openURL('tel:9600102028').catch(() =>
                  Alert.alert('Error', 'Calling not supported'),
                )
              }
            >
              <Text style={styles.waBtnIcon}>📞</Text>
              <Text style={styles.waBtnTxt}>Call Us</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Product Catalogue Header */}
        <View style={styles.catalogueHeader}>
          <View style={styles.catalogueHeaderLeft}>
            <Text style={styles.catalogueTitle}>
              {selectedCategory === 'All' ? 'All Products' : selectedCategory}
            </Text>
            <Text style={styles.itemCountBadge}>
              {filteredItems.length} {filteredItems.length === 1 ? 'item' : 'items'}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.sortByBtn}
            onPress={() => {
              Haptics.selectionAsync();
              setShowSortModal(true);
            }}
            activeOpacity={0.7}
          >
            <Ionicons name="swap-vertical" size={14} color={Colors.green700} />
            <Text style={styles.sortByBtnText}>
              Sort: {sortBy === 'popular' ? 'Popular' : sortBy === 'offers' ? 'Offers' : 'Recent'}
            </Text>
            <Ionicons name="chevron-down" size={13} color={Colors.inkSoft} />
          </TouchableOpacity>
        </View>

        {/* Loading State */}
        {itemsLoading && (
          <View style={styles.skeletonsContainer}>
            <ItemRowSkeleton />
            <ItemRowSkeleton />
            <ItemRowSkeleton />
          </View>
        )}

        {/* Error State */}
        {itemsError && !itemsLoading && (
          <ErrorState
            message={itemsError.message}
            onRetry={refreshItems}
          />
        )}

        {/* Empty State */}
        {!itemsLoading && !itemsError && filteredItems.length === 0 && (
          <EmptyState
            title="No items found"
            subtitle={
              searchQuery
                ? `No items matching "${searchQuery}". Try a different keyword.`
                : 'No items currently in this category.'
            }
            actionLabel="Reset Filters"
            onAction={() => {
              setSearchQuery('');
              setSelectedCategory('All');
            }}
          />
        )}

        {/* Items List */}
        {!itemsLoading && !itemsError && filteredItems.length > 0 && (
          <View style={styles.itemsGrid}>
            {filteredItems.map(item => {
              const inStock = item.inStock;
              const cartLine = lines.find(l => l.itemId === item.id);
              const qty = cartLine ? cartLine.qty : 0;

              return (
                <View
                  key={item.id}
                  style={[
                    styles.productCard,
                    !inStock && styles.productCardOutOfStock,
                  ]}
                >
                  <View style={styles.productTop}>
                    <Image
                      source={{ uri: getProductImage(item) }}
                      style={styles.productImg}
                      contentFit="cover"
                      transition={200}
                    />

                    <View style={styles.productInfo}>
                      <Text style={styles.productName} numberOfLines={2}>
                        {item.name}
                      </Text>
                      <Text style={styles.productUnit}>{item.unit}</Text>
                      <Text style={styles.productPrice}>₹{item.price}</Text>
                    </View>
                  </View>

                  <View style={styles.productBottom}>
                    {!inStock ? (
                      <View style={styles.outOfStockBadge}>
                        <Text style={styles.outOfStockText}>Out of stock</Text>
                      </View>
                    ) : (
                      <QtyStepper
                        qty={qty}
                        onAdd={() => addItem(item.id)}
                        onIncrement={() => addItem(item.id)}
                        onDecrement={() => removeItem(item.id)}
                        max={20}
                      />
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* ─── Sticky Cart Bar ──────────────────────────────────────────────── */}
      <StickyBar
        itemCount={totalCartCount}
        total={cartTotals.total}
        onPress={handleOpenCart}
      />

      {/* ─── Cart Bottom Sheet ────────────────────────────────────────────── */}
      <BottomSheet
        ref={cartSheetRef}
        title="Your Cart"
        snapPoints={['60%', '90%']}
      >
        <View style={styles.sheetContent}>
          {lines.length === 0 ? (
            <EmptyState
              title="Your cart is empty"
              subtitle="Add grocery items or water cans to start your order."
              actionLabel="Browse Catalogue"
              onAction={() => cartSheetRef.current?.close()}
            />
          ) : (
            <View>
              {/* Free Delivery Progress */}
              {cartTotals.amountToFreeDelivery > 0 ? (
                <View style={styles.freeDeliveryBanner}>
                  <Text style={styles.freeDeliveryText}>
                    Add ₹{cartTotals.amountToFreeDelivery} more for FREE delivery!
                  </Text>
                  <View style={styles.progressBar}>
                    <View
                      style={[
                        styles.progressFill,
                        {
                          width: `${Math.min(
                            100,
                            (cartTotals.subtotal / defaultSettings.freeDeliveryAbove) *
                              100,
                          )}%`,
                        },
                      ]}
                    />
                  </View>
                </View>
              ) : (
                <View style={styles.freeDeliveryUnlocked}>
                  <Text style={styles.freeDeliveryUnlockedText}>
                    🎉 Free delivery unlocked!
                  </Text>
                </View>
              )}

              {/* Line Items */}
              <View style={styles.cartItemsList}>
                {lines.map(line => {
                  const item = itemsMap[line.itemId];
                  if (!item) return null;

                  return (
                    <View key={line.itemId} style={styles.cartRow}>
                      <Image
                        source={{ uri: getProductImage(item) }}
                        style={styles.cartItemThumb}
                        contentFit="cover"
                        transition={150}
                      />
                      <View style={styles.cartRowLeft}>
                        <Text style={styles.cartRowName}>{item.name}</Text>
                        <Text style={styles.cartRowUnit}>
                          {item.unit} • ₹{item.price}
                        </Text>
                      </View>

                      <View style={styles.cartRowRight}>
                        <QtyStepper
                          qty={line.qty}
                          onAdd={() => addItem(line.itemId)}
                          onIncrement={() => addItem(line.itemId)}
                          onDecrement={() => removeItem(line.itemId)}
                        />
                        <Text style={styles.cartRowTotal}>
                          ₹{item.price * line.qty}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>

              {/* Delivery Slot Selection */}
              <View style={styles.sheetSection}>
                <Text style={styles.sheetSectionTitle}>Delivery Slot</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {defaultSettings.slots.map(slot => (
                    <TouchableOpacity
                      key={slot}
                      style={[
                        styles.slotChip,
                        selectedSlot === slot && styles.slotChipActive,
                      ]}
                      onPress={() => setSelectedSlot(slot)}
                    >
                      <Text
                        style={[
                          styles.slotChipText,
                          selectedSlot === slot && styles.slotChipTextActive,
                        ]}
                      >
                        {slot}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {/* Order Notes */}
              <View style={styles.sheetSection}>
                <Text style={styles.sheetSectionTitle}>Delivery Notes (Optional)</Text>
                <TextInput
                  style={styles.notesInput}
                  placeholder="e.g. Leave at door, call before arrival"
                  placeholderTextColor={Colors.inkSoft}
                  value={orderNotes}
                  onChangeText={setOrderNotes}
                  maxLength={150}
                />
              </View>

              {/* Bill Details */}
              <View style={styles.billCard}>
                <Text style={styles.billTitle}>Bill Summary</Text>

                <View style={styles.billRow}>
                  <Text style={styles.billLabel}>Item Subtotal</Text>
                  <Text style={styles.billValue}>₹{cartTotals.subtotal}</Text>
                </View>

                <View style={styles.billRow}>
                  <Text style={styles.billLabel}>Delivery Fee</Text>
                  <Text style={styles.billValue}>
                    {cartTotals.deliveryFee === 0 ? (
                      <Text style={{ color: Colors.green500 }}>FREE</Text>
                    ) : (
                      `₹${cartTotals.deliveryFee}`
                    )}
                  </Text>
                </View>

                <View style={styles.billDivider} />

                <View style={styles.billRowTotal}>
                  <Text style={styles.billTotalLabel}>To Pay (Cash on Delivery)</Text>
                  <Text style={styles.billTotalValue}>₹{cartTotals.total}</Text>
                </View>
              </View>

              {/* Minimum Order Warning */}
              {!cartTotals.meetsMinimum && (
                <View style={styles.minOrderWarning}>
                  <Text style={styles.minOrderWarningText}>
                    ⚠️ Minimum order amount is ₹{defaultSettings.minOrderValue}. Add
                    more items to place order.
                  </Text>
                </View>
              )}

              {/* Checkout Button */}
              <View style={styles.checkoutBtnWrap}>
                <Button
                  label={isPlacingOrder ? 'Placing Order...' : 'Place Order (COD)'}
                  variant="primary"
                  loading={isPlacingOrder}
                  disabled={
                    isPlacingOrder ||
                    !cartTotals.meetsMinimum ||
                    !storeIsOpen ||
                    lines.length === 0
                  }
                  onPress={handlePlaceOrder}
                />
              </View>
            </View>
          )}
        </View>
      </BottomSheet>

      {/* Sort Options Modal */}
      <Modal
        visible={showSortModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSortModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowSortModal(false)}
        >
          <View style={styles.sortModalSheet} onStartShouldSetResponder={() => true}>
            <View style={styles.sortModalHeader}>
              <Text style={styles.sortModalTitle}>Sort Products By</Text>
              <TouchableOpacity
                onPress={() => setShowSortModal(false)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="close" size={22} color={Colors.inkSoft} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.sortOptionRow, sortBy === 'popular' && styles.sortOptionRowActive]}
              onPress={() => {
                Haptics.selectionAsync();
                setSortBy('popular');
                setShowSortModal(false);
              }}
              activeOpacity={0.7}
            >
              <View style={styles.sortOptionLeft}>
                <Text style={styles.sortOptionIcon}>🔥</Text>
                <View style={styles.sortOptionTextWrap}>
                  <Text style={[styles.sortOptionTitle, sortBy === 'popular' && styles.sortOptionTitleActive]}>
                    Most Commonly Bought
                  </Text>
                  <Text style={styles.sortOptionSub}>Popular items based on customer purchases</Text>
                </View>
              </View>
              {sortBy === 'popular' && (
                <Ionicons name="checkmark-circle" size={22} color={Colors.green700} />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.sortOptionRow, sortBy === 'offers' && styles.sortOptionRowActive]}
              onPress={() => {
                Haptics.selectionAsync();
                setSortBy('offers');
                setShowSortModal(false);
              }}
              activeOpacity={0.7}
            >
              <View style={styles.sortOptionLeft}>
                <Text style={styles.sortOptionIcon}>🏷️</Text>
                <View style={styles.sortOptionTextWrap}>
                  <Text style={[styles.sortOptionTitle, sortBy === 'offers' && styles.sortOptionTitleActive]}>
                    Offers & Deals
                  </Text>
                  <Text style={styles.sortOptionSub}>Promotional discounts & featured specials</Text>
                </View>
              </View>
              {sortBy === 'offers' && (
                <Ionicons name="checkmark-circle" size={22} color={Colors.green700} />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.sortOptionRow, sortBy === 'recent' && styles.sortOptionRowActive]}
              onPress={() => {
                Haptics.selectionAsync();
                setSortBy('recent');
                setShowSortModal(false);
              }}
              activeOpacity={0.7}
            >
              <View style={styles.sortOptionLeft}>
                <Text style={styles.sortOptionIcon}>✨</Text>
                <View style={styles.sortOptionTextWrap}>
                  <Text style={[styles.sortOptionTitle, sortBy === 'recent' && styles.sortOptionTitleActive]}>
                    Recently Added / Updated
                  </Text>
                  <Text style={styles.sortOptionSub}>New arrivals & freshly restocked products</Text>
                </View>
              </View>
              {sortBy === 'recent' && (
                <Ionicons name="checkmark-circle" size={22} color={Colors.green700} />
              )}
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.cream,
  },
  header: {
    backgroundColor: Colors.green900,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
    borderBottomLeftRadius: Radius.card,
    borderBottomRightRadius: Radius.card,
    ...Shadow.card,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  greeting: {
    fontSize: FontSize.lg,
    fontFamily: 'Manrope_800ExtraBold',
    color: '#ffffff',
  },
  addressChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  addressIcon: {
    fontSize: 12,
  },
  addressText: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_600SemiBold',
    color: 'rgba(255, 255, 255, 0.85)',
    maxWidth: 240,
  },
  ordersIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  ordersIcon: {
    fontSize: 20,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: Radius.button,
    paddingHorizontal: Spacing.md,
    height: 46,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  searchIcon: {
    fontSize: 16,
    marginRight: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontFamily: 'Manrope_500Medium',
    fontSize: FontSize.sm,
    color: Colors.ink,
  },
  clearSearch: {
    fontSize: 14,
    color: Colors.inkSoft,
    padding: 4,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.lg,
  },
  closedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF4E5',
    borderWidth: 1,
    borderColor: Colors.amber,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  closedIcon: {
    fontSize: 22,
  },
  closedTextWrap: {
    flex: 1,
  },
  closedTitle: {
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_800ExtraBold',
    color: '#8A5800',
  },
  closedSub: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_500Medium',
    color: '#8A5800',
    marginTop: 2,
  },
  activeOrderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.card,
    borderRadius: Radius.card,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.line,
    ...Shadow.card,
  },
  activeOrderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  activeOrderIcon: {
    fontSize: 28,
  },
  activeOrderTitle: {
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.ink,
  },
  activeOrderSub: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_500Medium',
    color: Colors.green700,
    marginTop: 2,
  },
  bannerSection: {
    marginBottom: Spacing.lg,
  },
  bannerCard: {
    borderRadius: Radius.card,
    padding: Spacing.xl,
    justifyContent: 'center',
    minHeight: 120,
    marginRight: Spacing.md,
    ...Shadow.card,
  },
  bannerTitle: {
    fontSize: FontSize.lg,
    fontFamily: 'Manrope_800ExtraBold',
    color: '#ffffff',
    marginBottom: 4,
  },
  bannerSub: {
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_500Medium',
    color: 'rgba(255, 255, 255, 0.9)',
  },
  bannerTapPrompt: {
    marginTop: Spacing.sm,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  bannerTapText: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_600SemiBold',
    color: '#ffffff',
  },
  bannerDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: Spacing.sm,
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.line,
  },
  dotActive: {
    backgroundColor: Colors.green700,
    width: 18,
  },
  categoriesSection: {
    marginBottom: Spacing.lg,
  },
  categoryPillsList: {
    gap: Spacing.sm,
  },
  waSection: {
    backgroundColor: Colors.card,
    borderRadius: Radius.card,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.line,
    ...Shadow.card,
  },
  waHeader: {
    marginBottom: Spacing.md,
  },
  waTitle: {
    fontSize: FontSize.md,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.ink,
    marginBottom: 2,
  },
  waSub: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
    lineHeight: 18,
  },
  waButtons: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  waBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: Radius.button,
    gap: 6,
  },
  waBtnIcon: {
    fontSize: 16,
  },
  waBtnTxt: {
    color: '#ffffff',
    fontFamily: 'Manrope_600SemiBold',
    fontSize: FontSize.sm,
  },
  catalogueHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  catalogueHeaderLeft: {
    flex: 1,
  },
  catalogueTitle: {
    fontSize: FontSize.lg,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.ink,
  },
  itemCountBadge: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.inkSoft,
    marginTop: 2,
  },
  sortByBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    paddingHorizontal: Spacing.md,
    paddingVertical: 7,
    borderRadius: Radius.button,
    borderWidth: 1,
    borderColor: Colors.line,
    gap: 5,
    ...Shadow.card,
  },
  sortByBtnText: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_700Bold',
    color: Colors.ink,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  sortModalSheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: Spacing.xl,
    paddingBottom: Platform.OS === 'ios' ? 36 : Spacing.xl,
    ...Shadow.card,
  },
  sortModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.lg,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.line,
  },
  sortModalTitle: {
    fontSize: FontSize.md,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.ink,
  },
  sortOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
    marginBottom: Spacing.sm,
    backgroundColor: Colors.cream,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  sortOptionRowActive: {
    backgroundColor: '#E8F5E9',
    borderColor: Colors.green700,
  },
  sortOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    flex: 1,
  },
  sortOptionIcon: {
    fontSize: 22,
  },
  sortOptionTextWrap: {
    flex: 1,
  },
  sortOptionTitle: {
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_700Bold',
    color: Colors.ink,
  },
  sortOptionTitleActive: {
    color: Colors.green700,
  },
  sortOptionSub: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
    marginTop: 2,
  },
  skeletonsContainer: {
    gap: Spacing.md,
  },
  itemsGrid: {
    gap: Spacing.md,
  },
  productCard: {
    backgroundColor: Colors.card,
    borderRadius: Radius.card,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.line,
    ...Shadow.card,
  },
  productCardOutOfStock: {
    opacity: 0.65,
  },
  productTop: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  productImg: {
    width: 64,
    height: 64,
    borderRadius: Radius.md,
    backgroundColor: Colors.cream,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  productInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  productName: {
    fontSize: FontSize.md,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.ink,
    marginBottom: 2,
  },
  productUnit: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
    marginBottom: 4,
  },
  productPrice: {
    fontSize: FontSize.md,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.green700,
  },
  productBottom: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  outOfStockBadge: {
    backgroundColor: 'rgba(225, 96, 74, 0.1)',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.chip,
  },
  outOfStockText: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.coral,
  },
  sheetContent: {
    padding: Spacing.lg,
  },
  freeDeliveryBanner: {
    backgroundColor: '#EAF8F0',
    padding: Spacing.md,
    borderRadius: Radius.md,
    marginBottom: Spacing.lg,
  },
  freeDeliveryText: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.green700,
    marginBottom: 6,
    textAlign: 'center',
  },
  progressBar: {
    height: 6,
    backgroundColor: Colors.line,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.green500,
  },
  freeDeliveryUnlocked: {
    backgroundColor: '#EAF8F0',
    padding: Spacing.sm,
    borderRadius: Radius.md,
    marginBottom: Spacing.lg,
    alignItems: 'center',
  },
  freeDeliveryUnlockedText: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.green700,
  },
  cartItemsList: {
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  cartRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: Colors.line,
    paddingBottom: Spacing.sm,
  },
  cartItemThumb: {
    width: 44,
    height: 44,
    borderRadius: Radius.sm,
    backgroundColor: Colors.cream,
    borderWidth: 1,
    borderColor: Colors.line,
    marginRight: Spacing.sm,
  },
  cartRowLeft: {
    flex: 1,
    marginRight: Spacing.md,
  },
  cartRowName: {
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.ink,
  },
  cartRowUnit: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
    marginTop: 2,
  },
  cartRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  cartRowTotal: {
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.ink,
    minWidth: 50,
    textAlign: 'right',
  },
  sheetSection: {
    marginBottom: Spacing.lg,
  },
  sheetSectionTitle: {
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.ink,
    marginBottom: Spacing.sm,
  },
  slotChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.button,
    backgroundColor: Colors.cream,
    borderWidth: 1,
    borderColor: Colors.line,
    marginRight: Spacing.sm,
  },
  slotChipActive: {
    backgroundColor: Colors.green700,
    borderColor: Colors.green700,
  },
  slotChipText: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.ink,
  },
  slotChipTextActive: {
    color: '#ffffff',
  },
  notesInput: {
    backgroundColor: Colors.cream,
    borderWidth: 1,
    borderColor: Colors.line,
    borderRadius: Radius.button,
    padding: Spacing.md,
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_500Medium',
    color: Colors.ink,
  },
  billCard: {
    backgroundColor: Colors.cream,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  billTitle: {
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.ink,
    marginBottom: Spacing.sm,
  },
  billRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  billLabel: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
  },
  billValue: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.ink,
  },
  billDivider: {
    height: 1,
    backgroundColor: Colors.line,
    marginVertical: Spacing.sm,
  },
  billRowTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  billTotalLabel: {
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.ink,
  },
  billTotalValue: {
    fontSize: FontSize.md,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.green700,
  },
  minOrderWarning: {
    backgroundColor: '#FFF4E5',
    padding: Spacing.md,
    borderRadius: Radius.sm,
    marginBottom: Spacing.md,
  },
  minOrderWarningText: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_600SemiBold',
    color: '#8A5800',
    textAlign: 'center',
  },
  checkoutBtnWrap: {
    marginTop: Spacing.sm,
    marginBottom: Spacing.xl,
  },
});
