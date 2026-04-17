import { createContext, useContext, useEffect, useState, useCallback, ReactNode, createElement } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/types';

interface AuthState {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  loading: boolean;
}

interface AuthContextValue extends AuthState {
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchProfile(userId: string): Promise<Profile | null> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (error) return null;
    return data as Profile;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    profile: null,
    session: null,
    loading: true,
  });

  const updateState = useCallback(async (session: Session | null) => {
    const profile = session?.user ? await fetchProfile(session.user.id) : null;
    setState({
      user: session?.user ?? null,
      profile,
      session,
      loading: false,
    });
  }, []);

  useEffect(() => {
    // Timeout safety net: se após 8s ainda estiver loading, desliga o spinner
    const timeout = setTimeout(() => {
      setState(prev => prev.loading ? { ...prev, loading: false } : prev);
    }, 8000);

    // Busca sessão inicial
    supabase.auth.getSession()
      .then(({ data: { session } }) => updateState(session))
      .catch(() => setState(prev => ({ ...prev, loading: false })));

    // Escuta mudanças de auth
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => { updateState(session); }
    );

    return () => {
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, [updateState]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const value: AuthContextValue = {
    ...state,
    isAdmin: state.profile?.role === 'admin',
    signIn,
    signOut,
  };

  return createElement(AuthContext.Provider, { value }, children);
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
