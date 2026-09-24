'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { User } from '@/types/client';
import { api } from '@/lib/api';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, pass: string) => Promise<void>;
  register: (email: string, pass: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  login: async () => {},
  register: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore session on mount — silently ignore if not logged in
  useEffect(() => {
    let mounted = true;
    api
      .getMe()
      .then((res) => {
        if (mounted && res.user) {
          setUser(res.user);
        }
      })
      .catch(() => {
        // Not logged in — that's fine, user will be null
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => { mounted = false; };
  }, []);

  /**
   * Login — throws on failure so the auth page can show the real error message.
   */
  const login = async (email: string, pass: string) => {
    const res = await api.login(email, pass);
    setUser(res.user);
  };

  /**
   * Register — throws on failure so the auth page can show the real error message.
   */
  const register = async (email: string, pass: string) => {
    const res = await api.register(email, pass);
    setUser(res.user);
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch {
      // ignore network error on logout
    }
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
