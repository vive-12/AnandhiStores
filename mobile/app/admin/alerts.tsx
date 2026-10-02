// app/admin/alerts.tsx — Admin Operations Dashboard & Order Management
import React, { useState, useMemo, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  Linking,
  Platform,
  RefreshControl,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import RNBottomSheet from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Colors, Spacing, Radius, FontSize, Shadow, StatusColors } from '../../theme';
import { useSession } from '../../hooks/useSession';
import { useAdminOrders } from '../../hooks/useOrders';
import { useAgents } from '../../hooks/useAgents';
import { useItems } from '../../hooks/useItems';
import { useCustomers } from '../../hooks/useCustomers';
import { useSettings } from '../../hooks/useSettings';
import { assignAgent, transitionOrder, createOrder } from '../../services/orders';
import { logout } from '../../services/auth';
import { openMapChoice } from '../../utils/openMap';
import {
  ScreenHeader,
  Card,
  StatusPill,
  Button,
  BottomSheet,
  QtyStepper,
  EmptyState,
  CardSkeleton,
  NotificationBell,
  useToast,
} from '../../components/ui';
import type { Order, OrderStatus, User, OrderItem, AddressSnapshot, OrderSlot } from '../../types';

type SegmentFilter = 'all' | 'unassigned' | 'active' | 'delivered' | 'cancelled';

