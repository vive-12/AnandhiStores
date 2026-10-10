/**
 * Logger — Anandhi Stores / AquaRush
 *
 * Categories (grep these in Metro / share from /dev/logs):
 *   [AUTH]      — login, logout, session restore
 *   [ORDERS]    — place, assign, status transitions
 *   [AGENT]     — online/offline, delivery actions
 *   [ADMIN]     — admin actions (assign, pack, cancel)
 *   [OUTBOX]    — offline queue enqueue / replay
 *   [FIRESTORE] — raw Firestore errors
 *   [NAV]       — routing / navigation events
 *
 * Persistence:
 *   All logs are saved to AsyncStorage key: @anandhi_logs
 *   Max 500 entries are kept (ring buffer). Logs survive app restarts.
 *   Load on startup:  call initLogger() once in _layout.tsx
 *   Share all logs:   navigate to /dev/logs → tap "Share Logs"
 *
 * Usage:
 *   import { log } from '../utils/logger';
 *   log.auth.info('Login success', { uid, role });
 *   log.orders.warn('Transition blocked', { from, to });
 *   log.agent.error('setOnline failed', err);
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export type LogLevel    = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
export type LogCategory = 'AUTH' | 'ORDERS' | 'AGENT' | 'ADMIN' | 'OUTBOX' | 'FIRESTORE' | 'NAV';

export interface LogEntry {
  iso:      string;       // full ISO — used for persistence & sharing
  time:     string;       // HH:MM:SS.ms — for quick reading
  level:    LogLevel;
  category: LogCategory;
  message:  string;
  data:     unknown;
}

// ─── Config ───────────────────────────────────────────────────────────────────
const MAX_ENTRIES    = 500;
const STORAGE_KEY    = '@anandhi_logs';
const FLUSH_DELAY_MS = 3000;   // debounce AsyncStorage writes

// ─── In-memory ring buffer ────────────────────────────────────────────────────
const _buffer: LogEntry[] = [];
let   _flushTimer: ReturnType<typeof setTimeout> | null = null;
let   _storageReady = false;   // true after initLogger() loads previous logs

// ─── Category colours (ANSI — visible in Metro terminal) ─────────────────────
const CAT_COLOR: Record<LogCategory, string> = {
  AUTH:      '\x1b[36m',   // cyan
  ORDERS:    '\x1b[35m',   // magenta
  AGENT:     '\x1b[32m',   // green
  ADMIN:     '\x1b[33m',   // yellow
  OUTBOX:    '\x1b[34m',   // blue
  FIRESTORE: '\x1b[90m',   // grey
  NAV:       '\x1b[37m',   // white
};
const LEVEL_EMOJI: Record<LogLevel, string> = {
  INFO: 'i', WARN: '!', ERROR: 'X', DEBUG: '?',
};
const RESET = '\x1b[0m';

// ─── Timestamp helpers ────────────────────────────────────────────────────────
function _ts(): { iso: string; time: string } {
  const d  = new Date();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return { iso: d.toISOString(), time: `${hh}:${mm}:${ss}.${ms}` };
}

// ─── AsyncStorage flush (debounced) ──────────────────────────────────────────
function _scheduleFlush(): void {
  if (_flushTimer) clearTimeout(_flushTimer);
  _flushTimer = setTimeout(() => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(_buffer)).catch(() => {});
    _flushTimer = null;
  }, FLUSH_DELAY_MS);
}

// ─── Core push ────────────────────────────────────────────────────────────────
function _push(level: LogLevel, category: LogCategory, message: string, data?: unknown): void {
  const { iso, time } = _ts();

  // Safely serialize data (avoid circular refs crashing JSON.stringify later)
  let safeData: unknown = null;
  if (data !== undefined && data !== null) {
    if (data instanceof Error) {
      safeData = { __error: true, message: data.message, stack: data.stack ?? '' };
    } else {
      try { safeData = JSON.parse(JSON.stringify(data)); } catch { safeData = String(data); }
    }
  }

  const entry: LogEntry = { iso, time, level, category, message, data: safeData };

  if (_buffer.length >= MAX_ENTRIES) _buffer.shift();
  _buffer.push(entry);

  if (_storageReady) _scheduleFlush();

  // ── Metro console output ──────────────────────────────────────────────────
  const color  = CAT_COLOR[category];
  const prefix = `${LEVEL_EMOJI[level]} ${color}[${category}]${RESET} ${time}`;

  switch (level) {
    case 'ERROR':
      if (data instanceof Error) {
        console.error(`${prefix} ${message}`, '\n ', data.message, '\n ', data.stack ?? '');
      } else {
        console.error(`${prefix} ${message}`, data !== undefined ? data : '');
      }
      break;
    case 'WARN':
      console.warn(`${prefix} ${message}`, data !== undefined ? data : '');
      break;
    case 'DEBUG':
      console.debug(`${prefix} ${message}`, data !== undefined ? data : '');
      break;
    default:
      console.log(`${prefix} ${message}`, data !== undefined ? data : '');
  }
}

// ─── Category loggers ─────────────────────────────────────────────────────────
function makeLogger(category: LogCategory) {
  return {
    info:  (msg: string, data?: unknown) => _push('INFO',  category, msg, data),
    warn:  (msg: string, data?: unknown) => _push('WARN',  category, msg, data),
    error: (msg: string, data?: unknown) => _push('ERROR', category, msg, data),
    debug: (msg: string, data?: unknown) => _push('DEBUG', category, msg, data),
  };
}

export const log = {
  auth:      makeLogger('AUTH'),
  orders:    makeLogger('ORDERS'),
  agent:     makeLogger('AGENT'),
  admin:     makeLogger('ADMIN'),
  outbox:    makeLogger('OUTBOX'),
  firestore: makeLogger('FIRESTORE'),
  nav:       makeLogger('NAV'),
};

// ─── Init: load previous session logs from AsyncStorage ──────────────────────
/**
 * Call once at app startup (in _layout.tsx).
 * Loads previously saved log entries into the buffer so they appear
 * in /dev/logs even after an app restart.
 */
