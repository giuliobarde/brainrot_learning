import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { api, ApiError, type ApiUser } from '../lib/apiClient';

type Status = 'loading' | 'unauthenticated' | 'authenticated';

interface AuthState {
  status: Status;
  user: ApiUser | null;
  error?: string;
}

interface AuthContextValue extends AuthState {
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signOut: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading', user: null });

  const refreshSelf = useCallback(async () => {
    if (!(await api.hasStoredSession())) {
      setState({ status: 'unauthenticated', user: null });
      return;
    }
    try {
      const user = await api.me();
      setState({ status: 'authenticated', user });
    } catch {
      await api.clearLocalSession();
      setState({ status: 'unauthenticated', user: null });
    }
  }, []);

  useEffect(() => {
    void refreshSelf();
  }, [refreshSelf]);

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const { user } = await api.login({ email, password });
      setState({ status: 'authenticated', user });
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'login failed';
      setState((s) => ({ ...s, error: msg }));
      throw err;
    }
  }, []);

  const signUp = useCallback(async (email: string, password: string, displayName: string) => {
    try {
      const { user } = await api.register({ email, password, displayName });
      setState({ status: 'authenticated', user });
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'sign up failed';
      setState((s) => ({ ...s, error: msg }));
      throw err;
    }
  }, []);

  const signOut = useCallback(async () => {
    await api.logout();
    setState({ status: 'unauthenticated', user: null });
  }, []);

  const clearError = useCallback(() => setState((s) => ({ ...s, error: undefined })), []);

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, signIn, signUp, signOut, clearError }),
    [state, signIn, signUp, signOut, clearError],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
