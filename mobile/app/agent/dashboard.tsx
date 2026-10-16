// app/agent/dashboard.tsx — Delivery Agent Dashboard & Order Runs
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  Linking,
  Platform,
  RefreshControl,
  ScrollView,
  Modal,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import RNBottomSheet from '@gorhom/bottom-sheet';
import { Colors, Spacing, Radius, FontSize, Shadow, StatusColors } from '../../theme';
import { useSession } from '../../hooks/useSession';
import { useAuthUser } from '../../hooks/useAuthUser';
import { useAgentOrders } from '../../hooks/useOrders';
import { useStats } from '../../hooks/useStats';
import { getSundayOfCurrentWeek, getFirstDayOfCurrentMonth, getISTDateKey } from '../../services/stats';
import { setAgentOnline } from '../../services/users';
import { logout } from '../../services/auth';
import { openMapChoice } from '../../utils/openMap';
import {
  Card,
  StatusPill,
  Button,
  BottomSheet,
  EmptyState,
  CardSkeleton,
  NotificationBell,
  useToast,
} from '../../components/ui';
import type { Order } from '../../types';

type AgentTab = 'assigned' | 'out' | 'completed';

export default function AgentDashboard() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { uid, name: sessionName, clearSession } = useSession();
  const { user: profileUser } = useAuthUser();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<AgentTab>('assigned');
  const [togglingOnline, setTogglingOnline] = useState(false);

  // Earnings BottomSheet
  const earningsSheetRef = useRef<RNBottomSheet>(null);

  // Live orders assigned to this agent
  const { orders, loading: ordersLoading, error: ordersError } = useAgentOrders(uid);

  // Live stats for earnings & cash
  const { getAgentPerformance } = useStats(30);

  // Real agent performance
  const agentPerf = useMemo(() => {
    return uid ? getAgentPerformance(uid) : null;
  }, [uid, getAgentPerformance]);

  // Online status state
  const [isOnline, setIsOnline] = useState<boolean>(() => profileUser?.isOnline ?? true);

  useEffect(() => {
    if (profileUser?.isOnline !== undefined) {
      setIsOnline(profileUser.isOnline);
    }
  }, [profileUser?.isOnline]);

  const agentName = profileUser?.name || sessionName || 'Agent';

  // Partition orders by tab
  const assignedOrders = useMemo(() => {
    return orders.filter(o => o.status === 'placed' || o.status === 'packed');
  }, [orders]);

  const outOrders = useMemo(() => {
    return orders.filter(o => o.status === 'out_for_delivery');
  }, [orders]);

  const completedOrders = useMemo(() => {
    return orders.filter(o => o.status === 'delivered' && o.type !== 'recovery');
  }, [orders]);

  // Run timeframe state: 'today' | 'week' | 'month' | '7days' | '30days'
  type RunTimeframe = 'today' | 'week' | 'month' | '7days' | '30days';
  const [runTimeframe, setRunTimeframe] = useState<RunTimeframe>('today');
  const [clickTime, setClickTime] = useState<Date>(new Date());

  const parseOrderDate = useCallback((o: Order): Date | null => {
    const ts = o.deliveredAt || o.updatedAt || o.createdAt;
    if (!ts) return null;
    if (ts instanceof Date) return ts;
    if (typeof (ts as any).toDate === 'function') return (ts as any).toDate();
    if (typeof (ts as any).seconds === 'number') return new Date((ts as any).seconds * 1000);
    if (typeof ts === 'string' || typeof ts === 'number') return new Date(ts);
    return null;
  }, []);

  const todayCompletedOrders = useMemo(() => {
    const todayKey = getISTDateKey(clickTime);
    return completedOrders.filter(o => {
      const d = parseOrderDate(o);
      return d ? getISTDateKey(d) === todayKey && d <= clickTime : false;
    });
  }, [completedOrders, parseOrderDate, clickTime]);

  const weeklyCompletedOrders = useMemo(() => {
    const sundayMidnight = getSundayOfCurrentWeek(clickTime);
    return completedOrders.filter(o => {
      const d = parseOrderDate(o);
      return d ? d >= sundayMidnight && d <= clickTime : false;
    });
  }, [completedOrders, parseOrderDate, clickTime]);

  const monthlyCompletedOrders = useMemo(() => {
    const firstOfMonthMidnight = getFirstDayOfCurrentMonth(clickTime);
    return completedOrders.filter(o => {
      const d = parseOrderDate(o);
      return d ? d >= firstOfMonthMidnight && d <= clickTime : false;
    });
  }, [completedOrders, parseOrderDate, clickTime]);

  const todayCashFromOrders = useMemo(() => {
    return todayCompletedOrders.reduce((sum, o) => sum + (o.total || 0), 0);
  }, [todayCompletedOrders]);

  const weeklyCashFromOrders = useMemo(() => {
    return weeklyCompletedOrders.reduce((sum, o) => sum + (o.total || 0), 0);
  }, [weeklyCompletedOrders]);

  const monthlyCashFromOrders = useMemo(() => {
    return monthlyCompletedOrders.reduce((sum, o) => sum + (o.total || 0), 0);
  }, [monthlyCompletedOrders]);

  // Aggregate with stats_daily if available
  const effectiveTodayDeliveries = Math.max(agentPerf?.todayDeliveries || 0, todayCompletedOrders.length);
  const effectiveWeeklyDeliveries = Math.max(agentPerf?.weeklyDeliveries || 0, weeklyCompletedOrders.length);
  const effectiveMonthlyDeliveries = Math.max(agentPerf?.monthlyDeliveries || 0, monthlyCompletedOrders.length);
  const effectiveTodayCash = Math.max(agentPerf?.todayCash || 0, todayCashFromOrders);

  // Filtered completed runs list based on active timeframe
  const filteredCompletedOrders = useMemo(() => {
    if (runTimeframe === 'today') return todayCompletedOrders;
    if (runTimeframe === 'week' || runTimeframe === '7days') return weeklyCompletedOrders;
    return monthlyCompletedOrders;
  }, [runTimeframe, todayCompletedOrders, weeklyCompletedOrders, monthlyCompletedOrders]);

  const activeOrdersCount = assignedOrders.length + outOrders.length;

  // New assignment alert tracking
  // IMPORTANT: Firestore onSnapshot fires TWICE on first load (cache, then server).
  // We must skip the detection window until the initial snapshot settles,
  // otherwise every existing order looks "new" and the modal blocks the whole screen.
  const prevOrderIdsRef   = useRef<Set<string>>(new Set());
  const initialLoadDone   = useRef(false);
  const [newAssignmentAlert, setNewAssignmentAlert] = useState<Order | null>(null);

  useEffect(() => {
    if (ordersLoading) return;

    const currentIds = new Set(assignedOrders.map(o => o.id));

    if (!initialLoadDone.current) {
      // First real snapshot — seed the ref silently, don't alert.
      prevOrderIdsRef.current = currentIds;
      initialLoadDone.current = true;
      return;
    }

    // Subsequent snapshots — only alert for genuinely NEW order IDs.
    for (const order of assignedOrders) {
      if (!prevOrderIdsRef.current.has(order.id)) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        setNewAssignmentAlert(order);
        break;
      }
    }

    prevOrderIdsRef.current = currentIds;
  }, [assignedOrders, ordersLoading]);

  // Online / Offline toggle (sync row 14)
  const handleToggleOnline = async () => {
    if (!uid) return;

    // Block going offline if active orders exist
    if (isOnline && activeOrdersCount > 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(
        'Cannot Go Offline',
        `You currently have ${activeOrdersCount} active order${
          activeOrdersCount > 1 ? 's' : ''
        } assigned. You must complete or deliver all runs before going offline.`,
        [{ text: 'OK', style: 'default' }],
      );
      return;
    }

    const nextStatus = !isOnline;
    setIsOnline(nextStatus);

    try {
      setTogglingOnline(true);
      await setAgentOnline(uid, nextStatus);
      Haptics.selectionAsync();
      showToast(
        nextStatus ? 'Status: Online' : 'Status: Offline',
        nextStatus ? 'success' : 'info',
      );
    } catch (err: unknown) {
      console.warn('Backend update failed:', err);
    } finally {
      setTogglingOnline(false);
    }
  };

  // Logout
  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          try {
            // Navigate first, THEN clear session.
            // On Android, clearing Zustand state before navigation causes a
            // race where the layout guard fires before the router can redirect,
            // resulting in a frozen blank screen.
            router.replace('/auth/login');
            await logout();
            clearSession();
          } catch (e) {
            console.error('Logout error', e);
          }
        },
      },
    ]);
  };

  // Call customer
  const handleCall = (phone: string) => {
    Linking.openURL(`tel:${phone}`).catch(() => {
      showToast('Could not open phone dialer', 'error');
    });
  };

  // Open maps
  const handleOpenMap = (order: Order) => {
    const lat = order.addressSnapshot?.lat ?? null;
    const lng = order.addressSnapshot?.lng ?? null;
    const addr = [
      order.addressSnapshot?.door,
      order.addressSnapshot?.street,
      order.addressSnapshot?.locality,
      order.addressSnapshot?.city,
    ]
      .filter(Boolean)
      .join(', ');

    openMapChoice(lat, lng, `${order.customerName}, ${addr}`);
  };

  // Render an order card
  const renderOrderCard = ({ item }: { item: Order }) => {
    const isReady = item.status === 'packed';
    const isOut = item.status === 'out_for_delivery';
    const isDelivered = item.status === 'delivered';
    const isRecovery = item.type === 'recovery';

    const placedTime = item.createdAt?.toMillis
      ? new Date(item.createdAt.toMillis()).toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
        })
      : '';

    return (
      <TouchableOpacity
        style={[
          s.orderCard,
          isReady && s.orderCardReady,
          isOut && s.orderCardOut,
        ]}
        onPress={() => router.push(`/agent/delivery/${item.id}`)}
        activeOpacity={0.85}
      >
        {/* Card Top Row */}
        <View style={s.cardTopRow}>
          <View>
            <View style={s.orderNoRow}>
              <Text style={s.orderNo}>{item.orderNo}</Text>
              {isRecovery && (
                <View style={s.recoveryTag}>
                  <Text style={s.recoveryTagTxt}>💧 Recovery</Text>
                </View>
              )}
            </View>
            <Text style={s.orderTime}>Placed at {placedTime}</Text>
          </View>

          <View style={{ alignItems: 'flex-end' }}>
            <StatusPill status={item.status} />
            {isReady && (
              <View style={s.readyPill}>
                <Ionicons name="cube" size={12} color="#FFFFFF" />
                <Text style={s.readyPillTxt}>Ready for Pickup</Text>
              </View>
            )}
            {item.status === 'placed' && (
              <View style={s.packingPill}>
                <Ionicons name="time-outline" size={12} color={Colors.inkSoft} />
                <Text style={s.packingPillTxt}>Packing in store</Text>
              </View>
            )}
          </View>
        </View>

        {/* Customer Box */}
        <View style={s.customerBox}>
          <View style={{ flex: 1 }}>
            <Text style={s.customerName}>{item.customerName}</Text>
            <Text style={s.customerPhone}>{item.customerPhone}</Text>
            <View style={s.localityRow}>
              <Ionicons name="location-sharp" size={13} color={Colors.coral} />
              <Text style={s.localityText} numberOfLines={1}>
                {item.addressSnapshot?.locality || item.addressSnapshot?.street || 'Chennai'}
              </Text>
            </View>
          </View>

          {item.customerPhone ? (
            <TouchableOpacity
              style={s.callBtn}
              onPress={() => handleCall(item.customerPhone)}
            >
              <Ionicons name="call" size={18} color="#FFFFFF" />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Order Details / Cans info */}
        <View style={s.orderMeta}>
          {isRecovery ? (
            <View style={s.infoRow}>
              <Ionicons name="water-outline" size={16} color={Colors.green700} />
              <Text style={[s.infoText, { color: Colors.green700, fontWeight: '700' }]}>
                Collect {item.pendingCansToCollect || 1} Empty Water Cans
              </Text>
            </View>
          ) : (
            <View style={s.infoRow}>
              <Ionicons name="basket-outline" size={16} color={Colors.inkSoft} />
              <Text style={s.infoText} numberOfLines={1}>
                {item.items && item.items.length > 0
                  ? item.items.map(i => `${i.qty}x ${i.name}`).join(', ')
                  : 'Grocery Items'}
              </Text>
            </View>
          )}

          {item.slot?.label ? (
            <View style={s.infoRow}>
              <Ionicons name="time-outline" size={16} color={Colors.inkSoft} />
              <Text style={s.infoText}>Slot: {item.slot.label}</Text>
            </View>
          ) : null}
        </View>

        {/* Total & Action Bar */}
        <View style={s.cardFooter}>
          <View>
            <Text style={s.codLabel}>Cash on Delivery</Text>
            <Text style={s.codAmount}>₹{item.total}</Text>
          </View>

          <View style={s.footerBtnGroup}>
            <TouchableOpacity
              style={s.mapBtn}
              onPress={() => handleOpenMap(item)}
            >
              <Ionicons name="navigate-outline" size={16} color={Colors.green700} />
              <Text style={s.mapBtnTxt}>Maps</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                s.actionBtn,
                isReady && { backgroundColor: Colors.green700 },
                isOut && { backgroundColor: Colors.amber },
                isDelivered && { backgroundColor: Colors.line },
              ]}
              onPress={() => router.push(`/agent/delivery/${item.id}`)}
            >
              <Text
                style={[
                  s.actionBtnTxt,
                  isDelivered && { color: Colors.inkSoft },
                ]}
              >
                {isDelivered
                  ? 'Delivered'
                  : isOut
                  ? 'Continue Run'
                  : isReady
                  ? 'Start Pickup'
                  : 'View Order'}
              </Text>
              <Ionicons
                name="arrow-forward"
                size={14}
                color={isDelivered ? Colors.inkSoft : '#FFFFFF'}
              />
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const currentTabOrders =
    activeTab === 'assigned'
      ? assignedOrders
      : activeTab === 'out'
      ? outOrders
      : filteredCompletedOrders;

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={s.container}>
        {/* Top Header Bar (supports Notch & Dynamic Island) */}
        <View
          style={[
            s.header,
            {
              paddingTop: insets.top + Spacing.xs,
              paddingLeft: Math.max(insets.left, Spacing.lg),
              paddingRight: Math.max(insets.right, Spacing.lg),
            },
          ]}
        >
          <View style={s.headerLeft}>
            <Text style={s.greeting}>Hello, {agentName} 👋</Text>
            <Text style={s.headerSubtitle}>Ready for your delivery runs</Text>
          </View>

          <View style={s.headerRight}>
            <NotificationBell color="#FFFFFF" />

            <TouchableOpacity
              onPress={() => router.push('/auth/reset-pin')}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Change PIN"
              style={{ padding: 8 }}
            >
              <Ionicons name="key-outline" size={18} color={Colors.amber} />
            </TouchableOpacity>

            {/* Earnings Button */}
            <TouchableOpacity
              style={s.earningsHeaderBtn}
              onPress={() => earningsSheetRef.current?.expand()}
              activeOpacity={0.8}
            >
              <Ionicons name="wallet-outline" size={18} color={Colors.amber} />
              <Text style={s.earningsHeaderTxt}>Earnings</Text>
            </TouchableOpacity>

            {/* Logout Button */}
            <TouchableOpacity
              style={s.logoutBtn}
              onPress={handleLogout}
              activeOpacity={0.8}
              accessibilityLabel="Sign Out"
            >
              <Ionicons name="log-out-outline" size={18} color="#EF4444" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Online / Offline Status Toggle Banner */}
        <View style={s.statusBanner}>
          <View style={s.statusBannerLeft}>
            <View
              style={[
                s.statusPulseDot,
                { backgroundColor: isOnline ? '#22C55E' : '#EF4444' },
              ]}
            />
            <View>
              <Text style={s.statusBannerTitle}>
                {isOnline ? '🟢 Online' : '🔴 Offline'}
              </Text>
              <Text style={s.statusBannerSub}>
                {isOnline
                  ? activeOrdersCount > 0
                    ? `${activeOrdersCount} delivery run${activeOrdersCount > 1 ? 's' : ''} in progress`
                    : 'Ready to accept runs'
                  : 'Tap GO ONLINE to start receiving runs'}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={[
              s.toggleBtn,
              isOnline ? s.toggleBtnOnline : s.toggleBtnOffline,
              togglingOnline && { opacity: 0.6 },
            ]}
            onPress={handleToggleOnline}
            disabled={togglingOnline}
            activeOpacity={0.8}
          >
            <Text style={[s.toggleBtnTxt, isOnline && s.toggleBtnTxtOnline]}>
              {isOnline ? 'GO OFFLINE' : 'GO ONLINE'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Tab Navigation */}
        <View style={s.tabsRow}>
          <TouchableOpacity
            style={[s.tabItem, activeTab === 'assigned' && s.tabItemActive]}
            onPress={() => {
              Haptics.selectionAsync();
              setActiveTab('assigned');
            }}
          >
            <Text
              style={[
                s.tabText,
                activeTab === 'assigned' && s.tabTextActive,
              ]}
            >
              Assigned
            </Text>
            {assignedOrders.length > 0 && (
              <View
                style={[
                  s.tabBadge,
                  activeTab === 'assigned' && s.tabBadgeActive,
                ]}
              >
                <Text style={s.tabBadgeTxt}>{assignedOrders.length}</Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.tabItem, activeTab === 'out' && s.tabItemActive]}
            onPress={() => {
              Haptics.selectionAsync();
              setActiveTab('out');
            }}
          >
            <Text
              style={[
                s.tabText,
                activeTab === 'out' && s.tabTextActive,
              ]}
            >
              Out for Delivery
            </Text>
            {outOrders.length > 0 && (
              <View
                style={[
                  s.tabBadge,
                  { backgroundColor: Colors.amber },
                ]}
              >
                <Text style={s.tabBadgeTxt}>{outOrders.length}</Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.tabItem, activeTab === 'completed' && s.tabItemActive]}
            onPress={() => {
              Haptics.selectionAsync();
              setActiveTab('completed');
            }}
          >
            <Text
              style={[
                s.tabText,
                activeTab === 'completed' && s.tabTextActive,
              ]}
            >
              Retail Delivered
            </Text>
            {completedOrders.length > 0 && (
              <View
                style={[
                  s.tabBadge,
                  activeTab === 'completed' && s.tabBadgeActive,
                ]}
              >
                <Text style={s.tabBadgeTxt}>{completedOrders.length}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Run Timeframe Filter for Completed Tab */}
        {activeTab === 'completed' && (
          <View style={s.timeframeRow}>
            <TouchableOpacity
              style={[s.timeframeChip, runTimeframe === 'today' && s.timeframeChipActive]}
              onPress={() => {
                Haptics.selectionAsync();
                setClickTime(new Date());
                setRunTimeframe('today');
              }}
              accessibilityRole="button"
              accessibilityLabel={`Filter today runs, total ${effectiveTodayDeliveries}`}
            >
              <Text style={[s.timeframeChipTxt, runTimeframe === 'today' && s.timeframeChipTxtActive]}>
                Today ({effectiveTodayDeliveries})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.timeframeChip, (runTimeframe === 'week' || runTimeframe === '7days') && s.timeframeChipActive]}
              onPress={() => {
                Haptics.selectionAsync();
                setClickTime(new Date());
                setRunTimeframe('week');
              }}
              accessibilityRole="button"
              accessibilityLabel={`Filter weekly runs, total ${effectiveWeeklyDeliveries}`}
            >
              <Text style={[s.timeframeChipTxt, (runTimeframe === 'week' || runTimeframe === '7days') && s.timeframeChipTxtActive]}>
                Weekly ({effectiveWeeklyDeliveries})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.timeframeChip, (runTimeframe === 'month' || runTimeframe === '30days') && s.timeframeChipActive]}
              onPress={() => {
                Haptics.selectionAsync();
                setClickTime(new Date());
                setRunTimeframe('month');
              }}
              accessibilityRole="button"
              accessibilityLabel={`Filter monthly runs, total ${effectiveMonthlyDeliveries}`}
            >
              <Text style={[s.timeframeChipTxt, (runTimeframe === 'month' || runTimeframe === '30days') && s.timeframeChipTxtActive]}>
                Monthly ({effectiveMonthlyDeliveries})
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Orders List */}
        {ordersLoading ? (
          <View style={{ padding: Spacing.lg, gap: Spacing.md }}>
            <CardSkeleton />
            <CardSkeleton />
          </View>
        ) : (
          <FlatList
            data={currentTabOrders}
            keyExtractor={item => item.id}
            renderItem={renderOrderCard}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[
              s.listContent,
              {
                paddingBottom: Math.max(insets.bottom, 16) + 80,
                paddingLeft: Math.max(insets.left, Spacing.lg),
                paddingRight: Math.max(insets.right, Spacing.lg),
              },
            ]}
            ListEmptyComponent={
              <EmptyState
                title={
                  activeTab === 'assigned'
                    ? 'No Assigned Runs'
                    : activeTab === 'out'
                    ? 'No Deliveries in Transit'
                    : runTimeframe === 'today'
                    ? "No Completed Orders Today"
                    : runTimeframe === '7days'
                    ? "No Completed Orders in Last 7 Days"
                    : "No Completed Orders in Last 30 Days"
                }
                subtitle={
                  activeTab === 'assigned'
                    ? isOnline
                      ? 'Stay online. New orders assigned by the store will appear here automatically.'
                      : 'You are currently offline. Turn your status online to receive deliveries.'
                    : activeTab === 'out'
                    ? 'Orders marked as picked up will appear here.'
                    : 'Delivered orders will appear here for your cash handover.'
                }
              />
            }
          />
        )}

        {/* Earnings & Cash Bottom Sheet (P20) */}
        <BottomSheet
          ref={earningsSheetRef}
          snapPoints={['55%', '85%']}
          title="Earnings & Cash Handover"
        >
          <ScrollView
            style={s.sheetScroll}
            contentContainerStyle={s.sheetContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Cash Handover Notice */}
            <View style={s.cashHeroCard}>
              <Ionicons name="cash" size={28} color={Colors.green700} />
              <View style={{ flex: 1 }}>
                <Text style={s.cashHeroLabel}>
                  {runTimeframe === 'today'
                    ? 'Cash to Hand Over Today'
                    : runTimeframe === 'week' || runTimeframe === '7days'
                    ? 'Weekly COD Total'
                    : 'Monthly COD Total'}
                </Text>
                <Text style={s.cashHeroAmount}>
                  ₹{(runTimeframe === 'today'
                    ? effectiveTodayCash
                    : runTimeframe === 'week' || runTimeframe === '7days'
                    ? weeklyCashFromOrders
                    : monthlyCashFromOrders
                  ).toLocaleString('en-IN')}
                </Text>
                <Text style={s.cashHeroSub}>
                  COD Collected from {filteredCompletedOrders.length} completed run
                  {filteredCompletedOrders.length !== 1 ? 's' : ''}
                </Text>
              </View>
            </View>

            {/* Delivery Counts Grid — Interactive Timeframe Switcher */}
            <View style={s.perfGrid}>
              <TouchableOpacity
                style={[s.perfBox, runTimeframe === 'today' && s.perfBoxActive]}
                onPress={() => {
                  Haptics.selectionAsync();
                  setClickTime(new Date());
                  setRunTimeframe('today');
                }}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Filter today runs from 12 AM, total ${effectiveTodayDeliveries}`}
              >
                <Text style={[s.perfLabel, runTimeframe === 'today' && s.perfLabelActive]}>Today</Text>
                <Text style={[s.perfVal, runTimeframe === 'today' && s.perfValActive]}>{effectiveTodayDeliveries}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.perfBox, (runTimeframe === 'week' || runTimeframe === '7days') && s.perfBoxActive]}
                onPress={() => {
                  Haptics.selectionAsync();
                  setClickTime(new Date());
                  setRunTimeframe('week');
                }}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Filter weekly runs, total ${effectiveWeeklyDeliveries}`}
              >
                <Text style={[s.perfLabel, (runTimeframe === 'week' || runTimeframe === '7days') && s.perfLabelActive]}>Weekly</Text>
                <Text style={[s.perfVal, (runTimeframe === 'week' || runTimeframe === '7days') && s.perfValActive]}>{effectiveWeeklyDeliveries}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.perfBox, (runTimeframe === 'month' || runTimeframe === '30days') && s.perfBoxActive]}
                onPress={() => {
                  Haptics.selectionAsync();
                  setClickTime(new Date());
                  setRunTimeframe('month');
                }}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Filter monthly runs, total ${effectiveMonthlyDeliveries}`}
              >
                <Text style={[s.perfLabel, (runTimeframe === 'month' || runTimeframe === '30days') && s.perfLabelActive]}>Monthly</Text>
                <Text style={[s.perfVal, (runTimeframe === 'month' || runTimeframe === '30days') && s.perfValActive]}>{effectiveMonthlyDeliveries}</Text>
              </TouchableOpacity>
            </View>

            {/* Today's Completed Runs with Cash Breakdown */}
            <View style={s.todayRunsSection}>
              <View style={s.runsSectionHeaderRow}>
                <Text style={s.todayRunsTitle}>
                  {runTimeframe === 'today'
                    ? "Today's Deliveries"
                    : runTimeframe === 'week' || runTimeframe === '7days'
                    ? "Weekly Runs"
                    : "Monthly Runs"}
                </Text>
                <Text style={s.periodCashTxt}>
                  ₹{(runTimeframe === 'today'
                    ? effectiveTodayCash
                    : runTimeframe === 'week' || runTimeframe === '7days'
                    ? weeklyCashFromOrders
                    : monthlyCashFromOrders
                  ).toLocaleString('en-IN')} Total
                </Text>
              </View>

              {filteredCompletedOrders.length === 0 ? (
                <View style={s.noRunsBox}>
                  <Text style={s.noRunsTxt}>
                    No runs completed {runTimeframe === 'today' ? 'today' : runTimeframe === 'week' || runTimeframe === '7days' ? 'this week' : 'this month'}.
                  </Text>
                </View>
              ) : (
                <View style={s.runsList}>
                  {filteredCompletedOrders.map(order => (
                    <View key={order.id} style={s.runItemRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.runOrderNo}>{order.orderNo}</Text>
                        <Text style={s.runCustomer}>
                          {order.customerName}{' '}
                          {order.addressSnapshot?.locality ? `• ${order.addressSnapshot.locality}` : ''}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={s.runTotal}>₹{order.total}</Text>
                        <Text style={s.runCod}>COD Collected</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </ScrollView>
        </BottomSheet>

        {/* New Assignment Modal Banner (sync row 5) */}
        {newAssignmentAlert && (
          <Modal
            transparent
            animationType="fade"
            statusBarTranslucent   // Android: render over status bar correctly
            onRequestClose={() => setNewAssignmentAlert(null)}
          >
            <View style={s.alertOverlay}>
              <View style={s.alertCard}>
                <Text style={s.alertBell}>🔔</Text>
                <Text style={s.alertTitle}>New Delivery Assigned!</Text>
                <Text style={s.alertOrderNo}>{newAssignmentAlert.orderNo}</Text>
                <Text style={s.alertCustomer}>
                  {newAssignmentAlert.customerName}
                </Text>
                <Text style={s.alertLocality}>
                  {newAssignmentAlert.addressSnapshot?.locality || 'Chennai'}
                </Text>
                <Text style={s.alertTotal}>
                  Collect ₹{newAssignmentAlert.total} (COD)
                </Text>

                <TouchableOpacity
                  style={s.alertAcceptBtn}
                  onPress={() => {
                    const id = newAssignmentAlert.id;
                    setNewAssignmentAlert(null);
                    router.push(`/agent/delivery/${id}`);
                  }}
                >
                  <Text style={s.alertAcceptTxt}>Open Delivery Run</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={s.alertDismissBtn}
                  onPress={() => setNewAssignmentAlert(null)}
                >
                  <Text style={s.alertDismissTxt}>Dismiss</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
        )}
      </View>
    </>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.cream,
  },
  header: {
    backgroundColor: Colors.green900,
    paddingTop: Platform.OS === 'ios' ? 54 : 44,
    paddingBottom: Spacing.md,
    paddingHorizontal: Spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flex: 1,
  },
  greeting: {
    fontSize: FontSize.lg,
    fontFamily: 'Manrope_800ExtraBold',
    color: '#FFFFFF',
  },
  headerSubtitle: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_500Medium',
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  earningsHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: 6,
    borderRadius: Radius.chip,
    gap: 4,
  },
  earningsHeaderTxt: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_700Bold',
    color: Colors.amber,
  },
  logoutBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },

  // Status Banner
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.card,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: Colors.line,
  },
  statusBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  statusPulseDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  statusBannerTitle: {
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.ink,
  },
  statusBannerSub: {
    fontSize: FontSize.xs - 1,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
    marginTop: 1,
  },
  toggleBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 7,
    borderRadius: Radius.chip,
    borderWidth: 1.5,
  },
  toggleBtnOnline: {
    backgroundColor: '#FEE2E2',
    borderColor: Colors.coral,
  },
  toggleBtnOffline: {
    backgroundColor: Colors.green700,
    borderColor: Colors.green700,
  },
  toggleBtnTxt: {
    fontSize: FontSize.xs - 1,
    fontFamily: 'Manrope_800ExtraBold',
    color: '#FFFFFF',
  },
  toggleBtnTxtOnline: {
    color: Colors.coral,
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm + 2,
    gap: 4,
    borderBottomWidth: 2.5,
    borderBottomColor: 'transparent',
  },
  tabItemActive: {
    borderBottomColor: Colors.green700,
  },
  tabText: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.inkSoft,
  },
  tabTextActive: {
    color: Colors.green900,
    fontFamily: 'Manrope_800ExtraBold',
  },
  tabBadge: {
    backgroundColor: Colors.line,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  tabBadgeActive: {
    backgroundColor: Colors.green700,
  },
  tabBadgeTxt: {
    fontSize: FontSize.xs - 2,
    fontFamily: 'Manrope_800ExtraBold',
    color: '#FFFFFF',
  },

  listContent: {
    padding: Spacing.lg,
    gap: Spacing.md,
    paddingBottom: Spacing.xxl * 2,
  },

  // Order Card
  orderCard: {
    backgroundColor: Colors.card,
    borderRadius: Radius.card,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.line,
    ...Shadow.card,
    gap: Spacing.sm,
  },
  orderCardReady: {
    borderColor: Colors.green500,
    borderWidth: 1.5,
  },
  orderCardOut: {
    borderColor: Colors.amber,
    borderWidth: 1.5,
  },
  cardTopRow: {
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
  recoveryTag: {
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.chip,
  },
  recoveryTagTxt: {
    fontSize: FontSize.xs - 2,
    fontFamily: 'Manrope_700Bold',
    color: '#0284C7',
  },
  orderTime: {
    fontSize: FontSize.xs - 1,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
    marginTop: 2,
  },
  readyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.green500,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.chip,
    gap: 4,
    marginTop: 4,
  },
  readyPillTxt: {
    fontSize: FontSize.xs - 2,
    fontFamily: 'Manrope_800ExtraBold',
    color: '#FFFFFF',
  },
  packingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cream,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.chip,
    gap: 4,
    marginTop: 4,
  },
  packingPillTxt: {
    fontSize: FontSize.xs - 2,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.inkSoft,
  },

  // Customer box
  customerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cream,
    borderRadius: Radius.button,
    padding: Spacing.sm,
  },
  customerName: {
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_700Bold',
    color: Colors.ink,
  },
  customerPhone: {
    fontSize: FontSize.xs - 1,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
    marginTop: 1,
  },
  localityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
  },
  localityText: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.ink,
    flex: 1,
  },
  callBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.green700,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Order meta
  orderMeta: {
    gap: 4,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  infoText: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
    flex: 1,
  },

  // Footer
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Spacing.xs,
    borderTopWidth: 1,
    borderTopColor: Colors.line,
  },
  codLabel: {
    fontSize: FontSize.xs - 2,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.inkSoft,
  },
  codAmount: {
    fontSize: FontSize.md,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.green900,
  },
  footerBtnGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  mapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.button,
    borderWidth: 1,
    borderColor: Colors.green700,
    gap: 4,
  },
  mapBtnTxt: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_700Bold',
    color: Colors.green700,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.green700,
    paddingVertical: 8,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.button,
    gap: 6,
  },
  actionBtnTxt: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_800ExtraBold',
    color: '#FFFFFF',
  },

  // Bottom Sheet
  sheetScroll: {
    flex: 1,
  },
  sheetContent: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl * 2,
    gap: Spacing.md,
  },
  cashHeroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    padding: Spacing.md,
    borderRadius: Radius.card,
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: '#C8E6C9',
  },
  cashHeroLabel: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_700Bold',
    color: Colors.green900,
  },
  cashHeroAmount: {
    fontSize: FontSize.xl,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.green700,
    marginTop: 2,
  },
  cashHeroSub: {
    fontSize: FontSize.xs - 1,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
    marginTop: 2,
  },
  timeframeRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    gap: Spacing.xs,
    backgroundColor: Colors.cream,
  },
  timeframeChip: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: Radius.chip,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeframeChipActive: {
    backgroundColor: Colors.green700,
    borderColor: Colors.green700,
  },
  timeframeChipTxt: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.inkSoft,
  },
  timeframeChipTxtActive: {
    color: '#FFFFFF',
    fontFamily: 'Manrope_700Bold',
  },
  perfGrid: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  perfBox: {
    flex: 1,
    backgroundColor: Colors.cream,
    borderRadius: Radius.button,
    padding: Spacing.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.line,
  },
  perfBoxActive: {
    backgroundColor: '#E8F5E9',
    borderColor: Colors.green700,
  },
  perfLabel: {
    fontSize: FontSize.xs - 2,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.inkSoft,
  },
  perfLabelActive: {
    color: Colors.green700,
    fontFamily: 'Manrope_700Bold',
  },
  perfVal: {
    fontSize: FontSize.md,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.ink,
    marginTop: 2,
  },
  perfValActive: {
    color: Colors.green700,
  },
  todayRunsSection: {
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  runsSectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  todayRunsTitle: {
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_700Bold',
    color: Colors.ink,
  },
  periodCashTxt: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.green700,
  },
  noRunsBox: {
    paddingVertical: Spacing.lg,
    alignItems: 'center',
  },
  noRunsTxt: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
  },
  runsList: {
    gap: Spacing.xs,
  },
  runItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.card,
    padding: Spacing.sm,
    borderRadius: Radius.button,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  runOrderNo: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_700Bold',
    color: Colors.ink,
  },
  runCustomer: {
    fontSize: FontSize.xs - 1,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
  },
  runTotal: {
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.green700,
  },
  runCod: {
    fontSize: FontSize.xs - 2,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.amber,
  },

  // New assignment alert modal
  alertOverlay: {
    flex: 1,
    backgroundColor: 'rgba(18, 53, 36, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  alertCard: {
    backgroundColor: Colors.card,
    borderRadius: Radius.card,
    padding: Spacing.xl,
    width: '100%',
    alignItems: 'center',
  },
  alertBell: {
    fontSize: 52,
    marginBottom: Spacing.sm,
  },
  alertTitle: {
    fontSize: FontSize.lg,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.ink,
  },
  alertOrderNo: {
    fontSize: FontSize.xl,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.green700,
    marginTop: 4,
  },
  alertCustomer: {
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.ink,
    marginTop: 4,
  },
  alertLocality: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
  },
  alertTotal: {
    fontSize: FontSize.md,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.amber,
    marginVertical: Spacing.md,
  },
  alertAcceptBtn: {
    backgroundColor: Colors.green700,
    borderRadius: Radius.button,
    paddingVertical: 14,
    width: '100%',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  alertAcceptTxt: {
    color: '#FFFFFF',
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_800ExtraBold',
  },
  alertDismissBtn: {
    paddingVertical: 8,
  },
  alertDismissTxt: {
    color: Colors.inkSoft,
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_600SemiBold',
  },
});
