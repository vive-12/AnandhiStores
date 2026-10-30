import React, { useMemo, useState } from 'react';
import { ScrollView, View, Text, StyleSheet, TouchableOpacity, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontSize, Radius, Spacing } from '../../theme';
import { useSession } from '../../hooks/useSession';
import { useCustomerOrders } from '../../hooks/useOrders';
import { useItems } from '../../hooks/useItems';
import { getISTDateKey, formatDateKey } from '../../services/stats';
import { Card, EmptyState, ErrorState, ScreenHeader, CardSkeleton } from '../../components/ui';
import type { OrderItem } from '../../types';

type Range = 'week' | 'month' | 'year';
type SpendLine = { item: OrderItem; category: string };

function toDate(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') return value.toDate();
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function istNowParts(now: Date) {
  const date = new Date(now.getTime() + 330 * 60 * 1000);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth(), day: date.getUTCDate() };
}

function startOfMonthKey(now: Date) {
  const { year, month } = istNowParts(now);
  return formatDateKey(new Date(Date.UTC(year, month, 1) - 330 * 60 * 1000));
}

function startOfYearKey(now: Date) {
  const { year } = istNowParts(now);
  return formatDateKey(new Date(Date.UTC(year, 0, 1) - 330 * 60 * 1000));
}

function itemSpend(item: OrderItem) {
  const amount = Number(item.lineTotal);
  return Number.isFinite(amount) ? amount : Number(item.price || 0) * Number(item.qty || 0);
}

function orderSpend(items: OrderItem[] = []) {
  return items.reduce((sum, item) => sum + itemSpend(item), 0);
}

