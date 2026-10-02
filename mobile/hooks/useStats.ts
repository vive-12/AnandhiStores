// hooks/useStats.ts — Realtime Daily Stats & Analytics Hook
import { useState, useEffect, useMemo, useCallback } from 'react';
import { listenRecentStats, getTodayKey, getRecentStats } from '../services/stats';
import type { DailyStats } from '../types';

export type AnalyticsRange = 'today' | '7days' | '30days';

export interface DailyBreakdownItem {
  date: string;
  label: string; // e.g. "Mon" or "10/01"
  revenue: number;
  orders: number;
}

export interface AgentPerformanceData {
  todayDeliveries: number;
  weeklyDeliveries: number;
  monthlyDeliveries: number;
  todayCash: number;
}

export function useStats(maxDays = 30) {
  const [stats, setStats] = useState<DailyStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    setLoading(true);
    const unsub = listenRecentStats(
      maxDays,
      data => {
        setStats(data);
        setLoading(false);
      },
      err => {
        console.error('Error listening to stats_daily:', err);
        setError(err);
        setLoading(false);
      },
    );

    return unsub;
  }, [maxDays]);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getRecentStats(maxDays);
      setStats(data);
    } catch (e) {
      setError(e as Error);
    } finally {
      setLoading(false);
    }
  }, [maxDays]);

  const todayKey = useMemo(() => getTodayKey(), []);

  // Filter stats by selected range
  const getStatsForRange = useCallback(
    (range: AnalyticsRange): DailyStats[] => {
      if (range === 'today') {
        const todayDoc = stats.find(s => s.date === todayKey);
        return todayDoc ? [todayDoc] : [];
      }

      const daysLimit = range === '7days' ? 7 : 30;
      // Get cutoff date
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - (daysLimit - 1));
      const cutoffStr = cutoff.toISOString().slice(0, 10);

      return stats.filter(s => s.date >= cutoffStr);
    },
    [stats, todayKey],
  );

  // Compute aggregated metrics for a range
  const computeMetrics = useCallback(
    (range: AnalyticsRange) => {
      const filtered = getStatsForRange(range);

      let revenue = 0;
      let deliveredCount = 0;
      let cancelledCount = 0;
      const itemQtyMap: Record<string, number> = {};

      for (const day of filtered) {
        revenue += day.revenue || 0;
        deliveredCount += day.orders || 0;
        cancelledCount += day.cancelledOrders || 0;

        if (day.itemQty) {
          for (const [itemId, qty] of Object.entries(day.itemQty)) {
            itemQtyMap[itemId] = (itemQtyMap[itemId] || 0) + (qty || 0);
          }
        }
      }

      const aov = deliveredCount > 0 ? Math.round(revenue / deliveredCount) : 0;

      // Build daily breakdown for charts (chronological order)
      const daysCount = range === 'today' ? 1 : range === '7days' ? 7 : 30;
      const dailyBreakdown: DailyBreakdownItem[] = [];

      for (let i = daysCount - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().slice(0, 10);
        const matchingDoc = stats.find(s => s.date === dateStr);

        const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
        const dayMonth = `${d.getDate()}/${d.getMonth() + 1}`;
        const label = range === 'today' ? 'Today' : range === '7days' ? dayName : dayMonth;

        dailyBreakdown.push({
          date: dateStr,
          label,
          revenue: matchingDoc?.revenue || 0,
          orders: matchingDoc?.orders || 0,
        });
      }

      return {
        revenue,
        deliveredCount,
        cancelledCount,
        aov,
        itemQtyMap,
        dailyBreakdown,
      };
    },
    [getStatsForRange, stats],
  );

  // Compute stats per agent
  const getAgentPerformance = useCallback(
    (agentId: string): AgentPerformanceData => {
      const todayDoc = stats.find(s => s.date === todayKey);
      const todayDeliveries = todayDoc?.deliveriesByAgent?.[agentId] || 0;
      const todayCash = todayDoc?.cashCollectedByAgent?.[agentId] || 0;

      // 7 days
      const cutoff7 = new Date();
      cutoff7.setDate(cutoff7.getDate() - 6);
      const cutoff7Str = cutoff7.toISOString().slice(0, 10);

      let weeklyDeliveries = 0;
      for (const s of stats) {
        if (s.date >= cutoff7Str) {
          weeklyDeliveries += s.deliveriesByAgent?.[agentId] || 0;
        }
      }

      // 30 days
      const cutoff30 = new Date();
      cutoff30.setDate(cutoff30.getDate() - 29);
      const cutoff30Str = cutoff30.toISOString().slice(0, 10);

      let monthlyDeliveries = 0;
      for (const s of stats) {
        if (s.date >= cutoff30Str) {
          monthlyDeliveries += s.deliveriesByAgent?.[agentId] || 0;
        }
      }

      return {
        todayDeliveries,
        weeklyDeliveries,
        monthlyDeliveries,
        todayCash,
      };
    },
    [stats, todayKey],
  );

  return {
    stats,
    loading,
    error,
    refresh,
    todayKey,
    computeMetrics,
    getAgentPerformance,
  };
}
