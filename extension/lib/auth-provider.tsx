import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { getAuthUser, signIn as signInRequest, signOut as signOutRequest } from './auth';
import { LS_ACTIVE } from './constants';
import type { PremiumUser } from './types';

export interface AuthContextValue {
  user: PremiumUser | null;
  authLoading: boolean;
  signingIn: boolean;
  signIn: () => Promise<PremiumUser | null>;
  signOut: () => Promise<void>;
  handleAuthLost: () => void;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PremiumUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    let disposed = false;
    void getAuthUser()
      .then((u) => {
        if (disposed) return;
        setUser(u ?? null);
      })
      .catch(() => {})
      .finally(() => {
        if (!disposed) setAuthLoading(false);
      });
    return () => {
      disposed = true;
    };
  }, []);

  const signIn = useCallback(async () => {
    setSigningIn(true);
    try {
      const u = await signInRequest();
      setUser(u);
      return u;
    } finally {
      setSigningIn(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    await signOutRequest();
    // Only remove session-scoped keys; preserve model/plugin preferences (LS_MODEL, LS_DISABLED_PLUGINS).
    localStorage.removeItem(LS_ACTIVE);
    window.location.reload();
  }, []);

  const handleAuthLost = useCallback(() => setUser(null), []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, authLoading, signingIn, signIn, signOut, handleAuthLost }),
    [user, authLoading, signingIn, signIn, signOut, handleAuthLost],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
