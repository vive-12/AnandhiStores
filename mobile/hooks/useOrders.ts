// hooks/useOrders.ts — Live orders hook with role-based filtering
import { useState, useEffect, useCallback } from 'react';
import {
  listenCustomerOrders,
  listenAgentOrders,
  listenAdminOrders,
  listenRecoveryOrders,
} from '../services/orders';
import type { Order, OrderStatus } from '../types';

interface UseOrdersResult {
  orders:   Order[];
  loading:  boolean;
  error:    Error | null;
  refresh:  () => void;
  loadMore: () => void;
  historyLimit: number;
}

/** Customer: own orders */
export function useCustomerOrders(customerId: string | null): UseOrdersResult {
  const [orders,  setOrders]  = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<Error | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [historyLimit, setHistoryLimit] = useState(50);
  const loadMore = useCallback(() => setHistoryLimit(n => n + 50), []);

  useEffect(() => {
    setOrders([]);
    setError(null);
    if (!customerId) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    const unsub = listenCustomerOrders(
      customerId,
      data => { setOrders(data); setError(null); setLoading(false); },
      e    => { setError(e);    setLoading(false); },
      historyLimit,
    );
    return unsub;
  }, [customerId, reloadKey, historyLimit]);

  const refresh = useCallback(() => setReloadKey(key => key + 1), []);
  return { orders, loading, error, refresh, loadMore, historyLimit };
}

/** Agent: own assigned orders */
export function useAgentOrders(agentId: string | null): UseOrdersResult {
  const [orders,  setOrders]  = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<Error | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [historyLimit, setHistoryLimit] = useState(50);
  const loadMore = useCallback(() => setHistoryLimit(n => n + 50), []);

  useEffect(() => {
    setOrders([]);
    setError(null);
    if (!agentId) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    const unsub = listenAgentOrders(
      agentId,
      data => { setOrders(data); setError(null); setLoading(false); },
      e    => { setError(e);    setLoading(false); },
      historyLimit,
    );
    return unsub;
  }, [agentId, reloadKey, historyLimit]);

  const refresh = useCallback(() => setReloadKey(key => key + 1), []);
  return { orders, loading, error, refresh, loadMore, historyLimit };
}

/** Admin: all orders with optional status filter */
export function useAdminOrders(statusFilter?: OrderStatus): UseOrdersResult {
  const [orders,  setOrders]  = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<Error | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [historyLimit, setHistoryLimit] = useState(50);
  const loadMore = useCallback(() => setHistoryLimit(n => n + 50), []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const unsub = listenAdminOrders(
      data => { setOrders(data); setError(null); setLoading(false); },
      e    => { setError(e);    setLoading(false); },
      statusFilter,
      historyLimit,
    );
    return unsub;
  }, [statusFilter, reloadKey, historyLimit]);

  const refresh = useCallback(() => setReloadKey(key => key + 1), []);
  return { orders, loading, error, refresh, loadMore, historyLimit };
}

/** Admin: bounded recovery queue kept separate from ordinary order pages. */
export function useRecoveryOrders(): UseOrdersResult {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [historyLimit, setHistoryLimit] = useState(50);
  const loadMore = useCallback(() => setHistoryLimit(n => n + 50), []);
  useEffect(() => {
    setLoading(true);
    setError(null);
    const unsub = listenRecoveryOrders(
      data => { setOrders(data); setError(null); setLoading(false); },
      e => { setError(e); setLoading(false); },
      historyLimit,
    );
    return unsub;
  }, [reloadKey, historyLimit]);
  const refresh = useCallback(() => setReloadKey(key => key + 1), []);
  return { orders, loading, error, refresh, loadMore, historyLimit };
}
