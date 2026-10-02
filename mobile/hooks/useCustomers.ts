// hooks/useCustomers.ts — Live customers list hook for admin
import { useState, useEffect } from 'react';
import { listenUsersByRole } from '../services/users';
import type { User } from '../types';

export function useCustomers() {
  const [customers, setCustomers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    setLoading(true);
    const unsub = listenUsersByRole(
      'customer',
      data => {
        setCustomers(data);
        setLoading(false);
      },
      err => {
        setError(err);
        setLoading(false);
      },
    );
    return unsub;
  }, [tick]);

  return { customers, loading, error, refresh: () => setTick(t => t + 1) };
}
