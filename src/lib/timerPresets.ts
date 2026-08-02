import { supabase, isSupabaseEnabled, refetchOnAuth } from './supabase';

/**
 * The owner's reusable kitchen-timer durations (in minutes).
 *
 * 5/10/15 are baseline defaults baked into the UI; this store holds only the
 * *extra* durations the owner saves, so the defaults can never be lost. The
 * `timer_presets` table is the source of truth (mirrored to localStorage so the
 * kitchen still shows saved times through a network blip); realtime keeps every
 * device in sync. Local mode (no env) runs entirely off localStorage.
 */

export const DEFAULT_PRESETS = [5, 10, 15];

const KEY = 'vino:timer-presets';
let cachedRaw: string | null | undefined;
let cachedPresets: number[] = [];

let version = 0;
const listeners = new Set<() => void>();
function notify() {
  version += 1;
  listeners.forEach((fn) => fn());
}

export function subscribeTimerPresets(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function timerPresetsVersion(): number {
  return version;
}

/** The owner's saved durations only (defaults are merged in by the UI). */
export function loadTimerPresets(): number[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === cachedRaw) return cachedPresets;
    cachedRaw = raw;
    cachedPresets = raw ? (JSON.parse(raw) as number[]) : [];
  } catch {
    /* keep the last usable in-memory snapshot */
  }
  return cachedPresets;
}

/** Defaults + saved, de-duped and sorted — what the kitchen picker shows. */
export function allTimerPresets(): number[] {
  return [...new Set([...DEFAULT_PRESETS, ...loadTimerPresets()])].sort((a, b) => a - b);
}

function persist(list: number[]) {
  const sorted = [...new Set(list)].sort((a, b) => a - b);
  const raw = JSON.stringify(sorted);
  cachedRaw = raw;
  cachedPresets = sorted;
  try {
    localStorage.setItem(KEY, raw);
  } catch {
    /* storage full / unavailable — non-fatal */
  }
}

async function fetchPresets(): Promise<void> {
  if (!supabase) return;
  const { data, error } = await supabase.from('timer_presets').select('minutes');
  if (error || !data) {
    if (error) console.error('[vino] failed to fetch timer presets', error);
    return; // keep serving cache
  }
  persist((data as { minutes: number }[]).map((r) => r.minutes));
  notify();
}

if (isSupabaseEnabled && supabase) {
  void fetchPresets();
  refetchOnAuth(() => void fetchPresets());
  supabase
    .channel('timer-presets-feed')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'timer_presets' }, () => void fetchPresets())
    .subscribe();
}

/** Save a new duration (a no-op if it's already a default or saved). */
export function addTimerPreset(minutes: number): void {
  const m = Math.round(minutes);
  if (!Number.isFinite(m) || m <= 0) return;
  if (DEFAULT_PRESETS.includes(m) || loadTimerPresets().includes(m)) return;
  persist([...loadTimerPresets(), m]);
  notify();
  if (supabase) {
    void supabase
      .from('timer_presets')
      .upsert({ minutes: m })
      .then(({ error }) => { if (error) console.error('[vino] failed to save timer preset', error); });
  }
}

/** Remove a saved duration (defaults can't be removed — they're not stored). */
export function removeTimerPreset(minutes: number): void {
  if (!loadTimerPresets().includes(minutes)) return;
  persist(loadTimerPresets().filter((m) => m !== minutes));
  notify();
  if (supabase) {
    void supabase
      .from('timer_presets')
      .delete()
      .eq('minutes', minutes)
      .then(({ error }) => { if (error) console.error('[vino] failed to remove timer preset', error); });
  }
}