export default function CustomerDashboardScreen() {
  const { uid } = useSession();
  const { orders, loading: ordersLoading, error: ordersError, refresh } = useCustomerOrders(uid);
  const { items, loading: itemsLoading } = useItems();
  const [range, setRange] = useState<Range>('week');
  const [refreshing, setRefreshing] = useState(false);
  const now = new Date();
  const todayKey = getISTDateKey(now);
  const parts = istNowParts(now);

  const itemMap = useMemo(() => new Map(items.map(item => [item.id, item])), [items]);
  const deliveredOrders = useMemo(
    () => orders.filter(order => order.status === 'delivered' && order.type !== 'recovery'),
    [orders],
  );

  const report = useMemo(() => {
    const [yearPart, monthPart, dayPart] = todayKey.split('-').map(Number);
    const windowStart = new Date(Date.UTC(yearPart, monthPart - 1, dayPart));
    if (range === 'week') windowStart.setUTCDate(windowStart.getUTCDate() - 6);
    const minimumKey = range === 'week'
      ? formatDateKey(new Date(windowStart.getTime() - 330 * 60 * 1000))
      : range === 'month' ? startOfMonthKey(now) : startOfYearKey(now);
    const filtered = deliveredOrders.filter(order => {
      const date = toDate(order.deliveredAt || order.updatedAt || order.createdAt);
      const key = date ? getISTDateKey(date) : '';
      return key >= minimumKey && key <= todayKey;
    });

    const total = filtered.reduce((sum, order) => sum + Number(order.total || 0), 0);
    const categories: Record<string, number> = {};
    const products: Record<string, { name: string; qty: number; spend: number }> = {};
    const daily: Record<string, number> = {};
    for (const order of filtered) {
      const date = toDate(order.deliveredAt || order.updatedAt || order.createdAt);
      if (date) {
        const key = getISTDateKey(date);
        daily[key] = (daily[key] || 0) + Number(order.total || 0);
      }
      for (const line of order.items || []) {
        const item = itemMap.get(line.itemId);
        const category = item?.category || 'Other';
        const spend = itemSpend(line);
        categories[category] = (categories[category] || 0) + spend;
        const current = products[line.itemId] || { name: line.name, qty: 0, spend: 0 };
        current.qty += Number(line.qty || 0);
        current.spend += spend;
        products[line.itemId] = current;
      }
    }

    const bars: Array<{ key: string; label: string; value: number }> = [];
    if (range === 'week') {
      const start = new Date(Date.UTC(parts.year, parts.month, parts.day));
      start.setUTCDate(start.getUTCDate() - 6);
      for (let offset = 0; offset < 7; offset++) {
        const day = new Date(start);
        day.setUTCDate(start.getUTCDate() + offset);
        const key = getISTDateKey(day);
        bars.push({ key, label: day.toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'Asia/Kolkata' }), value: daily[key] || 0 });
      }
    } else if (range === 'month') {
      for (let day = 1; day <= parts.day; day++) {
        const key = formatDateKey(new Date(Date.UTC(parts.year, parts.month, day) - 330 * 60 * 1000));
        bars.push({ key, label: day === 1 || day % 5 === 0 || day === parts.day ? String(day) : '', value: daily[key] || 0 });
      }
    } else {
      for (let month = 0; month <= parts.month; month++) {
        const keyPrefix = `${parts.year}-${String(month + 1).padStart(2, '0')}`;
        const value = Object.entries(daily).reduce((sum, [date, amount]) => sum + (date.startsWith(keyPrefix) ? amount : 0), 0);
        bars.push({ key: keyPrefix, label: new Date(Date.UTC(parts.year, month, 1)).toLocaleDateString('en-IN', { month: 'short', timeZone: 'UTC' }), value });
      }
    }
    const categoryRows = Object.entries(categories).map(([name, spend]) => ({ name, spend })).sort((a, b) => b.spend - a.spend);
    const productRows = Object.entries(products).map(([id, product]) => ({ id, ...product })).sort((a, b) => b.spend - a.spend).slice(0, 5);
    return { total, orders: filtered.length, bars, categoryRows, productRows, hasData: filtered.length > 0 };
  }, [deliveredOrders, itemMap, range, now, todayKey, parts.day, parts.month, parts.year]);

  const maxBar = Math.max(1, ...report.bars.map(bar => bar.value));
  const maxCategory = Math.max(1, ...report.categoryRows.map(row => row.spend));

  const onRefresh = async () => {
    setRefreshing(true);
    refresh();
    setTimeout(() => setRefreshing(false), 500);
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title="My Dashboard" subtitle="Recent purchases, including delivery fees" />
      {ordersError ? (
        <ErrorState message={`Could not load your spending history. ${ordersError.message}`} onRetry={refresh} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.green700} />}
        >
          <Text style={{ color: Colors.inkSoft }}>Based on the most recent loaded purchases, not a complete annual statement. Empty-can collections are excluded.</Text>
          <View style={styles.rangeRow}>
            {(['week', 'month', 'year'] as Range[]).map(value => (
              <TouchableOpacity key={value} onPress={() => setRange(value)} style={[styles.rangeChip, range === value && styles.rangeChipActive]}>
                <Text style={[styles.rangeText, range === value && styles.rangeTextActive]}>{value === 'week' ? '7 days' : value === 'month' ? 'This month' : 'This year'}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {ordersLoading || itemsLoading ? <CardSkeleton /> : !report.hasData ? (
            <EmptyState title="Your spending story starts here" subtitle="Once an order is delivered, you’ll see your spending trends, favourite categories, and most-bought products here." />
          ) : (
            <>
              <View style={styles.hero}>
                <View style={styles.heroIcon}><Ionicons name="wallet-outline" size={22} color={Colors.green700} /></View>
                <Text style={styles.eyebrow}>{range === 'week' ? 'RECENT SPEND · 7 DAYS' : range === 'month' ? 'RECENT SPEND · THIS MONTH' : 'RECENT SPEND · THIS YEAR'}</Text>
                <Text style={styles.total}>₹{report.total.toLocaleString('en-IN')}</Text>
                <Text style={styles.heroFoot}>{report.orders} delivered {report.orders === 1 ? 'order' : 'orders'}</Text>
              </View>

              <Card style={styles.card}>
                <View style={styles.sectionHeader}>
                  <View><Text style={styles.sectionTitle}>Spending trend</Text><Text style={styles.sectionHint}>{range === 'week' ? 'Daily, last 7 days' : range === 'month' ? 'Daily, this month' : 'Monthly, this year'}</Text></View>
                  <Ionicons name="bar-chart-outline" size={21} color={Colors.green700} />
                </View>
                <View style={styles.chart}>
                  {report.bars.map(bar => (
                    <View key={bar.key} style={styles.barColumn}>
                      <View style={styles.barTrack}>
                        <View style={[styles.bar, { height: `${Math.max(bar.value > 0 ? 6 : 0, (bar.value / maxBar) * 100)}%` }]} />
                      </View>
                      <Text style={styles.barLabel}>{bar.label}</Text>
                    </View>
                  ))}
                </View>
              </Card>

              <Card style={styles.card}>
                <View style={styles.sectionHeader}><View><Text style={styles.sectionTitle}>Where your money goes</Text><Text style={styles.sectionHint}>Spend by grocery category</Text></View><Ionicons name="pie-chart-outline" size={21} color={Colors.green700} /></View>
                {report.categoryRows.length === 0 ? <Text style={styles.muted}>No item breakdown available yet.</Text> : report.categoryRows.slice(0, 5).map(row => (
                  <View key={row.name} style={styles.categoryRow}>
                    <View style={styles.categoryTop}><Text style={styles.rowName}>{row.name}</Text><Text style={styles.rowAmount}>₹{row.spend.toLocaleString('en-IN')}</Text></View>
                    <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${Math.max(3, (row.spend / maxCategory) * 100)}%` }]} /></View>
                  </View>
                ))}
              </Card>

              <Card style={styles.card}>
                <View style={styles.sectionHeader}><View><Text style={styles.sectionTitle}>Your top products</Text><Text style={styles.sectionHint}>Ranked by spend in this period</Text></View><Ionicons name="sparkles-outline" size={21} color={Colors.green700} /></View>
                {report.productRows.length === 0 ? <Text style={styles.muted}>No delivered products in this period.</Text> : report.productRows.map((product, index) => (
                  <View key={product.id} style={styles.productRow}>
                    <View style={styles.rank}><Text style={styles.rankText}>{index + 1}</Text></View>
                    <View style={styles.productInfo}><Text style={styles.rowName} numberOfLines={1}>{product.name}</Text><Text style={styles.sectionHint}>{product.qty} {product.qty === 1 ? 'unit' : 'units'} bought</Text></View>
                    <Text style={styles.rowAmount}>₹{product.spend.toLocaleString('en-IN')}</Text>
                  </View>
                ))}
              </Card>
              <Text style={styles.disclaimer}>Based on your latest 50 orders. Recovery collections are not counted as grocery spending.</Text>
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream },
  content: { padding: Spacing.lg, paddingBottom: 110, gap: Spacing.md },
  rangeRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.xs },
  rangeChip: { flex: 1, paddingVertical: 11, borderRadius: Radius.chip, backgroundColor: Colors.card, alignItems: 'center', borderWidth: 1, borderColor: Colors.line },
  rangeChipActive: { backgroundColor: Colors.green900, borderColor: Colors.green900 },
  rangeText: { color: Colors.inkSoft, fontSize: FontSize.xs, fontFamily: 'Manrope_700Bold' },
  rangeTextActive: { color: '#fff' },
  hero: { padding: Spacing.xl, backgroundColor: '#E8F5E9', borderRadius: Radius.card, alignItems: 'center', borderWidth: 1, borderColor: '#C7E8CC' },
  heroIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.md },
  eyebrow: { color: Colors.green700, fontSize: 10, letterSpacing: 1, fontFamily: 'Manrope_800ExtraBold' },
  total: { color: Colors.green900, fontSize: 34, fontFamily: 'Manrope_800ExtraBold', marginTop: 4 },
  heroFoot: { color: Colors.inkSoft, fontSize: FontSize.xs, fontFamily: 'Manrope_600SemiBold', marginTop: 2 },
  card: { padding: Spacing.lg },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.lg },
  sectionTitle: { color: Colors.ink, fontSize: FontSize.md, fontFamily: 'Manrope_800ExtraBold' },
  sectionHint: { color: Colors.inkSoft, fontSize: 11, fontFamily: 'Manrope_500Medium', marginTop: 2 },
  chart: { height: 142, flexDirection: 'row', alignItems: 'stretch', gap: 5 },
  barColumn: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  barTrack: { height: 112, width: '100%', justifyContent: 'flex-end', backgroundColor: '#F2F5F1', borderRadius: 7, overflow: 'hidden' },
  bar: { width: '100%', minHeight: 0, backgroundColor: Colors.green500, borderRadius: 7 },
  barLabel: { height: 20, marginTop: 7, color: Colors.inkSoft, fontSize: 9, fontFamily: 'Manrope_600SemiBold' },
  categoryRow: { marginBottom: Spacing.md },
  categoryTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  rowName: { flex: 1, color: Colors.ink, fontSize: FontSize.sm, fontFamily: 'Manrope_700Bold' },
  rowAmount: { color: Colors.green900, fontSize: FontSize.sm, fontFamily: 'Manrope_800ExtraBold' },
  progressTrack: { height: 7, borderRadius: 4, backgroundColor: '#EEF1EC', overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4, backgroundColor: Colors.green500 },
  productRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: 10, borderTopWidth: 1, borderTopColor: Colors.line },
  rank: { height: 30, width: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E8F5E9' },
  rankText: { color: Colors.green700, fontFamily: 'Manrope_800ExtraBold' },
  productInfo: { flex: 1 },
  muted: { color: Colors.inkSoft, fontSize: FontSize.sm, fontFamily: 'Manrope_500Medium' },
  disclaimer: { textAlign: 'center', color: Colors.inkSoft, fontSize: 10, lineHeight: 15, paddingHorizontal: Spacing.md },
});
