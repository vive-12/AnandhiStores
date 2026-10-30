// hooks/useSession.ts — Global auth session (Zustand, in-memory)
// Persisted across restarts via AsyncStorage in services/auth.ts.
import { create } from 'zustand';
import type { User, UserRole, UserStatus } from '../types';

interface SessionState {
  uid:       string | null;
  role:      UserRole | null;
  name:      string | null;
  phone:     string | null;
  status:    UserStatus | null;
  sessionVersion: number;
  isDemo: boolean;
  mustChangePin: boolean;
  isLoading: boolean;

  setSession:   (user: Pick<User, 'id' | 'role' | 'name' | 'phone' | 'status'> & Partial<Pick<User, 'mustChangePin' | 'sessionVersion' | 'isDemo'>>) => void;
  clearSession: () => void;
  setLoading:   (v: boolean) => void;
}

export const useSession = create<SessionState>()(set => ({
  uid:       null,
  role:      null,
  name:      null,
  phone:     null,
  status:    null,
  sessionVersion: 0,
  isDemo: false,
  mustChangePin: false,
  isLoading: true,   // true until session restoration completes on app start

  setSession: (user) => set({
    uid:       user.id,
    role:      user.role,
    name:      user.name,
    phone:     user.phone,
    status:    user.status,
    sessionVersion: user.sessionVersion ?? 0,
    isDemo: user.isDemo === true,
    mustChangePin: user.mustChangePin === true,
    isLoading: false,
  }),

  clearSession: () => set({
    uid: null, role: null, name: null, phone: null, status: null, sessionVersion: 0, isDemo: false, mustChangePin: false, isLoading: false,
  }),

  setLoading: (v) => set({ isLoading: v }),
}));
