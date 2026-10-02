// hooks/useSettings.ts — Live settings hook
import { useState, useEffect } from 'react';
import { listenSettings } from '../services/settings';
import type { Settings } from '../types';

interface UseSettingsResult {
  settings: Settings | null;
  loading:  boolean;
  error:    Error | null;
}

export function useSettings(): UseSettingsResult {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<Error | null>(null);

  useEffect(() => {
    const unsub = listenSettings(
      data => { setSettings(data); setLoading(false); },
      e    => { setError(e);      setLoading(false); },
    );
    return unsub;
  }, []);

  return { settings, loading, error };
}
