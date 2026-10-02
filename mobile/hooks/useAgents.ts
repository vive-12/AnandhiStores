// hooks/useAgents.ts — Live agents hook (admin use)
import { useState, useEffect } from 'react';
import { listenUsersByRole, listenOnlineAgents } from '../services/users';
import type { User } from '../types';

interface UseAgentsResult {
  agents:  User[];
  loading: boolean;
  error:   Error | null;
}

/** All agents (for admin Agents tab) */
export function useAgents(): UseAgentsResult {
  const [agents,  setAgents]  = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<Error | null>(null);

  useEffect(() => {
    const unsub = listenUsersByRole(
      'agent',
      data => { setAgents(data); setLoading(false); },
      e    => { setError(e);    setLoading(false); },
    );
    return unsub;
  }, []);

  return { agents, loading, error };
}

/** Only online agents (for assign picker) */
export function useOnlineAgents(): UseAgentsResult {
  const [agents,  setAgents]  = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<Error | null>(null);

  useEffect(() => {
    const unsub = listenOnlineAgents(
      data => { setAgents(data); setLoading(false); },
      e    => { setError(e);    setLoading(false); },
    );
    return unsub;
  }, []);

  return { agents, loading, error };
}
