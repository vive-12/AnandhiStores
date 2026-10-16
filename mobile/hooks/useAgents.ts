// hooks/useAgents.ts — Live agents hook (admin use)
import { useState, useEffect, useCallback } from 'react';
import { listenUsersByRole, listenOnlineAgents } from '../services/users';
import type { User } from '../types';

interface UseAgentsResult {
  agents:  User[];
  loading: boolean;
  error:   Error | null;
  refresh: () => void;
}

/** All agents (for admin Agents tab) */
export function useAgents(): UseAgentsResult {
  const [agents,  setAgents]  = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<Error | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const unsub = listenUsersByRole(
      'agent',
      data => { setAgents(data); setError(null); setLoading(false); },
      e    => { setError(e);    setLoading(false); },
    );
    return unsub;
  }, [reloadKey]);

  const refresh = useCallback(() => setReloadKey(key => key + 1), []);
  return { agents, loading, error, refresh };
}

/** Only online agents (for assign picker) */
export function useOnlineAgents(): UseAgentsResult {
  const [agents,  setAgents]  = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<Error | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const unsub = listenOnlineAgents(
      data => { setAgents(data); setError(null); setLoading(false); },
      e    => { setError(e);    setLoading(false); },
    );
    return unsub;
  }, [reloadKey]);

  const refresh = useCallback(() => setReloadKey(key => key + 1), []);
  return { agents, loading, error, refresh };
}