export default function AdminAlerts() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { uid, name: adminName, clearSession } = useSession();
  const { showToast } = useToast();

  const handleLogout = useCallback(() => {
    Alert.alert(
      'Admin Log Out',
      'Are you sure you want to sign out of the Admin panel?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log Out',
          style: 'destructive',
          onPress: async () => {
            try {
              await logout();
              clearSession();
              router.replace('/auth/login');
            } catch (err) {
              console.error('Logout error:', err);
            }
          },
        },
      ],
    );
  }, [clearSession, router]);

  // Data Hooks
  const { orders, loading: ordersLoading, error: ordersError } = useAdminOrders();
  const { agents } = useAgents();
  const { items } = useItems();
  const { customers } = useCustomers();
  const { settings } = useSettings();

  // Local UI State
  const [segment, setSegment] = useState<SegmentFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  // Selected Order for Action Sheets
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [assigningAgentId, setAssigningAgentId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Cancellation Modal State
  const [cancelModalVisible, setCancelModalVisible] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  // Manual Order Sheet State
  const [manualOrderVisible, setManualOrderVisible] = useState(false);
  const [manualCustomerMode, setManualCustomerMode] = useState<'existing' | 'walkin'>('existing');
  const [manualCustomerSearch, setManualCustomerSearch] = useState('');
  const [manualSelectedCustomer, setManualSelectedCustomer] = useState<User | null>(null);
  const [manualWalkinName, setManualWalkinName] = useState('');
  const [manualWalkinPhone, setManualWalkinPhone] = useState('');
  const [manualWalkinDoor, setManualWalkinDoor] = useState('');
  const [manualWalkinStreet, setManualWalkinStreet] = useState('');
  const [manualWalkinLocality, setManualWalkinLocality] = useState('');
  const [manualCart, setManualCart] = useState<Record<string, number>>({});
  const [manualDeliveryFee, setManualDeliveryFee] = useState('20');
  const [manualSlot, setManualSlot] = useState('ASAP');
  const [manualNotes, setManualNotes] = useState('');
  const [manualAgentId, setManualAgentId] = useState<string | null>(null);
  const [manualPlacing, setManualPlacing] = useState(false);

  // BottomSheet Refs
  const assignSheetRef = useRef<RNBottomSheet>(null);
  const detailSheetRef = useRef<RNBottomSheet>(null);

  // Agent active orders count calculation
  const agentActiveOrdersMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const a of agents) map[a.id] = 0;
    for (const o of orders) {
      if (o.agentId && (o.status === 'placed' || o.status === 'packed' || o.status === 'out_for_delivery')) {
        map[o.agentId] = (map[o.agentId] || 0) + 1;
      }
    }
    return map;
  }, [agents, orders]);

  // Online agents sorted: free first, then busy
  const sortedAgents = useMemo(() => {
    return [...agents].sort((a, b) => {
      if (a.isOnline && !b.isOnline) return -1;
      if (!a.isOnline && b.isOnline) return 1;
      const aCount = agentActiveOrdersMap[a.id] || 0;
      const bCount = agentActiveOrdersMap[b.id] || 0;
      return aCount - bCount;
    });
  }, [agents, agentActiveOrdersMap]);

  // Store & Order Stats
  const stats = useMemo(() => {
    const active = orders.filter(o => o.status !== 'delivered' && o.status !== 'cancelled');
    const today = new Date().toDateString();
    const deliveredToday = orders.filter(o => {
      if (o.status !== 'delivered' || !o.deliveredAt) return false;
      try {
        const timeMs = o.deliveredAt.toMillis ? o.deliveredAt.toMillis() : new Date(o.deliveredAt as any).getTime();
        return new Date(timeMs).toDateString() === today;
      } catch (_) {
        return false;
      }
    }).length;

    const freeAgents = agents.filter(a => a.isOnline && (agentActiveOrdersMap[a.id] || 0) === 0).length;

    return {
      total: orders.length,
      active: active.length,
      deliveredToday,
      freeAgents,
    };
  }, [orders, agents, agentActiveOrdersMap]);

  // Unassigned placed orders
  const unassignedOrders = useMemo(() => {
    return orders.filter(o => o.status === 'placed' && !o.agentId);
  }, [orders]);

  // Filtered orders list
  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      // Segment filter
      if (segment === 'unassigned' && (order.status !== 'placed' || order.agentId)) return false;
      if (segment === 'active' && (order.status === 'delivered' || order.status === 'cancelled')) return false;
      if (segment === 'delivered' && order.status !== 'delivered') return false;
      if (segment === 'cancelled' && order.status !== 'cancelled') return false;

      // Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchesNo = order.orderNo?.toLowerCase().includes(query) || order.id.toLowerCase().includes(query);
        const matchesName = order.customerName?.toLowerCase().includes(query);
        const matchesPhone = order.customerPhone?.toLowerCase().includes(query);
        return matchesNo || matchesName || matchesPhone;
      }

      return true;
    });
  }, [orders, segment, searchQuery]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 500);
  }, []);

  // Format timestamp helper
  const formatTimeAgo = (order: Order) => {
    try {
      const timeMs = order.createdAt?.toMillis ? order.createdAt.toMillis() : Date.now();
      const mins = Math.floor((Date.now() - timeMs) / 60000);
      if (mins < 1) return 'Just now';
      if (mins < 60) return `${mins}m ago`;
      const hrs = Math.floor(mins / 60);
      if (hrs < 24) return `${hrs}h ${mins % 60}m ago`;
      return `${Math.floor(hrs / 24)}d ago`;
    } catch (_) {
      return 'Recently';
    }
  };

  // Open Assign Agent Sheet
  const handleOpenAssign = (order: Order) => {
    setSelectedOrder(order);
    setAssigningAgentId(order.agentId || null);
    assignSheetRef.current?.expand();
  };

  // Open Order Detail Sheet
  const handleOpenDetail = (order: Order) => {
    setSelectedOrder(order);
    detailSheetRef.current?.expand();
  };

  // Assign agent action
  const handleConfirmAssign = async (markPacked: boolean) => {
    if (!selectedOrder || !assigningAgentId) {
      showToast('Select an agent first', 'info');
      return;
    }

    const agent = agents.find(a => a.id === assigningAgentId);
    if (!agent) {
      showToast('Agent not found', 'error');
      return;
    }

    setActionLoading(true);
    try {
      const agentFee = settings?.agentFeePerDelivery ?? 30;

      await assignAgent({
        orderId: selectedOrder.id,
        order: selectedOrder,
        agent: {
          uid: agent.id,
          name: agent.name,
          phone: agent.phone,
        },
        agentFee,
        customerId: selectedOrder.customerId,
        adminUid: uid || 'admin',
        oldAgentUid: selectedOrder.agentId,
      });

      if (markPacked && selectedOrder.status === 'placed') {
        await transitionOrder({
          orderId: selectedOrder.id,
          order: selectedOrder,
          toStatus: 'packed',
          actor: {
            uid: uid || 'admin',
            role: 'admin',
            name: adminName || 'Admin',
          },
        });
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast(
        markPacked
          ? `Assigned to ${agent.name} and marked Ready for Pickup!`
          : `Assigned to ${agent.name}`,
        'success',
      );
      assignSheetRef.current?.close();
    } catch (err: any) {
      console.error('Assign agent error:', err);
      showToast(err.message || 'Could not assign agent.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Mark order packed
  const handleMarkPacked = async (order: Order) => {
    if (order.status !== 'placed') return;

    setActionLoading(true);
    try {
      await transitionOrder({
        orderId: order.id,
        order,
        toStatus: 'packed',
        actor: {
          uid: uid || 'admin',
          role: 'admin',
          name: adminName || 'Admin',
        },
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast(`Order #${order.orderNo} marked Ready for Pickup! 📦`, 'success');
    } catch (err: any) {
      console.error('Mark packed error:', err);
      showToast(err.message || 'Could not mark order packed.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Open Cancel Dialog
  const handlePromptCancel = (order: Order) => {
    setSelectedOrder(order);
    setCancelReason('');
    setCancelModalVisible(true);
  };

  // Confirm Order Cancellation
  const handleConfirmCancel = async () => {
    if (!selectedOrder) return;
    const reason = cancelReason.trim();
    if (!reason) {
      Alert.alert('Reason Required', 'Please provide a reason for cancelling this order.');
      return;
    }

    setActionLoading(true);
    try {
      await transitionOrder({
        orderId: selectedOrder.id,
        order: selectedOrder,
        toStatus: 'cancelled',
        actor: {
          uid: uid || 'admin',
          role: 'admin',
          name: adminName || 'Admin',
        },
        cancelReason: reason,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      showToast(`Order #${selectedOrder.orderNo} cancelled`, 'info');
      setCancelModalVisible(false);
      detailSheetRef.current?.close();
    } catch (err: any) {
      console.error('Cancel order error:', err);
      showToast(err.message || 'Could not cancel order.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Manual Order Creation (P15)
  const handleCreateManualOrder = async () => {
    const cartKeys = Object.keys(manualCart).filter(k => (manualCart[k] || 0) > 0);
    if (cartKeys.length === 0) {
      Alert.alert('Items Required', 'Please add at least one item to this order.');
      return;
    }

    let customerName = '';
    let customerPhone = '';
    let customerId = 'walkin-customer';
    let addressSnapshot: AddressSnapshot;

    if (manualCustomerMode === 'existing') {
      if (!manualSelectedCustomer) {
        Alert.alert('Customer Required', 'Please search and select a customer.');
        return;
      }
      customerName = manualSelectedCustomer.name;
      customerPhone = manualSelectedCustomer.phone;
      customerId = manualSelectedCustomer.id;
      addressSnapshot = {
        door: manualSelectedCustomer.address?.door || '',
        street: manualSelectedCustomer.address?.street || '',
        locality: manualSelectedCustomer.address?.locality || '',
        city: manualSelectedCustomer.address?.city || 'Chennai',
        landmark: manualSelectedCustomer.address?.landmark || '',
        lat: manualSelectedCustomer.address?.lat ?? null,
        lng: manualSelectedCustomer.address?.lng ?? null,
      };
    } else {
      if (!manualWalkinName.trim() || !manualWalkinPhone.trim() || !manualWalkinLocality.trim()) {
        Alert.alert('Missing Details', 'Please enter customer name, phone, and locality.');
        return;
      }
      customerName = manualWalkinName.trim();
      customerPhone = manualWalkinPhone.trim();
      addressSnapshot = {
        door: manualWalkinDoor.trim(),
        street: manualWalkinStreet.trim(),
        locality: manualWalkinLocality.trim(),
        city: 'Chennai',
        landmark: '',
        lat: null,
        lng: null,
      };
    }

    // Build Order Items
    const orderItems: OrderItem[] = [];
    let subtotal = 0;
    for (const itemId of cartKeys) {
      const item = items.find(i => i.id === itemId);
      if (item) {
        const qty = manualCart[itemId];
        const lineTotal = item.price * qty;
        subtotal += lineTotal;
        orderItems.push({
          itemId: item.id,
          name: item.name,
          unit: item.unit,
          price: item.price,
          qty,
          lineTotal,
        });
      }
    }

    const fee = parseFloat(manualDeliveryFee) || 0;
    const total = subtotal + fee;

    setManualPlacing(true);
    try {
      const slot: OrderSlot = {
        type: (manualSlot || '').toLowerCase().includes('asap') ? 'asap' : 'scheduled',
        label: manualSlot,
      };

      const newOrderId = await createOrder({
        actor: {
          uid: uid || 'admin',
          role: 'admin',
          name: adminName || 'Admin',
        },
        items: orderItems,
        addressSnapshot,
        customerName,
        customerPhone,
        customerId,
        subtotal,
        deliveryFee: fee,
        total,
        slot,
        notes: manualNotes.trim(),
        source: 'admin_manual',
        adminUid: uid || 'admin',
      });

      // If an agent was pre-selected, assign immediately
      if (manualAgentId) {
        const ag = agents.find(a => a.id === manualAgentId);
        if (ag) {
          const fakeOrder = {
            id: newOrderId,
            orderNo: 'AS-NEW',
            customerId,
            customerName,
            customerPhone,
            addressSnapshot,
            items: orderItems,
            subtotal,
            deliveryFee: fee,
            total,
            paymentMethod: 'COD' as const,
            slot,
            notes: manualNotes.trim(),
            status: 'placed' as const,
            agentId: null,
            agentName: null,
            agentPhone: null,
            agentFee: null,
            source: 'admin_manual' as const,
            cancelReason: null,
            cancelledBy: null,
            statusHistory: [],
            createdAt: {} as any,
            updatedAt: {} as any,
            packedAt: null,
            pickedUpAt: null,
            deliveredAt: null,
            cancelledAt: null,
          };
          await assignAgent({
            orderId: newOrderId,
            order: fakeOrder,
            agent: { uid: ag.id, name: ag.name, phone: ag.phone },
            agentFee: settings?.agentFeePerDelivery ?? 30,
            customerId,
            adminUid: uid || 'admin',
            oldAgentUid: null,
          });
        }
      }

      showToast('Manual order created successfully! 📝', 'success');
      setManualOrderVisible(false);
      setManualCart({});
      setManualSelectedCustomer(null);
      setManualWalkinName('');
      setManualWalkinPhone('');
      setManualWalkinLocality('');
    } catch (err: any) {
      console.error('Manual order error:', err);
      showToast(err.message || 'Could not create order.', 'error');
    } finally {
      setManualPlacing(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* ─── Top Admin Header (supports Notch & Dynamic Island) ──────────── */}
      <View style={[styles.topHeader, { paddingTop: insets.top + Spacing.xs }]}>
        <View>
          <Text style={styles.adminTitle}>Anandhi Stores</Text>
          <Text style={styles.adminSub}>Live Store Operations & Orders</Text>
        </View>

        <View style={styles.headerRightBtns}>
          <TouchableOpacity
            style={styles.manualOrderBtn}
            onPress={() => setManualOrderVisible(true)}
            activeOpacity={0.8}
          >
            <Text style={styles.manualOrderBtnText}>+ New Order</Text>
          </TouchableOpacity>

          <NotificationBell color="#FFFFFF" />

          <TouchableOpacity
            style={styles.settingsIconBtn}
            onPress={() => router.push('/admin/settings')}
            hitSlop={8}
          >
            <Text style={{ fontSize: 20 }}>⚙️</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.logoutIconBtn}
            onPress={handleLogout}
            hitSlop={8}
            activeOpacity={0.8}
            accessibilityLabel="Log Out"
          >
            <Ionicons name="log-out-outline" size={18} color="#EF4444" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
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
        {/* ─── Stats Grid (Tappable Filters) ──────────────────────────────── */}
        <View style={styles.statsGrid}>
          <TouchableOpacity
            style={[styles.statBox, segment === 'all' && styles.statBoxActive]}
            onPress={() => setSegment('all')}
            activeOpacity={0.7}
          >
            <Text style={[styles.statVal, { color: '#0ea5e9' }]}>{stats.total}</Text>
            <Text style={styles.statLabel}>Total Orders</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.statBox, segment === 'active' && styles.statBoxActive]}
            onPress={() => setSegment('active')}
            activeOpacity={0.7}
          >
            <Text style={[styles.statVal, { color: '#6366f1' }]}>{stats.active}</Text>
            <Text style={styles.statLabel}>Active Orders</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.statBox, segment === 'delivered' && styles.statBoxActive]}
            onPress={() => setSegment('delivered')}
            activeOpacity={0.7}
          >
            <Text style={[styles.statVal, { color: '#10b981' }]}>{stats.deliveredToday}</Text>
            <Text style={styles.statLabel}>Today Delivered</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.statBox, segment === 'unassigned' && styles.statBoxActive]}
            onPress={() => setSegment('unassigned')}
            activeOpacity={0.7}
          >
            <Text style={[styles.statVal, { color: Colors.amber }]}>{unassignedOrders.length}</Text>
            <Text style={styles.statLabel}>Unassigned</Text>
          </TouchableOpacity>
        </View>

        {/* ─── Unassigned Orders Urgent Banner ────────────────────────────── */}
        {unassignedOrders.length > 0 && segment !== 'unassigned' && (
          <TouchableOpacity
            style={styles.urgentBanner}
            onPress={() => setSegment('unassigned')}
            activeOpacity={0.9}
          >
            <Text style={styles.urgentIcon}>🚨</Text>
            <View style={styles.urgentTextWrap}>
              <Text style={styles.urgentTitle}>
                {unassignedOrders.length} Unassigned Order{unassignedOrders.length > 1 ? 's' : ''}
              </Text>
              <Text style={styles.urgentSub}>Tap to assign delivery agents immediately</Text>
            </View>
            <Text style={styles.urgentArrow}>➔</Text>
          </TouchableOpacity>
        )}

        {/* ─── Search Bar ─────────────────────────────────────────────────── */}
        <View style={styles.searchBar}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search by Order #, Customer Name, Phone..."
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

        {/* ─── Filter Segments Pills ──────────────────────────────────────── */}
        <View style={styles.segmentsRow}>
          {(['all', 'unassigned', 'active', 'delivered', 'cancelled'] as SegmentFilter[]).map(seg => (
            <TouchableOpacity
              key={seg}
              style={[styles.segChip, segment === seg && styles.segChipActive]}
              onPress={() => setSegment(seg)}
            >
              <Text style={[styles.segChipText, segment === seg && styles.segChipTextActive]}>
                {seg.charAt(0).toUpperCase() + seg.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ─── Loading Skeletons ───────────────────────────────────────────── */}
        {ordersLoading && (
          <View style={styles.skeletonsWrap}>
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </View>
        )}

        {/* ─── Empty State ────────────────────────────────────────────────── */}
        {!ordersLoading && filteredOrders.length === 0 && (
          <EmptyState
            title="No orders found"
            subtitle={
              searchQuery
                ? `No orders matching "${searchQuery}".`
                : `There are currently no orders in the "${segment}" view.`
            }
            actionLabel="Reset Filter"
            onAction={() => {
              setSegment('all');
              setSearchQuery('');
            }}
          />
        )}

        {/* ─── Orders List ────────────────────────────────────────────────── */}
        {!ordersLoading && filteredOrders.length > 0 && (
          <View style={styles.ordersList}>
            {filteredOrders.map(order => {
              const isPlaced = order.status === 'placed';
              const isPacked = order.status === 'packed';
              const isDelivered = order.status === 'delivered';
              const isCancelled = order.status === 'cancelled';
              const isUnassigned = !order.agentId && !isDelivered && !isCancelled;

              return (
                <View
                  key={order.id}
                  style={[
                    styles.orderCard,
                    isUnassigned && styles.orderCardUnassigned,
                  ]}
                >
                  {/* Card Header: Order No, Elapsed Time, Status */}
                  <View style={styles.cardHeader}>
                    <View>
                      <View style={styles.orderNoRow}>
                        <Text style={styles.orderNo}>Order #{order.orderNo}</Text>
                        {order.source === 'admin_manual' && (
                          <View style={styles.manualBadge}>
                            <Text style={styles.manualBadgeText}>Manual</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.elapsedTime}>{formatTimeAgo(order)}</Text>
                    </View>

                    <StatusPill status={order.status} />
                  </View>

                  <View style={styles.divider} />

                  {/* Customer Info & Quick Phone Call */}
                  <View style={styles.customerRow}>
                    <View style={styles.customerLeft}>
                      <Text style={styles.customerName}>{order.customerName}</Text>
                      <Text style={styles.customerPhone}>+91 {order.customerPhone}</Text>
                    </View>

                    {order.customerPhone ? (
                      <TouchableOpacity
                        style={styles.callBtn}
                        onPress={() => Linking.openURL(`tel:${order.customerPhone}`)}
                      >
                        <Text style={styles.callBtnText}>📞 Call</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>

                  {/* Address Snapshot with Maps Launcher */}
                  <View style={styles.addressRow}>
                    <Text style={styles.addressText} numberOfLines={2}>
                      📍 {[
                        order.addressSnapshot?.door,
                        order.addressSnapshot?.street,
                        order.addressSnapshot?.locality,
                      ]
                        .filter(Boolean)
                        .join(', ') || 'Address not specified'}
                    </Text>

                    <TouchableOpacity
                      style={styles.mapBtn}
                      onPress={() =>
                        openMapChoice(
                          order.addressSnapshot?.lat,
                          order.addressSnapshot?.lng,
                          order.customerName,
                        )
                      }
                    >
                      <Text style={styles.mapBtnText}>Maps ↗</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Items Summary & Total COD */}
                  <View style={styles.itemsSummaryBox}>
                    <Text style={styles.itemsSummaryText} numberOfLines={1}>
                      {order.items?.map(i => `${i.qty}× ${i.name}`).join(', ') || 'Items'}
                    </Text>
                    <Text style={styles.totalAmount}>₹{order.total} (COD)</Text>
                  </View>

                  {/* Delivery Partner Box */}
                  <View style={styles.agentBox}>
                    <View style={styles.agentBoxLeft}>
                      <Text style={styles.agentIcon}>{order.agentName ? '🚴' : '⏳'}</Text>
                      <View>
                        <Text style={styles.agentLabel}>
                          {order.agentName ? 'Assigned Partner' : 'Partner Status'}
                        </Text>
                        <Text style={styles.agentName}>
                          {order.agentName ? `${order.agentName}` : 'Unassigned'}
                        </Text>
                      </View>
                    </View>

                    {order.agentPhone && (
                      <TouchableOpacity
                        style={styles.agentCallBtn}
                        onPress={() => Linking.openURL(`tel:${order.agentPhone}`)}
                      >
                        <Text style={styles.agentCallText}>📞</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Operational Action Buttons */}
                  <View style={styles.actionsGrid}>
                    {/* Assign or Reassign */}
                    {!isDelivered && !isCancelled && (
                      <TouchableOpacity
                        style={[
                          styles.actionBtn,
                          isUnassigned ? styles.actionBtnAssignUrgent : styles.actionBtnSecondary,
                        ]}
                        onPress={() => handleOpenAssign(order)}
                      >
                        <Text
                          style={
                            isUnassigned ? styles.actionBtnTextUrgent : styles.actionBtnTextSecondary
                          }
                        >
                          {order.agentId ? 'Reassign Agent' : 'Assign Agent ➔'}
                        </Text>
                      </TouchableOpacity>
                    )}

                    {/* Mark Packed */}
                    {isPlaced && (
                      <TouchableOpacity
                        style={[styles.actionBtn, styles.actionBtnPacked]}
                        onPress={() => handleMarkPacked(order)}
                      >
                        <Text style={styles.actionBtnTextPacked}>Ready for Pickup 📦</Text>
                      </TouchableOpacity>
                    )}

                    {/* Cancel Order */}
                    {!isDelivered && !isCancelled && (
                      <TouchableOpacity
                        style={[styles.actionBtn, styles.actionBtnCancel]}
                        onPress={() => handlePromptCancel(order)}
                      >
                        <Text style={styles.actionBtnTextCancel}>Cancel ✕</Text>
                      </TouchableOpacity>
                    )}

                    {/* Order Details */}
                    <TouchableOpacity
                      style={[styles.actionBtn, styles.actionBtnDetails]}
                      onPress={() => handleOpenDetail(order)}
                    >
                      <Text style={styles.actionBtnTextDetails}>Details ℹ️</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* ─── Assign Agent BottomSheet ─────────────────────────────────────── */}
      <BottomSheet
        ref={assignSheetRef}
        title={selectedOrder?.agentId ? 'Reassign Delivery Agent' : 'Assign Delivery Agent'}
        snapPoints={['55%', '85%']}
      >
        <View style={styles.sheetContent}>
          {selectedOrder && (
            <View style={styles.sheetOrderSummary}>
              <Text style={styles.sheetOrderNo}>
                Order #{selectedOrder.orderNo} • ₹{selectedOrder.total}
              </Text>
              <Text style={styles.sheetCustomer}>
                {selectedOrder.customerName} ({selectedOrder.addressSnapshot?.locality || 'Chennai'})
              </Text>
            </View>
          )}

          <Text style={styles.sheetSubtitle}>Choose from registered delivery partners:</Text>

          {/* Agents List */}
          <ScrollView style={styles.sheetAgentList}>
            {sortedAgents.map(ag => {
              const activeCount = agentActiveOrdersMap[ag.id] || 0;
              const isSelected = assigningAgentId === ag.id;
              const isOnline = ag.isOnline;

              return (
                <TouchableOpacity
                  key={ag.id}
                  style={[
                    styles.agentSelectRow,
                    isSelected && styles.agentSelectRowActive,
                    !isOnline && styles.agentSelectRowOffline,
                  ]}
                  disabled={!isOnline}
                  onPress={() => setAssigningAgentId(ag.id)}
                >
                  <View style={styles.agentSelectLeft}>
                    <Text style={styles.agentSelectAvatar}>{isOnline ? '🟢' : '⚪'}</Text>
                    <View>
                      <Text style={styles.agentSelectName}>{ag.name}</Text>
                      <Text style={styles.agentSelectPhone}>+91 {ag.phone}</Text>
                    </View>
                  </View>

                  <View style={styles.agentSelectRight}>
                    {isOnline ? (
                      activeCount === 0 ? (
                        <View style={styles.freeBadge}>
                          <Text style={styles.freeBadgeText}>FREE</Text>
                        </View>
                      ) : (
                        <Text style={styles.activeOrdersBadge}>{activeCount} active</Text>
                      )
                    ) : (
                      <Text style={styles.offlineText}>Offline</Text>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Action Buttons */}
          <View style={styles.sheetButtonsWrap}>
            <Button
              label={actionLoading ? 'Assigning...' : 'Assign Agent'}
              variant="secondary"
              disabled={actionLoading || !assigningAgentId}
              onPress={() => handleConfirmAssign(false)}
            />

            {selectedOrder?.status === 'placed' && (
              <Button
                label={actionLoading ? 'Saving...' : 'Assign & Mark Ready'}
                variant="primary"
                disabled={actionLoading || !assigningAgentId}
                onPress={() => handleConfirmAssign(true)}
              />
            )}
          </View>
        </View>
      </BottomSheet>

      {/* ─── Order Detail BottomSheet ──────────────────────────────────────── */}
      <BottomSheet
        ref={detailSheetRef}
        title="Order Details"
        snapPoints={['65%', '90%']}
      >
        <View style={styles.sheetContent}>
          {selectedOrder && (
            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Header Info */}
              <View style={styles.detailHeader}>
                <View>
                  <Text style={styles.detailOrderNo}>Order #{selectedOrder.orderNo}</Text>
                  <Text style={styles.detailDate}>Placed {formatTimeAgo(selectedOrder)}</Text>
                </View>
                <StatusPill status={selectedOrder.status} />
              </View>

              {/* Customer Card */}
              <View style={styles.detailSectionCard}>
                <Text style={styles.detailSectionTitle}>Customer & Address</Text>
                <Text style={styles.detailTextBold}>{selectedOrder.customerName}</Text>
                <Text style={styles.detailText}>+91 {selectedOrder.customerPhone}</Text>
                <Text style={styles.detailText}>
                  📍 {[
                    selectedOrder.addressSnapshot?.door,
                    selectedOrder.addressSnapshot?.street,
                    selectedOrder.addressSnapshot?.locality,
                    selectedOrder.addressSnapshot?.city,
                    selectedOrder.addressSnapshot?.landmark && `(Near ${selectedOrder.addressSnapshot.landmark})`,
                  ]
                    .filter(Boolean)
                    .join(', ')}
                </Text>
              </View>

              {/* Items Breakdown */}
              <View style={styles.detailSectionCard}>
                <Text style={styles.detailSectionTitle}>Items Ordered</Text>
                {selectedOrder.items?.map((item, idx) => (
                  <View key={`${item.itemId}-${idx}`} style={styles.detailItemRow}>
                    <Text style={styles.detailItemName}>
                      {item.name} ({item.unit}) × {item.qty}
                    </Text>
                    <Text style={styles.detailItemTotal}>₹{item.lineTotal || item.qty * item.price}</Text>
                  </View>
                ))}

                <View style={styles.divider} />

                <View style={styles.detailBillRow}>
                  <Text style={styles.detailBillLabel}>Subtotal</Text>
                  <Text style={styles.detailBillVal}>₹{selectedOrder.subtotal}</Text>
                </View>
                <View style={styles.detailBillRow}>
                  <Text style={styles.detailBillLabel}>Delivery Fee</Text>
                  <Text style={styles.detailBillVal}>
                    {selectedOrder.deliveryFee === 0 ? 'FREE' : `₹${selectedOrder.deliveryFee}`}
                  </Text>
                </View>
                <View style={styles.detailBillRowTotal}>
                  <Text style={styles.detailBillTotalLabel}>Total (Cash on Delivery)</Text>
                  <Text style={styles.detailBillTotalVal}>₹{selectedOrder.total}</Text>
                </View>
              </View>

              {/* Delivery Partner */}
              <View style={styles.detailSectionCard}>
                <Text style={styles.detailSectionTitle}>Delivery Partner</Text>
                <Text style={styles.detailTextBold}>
                  {selectedOrder.agentName ? `${selectedOrder.agentName}` : 'No partner assigned'}
                </Text>
                {selectedOrder.agentPhone && (
                  <Text style={styles.detailText}>+91 {selectedOrder.agentPhone}</Text>
                )}
              </View>

              {/* Status History Timeline */}
              <View style={styles.detailSectionCard}>
                <Text style={styles.detailSectionTitle}>Status Audit Log</Text>
                {selectedOrder.statusHistory?.map((entry, idx) => (
                  <View key={idx} style={styles.historyRow}>
                    <Text style={styles.historyDot}>●</Text>
                    <View style={styles.historyContent}>
                      <Text style={styles.historyStatus}>
                        {entry.status.toUpperCase()} by {entry.byRole}
                      </Text>
                      <Text style={styles.historyTime}>
                        {entry.at && typeof entry.at.toDate === 'function'
                          ? entry.at.toDate().toLocaleString()
                          : 'Recorded'}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>

              {/* Cancel Reason if Cancelled */}
              {selectedOrder.status === 'cancelled' && (
                <View style={styles.cancelledBox}>
                  <Text style={styles.cancelledBoxTitle}>Cancellation Reason:</Text>
                  <Text style={styles.cancelledBoxText}>
                    {selectedOrder.cancelReason || 'No reason specified'}
                  </Text>
                </View>
              )}
            </ScrollView>
          )}
        </View>
      </BottomSheet>

      {/* ─── Cancel Order Modal ───────────────────────────────────────────── */}
      <Modal visible={cancelModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Cancel Order #{selectedOrder?.orderNo}</Text>
            <Text style={styles.modalSub}>
              Please enter the reason for cancellation. This will be visible to the customer.
            </Text>

            <TextInput
              style={styles.modalInput}
              placeholder="e.g. Out of stock, Customer requested, Address unreachable"
              placeholderTextColor={Colors.inkSoft}
              value={cancelReason}
              onChangeText={setCancelReason}
              multiline
              numberOfLines={3}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setCancelModalVisible(false)}
              >
                <Text style={styles.modalCancelBtnText}>Dismiss</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalConfirmBtn}
                onPress={handleConfirmCancel}
                disabled={actionLoading}
              >
                <Text style={styles.modalConfirmBtnText}>
                  {actionLoading ? 'Cancelling...' : 'Confirm Cancel'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ─── Manual Order Modal (P15) ─────────────────────────────────────── */}
      <Modal visible={manualOrderVisible} animationType="slide">
        <View style={styles.manualModalContainer}>
          <ScreenHeader
            title="Create Manual Order"
            subtitle="Phone order / Walk-in order flow"
            showBack
            onBack={() => setManualOrderVisible(false)}
            right={
              <TouchableOpacity onPress={() => setManualOrderVisible(false)}>
                <Text style={{ color: '#fff', fontSize: 16 }}>Close</Text>
              </TouchableOpacity>
            }
          />

          <ScrollView style={styles.manualScroll} contentContainerStyle={styles.manualContent}>
            {/* Customer Mode Switch */}
            <View style={styles.modeTabs}>
              <TouchableOpacity
                style={[styles.modeTab, manualCustomerMode === 'existing' && styles.modeTabActive]}
                onPress={() => setManualCustomerMode('existing')}
              >
                <Text style={[styles.modeTabText, manualCustomerMode === 'existing' && styles.modeTabTextActive]}>
                  Existing Customer
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modeTab, manualCustomerMode === 'walkin' && styles.modeTabActive]}
                onPress={() => setManualCustomerMode('walkin')}
              >
                <Text style={[styles.modeTabText, manualCustomerMode === 'walkin' && styles.modeTabTextActive]}>
                  Walk-in / Phone
                </Text>
              </TouchableOpacity>
            </View>

            {/* Existing Customer Selector */}
            {manualCustomerMode === 'existing' ? (
              <View style={styles.formCard}>
                <Text style={styles.formTitle}>Select Customer</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Search customer by name or phone..."
                  placeholderTextColor={Colors.inkSoft}
                  value={manualCustomerSearch}
                  onChangeText={setManualCustomerSearch}
                />

                <ScrollView style={{ maxHeight: 150, marginTop: 8 }}>
                  {customers
                    .filter(
                      c =>
                        (c.name || '').toLowerCase().includes((manualCustomerSearch || '').toLowerCase()) ||
                        (c.phone || '').includes(manualCustomerSearch || ''),
                    )
                    .slice(0, 5)
                    .map(cust => (
                      <TouchableOpacity
                        key={cust.id}
                        style={[
                          styles.custRow,
                          manualSelectedCustomer?.id === cust.id && styles.custRowActive,
                        ]}
                        onPress={() => setManualSelectedCustomer(cust)}
                      >
                        <Text style={styles.custRowName}>{cust.name}</Text>
                        <Text style={styles.custRowPhone}>+91 {cust.phone}</Text>
                      </TouchableOpacity>
                    ))}
                </ScrollView>
              </View>
            ) : (
              <View style={styles.formCard}>
                <Text style={styles.formTitle}>Walk-in Customer Details</Text>
                <TextInput
                  style={[styles.input, { marginBottom: 8 }]}
                  placeholder="Customer Full Name *"
                  placeholderTextColor={Colors.inkSoft}
                  value={manualWalkinName}
                  onChangeText={setManualWalkinName}
                />
                <TextInput
                  style={[styles.input, { marginBottom: 8 }]}
                  placeholder="Phone Number (10 digits) *"
                  placeholderTextColor={Colors.inkSoft}
                  keyboardType="numeric"
                  value={manualWalkinPhone}
                  onChangeText={setManualWalkinPhone}
                />
                <TextInput
                  style={[styles.input, { marginBottom: 8 }]}
                  placeholder="Door / Flat No."
                  placeholderTextColor={Colors.inkSoft}
                  value={manualWalkinDoor}
                  onChangeText={setManualWalkinDoor}
                />
                <TextInput
                  style={[styles.input, { marginBottom: 8 }]}
                  placeholder="Street / Road"
                  placeholderTextColor={Colors.inkSoft}
                  value={manualWalkinStreet}
                  onChangeText={setManualWalkinStreet}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Locality / Area *"
                  placeholderTextColor={Colors.inkSoft}
                  value={manualWalkinLocality}
                  onChangeText={setManualWalkinLocality}
                />
              </View>
            )}

            {/* Item Picker */}
            <View style={styles.formCard}>
              <Text style={styles.formTitle}>Add Items to Order</Text>
              {items
                .filter(i => !i.isDeleted)
                .map(item => {
                  const qty = manualCart[item.id] || 0;
                  return (
                    <View key={item.id} style={styles.manualItemRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.manualItemName}>{item.name}</Text>
                        <Text style={styles.manualItemUnit}>
                          {item.unit} • ₹{item.price}
                        </Text>
                      </View>
                      <QtyStepper
                        qty={qty}
                        onAdd={() => setManualCart(prev => ({ ...prev, [item.id]: 1 }))}
                        onIncrement={() =>
                          setManualCart(prev => ({ ...prev, [item.id]: (prev[item.id] || 0) + 1 }))
                        }
                        onDecrement={() =>
                          setManualCart(prev => ({
                            ...prev,
                            [item.id]: Math.max(0, (prev[item.id] || 0) - 1),
                          }))
                        }
                      />
                    </View>
                  );
                })}
            </View>

            {/* Bill & Options */}
            <View style={styles.formCard}>
              <Text style={styles.formTitle}>Delivery Fee & Slot</Text>
              <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Delivery Fee (₹)</Text>
                  <TextInput
                    style={styles.input}
                    value={manualDeliveryFee}
                    onChangeText={setManualDeliveryFee}
                    keyboardType="numeric"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Delivery Slot</Text>
                  <TextInput
                    style={styles.input}
                    value={manualSlot}
                    onChangeText={setManualSlot}
                  />
                </View>
              </View>

              <Text style={styles.fieldLabel}>Order Notes</Text>
              <TextInput
                style={styles.input}
                placeholder="Optional delivery instructions"
                placeholderTextColor={Colors.inkSoft}
                value={manualNotes}
                onChangeText={setManualNotes}
              />
            </View>

            {/* Create Button */}
            <View style={{ marginTop: 8, marginBottom: 40 }}>
              <Button
                label={manualPlacing ? 'Placing Order...' : 'Create Order (Cash on Delivery)'}
                variant="primary"
                loading={manualPlacing}
                disabled={manualPlacing}
                onPress={handleCreateManualOrder}
              />
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.cream,
  },
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.card,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.line,
  },
  adminTitle: {
    fontSize: FontSize.lg,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.green900,
  },
  adminSub: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
    marginTop: 1,
  },
  headerRightBtns: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  manualOrderBtn: {
    backgroundColor: Colors.green700,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderRadius: Radius.button,
  },
  manualOrderBtnText: {
    color: '#ffffff',
    fontFamily: 'Manrope_600SemiBold',
    fontSize: FontSize.xs,
  },
  settingsIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.cream,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.line,
  },
  logoutIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
    gap: Spacing.lg,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  statBox: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: Radius.card,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.card,
  },
  statBoxActive: {
    borderColor: Colors.green700,
    backgroundColor: '#EAF8F0',
  },
  statVal: {
    fontSize: FontSize.xl,
    fontFamily: 'Manrope_800ExtraBold',
  },
  statLabel: {
    fontSize: 10,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.inkSoft,
    marginTop: 2,
    textAlign: 'center',
  },
  urgentBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF4E5',
    borderWidth: 1,
    borderColor: Colors.amber,
    borderRadius: Radius.card,
    padding: Spacing.md,
    gap: Spacing.md,
  },
  urgentIcon: {
    fontSize: 24,
  },
  urgentTextWrap: {
    flex: 1,
  },
  urgentTitle: {
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_800ExtraBold',
    color: '#8A5800',
  },
  urgentSub: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_500Medium',
    color: '#8A5800',
    marginTop: 2,
  },
  urgentArrow: {
    fontSize: 18,
    color: '#8A5800',
    fontFamily: 'Manrope_800ExtraBold',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: Radius.button,
    paddingHorizontal: Spacing.md,
    height: 44,
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
  segmentsRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  segChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radius.chip,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  segChipActive: {
    backgroundColor: Colors.green700,
    borderColor: Colors.green700,
  },
  segChipText: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.ink,
  },
  segChipTextActive: {
    color: '#ffffff',
  },
  skeletonsWrap: {
    gap: Spacing.md,
  },
  ordersList: {
    gap: Spacing.lg,
  },
  orderCard: {
    backgroundColor: Colors.card,
    borderRadius: Radius.card,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.line,
    marginBottom: Spacing.md,
    ...Shadow.card,
  },
  orderCardUnassigned: {
    borderColor: Colors.amber,
    borderWidth: 1.5,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  orderNoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  orderNo: {
    fontSize: FontSize.md,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.ink,
  },
  manualBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  manualBadgeText: {
    fontSize: 10,
    fontFamily: 'Manrope_600SemiBold',
    color: '#1D4ED8',
  },
  elapsedTime: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.line,
    marginVertical: Spacing.md,
  },
  customerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  customerLeft: {
    flex: 1,
  },
  customerName: {
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.ink,
  },
  customerPhone: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
    marginTop: 1,
  },
  callBtn: {
    backgroundColor: '#EAF8F0',
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radius.chip,
    borderWidth: 1,
    borderColor: Colors.green500,
  },
  callBtnText: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.green700,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.cream,
    padding: Spacing.sm,
    borderRadius: Radius.sm,
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  addressText: {
    flex: 1,
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_500Medium',
    color: Colors.ink,
  },
  mapBtn: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  mapBtnText: {
    fontSize: 11,
    fontFamily: 'Manrope_600SemiBold',
    color: '#1D4ED8',
  },
  itemsSummaryBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  itemsSummaryText: {
    flex: 1,
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
    marginRight: Spacing.md,
  },
  totalAmount: {
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.green700,
  },
  agentBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.cream,
    padding: Spacing.sm,
    borderRadius: Radius.sm,
    marginBottom: Spacing.md,
  },
  agentBoxLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  agentIcon: {
    fontSize: 20,
  },
  agentLabel: {
    fontSize: 10,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
    textTransform: 'uppercase',
  },
  agentName: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.ink,
  },
  agentCallBtn: {
    padding: 6,
    borderRadius: 14,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: Colors.line,
  },
  agentCallText: {
    fontSize: 14,
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  actionBtn: {
    width: '48%',
    flexGrow: 1,
    paddingVertical: 10,
    borderRadius: Radius.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnAssignUrgent: {
    backgroundColor: Colors.amber,
  },
  actionBtnTextUrgent: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.ink,
  },
  actionBtnSecondary: {
    backgroundColor: Colors.cream,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  actionBtnTextSecondary: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.ink,
  },
  actionBtnPacked: {
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#6366F1',
  },
  actionBtnTextPacked: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_800ExtraBold',
    color: '#4F46E5',
  },
  actionBtnCancel: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: Colors.coral,
  },
  actionBtnTextCancel: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.coral,
  },
  actionBtnDetails: {
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  actionBtnTextDetails: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.inkSoft,
  },
  sheetContent: {
    padding: Spacing.lg,
  },
  sheetOrderSummary: {
    backgroundColor: Colors.cream,
    padding: Spacing.md,
    borderRadius: Radius.sm,
    marginBottom: Spacing.md,
  },
  sheetOrderNo: {
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.ink,
  },
  sheetCustomer: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
    marginTop: 2,
  },
  sheetSubtitle: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.inkSoft,
    marginBottom: Spacing.sm,
  },
  sheetAgentList: {
    maxHeight: 280,
    marginBottom: Spacing.lg,
  },
  agentSelectRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: Radius.sm,
    backgroundColor: Colors.cream,
    borderWidth: 1,
    borderColor: Colors.line,
    marginBottom: Spacing.xs,
  },
  agentSelectRowActive: {
    borderColor: Colors.green700,
    backgroundColor: '#EAF8F0',
  },
  agentSelectRowOffline: {
    opacity: 0.5,
  },
  agentSelectLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  agentSelectAvatar: {
    fontSize: 14,
  },
  agentSelectName: {
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.ink,
  },
  agentSelectPhone: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
  },
  agentSelectRight: {},
  freeBadge: {
    backgroundColor: '#EAF8F0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.chip,
  },
  freeBadgeText: {
    fontSize: 10,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.green500,
  },
  activeOrdersBadge: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_600SemiBold',
    color: '#6366f1',
  },
  offlineText: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
  },
  sheetButtonsWrap: {
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  detailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.lg,
  },
  detailOrderNo: {
    fontSize: FontSize.lg,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.ink,
  },
  detailDate: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
    marginTop: 2,
  },
  detailSectionCard: {
    backgroundColor: Colors.cream,
    borderRadius: Radius.sm,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  detailSectionTitle: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.inkSoft,
    textTransform: 'uppercase',
    marginBottom: Spacing.sm,
  },
  detailTextBold: {
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.ink,
  },
  detailText: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_500Medium',
    color: Colors.ink,
    marginTop: 2,
  },
  detailItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  detailItemName: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.ink,
  },
  detailItemTotal: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.ink,
  },
  detailBillRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  detailBillLabel: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
  },
  detailBillVal: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.ink,
  },
  detailBillRowTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  detailBillTotalLabel: {
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.ink,
  },
  detailBillTotalVal: {
    fontSize: FontSize.md,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.green700,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    marginBottom: 8,
  },
  historyDot: {
    fontSize: 10,
    color: Colors.green700,
    marginTop: 2,
  },
  historyContent: {
    flex: 1,
  },
  historyStatus: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.ink,
  },
  historyTime: {
    fontSize: 10,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
  },
  cancelledBox: {
    backgroundColor: '#FEF2F2',
    padding: Spacing.md,
    borderRadius: Radius.sm,
    marginBottom: Spacing.xl,
  },
  cancelledBoxTitle: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.coral,
  },
  cancelledBoxText: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_500Medium',
    color: Colors.coral,
    marginTop: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  modalCard: {
    width: '100%',
    backgroundColor: Colors.card,
    borderRadius: Radius.card,
    padding: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  modalTitle: {
    fontSize: FontSize.md,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.ink,
    marginBottom: 4,
  },
  modalSub: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
    marginBottom: Spacing.md,
  },
  modalInput: {
    backgroundColor: Colors.cream,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.line,
    padding: Spacing.md,
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_500Medium',
    color: Colors.ink,
    textAlignVertical: 'top',
    minHeight: 80,
    marginBottom: Spacing.lg,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.button,
    backgroundColor: Colors.cream,
  },
  modalCancelBtnText: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.inkSoft,
  },
  modalConfirmBtn: {
    flex: 1.5,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.button,
    backgroundColor: Colors.coral,
  },
  modalConfirmBtnText: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_800ExtraBold',
    color: '#ffffff',
  },
  manualModalContainer: {
    flex: 1,
    backgroundColor: Colors.cream,
  },
  manualScroll: {
    flex: 1,
  },
  manualContent: {
    padding: Spacing.lg,
    gap: Spacing.lg,
  },
  modeTabs: {
    flexDirection: 'row',
    backgroundColor: Colors.card,
    borderRadius: Radius.button,
    padding: 4,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  modeTab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: Radius.sm,
  },
  modeTabActive: {
    backgroundColor: Colors.green700,
  },
  modeTabText: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.ink,
  },
  modeTabTextActive: {
    color: '#ffffff',
  },
  formCard: {
    backgroundColor: Colors.card,
    borderRadius: Radius.card,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  formTitle: {
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.ink,
    marginBottom: Spacing.md,
  },
  input: {
    backgroundColor: Colors.cream,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.line,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_500Medium',
    color: Colors.ink,
  },
  custRow: {
    padding: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.line,
  },
  custRowActive: {
    backgroundColor: '#EAF8F0',
  },
  custRowName: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.ink,
  },
  custRowPhone: {
    fontSize: 10,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
  },
  manualItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.line,
  },
  manualItemName: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.ink,
  },
  manualItemUnit: {
    fontSize: 10,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
  },
  fieldLabel: {
    fontSize: 11,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.inkSoft,
    marginBottom: 4,
  },
});
