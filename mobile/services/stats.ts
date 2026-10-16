// services/stats.ts — Daily stats read & realtime service
// Stats are written atomically by services/orders.ts on delivery & cancellation.
// Admin reads and listens to them here.
import {
  doc,
  getDoc,
  collection,
  query,
  orderBy,
  documentId,
  limit,
  getDocs,
  onSnapshot,
  Unsubscribe,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { DailyStats } from '../types';

const COL = 'stats_daily';

/** Format one timestamp as the store's calendar date (Asia/Kolkata). */
export function getISTDateKey(d: Date): string {
  const ist = new Date(d.getTime() + 330 * 60 * 1000);
  const year = ist.getUTCFullYear();
  const month = String(ist.getUTCMonth() + 1).padStart(2, '0');
  const day = String(ist.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Kept as the shared date-key formatter; all store dates are IST. */
export const formatDateKey = getISTDateKey;

/** Returns today's store date in YYYY-MM-DD (Asia/Kolkata). */
export function getTodayKey(): string {
  return getISTDateKey(new Date());
}

/** Returns Date object for Sunday 12:00:00 AM of the current week */
export function getSundayOfCurrentWeek(baseDate: Date = new Date()): Date {
  const d = new Date(`${getISTDateKey(baseDate)}T00:00:00.000Z`);
  const dayOfWeek = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - dayOfWeek);
  return new Date(d.getTime() - 330 * 60 * 1000);
}

/** Returns Date object for 1st of the current month at 12:00:00 AM */
export function getFirstDayOfCurrentMonth(baseDate: Date = new Date()): Date {
  const [year, month] = getISTDateKey(baseDate).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, 1) - 330 * 60 * 1000);
}

/** Formats Date to 12-hour time string with AM/PM e.g. "1:24 AM" */
export function formatTimeOnly(d: Date = new Date()): string {
  return d.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  });
}

export interface TimeframeWindow {
  range: string;
  startLabel: string;
  endLabel: string;
  chipSubText: string;
  windowTitle: string;
  detailLabel: string;
}

export function getTimeframeWindow(
  range: 'today' | 'week' | 'month' | '7days' | '30days' | 'all',
  asOfTime: Date = new Date(),
): TimeframeWindow {
  const timeStr = formatTimeOnly(asOfTime);

  if (range === 'today') {
    return {
      range: 'today',
      startLabel: '12:00 AM',
      endLabel: timeStr,
      chipSubText: `12 AM → ${timeStr}`,
      windowTitle: `Today (12:00 AM – ${timeStr})`,
      detailLabel: `Sales from 12:00 AM up to ${timeStr} (exact click time)`,
    };
  }

  if (range === 'week' || range === '7days') {
    return {
      range: 'week',
      startLabel: 'Sun 12:00 AM',
      endLabel: timeStr,
      chipSubText: `Sun 12 AM → ${timeStr}`,
      windowTitle: `This Week (Sun 12:00 AM – ${timeStr})`,
      detailLabel: `Weekly sales from Sunday 12:00 AM up to ${timeStr}`,
    };
  }

  if (range === 'month' || range === '30days') {
    return {
      range: 'month',
      startLabel: '1st 12:00 AM',
      endLabel: timeStr,
      chipSubText: `1st 12 AM → ${timeStr}`,
      windowTitle: `This Month (1st 12:00 AM – ${timeStr})`,
      detailLabel: `Monthly sales from 1st 12:00 AM up to ${timeStr}`,
    };
  }

  return {
    range: 'all',
    startLabel: 'All Time',
    endLabel: timeStr,
    chipSubText: 'Lifetime',
    windowTitle: `All Time (as of ${timeStr})`,
    detailLabel: `All-time cumulative sales as of ${timeStr}`,
  };
}

