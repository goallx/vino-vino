import { useState } from 'react';
import type { KitchenOrder } from '../types';
import { shekels } from '../lib/money';
import { armAudio } from '../lib/beep';
import { DEFAULT_PRESETS } from '../lib/timerPresets';
import { timerRemainingMs, fmtCountdown } from './timerUtil';
import { KitchenLine } from './KitchenLine';

const MAX_TIMER_MIN = 180; // a prep timer over 3h is a fat-finger, not a real value

interface KitchenCardProps {
  order: KitchenOrder;
  now: number;
  presets: number[]; // owner's durations in minutes (defaults + saved)
  onStart: (id: string, timerSeconds?: number) => void;
  onReady: (id: string) => void;
  onSetTimer: (id: string, timerSeconds: number | null) => void;
  onSavePreset: (minutes: number) => void;
  onRemovePreset: (minutes: number) => void;
}

function ageTier(minutes: number): 'fresh' | 'warn' | 'late' {
  if (minutes >= 20) return 'late';
  if (minutes >= 10) return 'warn';
  return 'fresh';
}

// Plain DOM, no animation runtime: the board mutates on every "start"/"ready" tap
// and refetch, so layout/exit animations here caused reflow jank and a
// flicker on cheap tablets. Cards appear/leave instantly; a cheap opacity
// fade-in (CSS, GPU-composited) softens new arrivals.
export function KitchenCard({ order, now, presets, onStart, onReady, onSetTimer, onSavePreset, onRemovePreset }: KitchenCardProps) {
  const minutes = Math.floor((now - order.createdAt) / 60000);
  const tier = ageTier(minutes);
  const timeLabel = minutes < 1 ? 'עכשיו' : `${minutes} ד׳`;
  const typeLabel = order.type === 'delivery' ? 'משלוח' : 'איסוף';
  const itemCount = order.lines.reduce((sum, l) => sum + l.qty, 0);
  const hasDetails = order.customerName || order.phone;
  const deliveryFee = order.deliveryFee ?? 0;
  const snapshotSubtotal = order.lines.reduce((sum, line) => sum + line.unitPrice * line.qty, 0);
  const snapshotDiscount = order.discounts?.reduce((sum, discount) => sum + discount.amount, 0) ?? 0;
  const total = order.total ?? Math.max(0, snapshotSubtotal - snapshotDiscount) + deliveryFee;

  const remaining = timerRemainingMs(order, now); // null = no running timer
  const expired = remaining != null && remaining <= 0;

  return (
    <article
      className={`kcard kcard--${tier} ${order.status === 'preparing' ? 'kcard--prep' : ''} ${expired ? 'kcard--over' : ''}`}
      data-testid={`kcard-${order.id}`}
    >
      <div className="kcard__strip" aria-hidden="true" />
      <header className="kcard__head">
        <span className="kcard__num">#{String(order.number).padStart(2, '0')}</span>
        <span className={`kcard__type kcard__type--${order.type}`}>{typeLabel}</span>
        <span className="kcard__time">⏱ {timeLabel}</span>
      </header>

      {hasDetails && (
        <div className="kcard__cust">
          {order.customerName && <span className="kcard__name">👤 {order.customerName}</span>}
          {order.phone && <span className="kcard__phone">{order.phone}</span>}
          <span className="kcard__count">{itemCount} פריטים</span>
        </div>
      )}

      {order.type === 'delivery' && order.address && (
        <div className="kcard__addr">📍 {order.address}</div>
      )}

      <ul className="kcard__lines">
        {order.lines.map((l) => (
          <KitchenLine key={l.id} line={l} />
        ))}
      </ul>

      {order.note && <p className="kcard__note">“{order.note}”</p>}

      <div className="kcard__price">
        <span className="kcard__total-label">סה״כ</span>
        <strong className="kcard__total">{shekels(total)}</strong>
        {deliveryFee > 0 && (
          <span className="kcard__delivery-fee">דמי משלוח +{shekels(deliveryFee)}</span>
        )}
      </div>

      <footer className="kcard__foot">
        {order.status === 'new' ? (
          <TimerPicker
            presets={presets}
            onPick={(seconds) => { armAudio(); onStart(order.id, seconds); }}
            onSavePreset={onSavePreset}
            onRemovePreset={onRemovePreset}
            onSkip={() => onStart(order.id)}
          />
        ) : (
          <>
            {remaining != null ? (
              <span className={`ktimer ${expired ? 'ktimer--over' : remaining <= 60000 ? 'ktimer--warn' : ''}`}>
                {expired ? '⏰ נגמר הזמן' : `⏱ ${fmtCountdown(remaining)}`}
                <button className="ktimer__clear" onClick={() => onSetTimer(order.id, null)} aria-label="בטל טיימר">✕</button>
              </span>
            ) : (
              <AddTimer presets={presets} onPick={(seconds) => { armAudio(); onSetTimer(order.id, seconds); }} onSavePreset={onSavePreset} onRemovePreset={onRemovePreset} />
            )}
            <button className="kbtn kbtn--ready" onClick={() => onReady(order.id)}>
              מוכן ✓
            </button>
          </>
        )}
      </footer>
    </article>
  );
}

