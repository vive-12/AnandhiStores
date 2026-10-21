// services/outbox.ts — AsyncStorage-backed outbox for offline resilience
// Automatically replays queued agent/customer actions when connectivity returns.
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { transitionOrder, getOrder } from './orders';
import { setAgentOnline } from './users';
import type { Actor, OrderStatus } from '../types';
import { log } from '../utils/logger';

const OUTBOX_KEY = '@anandhi_outbox';

export type OutboxAction =
  | {
      id: string;
      type: 'transition_order';
      createdAt: number;
      payload: {
        orderId: string;
        toStatus: OrderStatus;
        actor: Actor;
        cancelReason?: string;
      };
    }
  | {
      id: string;
      type: 'set_agent_online';
      createdAt: number;
      payload: {
        uid: string;
        isOnline: boolean;
      };
    };

/** Retrieve all queued actions from storage */
export async function getOutboxQueue(): Promise<OutboxAction[]> {
  try {
    const raw = await AsyncStorage.getItem(OUTBOX_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    log.outbox.error('Failed to read outbox queue', err);
    return [];
  }
}

/** Save actions list to storage */
async function saveOutboxQueue(queue: OutboxAction[]): Promise<void> {
  try {
    await AsyncStorage.setItem(OUTBOX_KEY, JSON.stringify(queue));
  } catch (err) {
    log.outbox.error('Failed to save outbox queue', err);
  }
}

/** Queue a new action when offline or when write fails */
export async function enqueueAction(
  action: Omit<OutboxAction, 'id' | 'createdAt'>,
): Promise<string> {
  const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const item: OutboxAction = {
    ...action,
    id,
    createdAt: Date.now(),
  } as OutboxAction;

  const queue = await getOutboxQueue();
  queue.push(item);
  await saveOutboxQueue(queue);
  log.outbox.info(`Queued action (offline): ${action.type}`, { id, type: action.type });
  return id;
}

let isReplaying = false;

/** Replay all queued actions in order, verifying document state for conflicts */
export async function replayOutbox(): Promise<{ replayed: number; conflicts: number }> {
  if (isReplaying) return { replayed: 0, conflicts: 0 };
  isReplaying = true;
  try {
    const queue = await getOutboxQueue();
    if (queue.length === 0) return { replayed: 0, conflicts: 0 };

    log.outbox.info(`Replaying ${queue.length} queued action(s)`);

  const remaining: OutboxAction[] = [];
  let replayed = 0;
  let conflicts = 0;

  for (const item of queue) {
    try {
      if (item.type === 'transition_order') {
        const { orderId, toStatus, actor, cancelReason } = item.payload;
        const latestOrder = await getOrder(orderId);
        if (!latestOrder) {
          log.outbox.warn(`Order ${orderId} no longer exists — discarding`, { actionId: item.id });
          conflicts++;
          continue;
        }

        if (latestOrder.status === toStatus) {
          log.outbox.debug(`Order ${orderId} already at ${toStatus} — skipping`);
          replayed++;
          continue;
        }

        if (latestOrder.status === 'cancelled' && toStatus !== 'cancelled') {
          log.outbox.warn(`Conflict: order ${orderId} was cancelled — skipping ${toStatus}`, { cancelledBy: latestOrder.cancelledBy });
          conflicts++;
          continue;
        }

        await transitionOrder({ orderId, order: latestOrder, toStatus, actor, cancelReason });
        log.outbox.info(`Replayed transition_order: ${orderId} → ${toStatus}`);
        replayed++;
      } else if (item.type === 'set_agent_online') {
        const { uid, isOnline } = item.payload;
        await setAgentOnline(uid, isOnline);
        log.outbox.info(`Replayed set_agent_online: ${uid} → ${isOnline}`);
        replayed++;
      }
    } catch (err) {
      log.outbox.error(`Failed to replay action ${item.id}`, err);
      remaining.push(item);
    }
  }

  await saveOutboxQueue(remaining);
  log.outbox.info(`Replay complete: ${replayed} replayed, ${conflicts} conflicts, ${remaining.length} still queued`);
  return { replayed, conflicts };
  } finally {
    isReplaying = false;
  }
}

let isInitialized = false;

/** Initialize the outbox listener that triggers replay on network restore */
export function initOutboxListener(): () => void {
  if (isInitialized) return () => {};
  isInitialized = true;

  // Immediate replay check if online
  NetInfo.fetch().then(state => {
    if (state.isConnected && state.isInternetReachable !== false) {
      log.outbox.debug('App started online — running immediate replay check');
      replayOutbox();
    } else {
      log.outbox.debug('App started offline — outbox listener ready, will replay on reconnect');
    }
  });

  const unsub = NetInfo.addEventListener(state => {
    if (state.isConnected && state.isInternetReachable !== false) {
      log.outbox.info('Network restored — replaying outbox');
      replayOutbox();
    }
  });

  return () => {
    unsub();
    isInitialized = false;
  };
}