function normalizeStatsDoc(data: any, date: string): DailyStats {
  const cashCollectedByAgent: Record<string, number> = { ...(data?.cashCollectedByAgent || {}) };
  const deliveriesByAgent: Record<string, number> = { ...(data?.deliveriesByAgent || {}) };
  const itemQty: Record<string, number> = { ...(data?.itemQty || {}) };
  const qrSales: Record<string, number> = { ...(data?.qrSales || {}) };
  const qrOrders: Record<string, number> = { ...(data?.qrOrders || {}) };
  const recoveryRunsByAgent: Record<string, number> = { ...(data?.recoveryRunsByAgent || {}) };

  if (data) {
    for (const [k, v] of Object.entries(data)) {
      if (k.startsWith('cashCollectedByAgent.')) {
        const agentId = k.slice('cashCollectedByAgent.'.length);
        cashCollectedByAgent[agentId] = (cashCollectedByAgent[agentId] || 0) + (Number(v) || 0);
      } else if (k.startsWith('deliveriesByAgent.')) {
        const agentId = k.slice('deliveriesByAgent.'.length);
        deliveriesByAgent[agentId] = (deliveriesByAgent[agentId] || 0) + (Number(v) || 0);
      } else if (k.startsWith('itemQty.')) {
        const itemId = k.slice('itemQty.'.length);
        itemQty[itemId] = (itemQty[itemId] || 0) + (Number(v) || 0);
      } else if (k.startsWith('qrSales.')) {
        const qrId = k.slice('qrSales.'.length);
        qrSales[qrId] = (qrSales[qrId] || 0) + (Number(v) || 0);
      } else if (k.startsWith('qrOrders.')) {
        const qrId = k.slice('qrOrders.'.length);
        qrOrders[qrId] = (qrOrders[qrId] || 0) + (Number(v) || 0);
      } else if (k.startsWith('recoveryRunsByAgent.')) {
        const agentId = k.slice('recoveryRunsByAgent.'.length);
        recoveryRunsByAgent[agentId] = (recoveryRunsByAgent[agentId] || 0) + (Number(v) || 0);
      }
    }
  }

  return {
    orders: 0,
    revenue: 0,
    cancelledOrders: 0,
    upiRevenue: 0,
    upiOrders: 0,
    ...data,
    date,
    cashCollectedByAgent,
    deliveriesByAgent,
    itemQty,
    qrSales,
    qrOrders,
    recoveryRunsByAgent,
  };
}

/** Fetch stats for a specific date (YYYY-MM-DD) */
export async function getStatsForDate(date: string): Promise<DailyStats | null> {
  const snap = await getDoc(doc(db, COL, date));
  if (!snap.exists()) return null;
  return normalizeStatsDoc(snap.data(), date);
}

/** Fetch today's stats */
export async function getTodayStats(): Promise<DailyStats | null> {
  return getStatsForDate(getTodayKey());
}

/** Fetch stats for the last N days (for 7-day / 30-day ranges) */
export async function getRecentStats(days: number): Promise<DailyStats[]> {
  const statsQuery = query(collection(db, COL), orderBy(documentId(), 'desc'), limit(days));
  const snap = await getDocs(statsQuery);
  return snap.docs.map(d => normalizeStatsDoc(d.data(), d.id));
}

/** Real-time listener for the last N days of stats */
export function listenRecentStats(
  days: number,
  onData: (stats: DailyStats[]) => void,
  onError: (e: Error) => void,
): Unsubscribe {
  return onSnapshot(
    query(collection(db, COL), orderBy(documentId(), 'desc'), limit(days)),
    snap => {
      const stats = snap.docs.map(d => normalizeStatsDoc(d.data(), d.id));
      onData(stats);
    },
    onError,
  );
}

/** Real-time listener for a single date (e.g. today) */
export function listenStatsForDate(
  date: string,
  onData: (stats: DailyStats | null) => void,
  onError: (e: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, COL, date),
    snap => {
      if (!snap.exists()) {
        onData(null);
      } else {
        onData({ date, ...snap.data() } as DailyStats);
      }
    },
    onError,
  );
}
