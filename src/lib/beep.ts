// A synthesized alert tone via WebAudio — no audio file to bundle, works offline
// in the PWA, and stays silent under jsdom (no AudioContext) so tests don't need
// to stub it.

type ACtor = typeof AudioContext;
const AC: ACtor | undefined =
  typeof window !== 'undefined'
    ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: ACtor }).webkitAudioContext)
    : undefined;

let ctx: AudioContext | null = null;
function context(): AudioContext | null {
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  return ctx;
}

/**
 * Prime the audio context from a user gesture (the "start prep" tap) so a later
 * programmatic {@link beep} is allowed to play — browsers block audio that isn't
 * rooted in a gesture, and a timer expires long after the tap.
 */
export function armAudio(): void {
  const c = context();
  if (c && c.state === 'suspended') void c.resume();
}

/** A single short alert tone (≈0.35s). No-op where WebAudio is unavailable. */
export function beep(): void {
  const c = context();
  if (!c) return;
  if (c.state === 'suspended') void c.resume();
  const now = c.currentTime;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'sine';
  osc.frequency.value = 880;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.3, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
  osc.connect(gain).connect(c.destination);
  osc.start(now);
  osc.stop(now + 0.36);
}
