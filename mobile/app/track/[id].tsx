// app/track/[id].tsx — Live Order Tracking & Status Screen
import React, { useEffect, useState, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  Alert,
  Linking,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors, Spacing, Radius, FontSize, Shadow, StatusColors } from '../../theme';
import { useSession } from '../../hooks/useSession';
import { listenOrder, transitionOrder } from '../../services/orders';
import { ScreenHeader, StatusPill, Button, useToast } from '../../components/ui';
import type { Order, OrderStatus } from '../../types';

const STEPS: { key: OrderStatus; label: string; icon: string; desc: string }[] = [
  {
    key: 'placed',
    label: 'Order Placed',
    icon: '📝',
    desc: 'We received your order and are confirming items',
  },
  {
    key: 'packed',
    label: 'Packed & Ready',
    icon: '📦',
    desc: 'Items packed fresh at the store',
  },
  {
    key: 'out_for_delivery',
    label: 'Out for Delivery',
    icon: '🚴‍♂️',
    desc: 'Delivery partner is on the way to your door',
  },
  {
    key: 'delivered',
    label: 'Delivered',
    icon: '🎉',
    desc: 'Order delivered successfully',
  },
];

export default function TrackOrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { uid, name } = useSession();
  const { showToast } = useToast();

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [secs, setSecs] = useState(15 * 60);

  // Pulse animation for active delivery
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.06, duration: 800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true }),
      ]),
    ).start();
  }, []);

  // Live order listener
  useEffect(() => {
    if (!id) return;
    setLoading(true);

    const unsub = listenOrder(
      id,
      data => {
        setOrder(data);
        setLoading(false);
      },
      err => {
        console.error('Error listening to order:', err);
        setLoading(false);
      },
    );

    return () => unsub();
  }, [id]);

  // Delivery countdown timer
  useEffect(() => {
    if (!order || order.status === 'delivered' || order.status === 'cancelled') return;
    const interval = setInterval(() => {
      setSecs(s => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [order?.status]);

  const fmtTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const remainder = s % 60;
    return `${String(mins).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
  };

  const isDelivered = order?.status === 'delivered';
  const isCancelled = order?.status === 'cancelled';
  const isPlaced = order?.status === 'placed';

  const currentStepIndex = useMemo(() => {
    if (!order) return 0;
    if (order.status === 'cancelled') return -1;
    return STEPS.findIndex(s => s.key === order.status);
  }, [order?.status]);

  // Cancel order action
  const handleCancel = () => {
    if (!order || order.status !== 'placed') {
      Alert.alert(
        'Cannot Cancel',
        'Orders can only be cancelled while in "Placed" status.',
      );
      return;
    }

    Alert.alert(
      'Cancel Order',
      `Are you sure you want to cancel order ${order.orderNo}?`,
      [
        { text: 'Keep Order', style: 'cancel' },
        {
          text: 'Cancel Order',
          style: 'destructive',
          onPress: async () => {
            if (!uid) return;
            setCancelling(true);
            try {
              await transitionOrder({
                orderId: order.id,
                order,
                toStatus: 'cancelled',
                actor: {
                  uid,
                  role: 'customer',
                  name: name || 'Customer',
                },
                cancelReason: 'Cancelled by customer',
              });

              showToast(`Order ${order.orderNo} has been cancelled.`, 'info');
            } catch (err: any) {
              Alert.alert('Cancellation Error', err.message || 'Could not cancel.');
            } finally {
              setCancelling(false);
            }
          },
        },
      ],
    );
  };

  return (
    <View style={styles.container}>
      <ScreenHeader
        title={order ? `Order #${order.orderNo}` : 'Track Order'}
        subtitle="Live delivery status & partner updates"
        showBack
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {loading || !order ? (
          <View style={styles.center}>
            <Text style={styles.loadingText}>Fetching order details... 🛒</Text>
          </View>
        ) : (
          <>
            {/* ─── Cancelled Banner ────────────────────────────────────────── */}
            {isCancelled && (
              <View style={styles.cancelledCard}>
                <Text style={styles.cancelledIcon}>❌</Text>
                <Text style={styles.cancelledTitle}>Order Cancelled</Text>
                <Text style={styles.cancelledSub}>
                  {order.cancelReason || 'This order was cancelled.'}
                </Text>
              </View>
            )}

            {/* ─── Delivered Banner ────────────────────────────────────────── */}
            {isDelivered && (
              <View style={styles.deliveredCard}>
                <Text style={styles.deliveredIcon}>🎉</Text>
                <Text style={styles.deliveredTitle}>Order Delivered!</Text>
                <Text style={styles.deliveredSub}>
                  Thank you for shopping with Anandhi Stores!
                </Text>
              </View>
            )}

            {/* ─── Active Delivery Countdown ───────────────────────────────── */}
            {!isDelivered && !isCancelled && (
              <View style={styles.timerCard}>
                <Text style={styles.timerLabel}>Estimated Delivery</Text>
                <Animated.View
                  style={[
                    styles.timerCircle,
                    { transform: [{ scale: pulse }] },
                  ]}
                >
                  <Text style={styles.timerDigits}>{fmtTime(secs)}</Text>
                  <Text style={styles.timerSub}>minutes</Text>
                </Animated.View>
                <Text style={styles.timerPromise}>
                  ⚡ Fast Delivery • Cash on Delivery
                </Text>
              </View>
            )}

            {/* ─── Status Machine Timeline ─────────────────────────────────── */}
            {!isCancelled && (
              <View style={styles.timelineCard}>
                <Text style={styles.sectionTitle}>Order Progress</Text>
                {STEPS.map((step, idx) => {
                  const isCompleted = idx < currentStepIndex || isDelivered;
                  const isCurrent = idx === currentStepIndex && !isDelivered;
                  const isPending = idx > currentStepIndex && !isDelivered;
                  const isLast = idx === STEPS.length - 1;

                  return (
                    <View key={step.key} style={[styles.timelineRow, isPending && { opacity: 0.55 }]}>
                      <View style={styles.timelineLeft}>
                        <View
                          style={[
                            styles.stepDot,
                            isCompleted && styles.stepDotDone,
                            isCurrent && styles.stepDotCurrent,
                          ]}
                        >
                          <Text style={styles.stepIcon}>{step.icon}</Text>
                        </View>
                        {!isLast && (
                          <View
                            style={[
                              styles.timelineLine,
                              isCompleted && styles.timelineLineDone,
                            ]}
                          />
                        )}
                      </View>

                      <View
                        style={[
                          styles.timelineContent,
                          isCurrent && styles.timelineContentActive,
                        ]}
                      >
                        <View style={styles.stepLabelRow}>
                          <Text
                            style={[
                              styles.stepLabel,
                              isCurrent && styles.stepLabelCurrent,
                              isCompleted && styles.stepLabelDone,
                            ]}
                          >
                            {step.label}
                          </Text>
                          {isCurrent && (
                            <View style={styles.activeBadge}>
                              <View style={styles.activeDot} />
                              <Text style={styles.activeBadgeText}>IN PROGRESS</Text>
                            </View>
                          )}
                          {isCompleted && (
                            <View style={styles.doneBadge}>
                              <Text style={styles.doneBadgeText}>✓ Done</Text>
                            </View>
                          )}
                        </View>
                        <Text style={[styles.stepDesc, isCurrent && styles.stepDescCurrent]}>
                          {step.desc}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            {/* ─── Delivery Partner Card ───────────────────────────────────── */}
            {order.agentName && !isCancelled && (
              <View style={styles.partnerCard}>
                <View style={styles.partnerHeader}>
                  <View style={styles.partnerAvatar}>
                    <Text style={styles.partnerAvatarText}>🚴‍♂️</Text>
                  </View>
                  <View style={styles.partnerInfo}>
                    <Text style={styles.partnerTitle}>Delivery Partner</Text>
                    <Text style={styles.partnerName}>{order.agentName}</Text>
                    {order.agentPhone && (
                      <Text style={styles.partnerPhone}>+91 {order.agentPhone}</Text>
                    )}
                  </View>
                </View>

                {order.agentPhone && (
                  <TouchableOpacity
                    style={styles.callPartnerBtn}
                    onPress={() =>
                      Linking.openURL(`tel:${order.agentPhone}`).catch(() =>
                        Alert.alert('Error', 'Calling not supported'),
                      )
                    }
                  >
                    <Text style={styles.callIcon}>📞</Text>
                    <Text style={styles.callText}>Call Partner</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* ─── COD Payment Notice ──────────────────────────────────────── */}
            <View style={styles.codCard}>
              <Text style={styles.codIcon}>💵</Text>
              <View style={styles.codContent}>
                <Text style={styles.codTitle}>
                  {isDelivered ? 'Payment Received' : `Pay ₹${order.total} via Cash`}
                </Text>
                <Text style={styles.codSub}>
                  {isDelivered
                    ? 'Payment collected on delivery.'
                    : 'Please keep exact cash ready upon arrival.'}
                </Text>
              </View>
            </View>

            {/* ─── Order Summary Details ───────────────────────────────────── */}
            <View style={styles.detailsCard}>
              <Text style={styles.sectionTitle}>Items in Order</Text>

              <View style={styles.itemsList}>
                {order.items?.map((item, idx) => (
                  <View key={`${item.itemId}-${idx}`} style={styles.itemRow}>
                    <View style={styles.itemRowLeft}>
                      <Text style={styles.itemName}>{item.name}</Text>
                      <Text style={styles.itemUnit}>{item.unit}</Text>
                    </View>
                    <Text style={styles.itemQtyPrice}>
                      {item.qty} × ₹{item.price} = ₹{item.lineTotal || item.qty * item.price}
                    </Text>
                  </View>
                ))}
              </View>

              <View style={styles.billDivider} />

              <View style={styles.billRow}>
                <Text style={styles.billLabel}>Subtotal</Text>
                <Text style={styles.billValue}>₹{order.subtotal}</Text>
              </View>

              <View style={styles.billRow}>
                <Text style={styles.billLabel}>Delivery Fee</Text>
                <Text style={styles.billValue}>
                  {order.deliveryFee === 0 ? 'FREE' : `₹${order.deliveryFee}`}
                </Text>
              </View>

              <View style={styles.billDivider} />

              <View style={styles.billRowTotal}>
                <Text style={styles.billTotalLabel}>Total Amount</Text>
                <Text style={styles.billTotalValue}>₹{order.total}</Text>
              </View>

              {/* Delivery Address */}
              <View style={styles.addressSnapshotBox}>
                <Text style={styles.addressSnapshotLabel}>Delivery Address:</Text>
                <Text style={styles.addressSnapshotText}>
                  {[
                    order.addressSnapshot?.door,
                    order.addressSnapshot?.street,
                    order.addressSnapshot?.locality,
                    order.addressSnapshot?.city,
                    order.addressSnapshot?.landmark && `Near ${order.addressSnapshot.landmark}`,
                  ]
                    .filter(Boolean)
                    .join(', ')}
                </Text>
              </View>
            </View>

            {/* ─── Cancel Order Button (Placed only) ───────────────────────── */}
            {isPlaced && (
              <View style={styles.cancelWrap}>
                <Button
                  label={cancelling ? 'Cancelling...' : 'Cancel Order'}
                  variant="danger"
                  loading={cancelling}
                  disabled={cancelling}
                  onPress={handleCancel}
                />
              </View>
            )}

            {/* ─── Back to Store Button ────────────────────────────────────── */}
            <TouchableOpacity
              style={styles.backHomeBtn}
              onPress={() => router.replace('/(customer)')}
            >
              <Text style={styles.backHomeBtnText}>Back to Shop 🛒</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
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
  center: {
    paddingVertical: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: FontSize.md,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.inkSoft,
  },
  cancelledCard: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: Colors.coral,
    borderRadius: Radius.card,
    padding: Spacing.xl,
    alignItems: 'center',
  },
  cancelledIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  cancelledTitle: {
    fontSize: FontSize.lg,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.coral,
  },
  cancelledSub: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
    marginTop: 4,
    textAlign: 'center',
  },
  deliveredCard: {
    backgroundColor: '#EAF8F0',
    borderWidth: 1,
    borderColor: Colors.green500,
    borderRadius: Radius.card,
    padding: Spacing.xl,
    alignItems: 'center',
  },
  deliveredIcon: {
    fontSize: 36,
    marginBottom: 8,
  },
  deliveredTitle: {
    fontSize: FontSize.xl,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.green700,
  },
  deliveredSub: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_500Medium',
    color: Colors.green700,
    marginTop: 4,
    textAlign: 'center',
  },
  timerCard: {
    backgroundColor: Colors.card,
    borderRadius: Radius.card,
    padding: Spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.line,
    ...Shadow.card,
  },
  timerLabel: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.inkSoft,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Spacing.md,
  },
  timerCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 4,
    borderColor: Colors.green500,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.cream,
    marginBottom: Spacing.md,
  },
  timerDigits: {
    fontSize: 34,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.green900,
  },
  timerSub: {
    fontSize: 11,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.inkSoft,
    marginTop: 2,
  },
  timerPromise: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.green700,
  },
  timelineCard: {
    backgroundColor: Colors.card,
    borderRadius: Radius.card,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.line,
    ...Shadow.card,
  },
  sectionTitle: {
    fontSize: FontSize.md,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.ink,
    marginBottom: Spacing.lg,
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  timelineLeft: {
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  stepDot: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.cream,
    borderWidth: 2,
    borderColor: Colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotDone: {
    borderColor: Colors.green500,
    backgroundColor: '#EAF8F0',
  },
  stepDotCurrent: {
    borderColor: Colors.green700,
    borderWidth: 3,
    backgroundColor: '#DCFCE7',
    transform: [{ scale: 1.12 }],
    ...Shadow.card,
  },
  stepIcon: {
    fontSize: 16,
  },
  timelineLine: {
    width: 2.5,
    height: 38,
    backgroundColor: Colors.line,
    marginVertical: 3,
  },
  timelineLineDone: {
    backgroundColor: Colors.green500,
  },
  timelineContent: {
    flex: 1,
    paddingTop: 2,
    paddingBottom: Spacing.md,
    paddingLeft: Spacing.xs,
  },
  timelineContentActive: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1.5,
    borderColor: '#86EFAC',
    borderRadius: 14,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  stepLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  stepLabel: {
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.inkSoft,
  },
  stepLabelDone: {
    color: Colors.ink,
    fontFamily: 'Manrope_700Bold',
  },
  stepLabelCurrent: {
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.green900,
    fontSize: FontSize.sm + 1,
  },
  stepDesc: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
    marginTop: 2,
  },
  stepDescCurrent: {
    color: Colors.ink,
    fontFamily: 'Manrope_600SemiBold',
  },
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.chip,
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.green700,
  },
  activeBadgeText: {
    fontSize: FontSize.xs - 3,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.green900,
    letterSpacing: 0.5,
  },
  doneBadge: {
    backgroundColor: '#EAF8F0',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: Radius.chip,
  },
  doneBadgeText: {
    fontSize: FontSize.xs - 3,
    fontFamily: 'Manrope_700Bold',
    color: Colors.green700,
  },
  partnerCard: {
    backgroundColor: Colors.card,
    borderRadius: Radius.card,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.line,
    ...Shadow.card,
  },
  partnerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  partnerAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  partnerAvatarText: {
    fontSize: 24,
  },
  partnerInfo: {
    flex: 1,
  },
  partnerTitle: {
    fontSize: 11,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.inkSoft,
    textTransform: 'uppercase',
  },
  partnerName: {
    fontSize: FontSize.md,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.ink,
  },
  partnerPhone: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
    marginTop: 2,
  },
  callPartnerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.green700,
    paddingVertical: 10,
    borderRadius: Radius.button,
    gap: 6,
  },
  callIcon: {
    fontSize: 14,
  },
  callText: {
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_600SemiBold',
    color: '#ffffff',
  },
  codCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EAF8F0',
    padding: Spacing.lg,
    borderRadius: Radius.card,
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.green500,
  },
  codIcon: {
    fontSize: 28,
  },
  codContent: {
    flex: 1,
  },
  codTitle: {
    fontSize: FontSize.md,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.green700,
  },
  codSub: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_500Medium',
    color: Colors.green700,
    marginTop: 2,
  },
  detailsCard: {
    backgroundColor: Colors.card,
    borderRadius: Radius.card,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.line,
    ...Shadow.card,
  },
  itemsList: {
    gap: Spacing.sm,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemRowLeft: {
    flex: 1,
    marginRight: Spacing.md,
  },
  itemName: {
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.ink,
  },
  itemUnit: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
  },
  itemQtyPrice: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.ink,
  },
  billDivider: {
    height: 1,
    backgroundColor: Colors.line,
    marginVertical: Spacing.md,
  },
  billRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
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
  billRowTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  billTotalLabel: {
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.ink,
  },
  billTotalValue: {
    fontSize: FontSize.lg,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.green700,
  },
  addressSnapshotBox: {
    backgroundColor: Colors.cream,
    padding: Spacing.md,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  addressSnapshotLabel: {
    fontSize: 10,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.inkSoft,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  addressSnapshotText: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_500Medium',
    color: Colors.ink,
    lineHeight: 18,
  },
  cancelWrap: {
    marginTop: Spacing.sm,
  },
  backHomeBtn: {
    paddingVertical: 14,
    borderRadius: Radius.button,
    borderWidth: 1,
    borderColor: Colors.green700,
    backgroundColor: Colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.sm,
  },
  backHomeBtnText: {
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.green700,
  },
});
