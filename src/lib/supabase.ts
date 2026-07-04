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
