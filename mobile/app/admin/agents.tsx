// app/admin/agents.tsx — Delivery Agent Fleet & Performance
import React, { useState, useMemo, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Linking,
  RefreshControl,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import RNBottomSheet from '@gorhom/bottom-sheet';
import { Colors, Spacing, Radius, FontSize, Shadow, StatusColors } from '../../theme';
import { useSession } from '../../hooks/useSession';
import { useAgents } from '../../hooks/useAgents';
import { useStats } from '../../hooks/useStats';
import { useAdminOrders } from '../../hooks/useOrders';
import { createAgent, adminResetPin } from '../../services/auth';
import {
  ScreenHeader,
  Card,
  Button,
  BottomSheet,
  EmptyState,
  CardSkeleton,
  useToast,
} from '../../components/ui';
import type { User, Order } from '../../types';

export default function AdminAgents() {
  const { uid: adminUid } = useSession();
  const { showToast } = useToast();

  const { agents, loading: agentsLoading, error: agentsError } = useAgents();
  const { loading: statsLoading, refresh: refreshStats, getAgentPerformance } = useStats(30);
  const { orders } = useAdminOrders();

  // Selected agent for detail sheet
  const [selectedAgent, setSelectedAgent] = useState<User | null>(null);
  const detailSheetRef = useRef<RNBottomSheet>(null);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newPin, setNewPin] = useState('');
  const [creating, setCreating] = useState(false);

  const [resetModalAgent, setResetModalAgent] = useState<User | null>(null);
  const [resetPinValue, setResetPinValue] = useState('');
  const [resetting, setResetting] = useState(false);

  // Map active orders by agentId
  const activeOrdersByAgent = useMemo(() => {
    const map = new Map<string, Order[]>();
    for (const order of orders) {
      if (
        order.agentId &&
        ['placed', 'packed', 'out_for_delivery'].includes(order.status)
      ) {
        const list = map.get(order.agentId) || [];
        list.push(order);
        map.set(order.agentId, list);
      }
    }
    return map;
  }, [orders]);

  // Map delivered orders by agentId (for detail sheet)
  const deliveredOrdersByAgent = useMemo(() => {
    const map = new Map<string, Order[]>();
    for (const order of orders) {
      if (order.agentId && order.status === 'delivered') {
        const list = map.get(order.agentId) || [];
        list.push(order);
        map.set(order.agentId, list);
      }
    }
    return map;
  }, [orders]);

  // Overall fleet stats
  const fleetSummary = useMemo(() => {
    const total = agents.length;
    let onlineCount = 0;
    let freeCount = 0;
    let totalActiveOrders = 0;

    for (const ag of agents) {
      const activeCount = activeOrdersByAgent.get(ag.id)?.length || 0;
      totalActiveOrders += activeCount;
      if (ag.isOnline) {
        onlineCount++;
        if (activeCount === 0) freeCount++;
      }
    }

    return { total, onlineCount, freeCount, totalActiveOrders };
  }, [agents, activeOrdersByAgent]);

  // Open detail sheet
  const handleOpenDetail = (agent: User) => {
    Haptics.selectionAsync();
    setSelectedAgent(agent);
    detailSheetRef.current?.expand();
  };

  // Call Agent
  const handleCall = (phone: string) => {
    Linking.openURL(`tel:${phone}`).catch(() => {
      showToast('Could not open phone dialer', 'error');
    });
  };

  // Create Agent
  const handleCreateAgent = async () => {
    const trimmedName = newName.trim();
    const trimmedPhone = newPhone.trim();

    if (!trimmedName) {
      showToast('Please enter agent name', 'error');
      return;
    }
    if (!/^[6-9]\d{9}$/.test(trimmedPhone)) {
      showToast('Enter valid 10-digit phone number (starts with 6-9)', 'error');
      return;
    }
    if (!/^\d{4}$/.test(newPin)) {
      showToast('PIN must be exactly 4 digits', 'error');
      return;
    }

    try {
      setCreating(true);
      await createAgent({
        name: trimmedName,
        phone: trimmedPhone,
        pin: newPin,
        adminUid: adminUid || 'admin',
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast('Agent added successfully!', 'success');
      setShowAddModal(false);
      setNewName('');
      setNewPhone('');
      setNewPin('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create agent';
      showToast(msg, 'error');
    } finally {
      setCreating(false);
    }
  };

  // Reset PIN
  const handleResetPin = async () => {
    if (!resetModalAgent) return;
    if (!/^\d{4}$/.test(resetPinValue)) {
      showToast('PIN must be exactly 4 digits', 'error');
      return;
    }

    try {
      setResetting(true);
      await adminResetPin(resetModalAgent.id, resetModalAgent.phone, resetPinValue);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast(`PIN reset for ${resetModalAgent.name}`, 'success');
      setResetModalAgent(null);
      setResetPinValue('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to reset PIN';
      showToast(msg, 'error');
    } finally {
      setResetting(false);
    }
  };

  const renderAgentItem = ({ item }: { item: User }) => {
    const perf = getAgentPerformance(item.id);
    const activeOrders = activeOrdersByAgent.get(item.id) || [];
    const activeCount = activeOrders.length;

    let statusText = 'Offline';
    let statusBg: string = Colors.line;
    let statusColor: string = Colors.inkSoft;

    if (item.isOnline) {
      if (activeCount === 0) {
        statusText = 'Free (Online)';
        statusBg = '#E8F5E9';
        statusColor = Colors.green700;
      } else {
        statusText = `${activeCount} Active Order${activeCount > 1 ? 's' : ''}`;
        statusBg = '#FEF3C7';
        statusColor = '#B45309';
      }
    }

    return (
      <TouchableOpacity
        style={s.agentCard}
        onPress={() => handleOpenDetail(item)}
        activeOpacity={0.85}
      >
        {/* Card Header */}
        <View style={s.cardHeader}>
          <View style={s.avatarWrap}>
            <View style={[s.avatar, item.isOnline && s.avatarOnline]}>
              <Text style={s.avatarText}>
                {item.name ? item.name.charAt(0).toUpperCase() : 'A'}
              </Text>
            </View>
            <View style={s.agentMeta}>
              <Text style={s.agentName}>{item.name}</Text>
              <Text style={s.agentPhone}>{item.phone}</Text>
            </View>
          </View>

          {/* Status Badge */}
          <View style={[s.statusBadge, { backgroundColor: statusBg }]}>
            <View
              style={[
                s.statusDot,
                { backgroundColor: item.isOnline ? Colors.green500 : Colors.inkSoft },
              ]}
            />
            <Text style={[s.statusBadgeText, { color: statusColor }]}>
              {statusText}
            </Text>
          </View>
        </View>

        {/* Real Metrics Strip */}
        <View style={s.metricsRow}>
          <View style={s.metricBox}>
            <Text style={s.metricVal}>{perf.todayDeliveries}</Text>
            <Text style={s.metricLabel}>Today</Text>
          </View>
          <View style={s.metricDivider} />
          <View style={s.metricBox}>
            <Text style={s.metricVal}>{perf.weeklyDeliveries}</Text>
            <Text style={s.metricLabel}>7 Days</Text>
          </View>
          <View style={s.metricDivider} />
          <View style={s.metricBox}>
            <Text style={s.metricVal}>{perf.monthlyDeliveries}</Text>
            <Text style={s.metricLabel}>30 Days</Text>
          </View>
          <View style={s.metricDivider} />
          <View style={s.metricBox}>
            <Text style={[s.metricVal, { color: Colors.green700 }]}>
              ₹{perf.todayCash}
            </Text>
            <Text style={s.metricLabel}>Cash Today</Text>
          </View>
        </View>

        {/* Quick Action Footer */}
        <View style={s.cardFooter}>
          <TouchableOpacity
            style={s.footerCallBtn}
            onPress={() => handleCall(item.phone)}
          >
            <Ionicons name="call-outline" size={15} color={Colors.green700} />
            <Text style={s.footerCallTxt}>Call</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={s.footerResetBtn}
            onPress={() => {
              setResetModalAgent(item);
              setResetPinValue('');
            }}
          >
            <Ionicons name="key-outline" size={15} color={Colors.amber} />
            <Text style={s.footerResetTxt}>Reset PIN</Text>
          </TouchableOpacity>

          <View style={s.detailHint}>
            <Text style={s.detailHintTxt}>Details</Text>
            <Ionicons name="chevron-forward" size={14} color={Colors.inkSoft} />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const selectedAgentPerf = selectedAgent
    ? getAgentPerformance(selectedAgent.id)
    : null;

  const selectedAgentDeliveries = selectedAgent
    ? deliveredOrdersByAgent.get(selectedAgent.id) || []
    : [];

  return (
    <View style={s.container}>
      <ScreenHeader
        title="Delivery Fleet"
        subtitle="Manage agents, verify cash & track runs"
      />

      {/* Fleet Summary Strip */}
      <View style={s.summaryStrip}>
        <View style={s.summaryItem}>
          <Text style={s.summaryVal}>{fleetSummary.total}</Text>
          <Text style={s.summaryLabel}>Total Fleet</Text>
        </View>
        <View style={s.summaryDiv} />
        <View style={s.summaryItem}>
          <Text style={[s.summaryVal, { color: Colors.green700 }]}>
            {fleetSummary.onlineCount}
          </Text>
          <Text style={s.summaryLabel}>Online</Text>
        </View>
        <View style={s.summaryDiv} />
        <View style={s.summaryItem}>
          <Text style={[s.summaryVal, { color: Colors.amber }]}>
            {fleetSummary.freeCount}
          </Text>
          <Text style={s.summaryLabel}>Free Now</Text>
        </View>
        <View style={s.summaryDiv} />
        <View style={s.summaryItem}>
          <Text style={[s.summaryVal, { color: Colors.ink }]}>
            {fleetSummary.totalActiveOrders}
          </Text>
          <Text style={s.summaryLabel}>Active Runs</Text>
        </View>
      </View>

      {/* Add Agent Bar */}
      <View style={s.actionBar}>
        <Text style={s.fleetCountText}>
          {agents.length} Registered Agent{agents.length !== 1 ? 's' : ''}
        </Text>
        <TouchableOpacity
          style={s.addBtn}
          onPress={() => setShowAddModal(true)}
          activeOpacity={0.8}
        >
          <Ionicons name="person-add-outline" size={16} color="#FFFFFF" />
          <Text style={s.addBtnText}>Add Agent</Text>
        </TouchableOpacity>
      </View>

      {/* Agents List */}
      {agentsLoading ? (
        <View style={{ padding: Spacing.lg, gap: Spacing.md }}>
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </View>
      ) : (
        <FlatList
          data={agents}
          keyExtractor={item => item.id}
          renderItem={renderAgentItem}
          contentContainerStyle={s.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={statsLoading}
              onRefresh={refreshStats}
              tintColor={Colors.green700}
            />
          }
          ListEmptyComponent={
            <EmptyState
              title="No Delivery Agents"
              subtitle="Add your first delivery agent to start assigning and delivering orders."
              actionLabel="+ Add New Agent"
              onAction={() => setShowAddModal(true)}
            />
          }
        />
      )}

      {/* Agent Detail Sheet */}
      <BottomSheet
        ref={detailSheetRef}
        snapPoints={['55%', '85%']}
        title={selectedAgent ? `${selectedAgent.name}'s Profile` : 'Agent Details'}
        onClose={() => setSelectedAgent(null)}
      >
        {selectedAgent && selectedAgentPerf && (
          <ScrollView
            style={s.sheetScroll}
            contentContainerStyle={s.sheetScrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Agent Header Card */}
            <View style={s.sheetHeader}>
              <View style={s.sheetAvatarWrap}>
                <View style={[s.sheetAvatar, selectedAgent.isOnline && s.avatarOnline]}>
                  <Text style={s.sheetAvatarTxt}>
                    {selectedAgent.name ? selectedAgent.name.charAt(0).toUpperCase() : 'A'}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.sheetName}>{selectedAgent.name}</Text>
                  <Text style={s.sheetPhone}>{selectedAgent.phone}</Text>
                </View>
              </View>

              <View style={s.sheetActionRow}>
                <TouchableOpacity
                  style={s.sheetActionBtn}
                  onPress={() => handleCall(selectedAgent.phone)}
                >
                  <Ionicons name="call" size={16} color={Colors.green700} />
                  <Text style={s.sheetActionTxt}>Call Agent</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[s.sheetActionBtn, { borderColor: Colors.amber }]}
                  onPress={() => {
                    detailSheetRef.current?.close();
                    setResetModalAgent(selectedAgent);
                    setResetPinValue('');
                  }}
                >
                  <Ionicons name="key" size={16} color={Colors.amber} />
                  <Text style={[s.sheetActionTxt, { color: Colors.amber }]}>Reset PIN</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Performance Card */}
            <Card style={s.sheetPerfCard}>
              <Text style={s.sheetPerfTitle}>Live Performance Breakdown</Text>

              <View style={s.sheetPerfGrid}>
                <View style={s.sheetPerfItem}>
                  <Text style={s.sheetPerfLabel}>Cash Collected (Today)</Text>
                  <Text style={[s.sheetPerfVal, { color: Colors.green700 }]}>
                    ₹{selectedAgentPerf.todayCash.toLocaleString('en-IN')}
                  </Text>
                </View>

                <View style={s.sheetPerfItem}>
                  <Text style={s.sheetPerfLabel}>Today Deliveries</Text>
                  <Text style={s.sheetPerfVal}>{selectedAgentPerf.todayDeliveries}</Text>
                </View>

                <View style={s.sheetPerfItem}>
                  <Text style={s.sheetPerfLabel}>Past 7 Days</Text>
                  <Text style={s.sheetPerfVal}>{selectedAgentPerf.weeklyDeliveries}</Text>
                </View>

                <View style={s.sheetPerfItem}>
                  <Text style={s.sheetPerfLabel}>Past 30 Days</Text>
                  <Text style={s.sheetPerfVal}>{selectedAgentPerf.monthlyDeliveries}</Text>
                </View>
              </View>
            </Card>

            {/* Recent Deliveries Section */}
            <View style={s.recentSection}>
              <Text style={s.recentSectionTitle}>Recent Deliveries</Text>
              {selectedAgentDeliveries.length === 0 ? (
                <View style={s.emptyDeliveriesBox}>
                  <Ionicons name="cube-outline" size={28} color={Colors.inkSoft} />
                  <Text style={s.emptyDeliveriesText}>No delivered orders on record yet</Text>
                </View>
              ) : (
                <View style={s.deliveriesList}>
                  {selectedAgentDeliveries.slice(0, 15).map(o => (
                    <View key={o.id} style={s.deliveryRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.deliveryOrderNo}>{o.orderNo}</Text>
                        <Text style={s.deliveryCustomer}>
                          {o.customerName} {o.addressSnapshot?.locality ? `• ${o.addressSnapshot.locality}` : ''}
                        </Text>
                        {o.deliveredAt && (
                          <Text style={s.deliveryTime}>
                            {new Date(
                              o.deliveredAt.toMillis ? o.deliveredAt.toMillis() : Date.now()
                            ).toLocaleDateString('en-IN', {
                              day: 'numeric',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </Text>
                        )}
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={s.deliveryTotal}>₹{o.total}</Text>
                        <Text style={s.deliveryCodBadge}>COD</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </ScrollView>
        )}
      </BottomSheet>

      {/* Add Agent Modal */}
      <Modal visible={showAddModal} transparent animationType="slide">
        <KeyboardAvoidingView
          style={s.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={s.modalContent}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Add Delivery Agent</Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <Ionicons name="close" size={24} color={Colors.inkSoft} />
              </TouchableOpacity>
            </View>

            <Text style={s.modalSubtitle}>
              New agents log in using their phone number and 4-digit PIN.
            </Text>

            <View style={s.inputGroup}>
              <Text style={s.inputLabel}>Agent Full Name</Text>
              <TextInput
                style={s.textInput}
                placeholder="e.g. Ramesh Kumar"
                placeholderTextColor={Colors.inkSoft}
                value={newName}
                onChangeText={setNewName}
              />
            </View>

            <View style={s.inputGroup}>
              <Text style={s.inputLabel}>Phone Number</Text>
              <TextInput
                style={s.textInput}
                placeholder="10-digit mobile number"
                placeholderTextColor={Colors.inkSoft}
                keyboardType="phone-pad"
                maxLength={10}
                value={newPhone}
                onChangeText={setNewPhone}
              />
            </View>

            <View style={s.inputGroup}>
              <Text style={s.inputLabel}>Initial 4-Digit PIN</Text>
              <TextInput
                style={[s.textInput, { letterSpacing: 8, textAlign: 'center' }]}
                placeholder="••••"
                placeholderTextColor={Colors.inkSoft}
                keyboardType="number-pad"
                secureTextEntry
                maxLength={4}
                value={newPin}
                onChangeText={setNewPin}
              />
            </View>

            <View style={s.modalBtnRow}>
              <Button
                label={creating ? 'Creating...' : 'Create Agent'}
                onPress={handleCreateAgent}
                loading={creating}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Reset PIN Modal */}
      <Modal visible={!!resetModalAgent} transparent animationType="fade">
        <KeyboardAvoidingView
          style={s.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={s.modalContent}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Reset Agent PIN</Text>
              <TouchableOpacity onPress={() => setResetModalAgent(null)}>
                <Ionicons name="close" size={24} color={Colors.inkSoft} />
              </TouchableOpacity>
            </View>

            <Text style={s.modalSubtitle}>
              Set a new 4-digit PIN for {resetModalAgent?.name} ({resetModalAgent?.phone}).
            </Text>

            <View style={s.inputGroup}>
              <Text style={s.inputLabel}>New 4-Digit PIN</Text>
              <TextInput
                style={[s.textInput, { letterSpacing: 8, textAlign: 'center', fontSize: 24 }]}
                placeholder="••••"
                placeholderTextColor={Colors.inkSoft}
                keyboardType="number-pad"
                secureTextEntry
                maxLength={4}
                value={resetPinValue}
                onChangeText={setResetPinValue}
                autoFocus
              />
            </View>

            <View style={s.modalBtnRow}>
              <Button
                label={resetting ? 'Updating...' : 'Update PIN'}
                onPress={handleResetPin}
                loading={resetting}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.cream,
  },

  // Summary strip
  summaryStrip: {
    flexDirection: 'row',
    backgroundColor: Colors.card,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.line,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryVal: {
    fontSize: FontSize.md,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.ink,
  },
  summaryLabel: {
    fontSize: FontSize.xs - 2,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.inkSoft,
    marginTop: 2,
  },
  summaryDiv: {
    width: 1,
    height: 24,
    backgroundColor: Colors.line,
    alignSelf: 'center',
  },

  // Action bar
  actionBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  fleetCountText: {
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.inkSoft,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.green700,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: Radius.chip,
    gap: 4,
  },
  addBtnText: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_800ExtraBold',
    color: '#FFFFFF',
  },

  listContent: {
    padding: Spacing.lg,
    gap: Spacing.md,
    paddingBottom: Spacing.xxl * 2,
  },

  // Agent Card
  agentCard: {
    backgroundColor: Colors.card,
    borderRadius: Radius.card,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.line,
    ...Shadow.card,
    gap: Spacing.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  avatarWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.cream,
    borderWidth: 2,
    borderColor: Colors.line,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarOnline: {
    borderColor: Colors.green500,
  },
  avatarText: {
    fontSize: FontSize.md,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.green900,
  },
  agentMeta: {
    flex: 1,
  },
  agentName: {
    fontSize: FontSize.md,
    fontFamily: 'Manrope_700Bold',
    color: Colors.ink,
  },
  agentPhone: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.chip,
    gap: 4,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusBadgeText: {
    fontSize: FontSize.xs - 1,
    fontFamily: 'Manrope_700Bold',
  },

  // Metrics
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cream,
    borderRadius: Radius.button,
    paddingVertical: Spacing.xs + 2,
    paddingHorizontal: Spacing.xs,
  },
  metricBox: {
    flex: 1,
    alignItems: 'center',
  },
  metricVal: {
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.ink,
  },
  metricLabel: {
    fontSize: FontSize.xs - 2,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
    marginTop: 1,
  },
  metricDivider: {
    width: 1,
    height: 20,
    backgroundColor: Colors.line,
  },

  // Footer
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.xs,
    borderTopWidth: 1,
    borderTopColor: Colors.line,
  },
  footerCallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: Spacing.xs,
  },
  footerCallTxt: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.green700,
  },
  footerResetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: Spacing.xs,
  },
  footerResetTxt: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.amber,
  },
  detailHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  detailHintTxt: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
  },

  // Sheet
  sheetScroll: {
    flex: 1,
  },
  sheetScrollContent: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl * 2,
    gap: Spacing.lg,
  },
  sheetHeader: {
    backgroundColor: Colors.card,
    borderRadius: Radius.card,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.line,
    gap: Spacing.md,
  },
  sheetAvatarWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  sheetAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.cream,
    borderWidth: 2,
    borderColor: Colors.line,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sheetAvatarTxt: {
    fontSize: FontSize.lg,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.green900,
  },
  sheetName: {
    fontSize: FontSize.lg,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.ink,
  },
  sheetPhone: {
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
  },
  sheetActionRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  sheetActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
    borderRadius: Radius.button,
    borderWidth: 1,
    borderColor: Colors.green700,
    gap: 6,
  },
  sheetActionTxt: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_700Bold',
    color: Colors.green700,
  },
  sheetPerfCard: {
    padding: Spacing.md,
  },
  sheetPerfTitle: {
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_700Bold',
    color: Colors.ink,
    marginBottom: Spacing.sm,
  },
  sheetPerfGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  sheetPerfItem: {
    width: '48%',
    backgroundColor: Colors.cream,
    padding: Spacing.sm,
    borderRadius: Radius.button,
  },
  sheetPerfLabel: {
    fontSize: FontSize.xs - 2,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.inkSoft,
  },
  sheetPerfVal: {
    fontSize: FontSize.md,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.ink,
    marginTop: 2,
  },

  // Recent deliveries
  recentSection: {
    gap: Spacing.sm,
  },
  recentSectionTitle: {
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_700Bold',
    color: Colors.ink,
  },
  emptyDeliveriesBox: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    gap: Spacing.xs,
  },
  emptyDeliveriesText: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
  },
  deliveriesList: {
    gap: Spacing.xs,
  },
  deliveryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.card,
    padding: Spacing.sm,
    borderRadius: Radius.button,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  deliveryOrderNo: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_700Bold',
    color: Colors.ink,
  },
  deliveryCustomer: {
    fontSize: FontSize.xs - 1,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
  },
  deliveryTime: {
    fontSize: FontSize.xs - 2,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
    marginTop: 2,
  },
  deliveryTotal: {
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.green900,
  },
  deliveryCodBadge: {
    fontSize: FontSize.xs - 2,
    fontFamily: 'Manrope_700Bold',
    color: Colors.amber,
    marginTop: 2,
  },

  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(18, 53, 36, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  modalContent: {
    width: '100%',
    backgroundColor: Colors.card,
    borderRadius: Radius.card,
    padding: Spacing.xl,
    gap: Spacing.md,
    ...Shadow.card,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: FontSize.lg,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.ink,
  },
  modalSubtitle: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
  },
  inputGroup: {
    gap: 4,
  },
  inputLabel: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.ink,
  },
  textInput: {
    borderWidth: 1,
    borderColor: Colors.line,
    borderRadius: Radius.button,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.ink,
    backgroundColor: Colors.cream,
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
});
