// hooks/useOrder.ts — Live single-order hook
import { useState, useEffect, useCallback } from 'react';
import { listenOrder } from '../services/orders';
import type { Order } from '../types';

interface UseOrderResult {
  order:   Order | null;
  loading: boolean;
  refresh: () => void;
  error:   Error | null;
}

export function useOrder(orderId: string | null): UseOrderResult {
  const [order,   setOrder]   = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<Error | null>(null);

  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(n => n + 1), []);
  useEffect(() => {
    setOrder(null);
    setError(null);
    if (!orderId) { setLoading(false); return; }
    setLoading(true);
    const unsub = listenOrder(
      orderId,
      data => { setOrder(data); setLoading(false); },
      e    => { setError(e);   setLoading(false); },
    );
    return unsub;
  }, [orderId, revision]);

  return { order, loading, error, refresh };
}
