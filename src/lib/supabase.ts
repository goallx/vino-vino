import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * Supabase is optional during early development. When the env vars are absent
 * the app runs entirely on the bundled local menu seed and keeps orders in
 * memory / localStorage. Wiring a real project is then just a matter of
 * filling .env.local — no code changes here.
 */
export const supabase: SupabaseClient | null =
  url && key ? createClient(url, key) : null;

export const isSupabaseEnabled = supabase !== null;

/**
 * Re-run a module-load fetch once a session exists. Stores fetch at import
 * time, which happens on the login screen as anon — RLS silently returns
 * zero rows there, so without this a fresh device shows empty data until a
 * manual reload.
 */
export function refetchOnAuth(fn: () => void): void {
  supabase?.auth.onAuthStateChange((event, session) => {
    if (session && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) fn();
  });
}
