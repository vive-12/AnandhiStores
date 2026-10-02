// app/(customer)/history.tsx — Customer Order History & Reorder Screen
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, Spacing, Radius, FontSize, Shadow } from '../../theme';
import { useSession } from '../../hooks/useSession';
import { useCustomerOrders } from '../../hooks/useOrders';
import { useCart } from '../../hooks/useCart';
import { transitionOrder } from '../../services/orders';
import {
  ScreenHeader,
  Card,
  StatusPill,
  Button,
  EmptyState,
  CardSkeleton,
  NotificationBell,
  useToast,
} from '../../components/ui';
import type { Order } from '../../types';

export default function OrderHistoryScreen() {
  const router = useRouter();
  const { uid, name } = useSession();
  const { showToast } = useToast();
  const { orders, loading, error } = useCustomerOrders(uid);
  const { addItem } = useCart();
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 600);
  }, []);

  // Format timestamp helper
  const formatDate = (order: Order) => {
    try {
      if (order.createdAt && typeof order.createdAt.toDate === 'function') {
        const d = order.createdAt.toDate();
        return d.toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
      }
    } catch (_) {}
    return 'Recently';
  };

  // Reorder action: add items from this order into current cart
  const handleReorder = (order: Order) => {
    if (!order.items || order.items.length === 0) {
      showToast('No items in this order.', 'info');
      return;
    }

    let addedCount = 0;
    for (const item of order.items) {
      addItem(item.itemId);
      addedCount++;
    }

    showToast(`Added ${addedCount} items from order ${order.orderNo} to cart! 🛒`, 'success');

    // Navigate to Home to review cart
    router.push('/(customer)');
  };

  // Cancel order (allowed only if placed)
  const handleCancelOrder = (order: Order) => {
    if (order.status !== 'placed') {
      Alert.alert(
        'Cannot Cancel',
        'This order is already being processed or out for delivery. Please contact the store directly.',
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
            setCancellingId(order.id);
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
              console.error('Failed to cancel order:', err);
              showToast(err.message || 'Please check your connection and try again.', 'error');
            } finally {
              setCancellingId(null);
            }
          },
        },
      ],
    );
  };

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="My Orders"
        subtitle="Track live orders and view past purchases"
        right={<NotificationBell />}
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
        {/* Loading Skeletons */}
        {loading && (
          <View style={styles.skeletonsContainer}>
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </View>
        )}

        {/* Empty State */}
        {!loading && orders.length === 0 && (
          <EmptyState
            title="No orders yet"
            subtitle="You haven't placed any orders with Anandhi Stores yet. Fresh groceries and water cans are just a tap away!"
            actionLabel="Start Shopping"
            onAction={() => router.push('/(customer)')}
          />
        )}

        {/* Orders List */}
        {!loading && orders.length > 0 && (
          <View style={styles.ordersList}>
            {orders.map(order => {
              const isPlaced = order.status === 'placed';
              const isDelivered = order.status === 'delivered';
              const isCancelled = order.status === 'cancelled';
              const isActive = !isDelivered && !isCancelled;
              const isThisCancelling = cancellingId === order.id;

              return (
                <View key={order.id} style={styles.orderCard}>
                  {/* Card Header: Order No + Date + Status */}
                  <View style={styles.cardHeader}>
                    <View>
                      <Text style={styles.orderNo}>Order #{order.orderNo}</Text>
                      <Text style={styles.orderDate}>{formatDate(order)}</Text>
                    </View>
                    <StatusPill status={order.status} />
                  </View>

                  <View style={styles.divider} />

                  {/* Items List Snapshot */}
                  <View style={styles.itemsBox}>
                    {order.items?.map((item, idx) => (
                      <View key={`${item.itemId}-${idx}`} style={styles.itemRow}>
                        <Text style={styles.itemName} numberOfLines={1}>
                          {item.name}
                        </Text>
                        <Text style={styles.itemQtyPrice}>
                          {item.qty} × ₹{item.price}
                        </Text>
                      </View>
                    ))}
                  </View>

                  {/* Delivery Location & Total */}
                  <View style={styles.metaRow}>
                    <View style={styles.metaLeft}>
                      <Text style={styles.metaLabel}>
                        {order.status === 'delivered'
                          ? 'Delivered to'
                          : isCancelled
                          ? 'Delivery address'
                          : 'Delivering to'}
                      </Text>
                      <Text style={styles.metaValue} numberOfLines={1}>
                        {order.addressSnapshot?.locality ||
                          order.addressSnapshot?.street ||
                          order.addressSnapshot?.door ||
                          'Chennai'}
                      </Text>
                    </View>

                    <View style={styles.metaRight}>
                      <Text style={styles.metaLabel}>Total (COD)</Text>
                      <Text style={styles.metaTotal}>₹{order.total}</Text>
                    </View>
                  </View>

                  {/* Partner Info if Assigned */}
                  {order.agentName && (
                    <View style={styles.agentBox}>
                      <Text style={styles.agentIcon}>🚴‍♂️</Text>
                      <Text style={styles.agentText}>
                        Delivery partner: <Text style={styles.agentName}>{order.agentName}</Text>
                      </Text>
                    </View>
                  )}

                  {/* Cancellation Reason if Cancelled */}
                  {isCancelled && order.cancelReason && (
                    <View style={styles.cancelBox}>
                      <Text style={styles.cancelText}>
                        Reason: {order.cancelReason}
                      </Text>
                    </View>
                  )}

                  {/* Card Actions */}
                  <View style={styles.actionsRow}>
                    {/* Live Tracker Button */}
                    <TouchableOpacity
                      style={[styles.actionBtn, styles.trackBtn]}
                      onPress={() => router.push(`/track/${order.id}`)}
                    >
                      <Text style={styles.trackBtnText}>
                        {isActive ? 'Live Tracking ➔' : 'View Details'}
                      </Text>
                    </TouchableOpacity>

                    {/* Reorder Button */}
                    <TouchableOpacity
                      style={[styles.actionBtn, styles.reorderBtn]}
                      onPress={() => handleReorder(order)}
                    >
                      <Text style={styles.reorderBtnText}>Reorder 🔄</Text>
                    </TouchableOpacity>

                    {/* Cancel Button (Placed only) */}
                    {isPlaced && (
                      <TouchableOpacity
                        style={[styles.actionBtn, styles.cancelBtn]}
                        disabled={isThisCancelling}
                        onPress={() => handleCancelOrder(order)}
                      >
                        <Text style={styles.cancelBtnText}>
                          {isThisCancelling ? 'Cancelling...' : 'Cancel'}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
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
  },
  skeletonsContainer: {
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
    ...Shadow.card,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  orderNo: {
    fontSize: FontSize.md,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.ink,
  },
  orderDate: {
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
  itemsBox: {
    gap: 6,
    marginBottom: Spacing.md,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemName: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.ink,
    flex: 1,
    marginRight: Spacing.md,
  },
  itemQtyPrice: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    backgroundColor: Colors.cream,
    padding: Spacing.md,
    borderRadius: Radius.sm,
    marginBottom: Spacing.md,
  },
  metaLeft: {
    flex: 1,
    marginRight: Spacing.md,
  },
  metaLabel: {
    fontSize: 10,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
    textTransform: 'uppercase',
  },
  metaValue: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.ink,
    marginTop: 2,
  },
  metaRight: {
    alignItems: 'flex-end',
  },
  metaTotal: {
    fontSize: FontSize.md,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.green700,
    marginTop: 2,
  },
  agentBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EFF6FF',
    padding: Spacing.sm,
    borderRadius: Radius.sm,
    marginBottom: Spacing.md,
  },
  agentIcon: {
    fontSize: 14,
  },
  agentText: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_500Medium',
    color: '#1D4ED8',
  },
  agentName: {
    fontFamily: 'Manrope_800ExtraBold',
  },
  cancelBox: {
    backgroundColor: '#FEF2F2',
    padding: Spacing.sm,
    borderRadius: Radius.sm,
    marginBottom: Spacing.md,
  },
  cancelText: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_500Medium',
    color: Colors.coral,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: Radius.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trackBtn: {
    backgroundColor: Colors.green700,
  },
  trackBtnText: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_600SemiBold',
    color: '#ffffff',
  },
  reorderBtn: {
    backgroundColor: Colors.cream,
    borderWidth: 1,
    borderColor: Colors.green700,
  },
  reorderBtnText: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.green700,
  },
  cancelBtn: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: Colors.coral,
    flex: 0.8,
  },
  cancelBtnText: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.coral,
  },
});
