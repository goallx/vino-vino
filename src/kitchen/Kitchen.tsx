import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { loadOrders, subscribe, setStatus, startPrep, setTimer } from '../lib/orderBus';
import { allTimerPresets, subscribeTimerPresets, timerPresetsVersion, addTimerPreset, removeTimerPreset } from '../lib/timerPresets';
import { beep, armAudio } from '../lib/beep';
import { timerRemainingMs } from './timerUtil';
import { KitchenCard } from './KitchenCard';
import { Wordmark } from '../components/Wordmark';

export function Kitchen() {
  const [orders, setOrders] = useState(loadOrders);
  const [now, setNow] = useState(() => Date.now());
  useSyncExternalStore(subscribeTimerPresets, timerPresetsVersion);
  const presets = allTimerPresets();

  useEffect(() => {
    setOrders(loadOrders());
    return subscribe(setOrders);
  }, []);

  // Prime the audio context from the first interaction anywhere on the board, so
  // a display that never taps "start" (a second screen, or after a reload) can
  // still sound the expiry beep — browsers block audio not rooted in a gesture.
  useEffect(() => {
    const arm = () => armAudio();
    window.addEventListener('pointerdown', arm, { once: true });
    window.addEventListener('keydown', arm, { once: true });
    return () => {
      window.removeEventListener('pointerdown', arm);
      window.removeEventListener('keydown', arm);
    };
  }, []);

  const active = orders
    .filter((o) => o.status !== 'ready' && o.status !== 'cancelled')
    .sort((a, b) => a.createdAt - b.createdAt);

  // A running countdown needs a 1s tick for its mm:ss; without one, the coarse
  // 15s aging tick is enough. Only pay for the fast interval when it's needed.
  const hasTimer = active.some((o) => timerRemainingMs(o, now) != null);
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), hasTimer ? 1000 : 15000);
    return () => window.clearInterval(id);
  }, [hasTimer]);

  // Beep once as each timer crosses zero. Keyed by prepStartedAt so restarting a
  // timer re-arms the alert; the set self-prunes when a timer clears/completes.
  // On first run we SEED the set with already-overdue timers instead of beeping,
  // so opening/reloading the board doesn't blast every stale order at once.
  const beeped = useRef<Set<string>>(new Set());
  const seeded = useRef(false);
  useEffect(() => {
    const liveKeys = new Set<string>();
    for (const o of active) {
      const remaining = timerRemainingMs(o, now);
      if (remaining == null) continue;
      const key = `${o.id}:${o.prepStartedAt}`;
      liveKeys.add(key);
      if (remaining <= 0 && !beeped.current.has(key)) {
        beeped.current.add(key);
        if (seeded.current) beep(); // first pass only records; later crossings sound
      }
    }
    for (const key of beeped.current) if (!liveKeys.has(key)) beeped.current.delete(key);
    seeded.current = true;
  }, [now, active]);

  return (
    <div className="kitchen">
      <header className="ktop">
        <span className="ktop__brand"><Wordmark /> · מטבח</span>
        <span className="ktop__count">{active.length} הזמנות פעילות</span>
        <nav className="ktop__nav" aria-label="ניווט">
          <a className="ktop__link" href="/">← הזמנה</a>
          <a className="ktop__link" href="/orders">הזמנות</a>
        </nav>
      </header>

      {active.length === 0 ? (
        <div className="kempty">
          <p>אין הזמנות פעילות</p>
          <span>הזמנות חדשות יופיעו כאן אוטומטית</span>
        </div>
      ) : (
        <main className="kboard">
          {active.map((o) => (
            <KitchenCard
              key={o.id}
              order={o}
              now={now}
              presets={presets}
              onStart={(id, seconds) => startPrep(id, seconds)}
              onReady={(id) => setStatus(id, 'ready')}
              onSetTimer={(id, seconds) => setTimer(id, seconds)}
              onSavePreset={(minutes) => addTimerPreset(minutes)}
              onRemovePreset={(minutes) => removeTimerPreset(minutes)}
            />
          ))}
        </main>
      )}
    </div>
  );
}
