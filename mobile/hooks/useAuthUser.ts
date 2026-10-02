import { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../config/firebase';
import { listenUser } from '../services/users';
import { useSession } from './useSession';
import type { User } from '../types';

interface UseAuthUserResult {
  user:          User | null;
  firebaseUid:   string | null;
  loading:       boolean;
}

export function useAuthUser(): UseAuthUserResult {
  const sessionUid = useSession(s => s.uid);
  const [firebaseUid, setFirebaseUid] = useState<string | null>(null);
  const [user,        setUser]        = useState<User | null>(null);
  const [loading,     setLoading]     = useState(true);

  useEffect(() => {
    // Listen for Firebase Auth state
    const unsubAuth = onAuthStateChanged(auth, fbUser => {
      setFirebaseUid(fbUser ? fbUser.uid : null);
    });
    return unsubAuth;
  }, []);

  const effectiveUid = sessionUid || firebaseUid;

  useEffect(() => {
    if (!effectiveUid) {
      setUser(null);
      setLoading(false);
      return;
    }
    // Listen for Firestore profile (role, status, isOnline, etc.)
    const unsubProfile = listenUser(effectiveUid, profile => {
      setUser(profile);
      setLoading(false);
    });
    return unsubProfile;
  }, [effectiveUid]);

  return { user, firebaseUid: effectiveUid, loading };
}
