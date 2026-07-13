import type { KitchenOrder } from '../types';
import { shekels } from '../lib/money';
import { KitchenLine } from './KitchenLine';

interface KitchenCardProps {
  order: KitchenOrder;
  now: number;
  onStart: (id: string) => void;
  onReady: (id: string) => void;
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
export function KitchenCard({ order, now, onStart, onReady }: KitchenCardProps) {
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

  return (
    <article
      className={`kcard kcard--${tier} ${order.status === 'preparing' ? 'kcard--prep' : ''}`}
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
          <button className="kbtn kbtn--start" onClick={() => onStart(order.id)}>
            התחל הכנה
          </button>
        ) : (
          <>
            <span className="kbadge">בהכנה</span>
            <button className="kbtn kbtn--ready" onClick={() => onReady(order.id)}>
              מוכן ✓
            </button>
          </>
        )}
      </footer>
    </article>
  );
}
