// app/agent/delivery/[id].tsx — Active Delivery Run & Status Actions
import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Linking,
  Platform,
  Modal,
  Image,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, Spacing, Radius, FontSize, Shadow, StatusColors } from '../../../theme';
import { useSession } from '../../../hooks/useSession';
import { useQRCodes } from '../../../hooks/useQRCodes';
import { generateUPIUri, getQRCodeImageUrl } from '../../../services/qr';
import { listenOrder, transitionOrder, updateOrderChecklist } from '../../../services/orders';
import { openMapChoice } from '../../../utils/openMap';
import {
  Card,
  StatusPill,
  Button,
  SwipeToConfirm,
  EmptyState,
  CardSkeleton,
  useToast,
} from '../../../components/ui';
import type { Order, Actor, PaymentMethod } from '../../../types';

export default function ActiveDeliveryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { uid, name: sessionName } = useSession();
  const { showToast } = useToast();
  const { defaultQR } = useQRCodes();

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [updating, setUpdating] = useState(false);

  // Item checklist
  const [checkedItems, setCheckedItems] = useState<Record<number, boolean>>({});

  // Empty cans tracking
  const [emptyCansCollected, setEmptyCansCollected] = useState(0);

  // Delivery confirmation & QR modal
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);
  const [deliveryPaymentMethod, setDeliveryPaymentMethod] = useState<PaymentMethod>('cash');

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setOrder(null);
    setCheckedItems({});

    // Load cached checklist from AsyncStorage immediately
    AsyncStorage.getItem(`@order_checklist_${id}`)
      .then(raw => {
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            const loaded: Record<string | number, boolean> = {};
            Object.entries(parsed).forEach(([k, v]) => {
              loaded[k] = Boolean(v);
              const numKey = Number(k);
              if (!isNaN(numKey)) loaded[numKey] = Boolean(v);
            });
            setCheckedItems(loaded);
          } catch (_) {}
        }
      })
      .catch(() => {});

    const unsub = listenOrder(
      id,
      orderData => {
        setOrder(orderData);
        if (orderData?.pendingCansToCollect && emptyCansCollected === 0) {
          setEmptyCansCollected(orderData.pendingCansToCollect);
        }
        if (orderData?.checkedItems) {
          const loaded: Record<string | number, boolean> = {};
          Object.entries(orderData.checkedItems).forEach(([k, v]) => {
            loaded[k] = Boolean(v);
            const numKey = Number(k);
            if (!isNaN(numKey)) loaded[numKey] = Boolean(v);
          });
          setCheckedItems(loaded);
          AsyncStorage.setItem(`@order_checklist_${id}`, JSON.stringify(loaded)).catch(() => {});
        }
        setLoading(false);
      },
      err => {
        console.error('Error listening to order:', err);
        setError(err);
        setLoading(false);
      },
    );

    return unsub;
  }, [id]);

  const actor: Actor = useMemo(() => ({
    uid: uid || 'agent',
    role: 'agent',
    name: sessionName || 'Delivery Agent',
  }), [uid, sessionName]);

  // Check if order contains water cans
  const hasWaterCans = useMemo(() => {
    if (!order) return false;
    if (order.type === 'recovery') return true;
    return (order.items || []).some(
      i =>
        i.name.toLowerCase().includes('can') ||
        (i.unit && i.unit.toLowerCase().includes('can')),
    );
  }, [order]);

  const totalCansDelivered = useMemo(() => {
    if (!order || !order.items) return 0;
    return order.items
      .filter(
        i =>
          i.name.toLowerCase().includes('can') ||
          (i.unit && i.unit.toLowerCase().includes('can')),
      )
      .reduce((sum, i) => sum + i.qty, 0);
  }, [order]);

  // Upper limit on empty cans customer can return (based on cans placed in order or pending recovery cans)
  const maxReturnLimit = useMemo(() => {
    if (!order) return 0;
    if (order.type === 'recovery') {
      return order.pendingCansToCollect || 1;
    }
    return totalCansDelivered;
  }, [order, totalCansDelivered]);

  // Keep empty cans collected strictly clamped within [0, maxReturnLimit]
  useEffect(() => {
    if (maxReturnLimit > 0 && emptyCansCollected > maxReturnLimit) {
      setEmptyCansCollected(maxReturnLimit);
    }
  }, [maxReturnLimit, emptyCansCollected]);

  // Call customer
  const handleCall = () => {
    if (!order?.customerPhone) return;
    Linking.openURL(`tel:${order.customerPhone}`).catch(() => {
      showToast('Could not open phone dialer', 'error');
    });
  };

  // Open in Maps
  const handleOpenMaps = () => {
    if (!order) return;
    const lat = order.addressSnapshot?.lat ?? null;
    const lng = order.addressSnapshot?.lng ?? null;
    const label = `${order.customerName}, ${order.addressSnapshot?.street || ''}`;
    openMapChoice(lat, lng, label);
  };

  // Total checklist items required for retail orders
  const checklistItems = useMemo(() => {
    return order?.items || [];
  }, [order?.items]);

  const totalChecklistCount = checklistItems.length;

  const checkedCount = useMemo(() => {
    if (!checklistItems.length) return 0;
    return checklistItems.filter((_, idx) => !!checkedItems[idx] || !!(checkedItems as any)[String(idx)]).length;
  }, [checklistItems, checkedItems]);

  const allChecklistItemsChecked = useMemo(() => {
    // Recovery orders do not have product checklist items
    if (order?.type === 'recovery') return true;
    if (totalChecklistCount === 0) return true;
    return checkedCount >= totalChecklistCount;
  }, [order?.type, totalChecklistCount, checkedCount]);

  // Toggle item checklist (persisted to AsyncStorage & Firestore, editable ONLY before delivered)
  const toggleItemCheck = async (idx: number) => {
    if (isDelivered) {
      showToast('Order is delivered. Checklist is locked.', 'info');
      return;
    }
    Haptics.selectionAsync();
    const currentVal = !!checkedItems[idx] || !!(checkedItems as any)[String(idx)];
    const newVal = !currentVal;
    const updated: Record<string | number, boolean> = {
      ...checkedItems,
      [idx]: newVal,
      [String(idx)]: newVal,
    };
    setCheckedItems(loaded => ({ ...loaded, [idx]: newVal, [String(idx)]: newVal }));
    if (order?.id) {
      AsyncStorage.setItem(`@order_checklist_${order.id}`, JSON.stringify(updated)).catch(() => {});
      try {
        await updateOrderChecklist(order.id, updated);
      } catch (e) {
        console.error('Failed to sync checklist to Firestore:', e);
      }
    }
  };

  // Toggle all items at once for faster agent verification
  const handleToggleCheckAll = async () => {
    if (isDelivered || !order?.items?.length) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const targetVal = !allChecklistItemsChecked;
    const updated: Record<string | number, boolean> = {};
    order.items.forEach((_, idx) => {
      updated[idx] = targetVal;
      updated[String(idx)] = targetVal;
    });
    setCheckedItems(updated);
    if (order?.id) {
      AsyncStorage.setItem(`@order_checklist_${order.id}`, JSON.stringify(updated)).catch(() => {});
      try {
        await updateOrderChecklist(order.id, updated);
      } catch (e) {
        console.error('Failed to sync checklist to Firestore:', e);
      }
    }
    showToast(targetVal ? 'All items marked as checked' : 'All items unchecked', 'info');
  };

  // Action: Mark Picked Up
  const handleMarkPickedUp = async () => {
    if (!order) return;

    if (order.status !== 'placed' && order.status !== 'packed') {
      showToast('This order cannot be picked up right now.', 'info');
      return;
    }

    // Strict checklist enforcement: Must check off all items before pickup
    if (!allChecklistItemsChecked) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(
        'Checklist Incomplete',
        `You cannot pick up this order without verifying the products.\n\nPlease check off all ${totalChecklistCount} items on the checklist before starting delivery.\n\nCurrently checked: ${checkedCount} of ${totalChecklistCount}`,
        [{ text: 'OK' }]
      );
      showToast(`Please check all ${totalChecklistCount} items before pickup`, 'error');
      return;
    }

    try {
      setUpdating(true);
      await transitionOrder({
        orderId: order.id,
        order,
        toStatus: 'out_for_delivery',
        actor,
        checkedItems,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast('Order picked up! Now Out for Delivery.', 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update order';
      showToast(msg, 'error');
    } finally {
      setUpdating(false);
    }
  };

  // Action: Prompt Swipe confirmation
  const handleSwipeDelivered = () => {
    // Safety check: Cannot deliver without completing checklist
    if (!allChecklistItemsChecked) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(
        'Checklist Incomplete',
        `All ${totalChecklistCount} items must be verified and checked off on the checklist before marking the order as delivered.\n\nCurrently checked: ${checkedCount} of ${totalChecklistCount}`,
        [{ text: 'OK' }]
      );
      showToast('Checklist incomplete. Please check all items.', 'error');
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setShowConfirmModal(true);
  };

  // Action: Confirm and Mark Delivered
  const handleConfirmDelivered = async (method: PaymentMethod = deliveryPaymentMethod) => {
    if (!order) return;

    // Safety guard
    if (!allChecklistItemsChecked) {
      showToast('Checklist incomplete. Please check all items.', 'error');
      return;
    }

    try {
      setUpdating(true);
      setShowConfirmModal(false);
      setShowQRModal(false);

      const isUpi = method === 'upi_qr';
      await transitionOrder({
        orderId: order.id,
        order,
        toStatus: 'delivered',
        actor,
        checkedItems,
        emptyCansCollected: hasWaterCans ? emptyCansCollected : undefined,
        paymentMethod: method,
        qrId: isUpi ? (defaultQR?.id || null) : null,
        qrLabel: isUpi ? (defaultQR?.name || 'Store UPI QR') : null,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast(
        isUpi
          ? 'Order Delivered & UPI QR Payment Recorded! 🎉'
          : 'Order Delivered & Cash Collected! 🎉',
        'success',
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to mark delivered';
      showToast(msg, 'error');
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <View style={s.container}>
        <Stack.Screen options={{ title: 'Loading Run...' }} />
        <View style={{ padding: Spacing.lg, gap: Spacing.md }}>
          <CardSkeleton />
          <CardSkeleton />
        </View>
      </View>
    );
  }

  if (error || !order) {
    return (
      <View style={s.container}>
        <Stack.Screen options={{ title: 'Order Not Found' }} />
        <View style={s.centerContent}>
          <EmptyState
            title="Order Not Found"
            subtitle="This order may have been reassigned, cancelled, or does not exist."
            actionLabel="Back to Dashboard"
            onAction={() => router.replace('/agent/dashboard')}
          />
        </View>
      </View>
    );
  }

  // Check if reassigned away from this agent
  const isAssignedToCurrentAgent = order.agentId === uid;
  if (!isAssignedToCurrentAgent) {
    return (
      <View style={s.container}>
        <Stack.Screen options={{ title: 'Order Reassigned' }} />
        <View style={s.centerContent}>
          <EmptyState
            title="Run Reassigned"
            subtitle="This order is no longer assigned to your account."
            actionLabel="Return to Dashboard"
            onAction={() => router.replace('/agent/dashboard')}
          />
        </View>
      </View>
    );
  }

  const isDelivered = order.status === 'delivered';
  const isOut = order.status === 'out_for_delivery';
  const isPacked = order.status === 'packed';
  const isPlaced = order.status === 'placed';
  const isRecovery = order.type === 'recovery';

  return (
    <>
      <Stack.Screen
        options={{
          title: `${isRecovery ? '💧 Can Recovery' : 'Delivery'} ${order.orderNo}`,
          headerBackTitle: 'Dashboard',
        }}
      />

      <ScrollView
        style={s.container}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Prominent COD Cash Banner (P18) */}
        <View style={[s.codHeroBanner, isDelivered && s.codHeroBannerDelivered]}>
          <View style={s.codHeroLeft}>
            <View style={s.cashIconBadge}>
              <Ionicons
                name={isDelivered ? 'checkmark-circle' : 'cash'}
                size={28}
                color="#FFFFFF"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.codHeroTitle}>
                {isDelivered
                  ? 'DELIVERY COMPLETED'
                  : isRecovery
                  ? 'EMPTY CAN COLLECTION'
                  : 'COLLECT CASH ON DELIVERY'}
              </Text>
              <Text style={s.codHeroAmount}>
                {isRecovery && order.total === 0 ? 'Collect Empty Cans' : `₹${order.total}`}
              </Text>
              <Text style={s.codHeroNote}>
                {isDelivered
                  ? 'Cash collected & recorded in today’s handover'
                  : 'Cash on Delivery only. Please collect the exact bill amount.'}
              </Text>
            </View>
          </View>
        </View>

        {/* Customer Information Card */}
        <Card style={s.card}>
          <View style={s.cardHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.customerName}>{order.customerName}</Text>
              <Text style={s.customerPhone}>{order.customerPhone}</Text>
            </View>
            <StatusPill status={order.status} />
          </View>

          {/* Address Details */}
          <View style={s.addressBox}>
            <Ionicons name="location" size={18} color={Colors.coral} style={{ marginTop: 2 }} />
            <View style={{ flex: 1 }}>
              <Text style={s.addressText}>
                {[
                  order.addressSnapshot?.door,
                  order.addressSnapshot?.street,
                  order.addressSnapshot?.locality,
                  order.addressSnapshot?.city,
                ]
                  .filter(Boolean)
                  .join(', ')}
              </Text>
              {order.addressSnapshot?.landmark ? (
                <Text style={s.landmarkText}>
                  Landmark: {order.addressSnapshot.landmark}
                </Text>
              ) : null}
            </View>
          </View>

          {/* Delivery Slot & Notes */}
          <View style={s.slotNotesRow}>
            {order.slot?.label && (
              <View style={s.badgeItem}>
                <Ionicons name="time-outline" size={14} color={Colors.inkSoft} />
                <Text style={s.badgeItemText}>{order.slot.label}</Text>
              </View>
            )}
            {order.notes ? (
              <View style={[s.badgeItem, { backgroundColor: '#FEF3C7' }]}>
                <Ionicons name="chatbubble-ellipses-outline" size={14} color="#B45309" />
                <Text style={[s.badgeItemText, { color: '#B45309' }]}>
                  Note: {order.notes}
                </Text>
              </View>
            ) : null}
          </View>

          {/* Action Buttons: Call & Maps */}
          <View style={s.actionRow}>
            <TouchableOpacity style={s.callBtn} onPress={handleCall} activeOpacity={0.8}>
              <Ionicons name="call" size={18} color="#FFFFFF" />
              <Text style={s.callBtnTxt}>Call Customer</Text>
            </TouchableOpacity>

            <TouchableOpacity style={s.mapBtn} onPress={handleOpenMaps} activeOpacity={0.8}>
              <Ionicons name="navigate" size={18} color={Colors.green700} />
              <Text style={s.mapBtnTxt}>
                {Platform.OS === 'ios' ? 'Apple Maps' : 'Google Maps'}
              </Text>
            </TouchableOpacity>
          </View>
        </Card>

        {/* Can Recovery & Empties Counter: Only visible once Out for Delivery or Delivered */}
        {hasWaterCans && (isOut || isDelivered) && (
          <Card style={s.canCard}>
            <View style={s.canHeader}>
              <Ionicons name="water" size={24} color="#0284C7" />
              <View style={{ flex: 1 }}>
                <Text style={s.canTitle}>Empty Water Cans to Return</Text>
                <Text style={s.canSubtitle}>
                  {totalCansDelivered > 0
                    ? `Customer ordered ${totalCansDelivered} fresh water can${
                        totalCansDelivered > 1 ? 's' : ''
                      }. Max limit: up to ${totalCansDelivered} empty can${
                        totalCansDelivered > 1 ? 's' : ''
                      } can be returned for refill.`
                    : `Collection run for ${order.pendingCansToCollect || 1} pending empty can${(order.pendingCansToCollect || 1) > 1 ? 's' : ''}.`}
                </Text>
              </View>
            </View>

            <View style={s.canCounterRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.canCounterLabel}>Empty Cans Collected:</Text>
                <Text style={s.canLimitHint}>
                  {maxReturnLimit > 0
                    ? `Max limit: ${maxReturnLimit} can${maxReturnLimit > 1 ? 's' : ''} (ordered)`
                    : 'No cans in order'}
                </Text>
              </View>
              <View style={s.stepper}>
                <TouchableOpacity
                  style={[s.stepBtn, (emptyCansCollected <= 0 || isDelivered) && s.stepBtnDisabled]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setEmptyCansCollected(prev => Math.max(0, prev - 1));
                  }}
                  disabled={emptyCansCollected <= 0 || isDelivered}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel="Decrease empty cans collected"
                >
                  <Text style={s.stepBtnTxt}>−</Text>
                </TouchableOpacity>

                <Text style={s.stepValue} accessibilityLabel={`${emptyCansCollected} empty cans collected`}>
                  {emptyCansCollected}
                </Text>

                <TouchableOpacity
                  style={[
                    s.stepBtn,
                    (emptyCansCollected >= maxReturnLimit || isDelivered) && s.stepBtnDisabled,
                  ]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setEmptyCansCollected(prev => Math.min(maxReturnLimit, prev + 1));
                  }}
                  disabled={emptyCansCollected >= maxReturnLimit || isDelivered}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel="Increase empty cans collected"
                >
                  <Text style={s.stepBtnTxt}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Card>
        )}

        {/* Items Checklist (P18) */}
        {order.items && order.items.length > 0 && (
          <Card style={s.card}>
            <View style={s.sectionHeaderRow}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={s.sectionTitle}>Order Checklist ({order.items.length})</Text>
                  <View
                    style={[
                      s.checklistStatusBadge,
                      allChecklistItemsChecked ? s.checklistBadgeDone : s.checklistBadgePending,
                    ]}
                  >
                    <Ionicons
                      name={allChecklistItemsChecked ? 'checkmark-circle' : 'time-outline'}
                      size={12}
                      color={allChecklistItemsChecked ? Colors.green700 : '#B45309'}
                    />
                    <Text
                      style={[
                        s.checklistBadgeTxt,
                        allChecklistItemsChecked ? s.checklistBadgeTxtDone : s.checklistBadgeTxtPending,
                      ]}
                    >
                      {checkedCount}/{totalChecklistCount} Checked
                    </Text>
                  </View>
                </View>
                <Text style={s.sectionSubtitle}>
                  {isDelivered
                    ? 'Checklist locked (Order delivered)'
                    : allChecklistItemsChecked
                    ? 'All items verified and ready for delivery'
                    : 'Tap items to check off before picking up'}
                </Text>
              </View>

              {!isDelivered && (
                <TouchableOpacity
                  style={s.checkAllBtn}
                  onPress={handleToggleCheckAll}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={allChecklistItemsChecked ? 'Uncheck all items' : 'Check all items'}
                >
                  <Text style={s.checkAllBtnTxt}>
                    {allChecklistItemsChecked ? 'Uncheck All' : 'Check All'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={s.checklist}>
              {order.items.map((item, idx) => {
                const isChecked = !!checkedItems[idx] || !!(checkedItems as any)[String(idx)];
                return (
                  <TouchableOpacity
                    key={`${item.itemId}-${idx}`}
                    style={[
                      s.checkItemRow,
                      isChecked && s.checkItemRowChecked,
                      isDelivered && { opacity: 0.8 },
                    ]}
                    onPress={() => toggleItemCheck(idx)}
                    disabled={isDelivered}
                    activeOpacity={0.8}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: isChecked }}
                    accessibilityLabel={`Item ${item.name}, quantity ${item.qty}`}
                  >
                    <View style={[s.checkbox, isChecked && s.checkboxChecked]}>
                      {isChecked && (
                        <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                      )}
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text style={[s.itemName, isChecked && s.itemNameChecked]}>
                        {item.name}
                      </Text>
                      {item.unit ? <Text style={s.itemUnit}>{item.unit}</Text> : null}
                    </View>

                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={s.itemQty}>Qty: {item.qty}</Text>
                      <Text style={s.itemTotal}>₹{item.lineTotal}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Card>
        )}

        {/* Bill Breakdown Card */}
        <Card style={s.card}>
          <Text style={s.sectionTitle}>Payment Summary</Text>
          <View style={s.billRow}>
            <Text style={s.billLabel}>Items Subtotal</Text>
            <Text style={s.billVal}>₹{order.subtotal}</Text>
          </View>
          <View style={s.billRow}>
            <Text style={s.billLabel}>Delivery Charge</Text>
            <Text style={s.billVal}>₹{order.deliveryFee}</Text>
          </View>
          <View style={s.billDivider} />
          <View style={s.billRow}>
            <Text style={s.billTotalLabel}>Total Cash to Collect</Text>
            <Text style={s.billTotalVal}>₹{order.total}</Text>
          </View>
          {order.agentFee !== null && order.agentFee !== undefined && (
            <View style={s.agentFeeTag}>
              <Ionicons name="gift-outline" size={14} color={Colors.green700} />
              <Text style={s.agentFeeTxt}>Your payout for this run: ₹{order.agentFee}</Text>
            </View>
          )}
        </Card>

        {/* Status Action Buttons (P19) */}
        <View style={s.actionSection}>
          {(isPlaced || isPacked) && (
            <View style={{ gap: Spacing.xs }}>
              {!allChecklistItemsChecked && (
                <View style={s.checklistWarningBanner}>
                  <Ionicons name="alert-circle" size={18} color="#B45309" />
                  <Text style={s.checklistWarningTxt}>
                    Please check off all items on the checklist above ({checkedCount}/{totalChecklistCount} checked) before picking up.
                  </Text>
                </View>
              )}
              <Button
                label={
                  updating
                    ? 'Updating...'
                    : !allChecklistItemsChecked
                    ? `Pick Up (${checkedCount}/${totalChecklistCount} Checked)`
                    : 'Pick Up & Start Delivery'
                }
                onPress={handleMarkPickedUp}
                loading={updating}
                variant={allChecklistItemsChecked ? 'primary' : 'secondary'}
              />
            </View>
          )}

          {isOut && (
            <View style={s.swipeContainer}>
              {/* QR Button Requested by User */}
              <TouchableOpacity
                style={s.qrTriggerBtn}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  setShowQRModal(true);
                }}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Show QR code for customer to scan and pay"
              >
                <View style={s.qrTriggerLeft}>
                  <View style={s.qrIconCircle}>
                    <Ionicons name="qr-code" size={22} color="#FFFFFF" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.qrTriggerTitle}>Customer paying online via UPI?</Text>
                    <Text style={s.qrTriggerSub}>
                      Tap for Store QR Code (GPay / PhonePe / Paytm)
                    </Text>
                  </View>
                </View>
                <View style={s.qrActionBadge}>
                  <Text style={s.qrActionBadgeTxt}>QR</Text>
                  <Ionicons name="chevron-forward" size={14} color={Colors.green900} />
                </View>
              </TouchableOpacity>

              <Text style={s.swipeInstruction}>
                Slide right after arriving at customer's doorstep:
              </Text>
              {!allChecklistItemsChecked && (
                <View style={[s.checklistWarningBanner, { marginBottom: Spacing.xs }]}>
                  <Ionicons name="alert-circle" size={18} color="#B45309" />
                  <Text style={s.checklistWarningTxt}>
                    Check off all items on the checklist above ({checkedCount}/{totalChecklistCount} checked) before delivery.
                  </Text>
                </View>
              )}
              <SwipeToConfirm
                label={allChecklistItemsChecked ? "Slide to Mark Delivered" : `Check All Items (${checkedCount}/${totalChecklistCount})`}
                onConfirm={handleSwipeDelivered}
                disabled={updating || !allChecklistItemsChecked}
              />
            </View>
          )}

          {isDelivered && (
            <View style={s.deliveredSuccessBox}>
              <Ionicons name="checkmark-circle" size={32} color={Colors.green500} />
              <Text style={s.deliveredTitle}>Order Delivered 🎉</Text>
              <Text style={s.deliveredSub}>
                Delivered at{' '}
                {order.deliveredAt?.toMillis
                  ? new Date(order.deliveredAt.toMillis()).toLocaleTimeString('en-IN', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : 'just now'}
                {' • '}
                {order.paymentMethod === 'upi_qr'
                  ? `📱 UPI QR (${order.qrLabel || 'Store QR'})`
                  : '💵 Cash Collected'}
              </Text>
              {hasWaterCans && order.emptyCansCollected !== undefined && (
                <Text style={s.deliveredCans}>
                  Empty Cans Collected: {order.emptyCansCollected}
                </Text>
              )}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Customer Scan-to-Pay QR Modal */}
      <Modal
        visible={showQRModal}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setShowQRModal(false)}
      >
        <View style={s.modalOverlay}>
          <View style={s.qrSheetCard}>
            <View style={s.qrSheetHeader}>
              <View>
                <Text style={s.qrSheetTitle}>Scan to Pay UPI</Text>
                <Text style={s.qrSheetSub}>
                  {defaultQR?.name || 'Primary Store QR'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowQRModal(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Close QR sheet"
              >
                <Ionicons name="close" size={24} color={Colors.ink} />
              </TouchableOpacity>
            </View>

            <View style={s.qrAmountBanner}>
              <Text style={s.qrAmountLabel}>EXACT AMOUNT TO COLLECT</Text>
              <Text style={s.qrAmountVal}>₹{order.total}</Text>
            </View>

            <View style={s.qrCodeWrapper}>
              <Image
                source={{
                  uri:
                    defaultQR?.imageUrl ||
                    getQRCodeImageUrl(
                      generateUPIUri({
                        upiId: defaultQR?.upiId || 'anandhistores@okaxis',
                        merchantName: defaultQR?.merchantName || 'Anandhi Stores',
                        amount: order.total,
                        orderNo: order.orderNo,
                      }),
                      320,
                    ),
                }}
                style={s.qrCodeImg}
              />
              <Text style={s.qrUpiText}>UPI: {defaultQR?.upiId || 'anandhistores@okaxis'}</Text>
              <Text style={s.qrPayeeText}>Payee: {defaultQR?.merchantName || 'Anandhi Stores'}</Text>
              <Text style={s.qrAppHint}>
                Ask customer to scan using Google Pay, PhonePe, Paytm, or any UPI app
              </Text>
            </View>

            {hasWaterCans && (
              <View style={s.modalCanBanner}>
                <Ionicons name="water" size={16} color="#0284C7" />
                <Text style={s.modalCanTxt}>
                  Empty cans collected: <Text style={s.modalBold}>{emptyCansCollected} / {maxReturnLimit}</Text>
                </Text>
              </View>
            )}

            <View style={s.modalBtnStack}>
              <Button
                label={updating ? 'Confirming...' : 'Customer Paid via QR • Complete Run'}
                onPress={() => handleConfirmDelivered('upi_qr')}
                loading={updating}
                variant="primary"
              />

              <TouchableOpacity
                style={s.modalCancelBtn}
                onPress={() => setShowQRModal(false)}
              >
                <Text style={s.modalCancelTxt}>Cancel (Customer will pay cash)</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Delivery Confirmation Modal with Payment Choice */}
      <Modal
        visible={showConfirmModal}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setShowConfirmModal(false)}
      >
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <View style={s.modalIconCircle}>
              <Ionicons
                name={deliveryPaymentMethod === 'upi_qr' ? 'qr-code' : 'cash'}
                size={36}
                color={Colors.green700}
              />
            </View>
            <Text style={s.modalTitle}>Confirm Order Delivery</Text>
            <Text style={s.modalMsg}>
              Collect <Text style={s.modalBold}>₹{order.total}</Text> from{' '}
              <Text style={s.modalBold}>{order.customerName}</Text>
            </Text>

            {/* Payment Mode Selector */}
            <View style={s.paymentMethodToggleRow}>
              <TouchableOpacity
                style={[
                  s.paymentToggleBtn,
                  deliveryPaymentMethod === 'cash' && s.paymentToggleBtnActive,
                ]}
                onPress={() => setDeliveryPaymentMethod('cash')}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="cash-outline"
                  size={16}
                  color={deliveryPaymentMethod === 'cash' ? Colors.green900 : Colors.inkSoft}
                />
                <Text
                  style={[
                    s.paymentToggleTxt,
                    deliveryPaymentMethod === 'cash' && s.paymentToggleTxtActive,
                  ]}
                >
                  💵 Cash
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  s.paymentToggleBtn,
                  deliveryPaymentMethod === 'upi_qr' && s.paymentToggleBtnActive,
                ]}
                onPress={() => setDeliveryPaymentMethod('upi_qr')}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="qr-code-outline"
                  size={16}
                  color={deliveryPaymentMethod === 'upi_qr' ? Colors.green900 : Colors.inkSoft}
                />
                <Text
                  style={[
                    s.paymentToggleTxt,
                    deliveryPaymentMethod === 'upi_qr' && s.paymentToggleTxtActive,
                  ]}
                >
                  📱 UPI QR
                </Text>
              </TouchableOpacity>
            </View>

            {deliveryPaymentMethod === 'upi_qr' && (
              <TouchableOpacity
                style={s.modalQrPrompt}
                onPress={() => {
                  setShowConfirmModal(false);
                  setShowQRModal(true);
                }}
              >
                <Ionicons name="scan-circle-outline" size={20} color={Colors.green700} />
                <Text style={s.modalQrPromptTxt}>
                  Need to show QR? Tap to open QR Code Screen
                </Text>
              </TouchableOpacity>
            )}

            {hasWaterCans && (
              <View style={s.modalCanBanner}>
                <Ionicons name="water" size={16} color="#0284C7" />
                <Text style={s.modalCanTxt}>
                  Empty cans collected: <Text style={s.modalBold}>{emptyCansCollected} / {maxReturnLimit}</Text>
                </Text>
              </View>
            )}

            <View style={s.modalBtnStack}>
              <Button
                label={
                  updating
                    ? 'Confirming...'
                    : deliveryPaymentMethod === 'upi_qr'
                    ? 'Confirm UPI QR Payment'
                    : 'Confirm Cash Collected'
                }
                onPress={() => handleConfirmDelivered(deliveryPaymentMethod)}
                loading={updating}
                variant="primary"
              />

              <TouchableOpacity
                style={s.modalCancelBtn}
                onPress={() => setShowConfirmModal(false)}
              >
                <Text style={s.modalCancelTxt}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.cream,
  },
  content: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl * 2,
    gap: Spacing.md,
  },
  centerContent: {
    flex: 1,
    padding: Spacing.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // COD Banner
  codHeroBanner: {
    backgroundColor: Colors.amber,
    borderRadius: Radius.card,
    padding: Spacing.md,
    ...Shadow.card,
  },
  codHeroBannerDelivered: {
    backgroundColor: Colors.green700,
  },
  codHeroLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  cashIconBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  codHeroTitle: {
    fontSize: FontSize.xs - 1,
    fontFamily: 'Manrope_800ExtraBold',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  codHeroAmount: {
    fontSize: FontSize.xl,
    fontFamily: 'Manrope_800ExtraBold',
    color: '#FFFFFF',
    marginTop: 2,
  },
  codHeroNote: {
    fontSize: FontSize.xs - 2,
    fontFamily: 'Manrope_500Medium',
    color: 'rgba(255,255,255,0.9)',
    marginTop: 2,
  },

  // Card
  card: {
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  customerName: {
    fontSize: FontSize.md,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.ink,
  },
  customerPhone: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
    marginTop: 2,
  },
  addressBox: {
    flexDirection: 'row',
    backgroundColor: Colors.cream,
    padding: Spacing.sm,
    borderRadius: Radius.button,
    gap: Spacing.xs,
  },
  addressText: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.ink,
    lineHeight: 18,
  },
  landmarkText: {
    fontSize: FontSize.xs - 1,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
    marginTop: 2,
  },
  slotNotesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  badgeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cream,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.chip,
    gap: 4,
  },
  badgeItemText: {
    fontSize: FontSize.xs - 1,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.ink,
  },
  actionRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  callBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.green700,
    paddingVertical: 12,
    borderRadius: Radius.button,
    gap: 6,
  },
  callBtnTxt: {
    color: '#FFFFFF',
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_700Bold',
  },
  mapBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: Colors.green700,
    paddingVertical: 12,
    borderRadius: Radius.button,
    gap: 6,
  },
  mapBtnTxt: {
    color: Colors.green700,
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_700Bold',
  },

  // Cans Card
  canCard: {
    padding: Spacing.md,
    gap: Spacing.sm,
    borderColor: '#BAE6FD',
    borderWidth: 1,
  },
  canHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  canTitle: {
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_700Bold',
    color: Colors.ink,
  },
  canSubtitle: {
    fontSize: FontSize.xs - 1,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
  },
  canCounterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F0F9FF',
    padding: Spacing.sm,
    borderRadius: Radius.button,
    marginTop: 4,
  },
  canCounterLabel: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_600SemiBold',
    color: '#0369A1',
  },
  canLimitHint: {
    fontSize: FontSize.xs - 2,
    fontFamily: 'Manrope_600SemiBold',
    color: '#0284C7',
    marginTop: 2,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  stepBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#0284C7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepBtnDisabled: {
    opacity: 0.4,
  },
  stepBtnTxt: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  stepValue: {
    fontSize: FontSize.md,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.ink,
    minWidth: 24,
    textAlign: 'center',
  },

  // Checklist
  sectionHeader: {
    marginBottom: Spacing.xs,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
  },
  checklistStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.chip,
  },
  checklistBadgePending: {
    backgroundColor: '#FEF3C7',
  },
  checklistBadgeDone: {
    backgroundColor: '#E8F5E9',
  },
  checklistBadgeTxt: {
    fontSize: FontSize.xs - 2,
    fontFamily: 'Manrope_700Bold',
  },
  checklistBadgeTxtPending: {
    color: '#B45309',
  },
  checklistBadgeTxtDone: {
    color: Colors.green700,
  },
  checkAllBtn: {
    backgroundColor: Colors.cream,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.chip,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  checkAllBtnTxt: {
    fontSize: FontSize.xs - 1,
    fontFamily: 'Manrope_700Bold',
    color: Colors.green900,
  },
  checklistWarningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    padding: Spacing.sm,
    borderRadius: Radius.button,
    gap: Spacing.xs,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  checklistWarningTxt: {
    flex: 1,
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_600SemiBold',
    color: '#92400E',
  },
  sectionTitle: {
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.ink,
  },
  sectionSubtitle: {
    fontSize: FontSize.xs - 1,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
  },
  checklist: {
    gap: Spacing.xs,
  },
  checkItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cream,
    padding: Spacing.sm,
    borderRadius: Radius.button,
    gap: Spacing.sm,
  },
  checkItemRowChecked: {
    backgroundColor: '#E8F5E9',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: Colors.inkSoft,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: Colors.green700,
    borderColor: Colors.green700,
  },
  itemName: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.ink,
  },
  itemNameChecked: {
    textDecorationLine: 'line-through',
    color: Colors.inkSoft,
  },
  itemUnit: {
    fontSize: FontSize.xs - 2,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
  },
  itemQty: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_700Bold',
    color: Colors.ink,
  },
  itemTotal: {
    fontSize: FontSize.xs - 1,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
  },

  // Bill
  billRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  billLabel: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
  },
  billVal: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.ink,
  },
  billDivider: {
    height: 1,
    backgroundColor: Colors.line,
    marginVertical: 4,
  },
  billTotalLabel: {
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.ink,
  },
  billTotalVal: {
    fontSize: FontSize.md,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.green700,
  },
  agentFeeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    padding: Spacing.xs,
    borderRadius: Radius.chip,
    gap: 4,
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  agentFeeTxt: {
    fontSize: FontSize.xs - 1,
    fontFamily: 'Manrope_700Bold',
    color: Colors.green700,
  },

  // Actions
  actionSection: {
    gap: Spacing.sm,
  },
  waitingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    padding: Spacing.md,
    borderRadius: Radius.card,
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  waitingTitle: {
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_700Bold',
    color: '#B45309',
  },
  waitingSub: {
    fontSize: FontSize.xs - 1,
    fontFamily: 'Manrope_500Medium',
    color: '#92400E',
    marginTop: 2,
  },
  swipeContainer: {
    alignItems: 'center',
    gap: Spacing.xs,
  },
  swipeInstruction: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.inkSoft,
  },
  deliveredSuccessBox: {
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    padding: Spacing.lg,
    borderRadius: Radius.card,
    gap: 4,
  },
  deliveredTitle: {
    fontSize: FontSize.md,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.green700,
    marginTop: 4,
  },
  deliveredSub: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
  },
  deliveredCans: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_700Bold',
    color: '#0284C7',
    marginTop: 4,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(18, 53, 36, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  modalCard: {
    width: '100%',
    backgroundColor: Colors.card,
    borderRadius: Radius.card,
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.md,
    ...Shadow.card,
  },
  modalIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: FontSize.lg,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.ink,
  },
  modalMsg: {
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
    textAlign: 'center',
    lineHeight: 22,
  },
  modalBold: {
    color: Colors.ink,
    fontFamily: 'Manrope_800ExtraBold',
  },
  modalCanBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F9FF',
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radius.chip,
    gap: 6,
  },
  modalCanTxt: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_600SemiBold',
    color: '#0369A1',
  },
  modalBtnStack: {
    width: '100%',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  modalCancelBtn: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  modalCancelTxt: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.inkSoft,
  },

  // QR Button & Modal Styles
  qrTriggerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: Colors.green700,
    borderRadius: Radius.card,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    ...Shadow.card,
  },
  qrTriggerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  qrIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.green700,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qrTriggerTitle: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_700Bold',
    color: Colors.green900,
  },
  qrTriggerSub: {
    fontSize: FontSize.xs - 2,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
    marginTop: 2,
  },
  qrActionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: Colors.amber,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.chip,
  },
  qrActionBadgeTxt: {
    fontSize: FontSize.xs - 2,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.green900,
  },

  // QR Modal Sheet
  qrSheetCard: {
    width: '100%',
    backgroundColor: Colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: Spacing.lg,
    alignItems: 'center',
    gap: Spacing.md,
    maxHeight: '92%',
  },
  qrSheetHeader: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  qrSheetTitle: {
    fontSize: FontSize.lg,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.ink,
  },
  qrSheetSub: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
    marginTop: 2,
  },
  qrAmountBanner: {
    width: '100%',
    backgroundColor: Colors.green900,
    borderRadius: Radius.card,
    padding: Spacing.md,
    alignItems: 'center',
  },
  qrAmountLabel: {
    fontSize: FontSize.xs - 2,
    fontFamily: 'Manrope_700Bold',
    color: Colors.amber,
    letterSpacing: 0.8,
  },
  qrAmountVal: {
    fontSize: 28,
    fontFamily: 'Manrope_800ExtraBold',
    color: '#FFFFFF',
    marginTop: 2,
  },
  qrCodeWrapper: {
    alignItems: 'center',
    padding: Spacing.sm,
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: Colors.line,
    width: '100%',
  },
  qrCodeImg: {
    width: 220,
    height: 220,
    marginBottom: Spacing.sm,
    borderRadius: Radius.sm,
  },
  qrUpiText: {
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.green900,
  },
  qrPayeeText: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
    marginTop: 2,
  },
  qrAppHint: {
    fontSize: FontSize.xs - 2,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
    marginTop: 6,
    textAlign: 'center',
  },

  // Payment Toggle in Confirm Modal
  paymentMethodToggleRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    width: '100%',
    marginTop: Spacing.xs,
  },
  paymentToggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: Radius.button,
    borderWidth: 1.5,
    borderColor: Colors.line,
    backgroundColor: Colors.cream,
  },
  paymentToggleBtnActive: {
    borderColor: Colors.green700,
    backgroundColor: '#F0FDF4',
  },
  paymentToggleTxt: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.inkSoft,
  },
  paymentToggleTxtActive: {
    color: Colors.green900,
    fontFamily: 'Manrope_800ExtraBold',
  },
  modalQrPrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: Spacing.xs,
  },
  modalQrPromptTxt: {
    fontSize: FontSize.xs - 1,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.green700,
    textDecorationLine: 'underline',
  },
});
