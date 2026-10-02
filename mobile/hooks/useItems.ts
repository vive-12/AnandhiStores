// hooks/useItems.ts — Live items hook
import { useState, useEffect } from 'react';
import { listenItems } from '../services/items';
import type { Item } from '../types';

interface UseItemsResult {
  items:    Item[];
  loading:  boolean;
  error:    Error | null;
  refresh:  () => void;
}

export function useItems(includeDeleted = false): UseItemsResult {
  const [items,   setItems]   = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<Error | null>(null);
  const [tick,    setTick]    = useState(0);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const unsub = listenItems(
      data => { setItems(data); setLoading(false); },
      e    => { setError(e);   setLoading(false); },
      includeDeleted,
    );
    return unsub;
  }, [includeDeleted, tick]);

  return { items, loading, error, refresh: () => setTick(t => t + 1) };
}
