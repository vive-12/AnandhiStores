/**
 * Logger Utility for AquaRush / Anandhi Stores
 * 
 * Usage:
 *   import { log } from '../utils/logger';
 *   log.info('Alerts', 'Fetched 12 orders');
 *   log.warn('Dashboard', 'Agent went offline mid-assign', { agentId });
 *   log.error('Register', 'Firestore write failed', error);
 * 
 * View recent logs:
 *   import { getLogs, clearLogs } from '../utils/logger';
 *   console.log(getLogs());        // returns array of recent log entries
 *   clearLogs();                   // clears the in-memory log buffer
 */

const MAX_LOG_ENTRIES = 200;

// In-memory ring buffer of log entries
const _logs = [];

const LEVEL_EMOJI = {
  INFO:  'ℹ️ ',
  WARN:  '⚠️ ',
  ERROR: '🔴',
  DEBUG: '🐛',
};

function _timestamp() {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${hh}:${mm}:${ss}.${ms}`;
}

function _push(level, tag, message, data) {
  const entry = {
    time: _timestamp(),
    level,
    tag,
    message,
    data: data !== undefined ? data : null,
    raw: new Date().toISOString(),
  };

  // Keep the buffer bounded
  if (_logs.length >= MAX_LOG_ENTRIES) _logs.shift();
  _logs.push(entry);

  // Format a readable console line
  const prefix = `${LEVEL_EMOJI[level]} [${entry.time}] [${tag}]`;

  switch (level) {
    case 'ERROR':
      if (data instanceof Error) {
        console.error(`${prefix} ${message}`, data.message, data.stack);
      } else {
        console.error(`${prefix} ${message}`, data ?? '');
      }
      break;
    case 'WARN':
      console.warn(`${prefix} ${message}`, data ?? '');
      break;
    case 'DEBUG':
      // eslint-disable-next-line no-console
      console.debug(`${prefix} ${message}`, data ?? '');
      break;
    default:
      // eslint-disable-next-line no-console
      console.log(`${prefix} ${message}`, data ?? '');
  }
}

/** Public logger interface */
export const log = {
  info:  (tag, message, data) => _push('INFO',  tag, message, data),
  warn:  (tag, message, data) => _push('WARN',  tag, message, data),
  error: (tag, message, data) => _push('ERROR', tag, message, data),
  debug: (tag, message, data) => _push('DEBUG', tag, message, data),
};

/** Get a copy of the in-memory log buffer (newest last) */
export function getLogs() {
  return [..._logs];
}

/** Clear all stored logs */
export function clearLogs() {
  _logs.length = 0;
}
