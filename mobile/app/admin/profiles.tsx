// app/admin/profiles.tsx — Customer Profiles & Lifetime Order History for Admin
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
import RNBottomSheet from '@gorhom/bottom-sheet';
import * as Haptics from 'expo-haptics';
import { Colors, Spacing, Radius, FontSize, Shadow, StatusColors } from '../../theme';
import { useSession } from '../../hooks/useSession';
import { useCustomers } from '../../hooks/useCustomers';
import { useAdminOrders } from '../../hooks/useOrders';
import { approveUserWithPin, blockUser, updateUser } from '../../services/users';
import { adminResetPin } from '../../services/auth';
import { openMapChoice } from '../../utils/openMap';
import {
  ScreenHeader,
  Card,
  StatusPill,
  Button,
  BottomSheet,
  EmptyState,
  CardSkeleton,
  useToast,
} from '../../components/ui';
import type { User, Order } from '../../types';

type ProfileTab = 'pending' | 'approved' | 'all';

export default function AdminProfiles() {
  const { showToast } = useToast();
  const { uid: adminUid } = useSession();

  // Data hooks
  const { customers, loading: customersLoading } = useCustomers();
  const { orders } = useAdminOrders();

  // Local UI State
  const [tab, setTab] = useState<ProfileTab>('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  // Modals & Sheets State
  const [selectedUserForOrders, setSelectedUserForOrders] = useState<User | null>(null);
  const [pinModalUser, setPinModalUser] = useState<User | null>(null);
  const [isApproveMode, setIsApproveMode] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // BottomSheet Ref for Customer Orders
  const customerOrdersSheetRef = useRef<RNBottomSheet>(null);

  // Map customer stats: total orders, total spent (delivered), last order date
  const customerStatsMap = useMemo(() => {
    const map: Record<
      string,
      { totalOrders: number; totalSpent: number; lastOrder: Order | null }
    > = {};

    for (const cust of customers) {
      map[cust.id] = { totalOrders: 0, totalSpent: 0, lastOrder: null };
    }

    for (const o of orders) {
      const custId = o.customerId;
      if (!map[custId]) {
        map[custId] = { totalOrders: 0, totalSpent: 0, lastOrder: null };
      }
      map[custId].totalOrders += 1;

      if (o.status === 'delivered') {
        map[custId].totalSpent += o.total;
      }

      if (!map[custId].lastOrder) {
        map[custId].lastOrder = o;
      }
    }

    return map;
  }, [customers, orders]);

  // Orders placed by selected customer
  const selectedCustomerOrders = useMemo(() => {
    if (!selectedUserForOrders) return [];
    return orders.filter(o => o.customerId === selectedUserForOrders.id);
  }, [orders, selectedUserForOrders]);

  // Tab counts
  const pendingCount = useMemo(
    () => customers.filter(c => c.status === 'pending').length,
    [customers],
  );
  const approvedCount = useMemo(
    () => customers.filter(c => c.status === 'approved' || (c as any).status === 'active').length,
    [customers],
  );

  // Filtered customer list
  const filteredCustomers = useMemo(() => {
    return customers.filter(c => {
      // Tab filter
      if (tab === 'pending' && c.status !== 'pending') return false;
      if (tab === 'approved' && c.status !== 'approved' && (c as any).status !== 'active') return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const displayName = c.name || (c.first_name ? `${c.first_name} ${c.last_name || ''}`.trim() : '');
        const matchesName = displayName.toLowerCase().includes(q);
        const matchesPhone = (c.phone || '').includes(q);
        const matchesLocality = (c.address?.locality || '').toLowerCase().includes(q);
        return matchesName || matchesPhone || matchesLocality;
      }

      return true;
    });
  }, [customers, tab, searchQuery]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 500);
  }, []);

  // Open "View Orders" BottomSheet
  const handleOpenCustomerOrders = (user: User) => {
    setSelectedUserForOrders(user);
    customerOrdersSheetRef.current?.expand();
  };

  // Open PIN Dialog
  const handleOpenPinModal = (user: User, approve: boolean) => {
    setPinModalUser(user);
    setIsApproveMode(approve);
    setPinInput('');
  };

  // Confirm PIN Save / Approval
  const handleSavePin = async () => {
    if (!pinModalUser) return;
    const pin = pinInput.trim();
    if (!/^\d{4}$/.test(pin)) {
      Alert.alert('Invalid PIN', 'PIN must be exactly 4 digits.');
      return;
    }

    setActionLoading(true);
    try {
      if (isApproveMode) {
        // Approve & set PIN (Sync row 2)
        await approveUserWithPin(pinModalUser.id, pin);
        await adminResetPin(pinModalUser.id, pinModalUser.phone, pin);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        showToast(`Approved ${pinModalUser.name}! PIN set to ${pin}. 🎉`, 'success');
      } else {
        // Reset PIN (Sync row 3)
        await adminResetPin(pinModalUser.id, pinModalUser.phone, pin);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        showToast(`PIN for ${pinModalUser.name} reset to ${pin}.`, 'success');
      }
      setPinModalUser(null);
    } catch (err: any) {
      console.error('PIN save error:', err);
      showToast(err.message || 'Could not update PIN.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Toggle Block / Unblock customer
  const handleToggleBlock = (user: User) => {
    const isCurrentlyBlocked = user.status === 'blocked';
    Alert.alert(
      isCurrentlyBlocked ? 'Unblock Customer' : 'Block Customer',
      isCurrentlyBlocked
        ? `Unblock ${user.name} and restore ordering access?`
        : `Block ${user.name}? They will be immediately signed out and unable to place orders.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isCurrentlyBlocked ? 'Unblock' : 'Block',
          style: isCurrentlyBlocked ? 'default' : 'destructive',
          onPress: async () => {
            try {
              if (isCurrentlyBlocked) {
                await updateUser(user.id, { status: 'approved' });
                showToast(`Unblocked ${user.name}`, 'info');
              } else {
                await blockUser(user.id);
                showToast(`Blocked ${user.name}`, 'info');
              }
            } catch (err: any) {
              showToast(err.message || 'Action failed', 'error');
            }
          },
        },
      ],
    );
  };

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Customer Profiles"
        subtitle="Customer approvals, addresses & purchase history"
      />

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
        {/* ─── Search Bar ─────────────────────────────────────────────────── */}
        <View style={styles.searchBar}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name, phone, or locality..."
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

        {/* ─── Filter Tabs ────────────────────────────────────────────────── */}
        <View style={styles.tabsRow}>
          <TouchableOpacity
            style={[styles.tabBtn, tab === 'pending' && styles.tabBtnActive]}
            onPress={() => setTab('pending')}
          >
            <Text style={[styles.tabBtnText, tab === 'pending' && styles.tabBtnTextActive]}>
              Pending Approval
            </Text>
            {pendingCount > 0 && (
              <View style={styles.tabBadge}>
                <Text style={styles.tabBadgeText}>{pendingCount}</Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, tab === 'approved' && styles.tabBtnActive]}
            onPress={() => setTab('approved')}
          >
            <Text style={[styles.tabBtnText, tab === 'approved' && styles.tabBtnTextActive]}>
              Approved ({approvedCount})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, tab === 'all' && styles.tabBtnActive]}
            onPress={() => setTab('all')}
          >
            <Text style={[styles.tabBtnText, tab === 'all' && styles.tabBtnTextActive]}>
              All ({customers.length})
            </Text>
          </TouchableOpacity>
        </View>

        {/* ─── Loading Skeletons ───────────────────────────────────────────── */}
        {customersLoading && (
          <View style={styles.skeletonsWrap}>
            <CardSkeleton />
            <CardSkeleton />
          </View>
        )}

        {/* ─── Empty State ────────────────────────────────────────────────── */}
        {!customersLoading && filteredCustomers.length === 0 && (
          <EmptyState
            title={tab === 'pending' ? 'No pending approvals' : 'No customers found'}
            subtitle={
              searchQuery
                ? `No customers matching "${searchQuery}".`
                : tab === 'pending'
                ? 'All registered customers have been approved.'
                : 'No customers in this list.'
            }
            actionLabel="Reset Search"
            onAction={() => setSearchQuery('')}
          />
        )}

        {/* ─── Customers List ─────────────────────────────────────────────── */}
        {!customersLoading && filteredCustomers.length > 0 && (
          <View style={styles.profilesList}>
            {filteredCustomers.map(cust => {
              const isPending = cust.status === 'pending';
              const isBlocked = cust.status === 'blocked';
              const stats = customerStatsMap[cust.id] || { totalOrders: 0, totalSpent: 0, lastOrder: null };

              const joinedDate = cust.createdAt?.toMillis
                ? new Date(cust.createdAt.toMillis()).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })
                : 'Recently';

              const lastOrderText = stats.lastOrder
                ? stats.lastOrder.createdAt?.toMillis
                  ? new Date(stats.lastOrder.createdAt.toMillis()).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                    })
                  : 'Recent'
                : 'None';

              return (
                <View
                  key={cust.id}
                  style={[
                    styles.profileCard,
                    isPending && styles.profileCardPending,
                    isBlocked && styles.profileCardBlocked,
                  ]}
                >
                  {/* Top Row: Name, Status Badge, Reset PIN */}
                  <View style={styles.cardTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.custName}>
                        {cust.name || (cust.first_name ? `${cust.first_name} ${cust.last_name || ''}`.trim() : 'Customer')}
                      </Text>
                      <View style={styles.statusPillWrap}>
                        <View
                          style={[
                            styles.statusDot,
                            {
                              backgroundColor: isPending
                                ? Colors.amber
                                : isBlocked
                                ? Colors.coral
                                : Colors.green500,
                            },
                          ]}
                        />
                        <Text
                          style={[
                            styles.statusText,
                            {
                              color: isPending
                                ? Colors.amber
                                : isBlocked
                                ? Colors.coral
                                : Colors.green700,
                            },
                          ]}
                        >
                          {isPending
                            ? 'Pending Approval'
                            : isBlocked
                            ? 'Account Blocked'
                            : 'Approved Customer'}
                        </Text>
                      </View>
                    </View>

                    <TouchableOpacity
                      style={styles.keyIconBtn}
                      onPress={() => handleOpenPinModal(cust, false)}
                      hitSlop={8}
                    >
                      <Text style={{ fontSize: 18 }}>🔑</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.divider} />

                  {/* Contact & Joined Info */}
                  <View style={styles.contactRow}>
                    <View style={styles.contactLeft}>
                      <Text style={styles.phoneText}>📞 +91 {cust.phone}</Text>
                      <Text style={styles.joinedText}>Joined: {joinedDate}</Text>
                    </View>

                    <TouchableOpacity
                      style={styles.callSmallBtn}
                      onPress={() => Linking.openURL(`tel:${cust.phone}`)}
                    >
                      <Text style={styles.callSmallBtnText}>Call</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Address Snapshot & Map Launcher */}
                  <View style={styles.addressBox}>
                    <View style={styles.addressTop}>
                      <Text style={styles.addressLabel}>DELIVERY ADDRESS</Text>
                      <TouchableOpacity
                        style={styles.openMapBtn}
                        onPress={() =>
                          openMapChoice(cust.address?.lat, cust.address?.lng, cust.name)
                        }
                      >
                        <Text style={styles.openMapBtnText}>🗺 Open in Maps</Text>
                      </TouchableOpacity>
                    </View>

                    <Text style={styles.addressDetailsText}>
                      {[
                        cust.address?.door,
                        cust.address?.street,
                        cust.address?.locality,
                        cust.address?.city,
                        cust.address?.landmark && `Near ${cust.address.landmark}`,
                      ]
                        .filter(Boolean)
                        .join(', ') || 'No address specified'}
                    </Text>

                    {cust.address?.lat && cust.address?.lng ? (
                      <Text style={styles.gpsCoordsText}>
                        🧭 GPS: {cust.address.lat.toFixed(5)}, {cust.address.lng.toFixed(5)}
                      </Text>
                    ) : null}
                  </View>

                  {/* ─── P16 Lifetime Stats ─────────────────────────────────── */}
                  <View style={styles.statsBanner}>
                    <View style={styles.statMetric}>
                      <Text style={styles.statMetricVal}>{stats.totalOrders}</Text>
                      <Text style={styles.statMetricLabel}>Orders</Text>
                    </View>

                    <View style={styles.metricDivider} />

                    <View style={styles.statMetric}>
                      <Text style={styles.statMetricVal}>₹{stats.totalSpent}</Text>
                      <Text style={styles.statMetricLabel}>Spent (Delivered)</Text>
                    </View>

                    <View style={styles.metricDivider} />

                    <View style={styles.statMetric}>
                      <Text style={styles.statMetricVal}>{lastOrderText}</Text>
                      <Text style={styles.statMetricLabel}>Last Order</Text>
                    </View>
                  </View>

                  {/* Actions Bar */}
                  <View style={styles.actionsBar}>
                    {/* View Orders Action (P16) */}
                    <TouchableOpacity
                      style={styles.viewOrdersBtn}
                      onPress={() => handleOpenCustomerOrders(cust)}
                    >
                      <Text style={styles.viewOrdersBtnText}>
                        View Orders ({stats.totalOrders}) ➔
                      </Text>
                    </TouchableOpacity>

                    {/* Block / Unblock Toggle */}
                    {!isPending && (
                      <TouchableOpacity
                        style={styles.blockBtn}
                        onPress={() => handleToggleBlock(cust)}
                      >
                        <Text style={styles.blockBtnText}>
                          {isBlocked ? 'Unblock' : 'Block'}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Pending Approval Hero Action (P14 / Sync row 2) */}
                  {isPending && (
                    <View style={styles.pendingActionWrap}>
                      <TouchableOpacity
                        style={styles.approveHeroBtn}
                        onPress={() => handleOpenPinModal(cust, true)}
                      >
                        <Text style={styles.approveHeroIcon}>✅</Text>
                        <Text style={styles.approveHeroText}>
                          Approve & Set PIN (Done)
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* ─── P16 Customer Orders BottomSheet ──────────────────────────────── */}
      <BottomSheet
        ref={customerOrdersSheetRef}
        title={
          selectedUserForOrders
            ? `Orders: ${selectedUserForOrders.name}`
            : 'Customer Orders'
        }
        snapPoints={['65%', '90%']}
      >
        <View style={styles.sheetContent}>
          {selectedCustomerOrders.length === 0 ? (
            <EmptyState
              title="No orders placed"
              subtitle="This customer hasn't placed any orders yet."
            />
          ) : (
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.orderHistoryList}>
                {selectedCustomerOrders.map(order => (
                  <View key={order.id} style={styles.orderHistoryCard}>
                    <View style={styles.orderHistoryTop}>
                      <View>
                        <Text style={styles.orderHistoryNo}>Order #{order.orderNo}</Text>
                        <Text style={styles.orderHistoryDate}>
                          {order.createdAt?.toMillis
                            ? new Date(order.createdAt.toMillis()).toLocaleString()
                            : 'Recorded'}
                        </Text>
                      </View>
                      <StatusPill status={order.status} />
                    </View>

                    <View style={styles.divider} />

                    <View style={styles.orderHistoryItems}>
                      {order.items?.map((item, idx) => (
                        <View key={`${item.itemId}-${idx}`} style={styles.orderHistoryItemRow}>
                          <Text style={styles.orderHistoryItemName}>
                            {item.name} ({item.unit}) × {item.qty}
                          </Text>
                          <Text style={styles.orderHistoryItemPrice}>
                            ₹{item.lineTotal || item.qty * item.price}
                          </Text>
                        </View>
                      ))}
                    </View>

                    <View style={styles.orderHistoryBottom}>
                      <Text style={styles.orderHistoryAddress} numberOfLines={1}>
                        📍 {order.addressSnapshot?.locality || 'Chennai'}
                      </Text>
                      <Text style={styles.orderHistoryTotal}>₹{order.total} (COD)</Text>
                    </View>
                  </View>
                ))}
              </View>
            </ScrollView>
          )}
        </View>
      </BottomSheet>

      {/* ─── PIN Setup / Reset Modal ───────────────────────────────────────── */}
      <Modal visible={!!pinModalUser} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {isApproveMode ? 'Approve Customer & Set PIN' : 'Reset Customer PIN'}
            </Text>

            <Text style={styles.modalSub}>
              {isApproveMode
                ? `Assign a 4-digit PIN for ${pinModalUser?.name} (+91 ${pinModalUser?.phone}). They will use this to sign in.`
                : `Set a new 4-digit PIN for ${pinModalUser?.name}.`}
            </Text>

            <TextInput
              style={styles.pinInputField}
              placeholder="e.g. 1234"
              placeholderTextColor={Colors.inkSoft}
              keyboardType="numeric"
              maxLength={4}
              value={pinInput}
              onChangeText={setPinInput}
              autoFocus
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setPinModalUser(null)}
              >
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalSaveBtn}
                onPress={handleSavePin}
                disabled={actionLoading || pinInput.length !== 4}
              >
                <Text style={styles.modalSaveBtnText}>
                  {actionLoading ? 'Saving...' : isApproveMode ? 'Approve' : 'Reset PIN'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
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
  scroll: {
    flex: 1,
  },
  content: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
    gap: Spacing.lg,
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
  tabsRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  tabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderRadius: Radius.chip,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  tabBtnActive: {
    backgroundColor: Colors.green700,
    borderColor: Colors.green700,
  },
  tabBtnText: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.ink,
  },
  tabBtnTextActive: {
    color: '#ffffff',
  },
  tabBadge: {
    backgroundColor: Colors.amber,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  tabBadgeText: {
    fontSize: 10,
    fontFamily: 'Manrope_800ExtraBold',
    color: '#ffffff',
  },
  skeletonsWrap: {
    gap: Spacing.md,
  },
  profilesList: {
    gap: Spacing.lg,
  },
  profileCard: {
    backgroundColor: Colors.card,
    borderRadius: Radius.card,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.line,
    ...Shadow.card,
  },
  profileCardPending: {
    borderColor: Colors.amber,
    borderWidth: 1.5,
  },
  profileCardBlocked: {
    borderColor: Colors.coral,
    opacity: 0.75,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  custName: {
    fontSize: FontSize.md,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.ink,
  },
  statusPillWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_600SemiBold',
  },
  keyIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.cream,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.line,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.line,
    marginVertical: Spacing.md,
  },
  contactRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  contactLeft: {
    flex: 1,
  },
  phoneText: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.ink,
  },
  joinedText: {
    fontSize: 11,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
    marginTop: 2,
  },
  callSmallBtn: {
    backgroundColor: '#EAF8F0',
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    borderRadius: Radius.chip,
    borderWidth: 1,
    borderColor: Colors.green500,
  },
  callSmallBtnText: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.green700,
  },
  addressBox: {
    backgroundColor: Colors.cream,
    borderRadius: Radius.sm,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.line,
    marginBottom: Spacing.md,
  },
  addressTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  addressLabel: {
    fontSize: 10,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.inkSoft,
    letterSpacing: 0.5,
  },
  openMapBtn: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  openMapBtnText: {
    fontSize: 10,
    fontFamily: 'Manrope_600SemiBold',
    color: '#1D4ED8',
  },
  addressDetailsText: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_500Medium',
    color: Colors.ink,
    lineHeight: 18,
  },
  gpsCoordsText: {
    fontSize: 10,
    fontFamily: 'Manrope_500Medium',
    color: Colors.green700,
    marginTop: 4,
  },
  statsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FAF5FF',
    borderRadius: Radius.sm,
    padding: Spacing.sm,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: '#E9D5FF',
  },
  statMetric: {
    flex: 1,
    alignItems: 'center',
  },
  statMetricVal: {
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_800ExtraBold',
    color: '#6B21A8',
  },
  statMetricLabel: {
    fontSize: 9,
    fontFamily: 'Manrope_600SemiBold',
    color: '#9333EA',
    marginTop: 1,
    textTransform: 'uppercase',
  },
  metricDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#E9D5FF',
  },
  actionsBar: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  viewOrdersBtn: {
    flex: 1,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.line,
    paddingVertical: 8,
    borderRadius: Radius.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewOrdersBtnText: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.ink,
  },
  blockBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderRadius: Radius.button,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: Colors.coral,
    alignItems: 'center',
    justifyContent: 'center',
  },
  blockBtnText: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.coral,
  },
  pendingActionWrap: {
    marginTop: Spacing.sm,
  },
  approveHeroBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.amber,
    paddingVertical: 12,
    borderRadius: Radius.button,
    gap: 6,
    ...Shadow.card,
  },
  approveHeroIcon: {
    fontSize: 16,
  },
  approveHeroText: {
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.ink,
  },
  sheetContent: {
    padding: Spacing.lg,
  },
  orderHistoryList: {
    gap: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  orderHistoryCard: {
    backgroundColor: Colors.cream,
    borderRadius: Radius.sm,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  orderHistoryTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  orderHistoryNo: {
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.ink,
  },
  orderHistoryDate: {
    fontSize: 10,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
    marginTop: 1,
  },
  orderHistoryItems: {
    gap: 4,
    marginBottom: Spacing.sm,
  },
  orderHistoryItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  orderHistoryItemName: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_500Medium',
    color: Colors.ink,
    flex: 1,
  },
  orderHistoryItemPrice: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.ink,
  },
  orderHistoryBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: Colors.line,
    paddingTop: 6,
    marginTop: 4,
  },
  orderHistoryAddress: {
    fontSize: 10,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
    flex: 1,
  },
  orderHistoryTotal: {
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.green700,
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
    lineHeight: 18,
    marginBottom: Spacing.lg,
  },
  pinInputField: {
    backgroundColor: Colors.cream,
    borderRadius: Radius.button,
    borderWidth: 1,
    borderColor: Colors.line,
    paddingVertical: 12,
    fontSize: 24,
    fontFamily: 'Manrope_800ExtraBold',
    textAlign: 'center',
    letterSpacing: 10,
    color: Colors.ink,
    marginBottom: Spacing.lg,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: Radius.button,
    backgroundColor: Colors.cream,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelBtnText: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.inkSoft,
  },
  modalSaveBtn: {
    flex: 1.5,
    paddingVertical: 12,
    borderRadius: Radius.button,
    backgroundColor: Colors.green700,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSaveBtnText: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_800ExtraBold',
    color: '#ffffff',
  },
});
