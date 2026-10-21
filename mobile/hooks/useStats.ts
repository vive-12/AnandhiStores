// hooks/useStats.ts — Realtime Daily Stats & Analytics Hook
import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  listenRecentStats,
  getTodayKey,
  getRecentStats,
  getSundayOfCurrentWeek,
  getFirstDayOfCurrentMonth,
  formatDateKey,
  formatTimeOnly,
  getTimeframeWindow,
  type TimeframeWindow,
} from '../services/stats';
import type { DailyStats } from '../types';

export type AnalyticsRange = 'today' | 'week' | 'month' | '7days' | '30days';

export interface DailyBreakdownItem {
  date: string;
  label: string; // e.g. "Sun" or "1"
  fullLabel: string; // e.g. "Sunday, Oct 4"
  revenue: number;
  orders: number;
  upiRevenue: number;
  upiOrders: number;
  codRevenue: number;
  isToday: boolean;
  isFuture?: boolean;
}

export interface AgentPerformanceData {
  todayDeliveries: number;
  weeklyDeliveries: number;
  monthlyDeliveries: number;
  todayCash: number;
  weeklyCash: number;
  monthlyCash: number;
}

export function useStats(maxDays = 45) {
  const [stats, setStats] = useState<DailyStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const [asOfTime, setAsOfTime] = useState<Date>(new Date());

  useEffect(() => {
    setLoading(true);
    const unsub = listenRecentStats(
      maxDays,
      data => {
        setStats(data);
        setError(null);
        setLoading(false);
      },
      err => {
        console.error('Error listening to stats_daily:', {
          code: (err as any)?.code,
          message: err?.message,
        });
        setError(err);
        setLoading(false);
      },
    );

    return unsub;
  }, [maxDays]);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      setLoading(true);
      setAsOfTime(new Date());
      const data = await getRecentStats(maxDays);
      setStats(data);
    } catch (e) {
      const error = e as Error;
      console.error('Failed to refresh stats_daily:', { code: (error as any)?.code, message: error.message });
      setError(error);
    } finally {
      setLoading(false);
    }
  }, [maxDays]);

  // Refresh calendar boundaries while the analytics screen remains open.
  useEffect(() => {
    const timer = setInterval(() => setAsOfTime(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const todayKey = getTodayKey();
  const sundayKey = formatDateKey(getSundayOfCurrentWeek(asOfTime));
  const firstOfMonthKey = formatDateKey(getFirstDayOfCurrentMonth(asOfTime));

  // Filter stats by selected range (Calendar bound: today from 12 AM, week from Sun 12 AM, month from 1st 12 AM)
  const getStatsForRange = useCallback(
    (range: AnalyticsRange): DailyStats[] => {
      if (range === 'today') {
        const todayDoc = stats.find(s => s.date === todayKey);
        return todayDoc ? [todayDoc] : [];
      }

      if (range === 'week' || range === '7days') {
        return stats.filter(s => s.date >= sundayKey);
      }

      // 'month' or '30days'
      return stats.filter(s => s.date >= firstOfMonthKey);
    },
    [stats, todayKey, sundayKey, firstOfMonthKey],
  );

  // Compute aggregated metrics for a range
  const computeMetrics = useCallback(
    (range: AnalyticsRange, targetAsOf: Date = asOfTime) => {
      const filtered = getStatsForRange(range);

      let revenue = 0;
      let deliveredCount = 0;
      let cancelledCount = 0;
      let recoveryCount = 0;
      let cancelledRecoveryCount = 0;
      let upiRevenue = 0;
      let upiOrders = 0;
      const itemQtyMap: Record<string, number> = {};
      const qrSalesMap: Record<string, number> = {};
      const qrOrdersMap: Record<string, number> = {};

      for (const day of filtered) {
        revenue += day.revenue || 0;
        deliveredCount += day.orders || 0;
        cancelledCount += day.cancelledOrders || 0;
        recoveryCount += day.recoveryOrders || 0;
        cancelledRecoveryCount += day.cancelledRecoveryOrders || 0;
        upiRevenue += day.upiRevenue || 0;
        upiOrders += day.upiOrders || 0;

        if (day.itemQty) {
          for (const [itemId, qty] of Object.entries(day.itemQty)) {
            itemQtyMap[itemId] = (itemQtyMap[itemId] || 0) + (qty || 0);
          }
        }

        if (day.qrSales) {
          for (const [qrId, amt] of Object.entries(day.qrSales)) {
            qrSalesMap[qrId] = (qrSalesMap[qrId] || 0) + (amt || 0);
          }
        }

        if (day.qrOrders) {
          for (const [qrId, cnt] of Object.entries(day.qrOrders)) {
            qrOrdersMap[qrId] = (qrOrdersMap[qrId] || 0) + (cnt || 0);
          }
        }
      }

      const codRevenue = Math.max(0, revenue - upiRevenue);
      const aov = deliveredCount > 0 ? Math.round(revenue / deliveredCount) : 0;

      // Build daily breakdown for charts
      const dailyBreakdown: DailyBreakdownItem[] = [];
      const now = new Date();

      if (range === 'today') {
        const matchingDoc = stats.find(s => s.date === todayKey);
        const dayRev = matchingDoc?.revenue || 0;
        const dayUpi = matchingDoc?.upiRevenue || 0;
        dailyBreakdown.push({
          date: todayKey,
          label: 'Today',
          fullLabel: `${now.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'Asia/Kolkata' })} (12:00 AM – ${formatTimeOnly(targetAsOf)})`,
          revenue: dayRev,
          orders: matchingDoc?.orders || 0,
          upiRevenue: dayUpi,
          upiOrders: matchingDoc?.upiOrders || 0,
          codRevenue: Math.max(0, dayRev - dayUpi),
          isToday: true,
          isFuture: false,
        });
      } else if (range === 'week' || range === '7days') {
        // 7-day week starting Sunday 12:00 AM (Sun, Mon, Tue, Wed, Thu, Fri, Sat)
        const sunday = getSundayOfCurrentWeek(targetAsOf);
        for (let i = 0; i < 7; i++) {
          const d = new Date(sunday);
          d.setUTCDate(sunday.getUTCDate() + i);
          const dateStr = formatDateKey(d);
          const matchingDoc = stats.find(s => s.date === dateStr);

          const dayName = d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'Asia/Kolkata' });
          const fullDate = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'Asia/Kolkata' });
          const isToday = dateStr === todayKey;
          const isFuture = dateStr > todayKey;

          const dayRev = isFuture ? 0 : matchingDoc?.revenue || 0;
          const dayUpi = isFuture ? 0 : matchingDoc?.upiRevenue || 0;

          dailyBreakdown.push({
            date: dateStr,
            label: isToday ? `${dayName} •` : dayName,
            fullLabel: isToday ? `${fullDate} (Today 12:00 AM – ${formatTimeOnly(targetAsOf)})` : fullDate,
            revenue: dayRev,
            orders: isFuture ? 0 : matchingDoc?.orders || 0,
            upiRevenue: dayUpi,
            upiOrders: isFuture ? 0 : matchingDoc?.upiOrders || 0,
            codRevenue: Math.max(0, dayRev - dayUpi),
            isToday,
            isFuture,
          });
        }
      } else {
        // 'month' or '30days' — Month-to-date starting 1st of month 12:00 AM up to today
        const istToday = getTodayKey();
        const [year, month, totalDaysToDate] = istToday.split('-').map(Number);
        for (let i = 1; i <= totalDaysToDate; i++) {
          const d = new Date(Date.UTC(year, month - 1, i));
          const dateStr = formatDateKey(d);
          const matchingDoc = stats.find(s => s.date === dateStr);

          const fullDate = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'Asia/Kolkata' });
          const isToday = dateStr === todayKey;

          const dayRev = matchingDoc?.revenue || 0;
          const dayUpi = matchingDoc?.upiRevenue || 0;

          dailyBreakdown.push({
            date: dateStr,
            label: `${i}`,
            fullLabel: isToday ? `${fullDate} (Today 12:00 AM – ${formatTimeOnly(targetAsOf)})` : fullDate,
            revenue: dayRev,
            orders: matchingDoc?.orders || 0,
            upiRevenue: dayUpi,
            upiOrders: matchingDoc?.upiOrders || 0,
            codRevenue: Math.max(0, dayRev - dayUpi),
            isToday,
            isFuture: false,
          });
        }
      }

      const timeWindow = getTimeframeWindow(range, targetAsOf);

      return {
        revenue,
        deliveredCount,
        cancelledCount,
        recoveryCount,
        cancelledRecoveryCount,
        aov,
        upiRevenue,
        upiOrders,
        codRevenue,
        itemQtyMap,
        qrSalesMap,
        qrOrdersMap,
        dailyBreakdown,
        asOfTime: targetAsOf,
        timeWindow,
      };
    },
    [getStatsForRange, stats, todayKey, asOfTime],
  );

  // Compute stats per agent
  const getAgentPerformance = useCallback(
    (agentId: string): AgentPerformanceData => {
      const todayDoc = stats.find(s => s.date === todayKey);
      const todayDeliveries = todayDoc?.deliveriesByAgent?.[agentId] || 0;
      const todayCash = todayDoc?.cashCollectedByAgent?.[agentId] || 0;

      // Week to Date (since Sunday 12:00 AM)
      let weeklyDeliveries = 0;
      let weeklyCash = 0;
      for (const s of stats) {
        if (s.date >= sundayKey) {
          weeklyDeliveries += s.deliveriesByAgent?.[agentId] || 0;
          weeklyCash += s.cashCollectedByAgent?.[agentId] || 0;
        }
      }

      // Month to Date (since 1st 12:00 AM)
      let monthlyDeliveries = 0;
      let monthlyCash = 0;
      for (const s of stats) {
        if (s.date >= firstOfMonthKey) {
          monthlyDeliveries += s.deliveriesByAgent?.[agentId] || 0;
          monthlyCash += s.cashCollectedByAgent?.[agentId] || 0;
        }
      }

      return {
        todayDeliveries,
        weeklyDeliveries,
        monthlyDeliveries,
        todayCash,
        weeklyCash,
        monthlyCash,
      };
    },
    [stats, todayKey, sundayKey, firstOfMonthKey],
  );

  return {
    stats,
    loading,
    error,
    refresh,
    todayKey,
    sundayKey,
    firstOfMonthKey,
    asOfTime,
    setAsOfTime,
    computeMetrics,
    getAgentPerformance,
  };
}
