// services/outbox.ts — AsyncStorage-backed outbox for offline resilience
// Automatically replays queued agent/customer actions when connectivity returns.
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { transitionOrder, getOrder } from './orders';
import { setAgentOnline } from './users';
import type { Actor, OrderStatus } from '../types';

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
    console.error('Failed to read outbox queue:', err);
    return [];
  }
}

/** Save actions list to storage */
async function saveOutboxQueue(queue: OutboxAction[]): Promise<void> {
  try {
    await AsyncStorage.setItem(OUTBOX_KEY, JSON.stringify(queue));
  } catch (err) {
    console.error('Failed to save outbox queue:', err);
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
  return id;
}

/** Replay all queued actions in order, verifying document state for conflicts */
export async function replayOutbox(): Promise<{ replayed: number; conflicts: number }> {
  const queue = await getOutboxQueue();
  if (queue.length === 0) return { replayed: 0, conflicts: 0 };

  const remaining: OutboxAction[] = [];
  let replayed = 0;
  let conflicts = 0;

  for (const item of queue) {
    try {
      if (item.type === 'transition_order') {
        const { orderId, toStatus, actor, cancelReason } = item.payload;
        // Verify current order state to detect conflicts before writing
        const latestOrder = await getOrder(orderId);
        if (!latestOrder) {
          console.warn(`[Outbox] Order ${orderId} no longer exists. Discarding action.`);
          conflicts++;
          continue;
        }

        // If the order was already transitioned to the desired status, treat as done
        if (latestOrder.status === toStatus) {
          replayed++;
          continue;
        }

        // If order was cancelled in the meantime by someone else, avoid invalid state transition
        if (latestOrder.status === 'cancelled' && toStatus !== 'cancelled') {
          console.warn(
            `[Outbox] Conflict: Order ${orderId} was cancelled by ${latestOrder.cancelledBy}. Skipping ${toStatus}.`,
          );
          conflicts++;
          continue;
        }

        // Apply transition
        await transitionOrder({
          orderId,
          order: latestOrder,
          toStatus,
          actor,
          cancelReason,
        });
        replayed++;
      } else if (item.type === 'set_agent_online') {
        const { uid, isOnline } = item.payload;
        await setAgentOnline(uid, isOnline);
        replayed++;
      }
    } catch (err) {
      console.error(`[Outbox] Failed to replay action ${item.id}:`, err);
      // Keep in remaining queue to retry later
      remaining.push(item);
    }
  }

  await saveOutboxQueue(remaining);
  return { replayed, conflicts };
}

let isInitialized = false;

/** Initialize the outbox listener that triggers replay on network restore */
export function initOutboxListener(): () => void {
  if (isInitialized) return () => {};
  isInitialized = true;

  // Immediate replay check if online
  NetInfo.fetch().then(state => {
    if (state.isConnected && state.isInternetReachable !== false) {
      replayOutbox();
    }
  });

  // Replay when connection transitions to online
  const unsub = NetInfo.addEventListener(state => {
    if (state.isConnected && state.isInternetReachable !== false) {
      replayOutbox();
    }
  });

  return () => {
    unsub();
    isInitialized = false;
  };
}
