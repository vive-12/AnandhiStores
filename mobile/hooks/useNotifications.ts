// hooks/useNotifications.ts — Live notifications hook
import { useState, useEffect } from 'react';
import { listenNotifications } from '../services/notifications';
import type { AppNotification } from '../types';

interface UseNotificationsResult {
  notifications: AppNotification[];
  unreadCount:   number;
  loading:       boolean;
  error:         Error | null;
}

export function useNotifications(uid: string | null): UseNotificationsResult {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState<Error | null>(null);

  useEffect(() => {
    if (!uid) { setLoading(false); return; }
    const unsub = listenNotifications(
      uid,
      data => { setNotifications(data); setLoading(false); },
      e    => { setError(e);           setLoading(false); },
    );
    return unsub;
  }, [uid]);

  const unreadCount = notifications.filter(n => !n.read).length;

  return { notifications, unreadCount, loading, error };
}
