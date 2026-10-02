// app/admin/analytics.tsx — Store Analytics & Insights
import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Colors, Spacing, Radius, FontSize, Shadow, StatusColors } from '../../theme';
import { useStats, AnalyticsRange, DailyBreakdownItem } from '../../hooks/useStats';
import { useItems } from '../../hooks/useItems';
import {
  ScreenHeader,
  Card,
  CardSkeleton,
  EmptyState,
  ErrorState,
} from '../../components/ui';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function AnalyticsScreen() {
  const [range, setRange] = useState<AnalyticsRange>('today');
  const [selectedDay, setSelectedDay] = useState<DailyBreakdownItem | null>(null);

  const { loading: statsLoading, error: statsError, refresh, computeMetrics } = useStats(30);
  const { items, loading: itemsLoading } = useItems();

  const metrics = useMemo(() => {
    return computeMetrics(range);
  }, [computeMetrics, range]);

  const {
    revenue,
    deliveredCount,
    cancelledCount,
    aov,
    itemQtyMap,
    dailyBreakdown,
  } = metrics;

  // Resolve top 5 items by quantity
  const topItems = useMemo(() => {
    const itemMap = new Map(items.map(it => [it.id, it]));

    const entries = Object.entries(itemQtyMap)
      .map(([itemId, qty]) => {
        const itemInfo = itemMap.get(itemId);
        return {
          id: itemId,
          name: itemInfo?.name || `Item (${itemId.slice(0, 5)})`,
          unit: itemInfo?.unit || '',
          price: itemInfo?.price || 0,
          qty,
        };
      })
      .filter(item => item.qty > 0)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);

    return entries;
  }, [items, itemQtyMap]);

  // Max values for chart scaling
  const maxRevenue = useMemo(() => {
    const max = Math.max(...dailyBreakdown.map(d => d.revenue), 0);
    return max > 0 ? max : 100;
  }, [dailyBreakdown]);

  const maxItemQty = useMemo(() => {
    if (topItems.length === 0) return 1;
    return Math.max(...topItems.map(i => i.qty), 1);
  }, [topItems]);

  const handleRangeChange = (newRange: AnalyticsRange) => {
    Haptics.selectionAsync();
    setRange(newRange);
    setSelectedDay(null);
  };

  const totalAttempted = deliveredCount + cancelledCount;
  const fulfillmentRate = totalAttempted > 0
    ? Math.round((deliveredCount / totalAttempted) * 100)
    : 100;

  if (statsError) {
    return (
      <View style={s.container}>
        <ScreenHeader title="Analytics & Insights" subtitle="Track store performance" />
        <View style={s.content}>
          <ErrorState message="Could not load analytics data." onRetry={refresh} />
        </View>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <ScreenHeader
        title="Analytics & Insights"
        subtitle="Live performance metrics & sales"
      />

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={statsLoading && !dailyBreakdown.length}
            onRefresh={refresh}
            tintColor={Colors.green700}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Range Switcher */}
        <View style={s.rangeBar}>
          <TouchableOpacity
            style={[s.rangeChip, range === 'today' && s.rangeChipActive]}
            onPress={() => handleRangeChange('today')}
            activeOpacity={0.8}
          >
            <Text style={[s.rangeText, range === 'today' && s.rangeTextActive]}>
              Today
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.rangeChip, range === '7days' && s.rangeChipActive]}
            onPress={() => handleRangeChange('7days')}
            activeOpacity={0.8}
          >
            <Text style={[s.rangeText, range === '7days' && s.rangeTextActive]}>
              7 Days
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.rangeChip, range === '30days' && s.rangeChipActive]}
            onPress={() => handleRangeChange('30days')}
            activeOpacity={0.8}
          >
            <Text style={[s.rangeText, range === '30days' && s.rangeTextActive]}>
              30 Days
            </Text>
          </TouchableOpacity>
        </View>

        {statsLoading && !dailyBreakdown.length ? (
          <View style={s.loadingContainer}>
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </View>
        ) : (
          <>
            {/* KPI Cards Grid */}
            <View style={s.kpiGrid}>
              {/* Revenue Card */}
              <View style={[s.kpiCard, { borderLeftColor: Colors.green700, borderLeftWidth: 4 }]}>
                <View style={s.kpiHeader}>
                  <Text style={s.kpiLabel}>Revenue (Delivered)</Text>
                  <View style={[s.iconBadge, { backgroundColor: '#E8F5E9' }]}>
                    <Ionicons name="cash-outline" size={18} color={Colors.green700} />
                  </View>
                </View>
                <Text style={s.kpiValue}>₹{revenue.toLocaleString('en-IN')}</Text>
                <Text style={s.kpiNote}>COD Cash earned</Text>
              </View>

              {/* Delivered Orders */}
              <View style={[s.kpiCard, { borderLeftColor: Colors.green500, borderLeftWidth: 4 }]}>
                <View style={s.kpiHeader}>
                  <Text style={s.kpiLabel}>Delivered</Text>
                  <View style={[s.iconBadge, { backgroundColor: '#E8F5E9' }]}>
                    <Ionicons name="checkmark-done-circle-outline" size={18} color={Colors.green500} />
                  </View>
                </View>
                <Text style={s.kpiValue}>{deliveredCount}</Text>
                <Text style={s.kpiNote}>Orders completed</Text>
              </View>

              {/* Average Order Value (AOV) */}
              <View style={[s.kpiCard, { borderLeftColor: Colors.amber, borderLeftWidth: 4 }]}>
                <View style={s.kpiHeader}>
                  <Text style={s.kpiLabel}>Avg Order Value</Text>
                  <View style={[s.iconBadge, { backgroundColor: '#FEF3C7' }]}>
                    <Ionicons name="receipt-outline" size={18} color={Colors.amber} />
                  </View>
                </View>
                <Text style={s.kpiValue}>₹{aov.toLocaleString('en-IN')}</Text>
                <Text style={s.kpiNote}>Revenue / order</Text>
              </View>

              {/* Cancelled Orders */}
              <View style={[s.kpiCard, { borderLeftColor: Colors.coral, borderLeftWidth: 4 }]}>
                <View style={s.kpiHeader}>
                  <Text style={s.kpiLabel}>Cancelled</Text>
                  <View style={[s.iconBadge, { backgroundColor: '#FEE2E2' }]}>
                    <Ionicons name="close-circle-outline" size={18} color={Colors.coral} />
                  </View>
                </View>
                <Text style={[s.kpiValue, { color: cancelledCount > 0 ? Colors.coral : Colors.ink }]}>
                  {cancelledCount}
                </Text>
                <Text style={s.kpiNote}>Lost orders</Text>
              </View>
            </View>

            {/* Performance Highlights Bar */}
            <Card style={s.highlightCard}>
              <View style={s.highlightRow}>
                <View style={s.highlightItem}>
                  <Text style={s.highlightTitle}>Fulfillment Rate</Text>
                  <Text style={[s.highlightValue, { color: Colors.green700 }]}>
                    {fulfillmentRate}%
                  </Text>
                </View>
                <View style={s.highlightDivider} />
                <View style={s.highlightItem}>
                  <Text style={s.highlightTitle}>Total Orders</Text>
                  <Text style={s.highlightValue}>{totalAttempted}</Text>
                </View>
                <View style={s.highlightDivider} />
                <View style={s.highlightItem}>
                  <Text style={s.highlightTitle}>Period Range</Text>
                  <Text style={s.highlightValue}>
                    {range === 'today' ? '1 Day' : range === '7days' ? '7 Days' : '30 Days'}
                  </Text>
                </View>
              </View>
            </Card>

            {/* Daily Trend Chart (for 7days / 30days) */}
            <Card style={s.chartCard}>
              <View style={s.sectionHeader}>
                <View>
                  <Text style={s.sectionTitle}>
                    {range === 'today' ? "Today's Delivery Output" : 'Daily Revenue Trend'}
                  </Text>
                  <Text style={s.sectionSubtitle}>
                    {range === 'today'
                      ? 'Delivered revenue recorded today'
                      : 'Tap any day bar to view breakdown'}
                  </Text>
                </View>
                <Ionicons name="bar-chart-outline" size={20} color={Colors.green700} />
              </View>

              {/* Selected Day Tooltip (7days / 30days only) */}
              {selectedDay && range !== 'today' && (
                <View style={s.dayTooltip}>
                  <Text style={s.tooltipDate}>{selectedDay.date} ({selectedDay.label})</Text>
                  <Text style={s.tooltipDetails}>
                    Revenue: <Text style={s.bold}>₹{selectedDay.revenue.toLocaleString('en-IN')}</Text> | Orders: <Text style={s.bold}>{selectedDay.orders}</Text>
                  </Text>
                </View>
              )}

              {/* View-based Bar Chart with Y-Axis guides */}
              <View style={s.chartWrapper}>
                {/* Horizontal reference lines & Y-axis labels */}
                <View style={s.axisContainer}>
                  <View style={s.axisRow}>
                    <Text style={s.axisLabel}>
                      ₹{maxRevenue > 0 ? maxRevenue.toLocaleString('en-IN') : '0'}
                    </Text>
                    <View style={s.axisLine} />
                  </View>
                  <View style={s.axisRow}>
                    <Text style={s.axisLabel}>
                      ₹{maxRevenue > 0 ? Math.round(maxRevenue / 2).toLocaleString('en-IN') : '0'}
                    </Text>
                    <View style={[s.axisLine, s.axisLineDashed]} />
                  </View>
                  <View style={s.axisRow}>
                    <Text style={s.axisLabel}>₹0</Text>
                    <View style={s.axisLine} />
                  </View>
                </View>

                {/* Bars */}
                <View
                  style={[
                    s.chartContainer,
                    range === 'today' && { justifyContent: 'center', paddingLeft: 0 },
                  ]}
                >
                  {dailyBreakdown.map((item, idx) => {
                    const heightPercent = maxRevenue > 0
                      ? Math.max(Math.round((item.revenue / maxRevenue) * 95), 8)
                      : 8;

                    const isSelected = selectedDay?.date === item.date && range !== 'today';

                    return (
                      <TouchableOpacity
                        key={item.date}
                        style={[
                          s.barColumn,
                          range === 'today' && { flex: 0, width: 84, maxWidth: 84 },
                        ]}
                        onPress={() => {
                          if (range === 'today') return;
                          Haptics.selectionAsync();
                          setSelectedDay(isSelected ? null : item);
                        }}
                        activeOpacity={range === 'today' ? 1 : 0.7}
                      >
                        <View style={s.barTrack}>
                          {/* Exact Value above bar for single day or selected */}
                          {(range === 'today' || isSelected) && item.revenue > 0 && (
                            <Text style={s.barValueAbove} numberOfLines={1}>
                              ₹{item.revenue.toLocaleString('en-IN')}
                            </Text>
                          )}
                          <View
                            style={[
                              s.barFill,
                              { height: heightPercent },
                              isSelected && s.barFillSelected,
                              item.revenue === 0 && s.barFillZero,
                              range === 'today' && { width: 44, maxWidth: 44, borderRadius: 6 },
                            ]}
                          />
                        </View>
                        <Text
                          style={[
                            s.barLabel,
                            isSelected && s.barLabelSelected,
                            range === '30days' && idx % 5 !== 0 && s.barLabelHidden,
                          ]}
                          numberOfLines={1}
                        >
                          {item.label}
                        </Text>
                        {range === 'today' && (
                          <Text style={s.barSubLabel}>{item.orders} orders</Text>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </Card>

            {/* Top 5 Items Section */}
            <Card style={s.topItemsCard}>
              <View style={s.sectionHeader}>
                <View>
                  <Text style={s.sectionTitle}>Top Selling Items</Text>
                  <Text style={s.sectionSubtitle}>Ranked by quantity delivered</Text>
                </View>
                <Ionicons name="trophy-outline" size={20} color={Colors.amber} />
              </View>

              {itemsLoading && topItems.length === 0 ? (
                <View style={{ paddingVertical: Spacing.md }}>
                  <CardSkeleton />
                </View>
              ) : topItems.length === 0 ? (
                <View style={s.noItemsBox}>
                  <Ionicons name="cube-outline" size={36} color={Colors.inkSoft} style={{ marginBottom: Spacing.sm }} />
                  <Text style={s.noItemsText}>No items delivered yet in this period</Text>
                </View>
              ) : (
                <View style={s.topItemsList}>
                  {topItems.map((item, index) => {
                    const widthPercent = Math.max(Math.round((item.qty / maxItemQty) * 100), 5);
                    const rankColors = [Colors.amber, '#94A3B8', '#B45309', Colors.green700, Colors.green700];

                    return (
                      <View key={item.id} style={s.topItemRow}>
                        <View style={s.topItemHeader}>
                          <View style={s.rankBadgeWrap}>
                            <View style={[s.rankBadge, { backgroundColor: rankColors[index] || Colors.green700 }]}>
                              <Text style={s.rankNumber}>#{index + 1}</Text>
                            </View>
                            <View style={s.itemInfo}>
                              <Text style={s.itemName} numberOfLines={1}>{item.name}</Text>
                              {item.unit ? <Text style={s.itemUnit}>{item.unit}</Text> : null}
                            </View>
                          </View>
                          <Text style={s.itemQty}>{item.qty} units</Text>
                        </View>

                        {/* Bar progress */}
                        <View style={s.itemProgressTrack}>
                          <View
                            style={[
                              s.itemProgressFill,
                              {
                                width: `${widthPercent}%`,
                                backgroundColor: index === 0 ? Colors.amber : Colors.green700,
                              },
                            ]}
                          />
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </Card>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.cream,
  },
  content: {
    flex: 1,
    padding: Spacing.lg,
  },
  rangeBar: {
    flexDirection: 'row',
    backgroundColor: Colors.card,
    padding: 4,
    borderRadius: Radius.chip,
    borderWidth: 1,
    borderColor: Colors.line,
    gap: 6,
    marginBottom: Spacing.xs,
    ...Shadow.card,
  },
  rangeChip: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: Radius.chip - 2,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  rangeChipActive: {
    backgroundColor: Colors.green900,
  },
  rangeText: {
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.inkSoft,
  },
  rangeTextActive: {
    color: '#FFFFFF',
    fontFamily: 'Manrope_800ExtraBold',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl * 2,
    gap: Spacing.lg,
  },
  loadingContainer: {
    gap: Spacing.md,
  },

  // KPI Grid
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
  },
  kpiCard: {
    width: (SCREEN_WIDTH - Spacing.lg * 2 - Spacing.md) / 2,
    backgroundColor: Colors.card,
    borderRadius: Radius.card,
    padding: Spacing.md,
    ...Shadow.card,
  },
  kpiHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  kpiLabel: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.inkSoft,
    flex: 1,
  },
  iconBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  kpiValue: {
    fontSize: FontSize.xl,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.ink,
    marginTop: 2,
  },
  kpiNote: {
    fontSize: FontSize.xs - 2,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
    marginTop: 2,
  },

  // Highlights
  highlightCard: {
    padding: Spacing.md,
  },
  highlightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  highlightItem: {
    flex: 1,
    alignItems: 'center',
  },
  highlightTitle: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.inkSoft,
    marginBottom: 2,
  },
  highlightValue: {
    fontSize: FontSize.md,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.ink,
  },
  highlightDivider: {
    width: 1,
    height: 28,
    backgroundColor: Colors.line,
  },

  // Chart
  chartCard: {
    padding: Spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    fontSize: FontSize.md,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.ink,
  },
  sectionSubtitle: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
    marginTop: 2,
  },
  dayTooltip: {
    backgroundColor: Colors.green900,
    borderRadius: Radius.button,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    marginBottom: Spacing.sm,
    alignSelf: 'flex-start',
  },
  tooltipDate: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_600SemiBold',
    color: '#FFFFFF',
  },
  tooltipDetails: {
    fontSize: FontSize.xs,
    fontFamily: 'Manrope_500Medium',
    color: 'rgba(255,255,255,0.85)',
  },
  bold: {
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.amber,
  },
  chartWrapper: {
    position: 'relative',
    height: 155,
    marginTop: Spacing.sm,
  },
  axisContainer: {
    position: 'absolute',
    top: 14,
    bottom: 22,
    left: 0,
    right: 0,
    justifyContent: 'space-between',
    zIndex: 0,
  },
  axisRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  axisLabel: {
    fontSize: FontSize.xs - 3,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.inkSoft,
    width: 38,
    textAlign: 'right',
  },
  axisLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.line,
  },
  axisLineDashed: {
    opacity: 0.5,
  },
  chartContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: '100%',
    paddingLeft: 44,
    paddingRight: 4,
    zIndex: 1,
    gap: 4,
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
    height: '100%',
    justifyContent: 'flex-end',
    maxWidth: 36,
  },
  barTrack: {
    flex: 1,
    width: '100%',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 2,
  },
  barValueAbove: {
    fontSize: FontSize.xs - 2,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.green700,
    marginBottom: 4,
    textAlign: 'center',
  },
  barFill: {
    width: '75%',
    maxWidth: 24,
    backgroundColor: Colors.green700,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    minHeight: 6,
  },
  barFillSelected: {
    backgroundColor: Colors.green900,
    borderWidth: 1.5,
    borderColor: '#86EFAC',
  },
  barFillZero: {
    backgroundColor: Colors.line,
  },
  barLabel: {
    fontSize: FontSize.xs - 2,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.inkSoft,
    marginTop: Spacing.xs,
    textAlign: 'center',
  },
  barLabelSelected: {
    color: Colors.green900,
    fontFamily: 'Manrope_800ExtraBold',
  },
  barLabelHidden: {
    opacity: 0,
  },
  barSubLabel: {
    fontSize: FontSize.xs - 3,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.inkSoft,
    marginTop: 1,
  },

  // Top Items
  topItemsCard: {
    padding: Spacing.md,
  },
  noItemsBox: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
  },
  noItemsText: {
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
  },
  topItemsList: {
    gap: Spacing.md,
  },
  topItemRow: {
    gap: 6,
  },
  topItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rankBadgeWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  rankBadge: {
    width: 22,
    height: 22,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rankNumber: {
    fontSize: FontSize.xs - 1,
    fontFamily: 'Manrope_800ExtraBold',
    color: '#FFFFFF',
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.ink,
  },
  itemUnit: {
    fontSize: FontSize.xs - 1,
    fontFamily: 'Manrope_500Medium',
    color: Colors.inkSoft,
  },
  itemQty: {
    fontSize: FontSize.sm,
    fontFamily: 'Manrope_800ExtraBold',
    color: Colors.green900,
  },
  itemProgressTrack: {
    height: 6,
    backgroundColor: Colors.cream,
    borderRadius: 3,
    overflow: 'hidden',
  },
  itemProgressFill: {
    height: '100%',
    borderRadius: 3,
  },
});
