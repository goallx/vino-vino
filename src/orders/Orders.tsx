import { useEffect, useState } from 'react';
import { loadOrders, subscribe, setStatus } from '../lib/orderBus';
import { ordersForDay, orderRevenue } from '../analytics/metrics';
import { lineSummary } from '../lib/cart';
import { shekels } from '../lib/money';
import { DishThumb } from '../components/DishThumb';
import type { KitchenOrder, KitchenStatus } from '../types';

type Filter = 'all' | 'active' | 'new' | 'preparing' | 'ready' | 'cancelled';

const FILTERS: [Filter, string][] = [
  ['all', 'הכל'],
  ['active', 'פעילות'],
  ['new', 'חדש'],
  ['preparing', 'בהכנה'],
  ['ready', 'מוכן'],
  ['cancelled', 'בוטלו'],
];

// The three live stages an order moves through (cancelled sits off to the side).
const STEPS: [KitchenStatus, string][] = [
  ['new', 'חדש'],
  ['preparing', 'בהכנה'],
  ['ready', 'מוכן'],
];

const time = (ts: number) => new Date(ts).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });

// The advance button: what tapping it does next, keyed to the current status.
const ADVANCE: Partial<Record<KitchenStatus, { label: string; cls: string; next: KitchenStatus }>> = {
  new: { label: 'התחל הכנה', cls: 'orow__adv--start', next: 'preparing' },
  preparing: { label: 'סמן מוכן', cls: 'orow__adv--ready', next: 'ready' },
};

function OrderRow({ order, onAdvance, onCancel }: {
  order: KitchenOrder;
  onAdvance: (id: string, next: KitchenStatus) => void;
  onCancel: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const stepIdx = STEPS.findIndex((s) => s[0] === order.status);
  const adv = ADVANCE[order.status];
  const cancelled = order.status === 'cancelled';
  const metaBits = [
    order.type === 'delivery' ? 'משלוח' : 'איסוף',
    order.type === 'delivery' ? order.address : undefined,
    time(order.createdAt),
  ].filter(Boolean);

  return (
    <article className={`orow ${cancelled ? 'orow--cancelled' : ''}`}>
      <div className="orow__head">
        <span className="orow__num">#{String(order.number).padStart(2, '0')}</span>
        <div className="orow__who">
          <span className="orow__name">{order.customerName || 'ללא שם'}</span>
          <span className="orow__meta">{metaBits.join(' · ')}</span>
        </div>

        <span className={`pay ${order.payment === 'paid' ? 'pay--paid' : 'pay--unpaid'}`}>
          {order.payment === 'paid' ? 'שולם' : 'לא שולם'}
        </span>
        {cancelled ? (
          <span className="orow__steps"><span className="ostep ostep--cancel">בוטל</span></span>
        ) : (
          <span className="orow__steps" aria-hidden="true">
            {STEPS.map(([s, label], i) => (
              <span key={s} className={`ostep ostep--${s} ${i <= stepIdx ? 'is-done' : ''} ${i === stepIdx ? 'is-current' : ''}`}>
                {label}
              </span>
            ))}
          </span>
        )}
        <span className="orow__total">{shekels(orderRevenue(order))}</span>
        <button
          className={`orow__chev ${open ? 'is-open' : ''}`}
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? 'סגור פרטים' : 'הצג פרטים'}
        >
          ▼
        </button>
        {adv ? (
          <button className={`orow__adv ${adv.cls}`} onClick={() => onAdvance(order.id, adv.next)}>{adv.label}</button>
        ) : (
          <button className="orow__adv orow__adv--done" disabled>
            {cancelled ? 'בוטלה' : 'מוכן ✓'}
          </button>
        )}
      </div>

      {open && (
        <div className="orow__body">
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
          <div className="orow__aside">
            {order.type === 'delivery' && order.address && <span className="orow__addr">{order.address}</span>}
            {!cancelled && (
              confirming ? (
                <div className="orow__confirm">
                  <span>לבטל את ההזמנה?</span>
                  <button className="btn btn--danger btn--sm" onClick={() => onCancel(order.id)}>כן, בטל</button>
                  <button className="btn btn--ghost btn--sm" onClick={() => setConfirming(false)}>חזור</button>
                </div>
              ) : (
                <button className="orow__cancel" onClick={() => setConfirming(true)}>ביטול הזמנה</button>
              )
            )}
          </div>
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
  const shown = today.filter((o) => {
    if (filter === 'all') return true;
    if (filter === 'active') return o.status !== 'cancelled';
    return o.status === filter;
  });

  return (
    <div className="orders">
      <header className="otop">
        <span className="otop__brand">הזמנות היום</span>
        <div className="otop__filters" role="group" aria-label="סינון">
          {FILTERS.map(([k, label]) => (
            <button key={k} className={filter === k ? 'is-active' : ''} onClick={() => setFilter(k)}>{label}</button>
          ))}
        </div>
        <nav className="otop__nav">
          <a href="/">← הזמנה</a>
          <a href="/kitchen">מטבח</a>
        </nav>
      </header>

      <main className="olist">
        {shown.length === 0 ? (
          <p className="olist__empty">אין הזמנות להצגה</p>
        ) : (
          shown.map((o) => (
            <OrderRow
              key={o.id}
              order={o}
              onAdvance={(id, next) => setStatus(id, next)}
              onCancel={(id) => setStatus(id, 'cancelled')}
            />
          ))
        )}
      </main>
    </div>
  );
}
