// services/stats.ts — Daily stats read & realtime service
// Stats are written atomically by services/orders.ts on delivery & cancellation.
// Admin reads and listens to them here.
import {
  doc,
  getDoc,
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  onSnapshot,
  Unsubscribe,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { DailyStats } from '../types';

const COL = 'stats_daily';

/** Returns local date string in YYYY-MM-DD */
export function getTodayKey(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Fetch stats for a specific date (YYYY-MM-DD) */
export async function getStatsForDate(date: string): Promise<DailyStats | null> {
  const snap = await getDoc(doc(db, COL, date));
  if (!snap.exists()) return null;
  return { date, ...snap.data() } as DailyStats;
}

/** Fetch today's stats */
export async function getTodayStats(): Promise<DailyStats | null> {
  return getStatsForDate(getTodayKey());
}

/** Fetch stats for the last N days (for 7-day / 30-day ranges) */
export async function getRecentStats(days: number): Promise<DailyStats[]> {
  const snap = await getDocs(collection(db, COL));
  const stats = snap.docs.map(d => ({ date: d.id, ...d.data() } as DailyStats));
  stats.sort((a, b) => b.date.localeCompare(a.date));
  return stats.slice(0, days);
}

/** Real-time listener for the last N days of stats */
export function listenRecentStats(
  days: number,
  onData: (stats: DailyStats[]) => void,
  onError: (e: Error) => void,
): Unsubscribe {
  return onSnapshot(
    collection(db, COL),
    snap => {
      const stats = snap.docs.map(d => ({ date: d.id, ...d.data() } as DailyStats));
      stats.sort((a, b) => b.date.localeCompare(a.date));
      onData(stats.slice(0, days));
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
