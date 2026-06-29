import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { apiRequest, setAccessToken, setOnAuthCleared } from '../../lib/api';
import type { AuthResponse, User } from '../../types/auth';

interface AuthContextValue {
  user: User | null;
  /** True while bootstrapping the session on first load. */
  initializing: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);

  const applyAuth = useCallback((res: AuthResponse) => {
    setAccessToken(res.accessToken);
    setUser(res.user);
  }, []);

  const clearAuth = useCallback(() => {
    setAccessToken(null);
    setUser(null);
  }, []);

  // If a 401 can't be refreshed mid-session, drop the user.
  useEffect(() => {
    setOnAuthCleared(() => setUser(null));
  }, []);

  // On first load, try to restore a session from the refresh cookie.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await apiRequest<AuthResponse>('/auth/refresh', { method: 'POST' }, false);
        if (active) applyAuth(res);
      } catch {
        if (active) clearAuth();
      } finally {
        if (active) setInitializing(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [applyAuth, clearAuth]);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await apiRequest<AuthResponse>(
        '/auth/login',
        { method: 'POST', body: JSON.stringify({ email, password }) },
        false,
      );
      applyAuth(res);
    },
    [applyAuth],
  );

  const register = useCallback(
    async (name: string, email: string, password: string) => {
      const res = await apiRequest<AuthResponse>(
        '/auth/register',
        { method: 'POST', body: JSON.stringify({ name, email, password }) },
        false,
      );
      applyAuth(res);
    },
    [applyAuth],
  );

  const logout = useCallback(async () => {
    try {
      await apiRequest('/auth/logout', { method: 'POST' }, false);
    } finally {
      clearAuth();
    }
  }, [clearAuth]);

  const value = useMemo(
    () => ({ user, initializing, login, register, logout }),
    [user, initializing, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