interface ChipProps {
  presets: number[];
  onPick: (seconds: number) => void;
  onSavePreset: (minutes: number) => void;
  onRemovePreset: (minutes: number) => void;
}

/** Preset chips + a custom entry; on a new order each chip starts prep with its timer. */
function TimerPicker({ onSkip, ...chip }: ChipProps & { onSkip: () => void }) {
  return (
    <div className="ktimerset">
      <span className="ktimerset__label">⏱ זמן הכנה:</span>
      <PresetChips {...chip} />
      <button className="kbtn kbtn--skip" onClick={onSkip}>התחל בלי טיימר</button>
    </div>
  );
}

/** Add a timer to an order already in prep that was started without one. */
function AddTimer(chip: ChipProps) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return <button className="ktimer__add" onClick={() => setOpen(true)}>+ טיימר</button>;
  }
  return <PresetChips {...chip} />;
}

/** The shared chip row: a chip per preset minute + a "+" that saves a custom time. */
function PresetChips({ presets, onPick, onSavePreset, onRemovePreset }: ChipProps) {
  const [customOpen, setCustomOpen] = useState(false);
  const [text, setText] = useState('');
  const [invalid, setInvalid] = useState(false);

  function confirmCustom() {
    const m = Math.round(Number(text.trim().replace(',', '.'))); // tolerate "8," / "8.5"
    if (!Number.isFinite(m) || m <= 0) {
      setInvalid(true); // keep the field open so a typo (0, blank, "abc") is visible
      return;
    }
    const mins = Math.min(m, MAX_TIMER_MIN);
    onSavePreset(mins); // remember it for next time
    onPick(mins * 60);
    setCustomOpen(false);
    setText('');
    setInvalid(false);
  }

  return (
    <div className="ktimerset__chips">
      {presets.map((m) => (
        <span key={m} className="ktimerchip__wrap">
          <button className="ktimerchip" onClick={() => onPick(m * 60)}>{m}׳</button>
          {!DEFAULT_PRESETS.includes(m) && (
            <button
              className="ktimerchip__rm"
              onClick={(e) => { e.stopPropagation(); onRemovePreset(m); }}
              aria-label={`מחק ${m} דקות`}
            >
              ✕
            </button>
          )}
        </span>
      ))}
      {customOpen ? (
        <span className="ktimerchip__custom">
          <input
            className={`ktimerchip__input ${invalid ? 'is-invalid' : ''}`}
            inputMode="numeric"
            placeholder="דק׳"
            value={text}
            autoFocus
            aria-label="זמן מותאם בדקות"
            aria-invalid={invalid}
            onChange={(e) => { setText(e.target.value); setInvalid(false); }}
            onKeyDown={(e) => { if (e.key === 'Enter') confirmCustom(); }}
          />
          <button className="ktimerchip ktimerchip--go" onClick={confirmCustom} aria-label="התחל">✓</button>
        </span>
      ) : (
        <button className="ktimerchip ktimerchip--add" onClick={() => setCustomOpen(true)} aria-label="זמן מותאם">+</button>
      )}
    </div>
  );
}
