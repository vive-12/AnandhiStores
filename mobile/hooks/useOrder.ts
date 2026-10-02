// hooks/useOrder.ts — Live single-order hook
import { useState, useEffect } from 'react';
import { listenOrder } from '../services/orders';
import type { Order } from '../types';

interface UseOrderResult {
  order:   Order | null;
  loading: boolean;
  error:   Error | null;
}

export function useOrder(orderId: string | null): UseOrderResult {
  const [order,   setOrder]   = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<Error | null>(null);

  useEffect(() => {
    if (!orderId) { setLoading(false); return; }
    setLoading(true);
    const unsub = listenOrder(
      orderId,
      data => { setOrder(data); setLoading(false); },
      e    => { setError(e);   setLoading(false); },
    );
    return unsub;
  }, [orderId]);

  return { order, loading, error };
}
