'use client';

import { useQueryClient } from '@tanstack/react-query';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, onSessionChange, refreshSession, setSession } from './api';
import { guestCart } from './guest-cart';
import type { AuthResponse, Cart, User } from './types';

type Status = 'loading' | 'authenticated' | 'anonymous';

interface AuthContextValue {
  user: User | null;
  status: Status;
  login(email: string, password: string): Promise<User>;
  register(name: string, email: string, password: string): Promise<User>;
  logout(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const queryClient = useQueryClient();

  /** Moves anything added while signed out into the account cart, so signing in never empties the cart. */
  const mergeGuestCart = useCallback(async () => {
    const items = guestCart.read();
    if (!items.length) return;
    try {
      const cart = await api<Cart>('/cart/merge', { method: 'POST', body: { items } });
      queryClient.setQueryData(['cart'], cart);
      guestCart.clear();
    } catch {
      // keep the guest cart; the next sign-in or page load retries the merge
    }
  }, [queryClient]);

  const startSession = useCallback(
    async (session: AuthResponse) => {
      setSession(session);
      // Awaited so a redirect to /checkout right after login already sees the merged cart.
      await mergeGuestCart();
      void queryClient.invalidateQueries();
      return session.user;
    },
    [queryClient, mergeGuestCart],
  );

  useEffect(() => {
    const unsubscribe = onSessionChange((session) => {
      setUser(session?.user ?? null);
      setStatus(session ? 'authenticated' : 'anonymous');
    });
    // Restore the session after a page load using the httpOnly refresh cookie.
    void refreshSession().then((session) => (session ? mergeGuestCart() : undefined));
    return () => {
      unsubscribe();
    };
  }, [mergeGuestCart]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      status,
      login: async (email, password) =>
        startSession(await api<AuthResponse>('/auth/login', { method: 'POST', body: { email, password } })),
      register: async (name, email, password) =>
        startSession(await api<AuthResponse>('/auth/register', { method: 'POST', body: { name, email, password } })),
      logout: async () => {
        await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
        setSession(null);
        queryClient.clear();
      },
    }),
    [user, status, startSession, queryClient],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
