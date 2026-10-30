// hooks/useSettings.ts — Live settings hook
import { useState, useEffect, useCallback } from 'react';
import { listenSettings } from '../services/settings';
import type { Settings } from '../types';

interface UseSettingsResult {
  settings: Settings | null;
  loading:  boolean;
  refresh: () => void;
  error:    Error | null;
}

export function useSettings(): UseSettingsResult {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<Error | null>(null);

  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => { setLoading(true); setError(null); setRevision(n => n + 1); }, []);
  useEffect(() => {
    const unsub = listenSettings(
      data => { setSettings(data); setError(null); setLoading(false); },
      e    => { setError(e);      setLoading(false); },
    );
    return unsub;
  }, [revision]);

  return { settings, loading, error, refresh };
}
