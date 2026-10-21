// app/(customer)/index.tsx — Customer Home / Shop screen
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
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
  ActivityIndicator,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import RNBottomSheet from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Spacing, Radius, FontSize, Shadow } from '../../theme';
import { getBannerPalette } from '../../utils/bannerPalette';
import {
  buildItemBannerMatchMap,
  findBestMatchingItemForBanner,
} from '../../utils/bannerMatcher';
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
const GRID_CARD_WIDTH = Math.floor((SCREEN_WIDTH - Spacing.lg * 2 - Spacing.sm) / 2);

const SORT_LABELS: Record<'popular' | 'price_asc' | 'price_desc' | 'offers' | 'recent', string> = {
  popular: 'Popular',
  price_asc: 'Price: Low → High',
  price_desc: 'Price: High → Low',
  offers: 'Deals & Offers',
  recent: 'New Arrivals',
};

const QUICK_SORT_OPTIONS: Array<{
  id: 'popular' | 'price_asc' | 'price_desc' | 'offers' | 'recent';
  label: string;
  icon: string;
}> = [
  { id: 'popular', label: 'Popular', icon: '🔥' },
  { id: 'price_asc', label: 'Price: Low → High', icon: '💰' },
  { id: 'price_desc', label: 'Price: High → Low', icon: '💎' },
  { id: 'offers', label: 'Deals & Offers', icon: '🏷️' },
  { id: 'recent', label: 'New Arrivals', icon: '✨' },
];

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
  const [sortBy, setSortBy] = useState<'popular' | 'price_asc' | 'price_desc' | 'offers' | 'recent'>('popular');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showSortModal, setShowSortModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<string>('5 min');
  const [orderNotes, setOrderNotes] = useState('');
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);

  // Banner carousel state
  const [currentBannerIndex, setCurrentBannerIndex] = useState(0);
  const bannerFlatListRef = useRef<FlatList>(null);
  const scrollY = useRef(new Animated.Value(0)).current;
  const bannerMotion: any = {
    opacity: scrollY.interpolate({ inputRange: [0, 180], outputRange: [1, 0.72], extrapolate: 'clamp' }),
    transform: [
      { translateY: scrollY.interpolate({ inputRange: [0, 180], outputRange: [0, -16], extrapolate: 'clamp' }) },
      { scale: scrollY.interpolate({ inputRange: [0, 180], outputRange: [1, 0.97], extrapolate: 'clamp' }) },
    ],
  };

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

  // Map of item ID -> banner match ranking info for active promotional banners
  const itemBannerMatchMap = useMemo(() => {
    return buildItemBannerMatchMap(items, banners);
  }, [items, banners]);

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

      if (sortBy === 'price_asc') {
        return (a.price || 0) - (b.price || 0);
      }

      if (sortBy === 'price_desc') {
        return (b.price || 0) - (a.price || 0);
      }

      if (sortBy === 'offers') {
        const aMatch = itemBannerMatchMap.get(a.id);
        const bMatch = itemBannerMatchMap.get(b.id);
        const aHasMatch = Boolean(aMatch && aMatch.bannerIndex >= 0);
        const bHasMatch = Boolean(bMatch && bMatch.bannerIndex >= 0);

        // Active banner promotional offers ALWAYS come first
        if (aHasMatch && !bHasMatch) return -1;
        if (!aHasMatch && bHasMatch) return 1;

        if (aHasMatch && bHasMatch) {
          // Banner with lower carousel index comes first (Banner 0 items before Banner 1 items)
          if (aMatch!.bannerIndex !== bMatch!.bannerIndex) {
            return aMatch!.bannerIndex - bMatch!.bannerIndex;
          }
          // Within same banner, higher match score comes first (exact item before category item)
          if (bMatch!.score !== aMatch!.score) {
            return bMatch!.score - aMatch!.score;
          }
        }

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
  }, [items, selectedCategory, searchQuery, sortBy, itemBannerMatchMap, itemPopularityMap]);

  // Dynamic batch slicing for ultra-fast 60 FPS scrolling through large inventories (500+ items)
  const [visibleCount, setVisibleCount] = useState(30);

  useEffect(() => {
    setVisibleCount(30);
  }, [selectedCategory, searchQuery, sortBy]);

  const displayedItems = useMemo(() => {
    return filteredItems.slice(0, visibleCount);
  }, [filteredItems, visibleCount]);

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
        slots: ['5 min', 'Morning 7–9 AM', 'Evening 5–7 PM'],
        agentFeePerDelivery: 30,
      },
    [settings],
  );

  const availableSlots = useMemo(() => {
    const raw = defaultSettings.slots && defaultSettings.slots.length > 0
      ? defaultSettings.slots
      : ['5 min', 'Morning 7–9 AM', 'Evening 5–7 PM'];
    return raw.map(s => (typeof s === 'string' && s.trim().toUpperCase() === 'ASAP' ? '5 min' : s));
  }, [defaultSettings.slots]);

  useEffect(() => {
    if (selectedSlot.trim().toUpperCase() === 'ASAP') {
      setSelectedSlot('5 min');
    }
  }, [selectedSlot]);

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

  // Handle banner press: take user directly to product and add to cart, or view all banner offers
  const handleBannerPress = (banner: AppBanner) => {
    const target = findBestMatchingItemForBanner(banner, items);

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
      // If broad banner promotion, show all deals & offers
      setSelectedCategory('All');
      setSearchQuery('');
      setSortBy('offers');
      Haptics.selectionAsync();
      showToast('🎉 Viewing all current Deals & Offers!', 'info');
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

      const isImmediate = selectedSlot.toLowerCase().includes('asap') || selectedSlot.toLowerCase().includes('5 min');
      const slot: OrderSlot = {
        type: isImmediate ? 'asap' : 'scheduled',
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
      <Animated.ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: totalCartCount > 0 ? 120 : Spacing.xl },
        ]}
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={[1]}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          {
            useNativeDriver: false,
            listener: (e: any) => {
              const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
              const isCloseToBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 400;
              if (isCloseToBottom && visibleCount < filteredItems.length) {
                setVisibleCount(prev => Math.min(prev + 30, filteredItems.length));
              }
            },
          },
        )}
        scrollEventThrottle={64}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[Colors.green700]}
            tintColor={Colors.green700}
          />
        }
      >
        {/* Child 0: Announcements, tracker & promotional banners */}
        <View>
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
            <Animated.View style={[styles.bannerSection, bannerMotion]}>
              <FlatList
                ref={bannerFlatListRef}
                data={banners}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                keyExtractor={item => item.id}
                renderItem={({ item }) => {
                  const hasLink = Boolean(item.linkedItemId || item.linkedItemName);
                  const palette = getBannerPalette(item);
                  return (
                    <TouchableOpacity
                      style={[styles.bannerCardContainer, { width: BANNER_WIDTH }]}
                      activeOpacity={0.85}
                      onPress={() => handleBannerPress(item)}
                    >
                      <LinearGradient
                        colors={[palette.colors[0], palette.colors[1]]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.bannerGradient}
                      >
                        {/* Soft decorative background shapes */}
                        <View style={styles.bannerDecoCircleLarge} />
                        <View style={styles.bannerDecoCircleSmall} />

                        {/* Banner Inner Content */}
                        <View style={styles.bannerInner}>
                          <View style={styles.bannerContent}>
                            <Text style={styles.bannerTitle} numberOfLines={2}>
                              {item.title}
                            </Text>
                            {item.subtitle ? (
                              <Text style={styles.bannerSub} numberOfLines={2}>
                                {item.subtitle}
                              </Text>
                            ) : null}
                            <View style={styles.bannerTapPrompt}>
                              <Text style={styles.bannerTapText} numberOfLines={1}>
                                {item.linkedItemName
                                  ? `⚡ Special Offer on ${item.linkedItemName} • Tap to view & add ➔`
                                  : '⚡ Special Offer • Tap to view deal ➔'}
                              </Text>
                            </View>
                          </View>

                          {/* Decorative Round Badge (Custom Image or Category Emoji) */}
                          <View style={styles.bannerEmojiBadge}>
                            {item.imageUrl ? (
                              <Image
                                source={{ uri: item.imageUrl }}
                                style={[
                                  styles.bannerBadgeImg,
                                  {
                                    transform: [
                                      { rotate: `${item.imageRotation || 0}deg` },
                                      { scale: item.imageScale || 1 },
                                      { translateX: (item.imageOffsetX ? (Math.abs(item.imageOffsetX) > 1 ? item.imageOffsetX / 200 : item.imageOffsetX) : 0) * 58 },
                                      { translateY: (item.imageOffsetY ? (Math.abs(item.imageOffsetY) > 1 ? item.imageOffsetY / 200 : item.imageOffsetY) : 0) * 58 },
                                    ],
                                  },
                                ]}
                                contentFit="cover"
                              />
                            ) : (
                              <Text style={styles.bannerEmoji}>{palette.emoji}</Text>
                            )}
                          </View>
                        </View>
                      </LinearGradient>
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
            </Animated.View>
          )}
        </View>

        {/* Child 1: Sticky Category & Quick Filter Bar */}
        <View style={styles.stickyFilterContainer}>
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

          {/* Quick Sort & Filter Chips Bar */}
          <View style={styles.sortChipsSection}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.sortChipsList}
            >
              <TouchableOpacity
                style={styles.sortFilterBtn}
                onPress={() => {
                  Haptics.selectionAsync();
                  setShowSortModal(true);
                }}
                activeOpacity={0.7}
              >
                <Ionicons name="options-outline" size={14} color={Colors.ink} />
                <Text style={styles.sortFilterBtnText}>All Filters</Text>
              </TouchableOpacity>

              {QUICK_SORT_OPTIONS.map(opt => {
                const isActive = sortBy === opt.id;
                return (
                  <TouchableOpacity
                    key={opt.id}
                    style={[
                      styles.sortQuickChip,
                      isActive && styles.sortQuickChipActive,
                    ]}
                    onPress={() => {
                      Haptics.selectionAsync();
                      if (opt.id === 'offers') {
                        setSelectedCategory('All');
                        setSearchQuery('');
                      }
                      setSortBy(opt.id);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.sortQuickChipIcon}>{opt.icon}</Text>
                    <Text
                      style={[
                        styles.sortQuickChipText,
                        isActive && styles.sortQuickChipTextActive,
                      ]}
                    >
                      {opt.label}
                    </Text>
                    {isActive && (
                      <Ionicons
                        name="checkmark-circle"
                        size={14}
                        color="#ffffff"
                        style={{ marginLeft: 3 }}
                      />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>

        {/* Compact WhatsApp & Call Quick Ordering Ribbon */}
        <View style={styles.waSection}>
          <View style={styles.waHeaderRow}>
            <View style={styles.waTextContainer}>
              <View style={styles.waTitleRow}>
                <View style={styles.waBadge}>
                  <Text style={styles.waBadgeText}>QUICK ORDER</Text>
                </View>
                <Text style={styles.waTitle}>Have a grocery list? 📝</Text>
              </View>
              <Text style={styles.waSub}>
                Send photo or voice note directly to our store
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
                activeOpacity={0.8}
              >
                <Ionicons name="logo-whatsapp" size={15} color="#ffffff" />
                <Text style={styles.waBtnTxt}>WhatsApp</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.waBtn, { backgroundColor: Colors.green700 }]}
                onPress={() =>
                  Linking.openURL('tel:9600102028').catch(() =>
                    Alert.alert('Error', 'Calling not supported'),
                  )
                }
                activeOpacity={0.8}
              >
                <Ionicons name="call" size={13} color="#ffffff" />
                <Text style={styles.waBtnTxt}>Call</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Product Catalogue Header */}
        <View style={styles.catalogueHeader}>
          <View style={styles.catalogueHeaderLeft}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, flexWrap: 'wrap' }}>
              <Text style={styles.catalogueTitle}>
                {selectedCategory === 'All'
                  ? sortBy === 'offers'
                    ? '🏷️ Deals & Offers'
                    : 'All Products'
                  : selectedCategory}
              </Text>
              {sortBy === 'offers' && (
                <View style={styles.dealsActivePill}>
                  <Text style={styles.dealsActivePillText}>⚡ Banner Offers First</Text>
                </View>
              )}
            </View>
            <Text style={styles.itemCountBadge}>
              {filteredItems.length} {filteredItems.length === 1 ? 'item' : 'items'} available
            </Text>
          </View>

          <View style={styles.catalogueHeaderRight}>
            <TouchableOpacity
              style={styles.viewToggleBtn}
              onPress={() => {
                Haptics.selectionAsync();
                setViewMode(prev => (prev === 'grid' ? 'list' : 'grid'));
              }}
              activeOpacity={0.7}
              accessibilityLabel={`Switch to ${viewMode === 'grid' ? 'list' : 'grid'} view`}
            >
              <Ionicons
                name={viewMode === 'grid' ? 'list' : 'grid'}
                size={16}
                color={Colors.ink}
              />
            </TouchableOpacity>

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
                {SORT_LABELS[sortBy] || 'Sort'}
              </Text>
              <Ionicons name="chevron-down" size={13} color={Colors.inkSoft} />
            </TouchableOpacity>
          </View>
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

        {/* Items List (2-column Grid or 1-column List) */}
        {!itemsLoading && !itemsError && filteredItems.length > 0 && (
          <View>
            {viewMode === 'grid' ? (
              <View style={styles.itemsGridTwoCol}>
                {displayedItems.map(item => {
                  const inStock = item.inStock;
                  const cartLine = lines.find(l => l.itemId === item.id);
                  const qty = cartLine ? cartLine.qty : 0;
                  const isCan =
                    item.name.toLowerCase().includes('can') ||
                    item.category.toLowerCase().includes('water');
                  const isOffer = itemBannerMatchMap.has(item.id);
                  const isPopular = (itemPopularityMap[item.id] || 0) >= 2;

                  return (
                    <View
                      key={item.id}
                      style={[
                        styles.gridCard,
                        qty > 0 && styles.gridCardInCart,
                        !inStock && styles.productCardOutOfStock,
                      ]}
                    >
                      {/* In-Cart Pill */}
                      {qty > 0 && (
                        <View style={styles.gridInCartIndicator}>
                          <Ionicons name="cart" size={11} color={Colors.green700} />
                          <Text style={styles.gridInCartIndicatorText}>
                            {qty} in cart
                          </Text>
                        </View>
                      )}

                      {/* Product Thumbnail with Badges */}
                      <View style={styles.gridImgWrapper}>
                        <Image
                          source={{ uri: getProductImage(item) }}
                          style={styles.gridImg}
                          contentFit="cover"
                          transition={200}
                        />
                        {!inStock ? (
                          <View style={styles.imgBadgeSoldOut}>
                            <Text style={styles.imgBadgeSoldOutText}>SOLD OUT</Text>
                          </View>
                        ) : isOffer ? (
                          <View style={styles.imgBadgeOffer}>
                            <Text style={styles.imgBadgeText}>🔥 DEAL</Text>
                          </View>
                        ) : isCan ? (
                          <View style={styles.imgBadgeCan}>
                            <Text style={styles.imgBadgeText}>💧 20L</Text>
                          </View>
                        ) : isPopular ? (
                          <View style={styles.imgBadgePopular}>
                            <Text style={styles.imgBadgeText}>⭐ TOP</Text>
                          </View>
                        ) : null}
                      </View>

                      {/* Product Details */}
                      <View style={styles.gridInfo}>
                        <Text style={styles.categoryBadge} numberOfLines={1}>
                          {item.category.toUpperCase()}
                        </Text>

                        <Text style={styles.gridProductName} numberOfLines={2}>
                          {item.name}
                        </Text>

                        <View style={styles.unitBadge}>
                          <Text style={styles.unitBadgeText}>{item.unit}</Text>
                        </View>
                      </View>

                      {/* Price & Stepper Row */}
                      <View style={styles.gridBottomRow}>
                        <View style={styles.gridPriceWrap}>
                          <Text style={styles.gridPrice}>₹{item.price}</Text>
                        </View>

                        <View style={styles.gridActionWrap}>
                          {!inStock ? (
                            <View style={styles.gridOutOfStockBadge}>
                              <Text style={styles.outOfStockText}>Unavailable</Text>
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
                    </View>
                  );
                })}
              </View>
            ) : (
              <View style={styles.itemsGrid}>
                {displayedItems.map(item => {
                  const inStock = item.inStock;
                  const cartLine = lines.find(l => l.itemId === item.id);
                  const qty = cartLine ? cartLine.qty : 0;
                  const isCan =
                    item.name.toLowerCase().includes('can') ||
                    item.category.toLowerCase().includes('water');
                  const isOffer = itemBannerMatchMap.has(item.id);
                  const isPopular = (itemPopularityMap[item.id] || 0) >= 2;

                  return (
                    <View
                      key={item.id}
                      style={[
                        styles.productCard,
                        qty > 0 && styles.productCardInCart,
                        !inStock && styles.productCardOutOfStock,
                      ]}
                    >
                      {/* In-Cart Top Ribbon */}
                      {qty > 0 && (
                        <View style={styles.inCartIndicator}>
                          <Ionicons name="cart" size={13} color={Colors.green700} />
                          <Text style={styles.inCartIndicatorText}>
                            {qty} in cart • Subtotal ₹{item.price * qty}
                          </Text>
                        </View>
                      )}

                      <View style={styles.productMainRow}>
                        {/* Left: Product Thumbnail with floating tag badges */}
                        <View style={styles.productImgWrapper}>
                          <Image
                            source={{ uri: getProductImage(item) }}
                            style={styles.productImg}
                            contentFit="cover"
                            transition={200}
                          />
                          {!inStock ? (
                            <View style={styles.imgBadgeSoldOut}>
                              <Text style={styles.imgBadgeSoldOutText}>SOLD OUT</Text>
                            </View>
                          ) : isOffer ? (
                            <View style={styles.imgBadgeOffer}>
                              <Text style={styles.imgBadgeText}>🔥 DEAL</Text>
                            </View>
                          ) : isCan ? (
                            <View style={styles.imgBadgeCan}>
                              <Text style={styles.imgBadgeText}>💧 20L</Text>
                            </View>
                          ) : isPopular ? (
                            <View style={styles.imgBadgePopular}>
                              <Text style={styles.imgBadgeText}>⭐ TOP</Text>
                            </View>
                          ) : null}
                        </View>

                        {/* Middle: Details */}
                        <View style={styles.productInfo}>
                          <View style={styles.productMetaRow}>
                            <Text style={styles.categoryBadge}>
                              {item.category.toUpperCase()}
                            </Text>
                            {inStock && (
                              <Text style={styles.deliverySpeedTag}>⚡ In Stock</Text>
                            )}
                          </View>

                          <Text style={styles.productName} numberOfLines={2}>
                            {item.name}
                          </Text>

                          <View style={styles.unitBadge}>
                            <Text style={styles.unitBadgeText}>{item.unit}</Text>
                          </View>
                        </View>
                      </View>

                      {/* Bottom: Price and Stepper */}
                      <View style={styles.productBottomRow}>
                        <View style={styles.productPriceWrap}>
                          <Text style={styles.productPrice}>₹{item.price}</Text>
                          <Text style={styles.productPriceSub}>
                            {item.unit ? ` per ${item.unit}` : ''}
                          </Text>
                        </View>

                        <View style={styles.productActionWrap}>
                          {!inStock ? (
                            <View style={styles.outOfStockBadge}>
                              <Text style={styles.outOfStockText}>Unavailable</Text>
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
                    </View>
                  );
                })}
              </View>
            )}

            {/* Load More Indicator for large catalogs */}
            {visibleCount < filteredItems.length && (
              <TouchableOpacity
                style={styles.loadMoreBtn}
                onPress={() => {
                  Haptics.selectionAsync();
                  setVisibleCount(prev => Math.min(prev + 40, filteredItems.length));
                }}
                activeOpacity={0.8}
              >
                <ActivityIndicator size="small" color={Colors.green700} />
                <Text style={styles.loadMoreText}>
                  Loaded {displayedItems.length} of {filteredItems.length} products • Tap to show more
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </Animated.ScrollView>

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
                  {availableSlots.map(slot => (
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
        statusBarTranslucent
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
              style={[styles.sortOptionRow, sortBy === 'price_asc' && styles.sortOptionRowActive]}
              onPress={() => {
                Haptics.selectionAsync();
                setSortBy('price_asc');
                setShowSortModal(false);
              }}
              activeOpacity={0.7}
            >
              <View style={styles.sortOptionLeft}>
                <Text style={styles.sortOptionIcon}>💰</Text>
                <View style={styles.sortOptionTextWrap}>
                  <Text style={[styles.sortOptionTitle, sortBy === 'price_asc' && styles.sortOptionTitleActive]}>
                    Price: Low to High
                  </Text>
                  <Text style={styles.sortOptionSub}>Affordable & everyday grocery essentials first</Text>
                </View>
              </View>
              {sortBy === 'price_asc' && (
                <Ionicons name="checkmark-circle" size={22} color={Colors.green700} />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.sortOptionRow, sortBy === 'price_desc' && styles.sortOptionRowActive]}
              onPress={() => {
                Haptics.selectionAsync();
                setSortBy('price_desc');
                setShowSortModal(false);
              }}
              activeOpacity={0.7}
            >
              <View style={styles.sortOptionLeft}>
                <Text style={styles.sortOptionIcon}>💎</Text>
                <View style={styles.sortOptionTextWrap}>
                  <Text style={[styles.sortOptionTitle, sortBy === 'price_desc' && styles.sortOptionTitleActive]}>
                    Price: High to Low
                  </Text>
                  <Text style={styles.sortOptionSub}>Premium cans, family packs & large combos first</Text>
                </View>
              </View>
              {sortBy === 'price_desc' && (
                <Ionicons name="checkmark-circle" size={22} color={Colors.green700} />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.sortOptionRow, sortBy === 'offers' && styles.sortOptionRowActive]}
              onPress={() => {
                Haptics.selectionAsync();
                setSelectedCategory('All');
                setSearchQuery('');
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
  bannerCardContainer: {
    marginRight: Spacing.md,
    borderRadius: Radius.card,
    ...Shadow.card,
  },
  bannerGradient: {
    borderRadius: Radius.card,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    minHeight: 118,
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
  },
  bannerDecoCircleLarge: {
    position: 'absolute',
    top: -20,
    right: -20,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  bannerDecoCircleSmall: {
    position: 'absolute',
    bottom: -25,
    right: 85,
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  bannerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 2,
    gap: Spacing.md,
  },
  bannerContent: {
    flex: 1,
    justifyContent: 'center',
  },
  bannerEmojiBadge: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 2,
    overflow: 'hidden',
  },
  bannerBadgeImg: {
    width: '100%',
    height: '100%',
    borderRadius: 26,
  },
  bannerEmoji: {
    fontSize: 26,
  },
  bannerTitle: {
    fontSize: FontSize.lg,
    fontFamily: 'Manrope_800ExtraBold',
    color: '#ffffff',
    marginBottom: 2,
    textShadowColor: 'rgba(0, 0, 0, 0.15)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  bannerSub: {
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_600SemiBold',
    color: 'rgba(255, 255, 255, 0.95)',
    lineHeight: 18,
  },
  bannerTapPrompt: {
    marginTop: Spacing.sm,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.35)',
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: Radius.chip,
  },
  bannerTapText: {
    fontSize: FontSize.xs - 1,
    fontFamily: 'Manrope_700Bold',
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
  stickyFilterContainer: {
    backgroundColor: Colors.cream,
    marginHorizontal: -Spacing.lg,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: Colors.line,
    zIndex: 10,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    marginBottom: Spacing.sm,
  },
  categoriesSection: {
    marginBottom: 6,
  },
  categoryPillsList: {
    gap: Spacing.sm,
  },
  sortChipsSection: {
    marginBottom: 2,
  },
  sortChipsList: {
    gap: Spacing.xs,
    alignItems: 'center',
    paddingVertical: 2,
  },
  sortFilterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: Colors.ink,
    borderRadius: Radius.chip,
    paddingHorizontal: 12,
    paddingVertical: 7,
    gap: 5,
    marginRight: 4,
    ...Shadow.card,
  },
  sortFilterBtnText: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_700Bold',
    color: Colors.ink,
  },
  sortQuickChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cream,
    borderWidth: 1,
    borderColor: Colors.line,
    borderRadius: Radius.chip,
    paddingHorizontal: 12,
    paddingVertical: 7,
    gap: 4,
  },
  sortQuickChipActive: {
    backgroundColor: Colors.green700,
    borderColor: Colors.green700,
  },
  sortQuickChipIcon: {
    fontSize: 13,
  },
  sortQuickChipText: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.inkSoft,
  },
  sortQuickChipTextActive: {
    color: '#FFFFFF',
    fontFamily: 'Manrope_700Bold',
  },
  waSection: {
    backgroundColor: Colors.card,
    borderRadius: Radius.card,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.line,
    ...Shadow.card,
  },
  waHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  waTextContainer: {
    flex: 1,
  },
  waTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 2,
  },
  waBadge: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  waBadgeText: {
    fontSize: 9,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.green700,
    letterSpacing: 0.5,
  },
  waTitle: {
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.ink,
  },
  waSub: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
    lineHeight: 16,
  },
  waButtons: {
    flexDirection: 'row',
    gap: 6,
  },
  waBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: Radius.button,
    gap: 4,
  },
  waBtnTxt: {
    color: '#ffffff',
    fontFamily: 'Manrope_700Bold',
    fontSize: FontSize.xs,
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
  dealsActivePill: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.chip,
    borderWidth: 1,
    borderColor: '#FCD34D',
  },
  dealsActivePillText: {
    fontSize: FontSize.xs - 1,
    fontFamily: 'Manrope_700Bold',
    color: '#B45309',
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
  catalogueHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  viewToggleBtn: {
    width: 36,
    height: 34,
    borderRadius: Radius.button,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: Colors.line,
    justifyContent: 'center',
    alignItems: 'center',
    ...Shadow.card,
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
  itemsGridTwoCol: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: Spacing.md,
  },
  gridCard: {
    width: GRID_CARD_WIDTH,
    backgroundColor: Colors.card,
    borderRadius: Radius.card,
    padding: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.line,
    justifyContent: 'space-between',
    ...Shadow.card,
  },
  gridCardInCart: {
    borderColor: Colors.green500,
    borderWidth: 1.5,
    backgroundColor: '#FAFCF9',
  },
  gridInCartIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginBottom: 6,
    gap: 3,
  },
  gridInCartIndicatorText: {
    fontSize: 9,
    fontFamily: 'Manrope_700Bold',
    color: Colors.green700,
  },
  gridImgWrapper: {
    position: 'relative',
    width: '100%',
    height: 114,
    borderRadius: Radius.md,
    backgroundColor: Colors.cream,
    borderWidth: 1,
    borderColor: Colors.line,
    overflow: 'hidden',
    marginBottom: Spacing.xs,
  },
  gridImg: {
    width: '100%',
    height: '100%',
  },
  gridInfo: {
    flex: 1,
    marginBottom: Spacing.xs,
  },
  gridProductName: {
    fontSize: FontSize.xs + 1,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.ink,
    lineHeight: 18,
    marginTop: 2,
    marginBottom: 4,
    minHeight: 36,
  },
  gridBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Spacing.xs,
    borderTopWidth: 1,
    borderTopColor: Colors.line,
  },
  gridPriceWrap: {
    flex: 1,
  },
  gridPrice: {
    fontSize: FontSize.md,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.green700,
  },
  gridActionWrap: {
    alignItems: 'flex-end',
  },
  gridOutOfStockBadge: {
    backgroundColor: 'rgba(225, 96, 74, 0.1)',
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: Radius.chip,
  },
  productCard: {
    backgroundColor: Colors.card,
    borderRadius: Radius.card,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.line,
    ...Shadow.card,
  },
  productCardInCart: {
    borderColor: Colors.green500,
    borderWidth: 1.5,
    backgroundColor: '#FAFCF9',
  },
  productCardOutOfStock: {
    opacity: 0.6,
  },
  inCartIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: Spacing.sm,
    gap: 5,
  },
  inCartIndicatorText: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_700Bold',
    color: Colors.green700,
  },
  productMainRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.sm,
  },
  productImgWrapper: {
    position: 'relative',
    width: 82,
    height: 82,
    borderRadius: Radius.md,
    backgroundColor: Colors.cream,
    borderWidth: 1,
    borderColor: Colors.line,
    overflow: 'hidden',
  },
  productImg: {
    width: '100%',
    height: '100%',
  },
  imgBadgeOffer: {
    position: 'absolute',
    top: 4,
    left: 4,
    backgroundColor: '#DC2626',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  imgBadgeCan: {
    position: 'absolute',
    top: 4,
    left: 4,
    backgroundColor: '#0284C7',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  imgBadgePopular: {
    position: 'absolute',
    top: 4,
    left: 4,
    backgroundColor: '#D97706',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  imgBadgeText: {
    fontSize: 9,
    fontFamily: 'Manrope_800ExtraBold',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  imgBadgeSoldOut: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imgBadgeSoldOutText: {
    fontSize: 10,
    fontFamily: 'Manrope_800ExtraBold',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  productInfo: {
    flex: 1,
    justifyContent: 'space-between',
  },
  productMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  categoryBadge: {
    fontSize: 10,
    fontFamily: 'Manrope_700Bold',
    color: Colors.inkSoft,
    letterSpacing: 0.5,
  },
  deliverySpeedTag: {
    fontSize: 10,
    fontFamily: 'Manrope_700Bold',
    color: Colors.green700,
  },
  productName: {
    fontSize: FontSize.md,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.ink,
    lineHeight: 20,
    marginBottom: 4,
  },
  unitBadge: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.cream,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  unitBadgeText: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.inkSoft,
  },
  productBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.line,
  },
  productPriceWrap: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  productPrice: {
    fontSize: FontSize.lg,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.green700,
  },
  productPriceSub: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
  },
  productActionWrap: {
    alignItems: 'flex-end',
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
  loadMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.card,
    borderRadius: Radius.button,
    paddingVertical: 14,
    paddingHorizontal: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.line,
    marginTop: Spacing.xs,
    gap: 8,
    ...Shadow.card,
  },
  loadMoreText: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_700Bold',
    color: Colors.green700,
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