export async function initLogger(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved: LogEntry[] = JSON.parse(raw);
      // Prepend saved entries; trim to MAX_ENTRIES
      const combined = [...saved, ..._buffer];
      const trimmed  = combined.slice(-MAX_ENTRIES);
      _buffer.length = 0;
      _buffer.push(...trimmed);
    }
  } catch {
    // If corrupt, start fresh
  }
  _storageReady = true;
  _scheduleFlush(); // persist any logs that fired before init
}

// ─── Buffer access ────────────────────────────────────────────────────────────

/** All buffered entries, newest last */
export function getLogs(): LogEntry[] {
  return [..._buffer];
}

/** Filter by category */
export function getLogsByCategory(category: LogCategory): LogEntry[] {
  return _buffer.filter(e => e.category === category);
}

/** Only WARN + ERROR (or just ERROR) */
export function getLogsByLevel(minLevel: 'WARN' | 'ERROR'): LogEntry[] {
  const levels: LogLevel[] = minLevel === 'ERROR' ? ['ERROR'] : ['WARN', 'ERROR'];
  return _buffer.filter(e => levels.includes(e.level));
}

/** Clear buffer and AsyncStorage */
export async function clearLogs(): Promise<void> {
  _buffer.length = 0;
  await AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
}

// ─── Share-friendly plain-text export ────────────────────────────────────────
/**
 * Formats all (or filtered) log entries as plain text ready to paste.
 * Used by /dev/logs → "Share Logs" button.
 */
export function formatLogsForSharing(entries?: LogEntry[]): string {
  const list = entries ?? _buffer;
  if (list.length === 0) return '(no logs)';

  const header = [
    '====================================',
    'ANANDHI STORES — APP LOGS',
    `Exported: ${new Date().toISOString()}`,
    `Entries:  ${list.length}`,
    '====================================',
    '',
  ].join('\n');

  const lines = list.map(e => {
    const dataStr = e.data ? '  ' + JSON.stringify(e.data) : '';
    return `${e.iso}  [${e.level.padEnd(5)}] [${e.category.padEnd(9)}]  ${e.message}${dataStr}`;
  });

  return header + lines.join('\n');
}
