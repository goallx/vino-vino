import { useEffect, useState } from 'react';
import { loadOrders, subscribe, setStatus } from '../lib/orderBus';
import { ordersForDay, orderRevenue } from '../analytics/metrics';
import { lineSummary } from '../lib/cart';
import { shekels } from '../lib/money';
import { Wordmark } from '../components/Wordmark';
import { DishThumb } from '../components/DishThumb';
import type { KitchenOrder } from '../types';


type Filter = 'active' | 'all' | 'cancelled';

const STATUS: Record<string, { label: string; cls: string }> = {
  new: { label: 'חדש', cls: 'st--new' },
  preparing: { label: 'בהכנה', cls: 'st--prep' },
  ready: { label: 'מוכן', cls: 'st--ready' },
  cancelled: { label: 'בוטל', cls: 'st--cancel' },
};

const time = (ts: number) => new Date(ts).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });

const STEPS = [
  ['new', 'התקבל'],
  ['preparing', 'בהכנה'],
  ['ready', 'מוכן'],
] as const;

function StatusTracker({ status }: { status: string }) {
  const idx = STEPS.findIndex((s) => s[0] === status);
  return (
    <div className="track" aria-hidden="true">
      {STEPS.map((s, i) => (
        <div key={s[0]} className={`track__step ${i <= idx ? 'is-done' : ''} ${i === idx ? 'is-current' : ''}`}>
          <span className="track__dot" />
          <span className="track__label">{s[1]}</span>
        </div>
      ))}
    </div>
  );
}

function OrderRow({ order, onCancel }: { order: KitchenOrder; onCancel: (id: string) => void }) {
  const [confirming, setConfirming] = useState(false);
  const st = STATUS[order.status] ?? STATUS.new;
  const cancellable = order.status !== 'cancelled';

  return (
    <article className={`orow ${order.status === 'cancelled' ? 'orow--cancelled' : ''}`}>
      <div className="orow__head">
        <span className="orow__num">#{String(order.number).padStart(2, '0')}</span>
        <span className={`st ${st.cls}`}>{st.label}</span>
        <span className="orow__meta">{time(order.createdAt)} · {order.type === 'delivery' ? 'משלוח' : 'איסוף'}</span>
        <span className={`pay ${order.payment === 'paid' ? 'pay--paid' : 'pay--unpaid'}`}>
          {order.payment === 'paid' ? 'שולם' : 'לא שולם'}
        </span>
        <span className="orow__total">{shekels(orderRevenue(order))}</span>
      </div>

      {order.status !== 'cancelled' && <StatusTracker status={order.status} />}

      <ul className="orow__lines">
        {order.lines.map((l) => {
          const sum = lineSummary(l);
          return (
            <li key={l.id} className="oline">
              <DishThumb productId={l.productId} size={38} />
              <span className="oline__text">
                <span className="orow__qty">{l.qty}×</span> {l.name}
                {sum && <span className="orow__sub"> · {sum}</span>}
              </span>
            </li>
          );
        })}
      </ul>

      {cancellable && (
        <div className="orow__actions">
          {confirming ? (
            <>
              <span className="orow__confirm">לבטל את ההזמנה?</span>
              <button className="btn btn--danger btn--sm" onClick={() => onCancel(order.id)}>כן, בטל</button>
              <button className="btn btn--ghost btn--sm" onClick={() => setConfirming(false)}>חזור</button>
            </>
          ) : (
            <button className="btn btn--ghost btn--sm orow__cancel" onClick={() => setConfirming(true)}>ביטול הזמנה</button>
          )}
        </div>
      )}
    </article>
  );
}

export function Orders() {
  const [orders, setOrders] = useState(loadOrders);
  const [filter, setFilter] = useState<Filter>('active');

  useEffect(() => {
    setOrders(loadOrders());
    return subscribe(setOrders);
  }, []);

  const today = ordersForDay(orders).sort((a, b) => b.createdAt - a.createdAt);
  const shown = today.filter((o) =>
    filter === 'all' ? true : filter === 'cancelled' ? o.status === 'cancelled' : o.status !== 'cancelled'
  );

  return (
    <div className="orders">
      <header className="otop">
        <span className="otop__brand"><Wordmark /> · הזמנות היום</span>
        <div className="otop__filters" role="group" aria-label="סינון">
          {([['active', 'פעילות'], ['all', 'הכל'], ['cancelled', 'בוטלו']] as const).map(([k, label]) => (
            <button key={k} className={filter === k ? 'is-active' : ''} onClick={() => setFilter(k)}>{label}</button>
          ))}
        </div>
        <nav className="otop__nav">
          <a href="/">קבלת הזמנות</a>
          <a href="/kitchen">מטבח</a>
          <a href="/reports">דוח</a>
        </nav>
      </header>

      <main className="olist">
        {shown.length === 0 ? (
          <p className="olist__empty">אין הזמנות להצגה</p>
        ) : (
          shown.map((o) => (
            <OrderRow key={o.id} order={o} onCancel={(id) => setStatus(id, 'cancelled')} />
          ))
        )}
      </main>
    </div>
  );
}
