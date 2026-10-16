// hooks/useCustomers.ts — Live customers list hook for admin
import { useState, useEffect, useCallback } from 'react';
import { listenUsersByRole } from '../services/users';
import type { User } from '../types';

export function useCustomers() {
  const [customers, setCustomers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const unsub = listenUsersByRole(
      'customer',
      data => {
        setCustomers(data);
        setError(null);
        setLoading(false);
      },
      err => {
        setError(err);
        setLoading(false);
      },
    );
    return unsub;
  }, [tick]);

  const refresh = useCallback(() => setTick(t => t + 1), []);
  return { customers, loading, error, refresh };
}
