// app/admin/cans.tsx — Water Can Tracking & Empty Can Recovery
import React, { useState, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  Linking,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import RNBottomSheet from '@gorhom/bottom-sheet';
import { Colors, Spacing, Radius, FontSize, Shadow, StatusColors } from '../../theme';
import { useSession } from '../../hooks/useSession';
import { useCustomers } from '../../hooks/useCustomers';
import { useOnlineAgents } from '../../hooks/useAgents';
import { useAdminOrders } from '../../hooks/useOrders';
import { createOrder, assignAgent } from '../../services/orders';
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

type CanTab = 'unassigned' | 'active';

export default function CansOutsideScreen() {
  const { uid: adminUid, name: adminName } = useSession();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<CanTab>('unassigned');
  const [assigning, setAssigning] = useState(false);

  // BottomSheet for assigning agent
  const assignSheetRef = useRef<RNBottomSheet>(null);
  const [targetCustomer, setTargetCustomer] = useState<User | null>(null);
  const [targetRecovery, setTargetRecovery] = useState<Order | null>(null);

  // Hooks
  const { customers, loading: customersLoading, refresh: refreshCustomers } = useCustomers();
  const { agents: onlineAgents, loading: agentsLoading } = useOnlineAgents();
  const { orders, loading: ordersLoading } = useAdminOrders();

  // Active recovery orders
  const activeRecoveries = useMemo(() => {
    return orders.filter(
      o => o.type === 'recovery' && o.status !== 'delivered' && o.status !== 'cancelled',
    );
  }, [orders]);

  // Customers who hold pending empty cans and don't yet have an active recovery order
  const pendingCustomers = useMemo(() => {
    const assignedCustIds = new Set(activeRecoveries.map(r => r.customerId));
    return customers.filter(
      c => (c.pendingCans || 0) > 0 && !assignedCustIds.has(c.id),
    );
  }, [customers, activeRecoveries]);

  // Total cans currently with customers across town
  const totalCansOutside = useMemo(() => {
    const fromCustomers = customers.reduce((sum, c) => sum + (c.pendingCans || 0), 0);
    const fromActiveRuns = activeRecoveries.reduce(
      (sum, r) => sum + (r.pendingCansToCollect || 0),
      0,
    );
    return fromCustomers + fromActiveRuns;
  }, [customers, activeRecoveries]);

  // Open Assign Agent Sheet for customer
  const handleOpenAssignCustomer = (cust: User) => {
    Haptics.selectionAsync();
    setTargetCustomer(cust);
    setTargetRecovery(null);
    assignSheetRef.current?.expand();
  };

  // Open Reassign Agent Sheet for existing recovery run
  const handleOpenReassignRun = (rec: Order) => {
    Haptics.selectionAsync();
    setTargetCustomer(null);
    setTargetRecovery(rec);
    assignSheetRef.current?.expand();
  };

  // Select agent to perform collection
  const handleSelectAgent = async (agent: User) => {
    try {
      setAssigning(true);

      if (targetRecovery) {
        // Reassign existing recovery run
        await assignAgent({
          orderId: targetRecovery.id,
          order: targetRecovery,
          agent: { uid: agent.id, name: agent.name, phone: agent.phone },
          agentFee: 0,
          customerId: targetRecovery.customerId,
          adminUid: adminUid || 'admin',
          oldAgentUid: targetRecovery.agentId,
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        showToast(`Recovery run reassigned to ${agent.name}`, 'success');
      } else if (targetCustomer) {
        // Create a new recovery order
        const cansCount = targetCustomer.pendingCans || 1;
        await createOrder({
          actor: {
            uid: adminUid || 'admin',
            role: 'admin',
            name: adminName || 'Admin',
          },
          items: [],
          addressSnapshot: {
            door: targetCustomer.address?.door || '',
            street: targetCustomer.address?.street || '',
            locality: targetCustomer.address?.locality || '',
            city: targetCustomer.address?.city || 'Chennai',
            landmark: targetCustomer.address?.landmark || '',
            lat: targetCustomer.address?.lat ?? null,
            lng: targetCustomer.address?.lng ?? null,
          },
          customerName: targetCustomer.name,
          customerPhone: targetCustomer.phone,
          subtotal: 0,
          deliveryFee: 0,
          total: 0,
          slot: { type: 'asap', label: 'Can Collection' },
          notes: `Collect ${cansCount} empty 20L water cans`,
          source: 'admin_manual',
          adminUid: adminUid || 'admin',
          type: 'recovery',
          pendingCansToCollect: cansCount,
        });

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        showToast(
          `Can recovery run created and assigned to ${agent.name}!`,
          'success',
        );
      }

      assignSheetRef.current?.close();
      setTargetCustomer(null);
      setTargetRecovery(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to assign agent';
      showToast(msg, 'error');
    } finally {
      setAssigning(false);
    }
  };

  const renderCustomerItem = ({ item }: { item: User }) => (
    <View style={s.card}>
      <View style={s.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={s.nameTxt}>{item.name}</Text>
          <Text style={s.phoneTxt}>{item.phone}</Text>
          <Text style={s.addrTxt}>
            {[item.address?.door, item.address?.street, item.address?.locality]
              .filter(Boolean)
              .join(', ') || 'No address saved'}
          </Text>
        </View>

        <View style={s.canBadge}>
          <Ionicons name="water" size={16} color="#0284C7" />
          <Text style={s.canBadgeNum}>{item.pendingCans}</Text>
          <Text style={s.canBadgeTxt}>cans</Text>
        </View>
      </View>

      <View style={s.cardFooter}>
        <TouchableOpacity
          style={s.callBtn}
          onPress={() => Linking.openURL(`tel:${item.phone}`)}
        >
          <Ionicons name="call-outline" size={14} color={Colors.green700} />
          <Text style={s.callBtnTxt}>Call</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={s.assignBtn}
          onPress={() => handleOpenAssignCustomer(item)}
        >
          <Ionicons name="bicycle" size={14} color="#FFFFFF" />
          <Text style={s.assignBtnTxt}>Assign Collection Run</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderRecoveryItem = ({ item }: { item: Order }) => (
    <View style={[s.card, s.activeCard]}>
      <View style={s.cardHeader}>
        <View style={{ flex: 1 }}>
          <View style={s.orderNoRow}>
            <Text style={s.nameTxt}>{item.orderNo}</Text>
            <StatusPill status={item.status} />
          </View>
          <Text style={s.customerSub}>Customer: {item.customerName}</Text>
          <Text style={s.agentSub}>
            Assigned Agent: <Text style={{ fontFamily: 'Manrope_700Bold' }}>{item.agentName || 'Pending'}</Text>
          </Text>
          <Text style={s.addrTxt}>
            {item.addressSnapshot?.locality || item.addressSnapshot?.street || 'Chennai'}
          </Text>
        </View>

        <View style={s.canBadge}>
          <Ionicons name="water" size={16} color="#0284C7" />
          <Text style={s.canBadgeNum}>{item.pendingCansToCollect}</Text>
          <Text style={s.canBadgeTxt}>to collect</Text>
        </View>
      </View>

      <View style={s.cardFooter}>
        <TouchableOpacity
          style={s.callBtn}
          onPress={() => Linking.openURL(`tel:${item.customerPhone}`)}
        >
          <Ionicons name="call-outline" size={14} color={Colors.green700} />
          <Text style={s.callBtnTxt}>Call Customer</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={s.reassignBtn}
          onPress={() => handleOpenReassignRun(item)}
        >
          <Ionicons name="swap-horizontal" size={14} color={Colors.amber} />
          <Text style={s.reassignBtnTxt}>Reassign Agent</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const loading = customersLoading || ordersLoading;

  return (
    <View style={s.container}>
      <ScreenHeader
        title="Water Can Tracking"
        subtitle="Manage pending empty cans & dispatch collection runs"
      />

      {/* Hero Stats Card */}
      <View style={s.heroCard}>
        <View style={s.heroLeft}>
          <Text style={s.heroLabel}>Total Empty Cans in Market</Text>
          <Text style={s.heroCount}>{totalCansOutside}</Text>
          <Text style={s.heroSub}>
            {pendingCustomers.length} customer holding cans • {activeRecoveries.length} active collection runs
          </Text>
        </View>
        <Ionicons name="water" size={48} color="#FFFFFF" style={{ opacity: 0.85 }} />
      </View>

      {/* Segmented Tabs */}
      <View style={s.tabsRow}>
        <TouchableOpacity
          style={[s.tabItem, activeTab === 'unassigned' && s.tabItemActive]}
          onPress={() => {
            Haptics.selectionAsync();
            setActiveTab('unassigned');
          }}
        >
          <Text
            style={[s.tabTxt, activeTab === 'unassigned' && s.tabTxtActive]}
          >
            Pending with Customers ({pendingCustomers.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[s.tabItem, activeTab === 'active' && s.tabItemActive]}
          onPress={() => {
            Haptics.selectionAsync();
            setActiveTab('active');
          }}
        >
          <Text
            style={[s.tabTxt, activeTab === 'active' && s.tabTxtActive]}
          >
            Active Runs ({activeRecoveries.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* List */}
      {loading ? (
        <View style={{ padding: Spacing.lg, gap: Spacing.md }}>
          <CardSkeleton />
          <CardSkeleton />
        </View>
      ) : activeTab === 'unassigned' ? (
        <FlatList
          data={pendingCustomers}
          keyExtractor={item => item.id}
          renderItem={renderCustomerItem}
          contentContainerStyle={s.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={refreshCustomers}
              tintColor={Colors.green700}
            />
          }
          ListEmptyComponent={
            <EmptyState
              title="All Cans Accounted For! 🎉"
              subtitle="No customers currently hold uncollected water cans."
            />
          }
        />
      ) : (
        <FlatList
          data={activeRecoveries}
          keyExtractor={item => item.id}
          renderItem={renderRecoveryItem}
          contentContainerStyle={s.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <EmptyState
              title="No Active Recovery Runs"
              subtitle="Dispatch an agent from the Pending tab to initiate an empty can collection run."
            />
          }
        />
      )}

      {/* Agent Selection BottomSheet */}
      <BottomSheet
        ref={assignSheetRef}
        snapPoints={['50%', '80%']}
        title={
          targetRecovery
            ? `Reassign ${targetRecovery.orderNo}`
            : targetCustomer
            ? `Collect ${targetCustomer.pendingCans} Cans from ${targetCustomer.name}`
            : 'Select Agent'
        }
      >
        <View style={s.sheetContent}>
          <Text style={s.sheetSubtitle}>
            Select an online delivery partner to dispatch for this run:
          </Text>

          {onlineAgents.length === 0 ? (
            <View style={s.noAgentsBox}>
              <Ionicons name="bicycle" size={32} color={Colors.inkSoft} />
              <Text style={s.noAgentsTxt}>
                No delivery agents are currently ONLINE.
              </Text>
              <Text style={s.noAgentsSub}>
                Wait for an agent to toggle their status online in their app.
              </Text>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={s.agentList}>
                {onlineAgents.map(ag => (
                  <TouchableOpacity
                    key={ag.id}
                    style={s.agentRow}
                    onPress={() => handleSelectAgent(ag)}
                    disabled={assigning}
                    activeOpacity={0.8}
                  >
                    <View style={s.agentAvatar}>
                      <Text style={s.agentAvatarTxt}>
                        {ag.name ? ag.name.charAt(0).toUpperCase() : 'A'}
                      </Text>
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text style={s.agentName}>{ag.name}</Text>
                      <Text style={s.agentPhone}>{ag.phone}</Text>
                    </View>

                    <View style={s.dispatchPill}>
                      <Text style={s.dispatchPillTxt}>Dispatch ›</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          )}
        </View>
      </BottomSheet>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.cream,
  },
  heroCard: {
    margin: Spacing.lg,
    backgroundColor: '#0284C7',
    borderRadius: Radius.card,
    padding: Spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    ...Shadow.card,
  },
  heroLeft: {
    flex: 1,
  },
  heroLabel: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_700Bold',
    color: 'rgba(255,255,255,0.85)',
  },
  heroCount: {
    fontSize: FontSize.xl + 4,
    fontFamily: 'Manrope_800ExtraBold',
    color: '#FFFFFF',
    marginVertical: 2,
  },
  heroSub: {
    fontSize: FontSize.xs - 2,
    fontFamily: 'Manrope_500Medium',
    color: 'rgba(255,255,255,0.85)',
  },

  // Tabs
  tabsRow: {
    flexDirection: 'row',
    backgroundColor: Colors.card,
    paddingHorizontal: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.line,
  },
  tabItem: {
    flex: 1,
    paddingVertical: Spacing.sm + 2,
    alignItems: 'center',
    borderBottomWidth: 2.5,
    borderBottomColor: 'transparent',
  },
  tabItemActive: {
    borderBottomColor: Colors.green700,
  },
  tabTxt: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.inkSoft,
  },
  tabTxtActive: {
    color: Colors.green900,
    fontFamily: 'Manrope_800ExtraBold',
  },

  listContent: {
    padding: Spacing.lg,
    gap: Spacing.md,
    paddingBottom: Spacing.xxl * 2,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: Radius.card,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.line,
    ...Shadow.card,
    gap: Spacing.sm,
  },
  activeCard: {
    borderColor: '#BAE6FD',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  nameTxt: {
    fontSize: FontSize.md,
    fontFamily: 'Manrope_700Bold',
    color: Colors.ink,
  },
  phoneTxt: {
    fontSize: FontSize.xs - 1,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
    marginTop: 1,
  },
  customerSub: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.ink,
    marginTop: 2,
  },
  agentSub: {
    fontSize: FontSize.xs - 1,
    fontFamily: 'Manrope_500Medium',
    color: Colors.green700,
    marginTop: 1,
  },
  addrTxt: {
    fontSize: FontSize.xs - 1,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
    marginTop: 2,
  },
  canBadge: {
    backgroundColor: '#F0F9FF',
    borderRadius: Radius.button,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  canBadgeNum: {
    fontSize: FontSize.md,
    fontFamily: 'Manrope_800ExtraBold',
    color: '#0284C7',
  },
  canBadgeTxt: {
    fontSize: FontSize.xs - 2,
    fontFamily: 'Manrope_600SemiBold',
    color: '#0369A1',
  },
  orderNoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Spacing.xs,
    borderTopWidth: 1,
    borderTopColor: Colors.line,
  },
  callBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.chip,
    borderWidth: 1,
    borderColor: Colors.green700,
    gap: 4,
  },
  callBtnTxt: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_700Bold',
    color: Colors.green700,
  },
  assignBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.green700,
    paddingVertical: 7,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.chip,
    gap: 4,
  },
  assignBtnTxt: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_800ExtraBold',
    color: '#FFFFFF',
  },
  reassignBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.chip,
    borderWidth: 1,
    borderColor: Colors.amber,
    gap: 4,
  },
  reassignBtnTxt: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_700Bold',
    color: Colors.amber,
  },

  // Sheet
  sheetContent: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl * 2,
    gap: Spacing.md,
  },
  sheetSubtitle: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
  },
  noAgentsBox: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    gap: Spacing.xs,
  },
  noAgentsTxt: {
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_700Bold',
    color: Colors.ink,
  },
  noAgentsSub: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
    textAlign: 'center',
  },
  agentList: {
    gap: Spacing.sm,
  },
  agentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cream,
    padding: Spacing.sm,
    borderRadius: Radius.button,
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  agentAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.green900,
    justifyContent: 'center',
    alignItems: 'center',
  },
  agentAvatarTxt: {
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_800ExtraBold',
    color: '#FFFFFF',
  },
  agentName: {
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_700Bold',
    color: Colors.ink,
  },
  agentPhone: {
    fontSize: FontSize.xs - 1,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
  },
  dispatchPill: {
    backgroundColor: Colors.green700,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
    borderRadius: Radius.chip,
  },
  dispatchPillTxt: {
    fontSize: FontSize.xs - 1,
    fontFamily: 'Manrope_800ExtraBold',
    color: '#FFFFFF',
  },
});
