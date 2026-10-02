// hooks/useOrders.ts — Live orders hook with role-based filtering
import { useState, useEffect } from 'react';
import {
  listenCustomerOrders,
  listenAgentOrders,
  listenAdminOrders,
} from '../services/orders';
import type { Order, OrderStatus } from '../types';

interface UseOrdersResult {
  orders:   Order[];
  loading:  boolean;
  error:    Error | null;
}

/** Customer: own orders */
export function useCustomerOrders(customerId: string | null): UseOrdersResult {
  const [orders,  setOrders]  = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<Error | null>(null);

  useEffect(() => {
    if (!customerId) { setLoading(false); return; }
    setLoading(true);
    const unsub = listenCustomerOrders(
      customerId,
      data => { setOrders(data); setLoading(false); },
      e    => { setError(e);    setLoading(false); },
    );
    return unsub;
  }, [customerId]);

  return { orders, loading, error };
}

/** Agent: own assigned orders */
export function useAgentOrders(agentId: string | null): UseOrdersResult {
  const [orders,  setOrders]  = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<Error | null>(null);

  useEffect(() => {
    if (!agentId) { setLoading(false); return; }
    setLoading(true);
    const unsub = listenAgentOrders(
      agentId,
      data => { setOrders(data); setLoading(false); },
      e    => { setError(e);    setLoading(false); },
    );
    return unsub;
  }, [agentId]);

  return { orders, loading, error };
}

/** Admin: all orders with optional status filter */
export function useAdminOrders(statusFilter?: OrderStatus): UseOrdersResult {
  const [orders,  setOrders]  = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<Error | null>(null);

  useEffect(() => {
    setLoading(true);
    const unsub = listenAdminOrders(
      data => { setOrders(data); setLoading(false); },
      e    => { setError(e);    setLoading(false); },
      statusFilter,
    );
    return unsub;
  }, [statusFilter]);

  return { orders, loading, error };
}
