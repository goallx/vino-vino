import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase, isSupabaseEnabled } from '../lib/supabase';

export interface AuthUser {
  /** Display name — the part of the email before the @. */
  username: string;
}

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  mode: 'supabase' | 'local';
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
}

// Sign-in only: staff accounts are created in the Supabase dashboard
// (public sign-up disabled) and log in with email + password.

// Local fallback credentials, used only when no Supabase project is configured
// (tests, offline dev). In production these are inert — Supabase handles auth.
const LOCAL_EMAIL = 'admin@vinovino.app';
const LOCAL_PASS = 'vinovino';
const LOCAL_KEY = 'vino:auth';

const BAD_CREDS = 'אימייל או סיסמה שגויים';

const AuthCtx = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isSupabaseEnabled && supabase) {
      supabase.auth.getSession().then(({ data }) => {
        setUser(data.session ? { username: usernameOf(data.session.user.email) } : null);
        setLoading(false);
      });
      const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
        setUser(session ? { username: usernameOf(session.user.email) } : null);
      });
      return () => sub.subscription.unsubscribe();
    }
    // local mode
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      setUser(raw ? (JSON.parse(raw) as AuthUser) : null);
    } catch {
      setUser(null);
    }
    setLoading(false);
  }, []);

  async function signIn(email: string, password: string): Promise<{ error?: string }> {
    const normalized = email.trim().toLowerCase();
    if (!normalized || !password) return { error: BAD_CREDS };

    if (isSupabaseEnabled && supabase) {
      const { error } = await supabase.auth.signInWithPassword({ email: normalized, password });
      return error ? { error: BAD_CREDS } : {};
    }

    if (normalized === LOCAL_EMAIL && password === LOCAL_PASS) {
      const u: AuthUser = { username: usernameOf(normalized) };
      localStorage.setItem(LOCAL_KEY, JSON.stringify(u));
      setUser(u);
      return {};
    }
    return { error: BAD_CREDS };
  }

  async function signOut() {
    if (isSupabaseEnabled && supabase) {
      await supabase.auth.signOut();
    } else {
      localStorage.removeItem(LOCAL_KEY);
      setUser(null);
    }
  }

  return (
    <AuthCtx.Provider value={{ user, loading, mode: isSupabaseEnabled ? 'supabase' : 'local', signIn, signOut }}>
      {children}
    </AuthCtx.Provider>
  );
}

function usernameOf(email: string | undefined): string {
  return email ? email.split('@')[0] : 'משתמש';
}
