import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase, isSupabaseEnabled } from '../lib/supabase';

export interface AuthUser {
  /** Display name — the part of the email before the @. */
  username: string;
}

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  /** False only when the Supabase env vars are missing (misconfigured build). */
  configured: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
}

// Supabase Auth is the only sign-in path: staff accounts are created in the
// dashboard (public sign-up disabled) and log in with email + password.

const BAD_CREDS = 'אימייל או סיסמה שגויים';
const NOT_CONFIGURED = 'חסרה הגדרת חיבור למסד הנתונים (env)';

const AuthCtx = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}

/** Like useAuth but returns null outside a provider (e.g. tests) instead of throwing. */
export function useAuthOptional(): AuthState | null {
  return useContext(AuthCtx);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(isSupabaseEnabled);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session ? { username: usernameOf(data.session.user.email) } : null);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session ? { username: usernameOf(session.user.email) } : null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function signIn(email: string, password: string): Promise<{ error?: string }> {
    if (!supabase) return { error: NOT_CONFIGURED };
    const normalized = email.trim().toLowerCase();
    if (!normalized || !password) return { error: BAD_CREDS };
    const { error } = await supabase.auth.signInWithPassword({ email: normalized, password });
    return error ? { error: signInError(error.message) } : {};
  }

  async function signOut() {
    await supabase?.auth.signOut();
  }

  return (
    <AuthCtx.Provider value={{ user, loading, configured: isSupabaseEnabled, signIn, signOut }}>
      {children}
    </AuthCtx.Provider>
  );
}

function usernameOf(email: string | undefined): string {
  return email ? email.split('@')[0] : 'משתמש';
}

/** Wrong credentials stay generic; configuration problems say what they are. */
function signInError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('not confirmed')) return 'המשתמש טרם אומת — סמנו "Auto Confirm User" ביצירת המשתמש בלוח Supabase';
  if (m.includes('logins are disabled') || m.includes('provider is not enabled'))
    return 'התחברות באימייל כבויה בפרויקט — הפעילו את ספק ה‑Email בהגדרות Auth';
  if (m.includes('rate limit')) return 'יותר מדי ניסיונות — נסו שוב בעוד רגע';
  if (m.includes('invalid login credentials')) return BAD_CREDS;
  return `שגיאת התחברות: ${message}`;
}
