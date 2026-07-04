import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase, isSupabaseEnabled } from '../lib/supabase';

export interface AuthUser {
  username: string;
}

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  mode: 'supabase' | 'local';
  signIn: (username: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
}

// Supabase Auth is email/password; we present it as a username by mapping
// `<username>` → `<username>@vinovino.app`. Staff accounts are created in the
// Supabase dashboard with those emails (public sign-up disabled).
const EMAIL_DOMAIN = 'vinovino.app';
export const usernameToEmail = (u: string) => `${u.trim().toLowerCase()}@${EMAIL_DOMAIN}`;

// Local fallback credentials, used only when no Supabase project is configured
// (development). In production these are inert — Supabase handles auth.
const LOCAL_USER = 'admin';
const LOCAL_PASS = 'vinovino';
const LOCAL_KEY = 'vino:auth';

const BAD_CREDS = 'שם משתמש או סיסמה שגויים';

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

  async function signIn(username: string, password: string): Promise<{ error?: string }> {
    if (!username.trim() || !password) return { error: BAD_CREDS };

    if (isSupabaseEnabled && supabase) {
      const { error } = await supabase.auth.signInWithPassword({
        email: usernameToEmail(username),
        password,
      });
      return error ? { error: BAD_CREDS } : {};
    }

    if (username.trim().toLowerCase() === LOCAL_USER && password === LOCAL_PASS) {
      const u: AuthUser = { username: username.trim() };
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
