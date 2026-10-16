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
}

/** Customer: own orders */
export function useCustomerOrders(customerId: string | null): UseOrdersResult {
  const [orders,  setOrders]  = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<Error | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!customerId) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    const unsub = listenCustomerOrders(
      customerId,
      data => { setOrders(data); setError(null); setLoading(false); },
      e    => { setError(e);    setLoading(false); },
    );
    return unsub;
  }, [customerId, reloadKey]);

  const refresh = useCallback(() => setReloadKey(key => key + 1), []);
  return { orders, loading, error, refresh };
}

/** Agent: own assigned orders */
export function useAgentOrders(agentId: string | null): UseOrdersResult {
  const [orders,  setOrders]  = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<Error | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!agentId) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    const unsub = listenAgentOrders(
      agentId,
      data => { setOrders(data); setError(null); setLoading(false); },
      e    => { setError(e);    setLoading(false); },
    );
    return unsub;
  }, [agentId, reloadKey]);

  const refresh = useCallback(() => setReloadKey(key => key + 1), []);
  return { orders, loading, error, refresh };
}

/** Admin: all orders with optional status filter */
export function useAdminOrders(statusFilter?: OrderStatus): UseOrdersResult {
  const [orders,  setOrders]  = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<Error | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const unsub = listenAdminOrders(
      data => { setOrders(data); setError(null); setLoading(false); },
      e    => { setError(e);    setLoading(false); },
      statusFilter,
    );
    return unsub;
  }, [statusFilter, reloadKey]);

  const refresh = useCallback(() => setReloadKey(key => key + 1), []);
  return { orders, loading, error, refresh };
}

/** Admin: bounded recovery queue kept separate from ordinary order pages. */
export function useRecoveryOrders(): UseOrdersResult {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    setLoading(true);
    setError(null);
    const unsub = listenRecoveryOrders(
      data => { setOrders(data); setError(null); setLoading(false); },
      e => { setError(e); setLoading(false); },
    );
    return unsub;
  }, [reloadKey]);
  const refresh = useCallback(() => setReloadKey(key => key + 1), []);
  return { orders, loading, error, refresh };
}
