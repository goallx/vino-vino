import { useEffect, useState } from 'react';
import { loadOrders, loadOrdersRange, subscribe } from '../lib/orderBus';
import { isSupabaseEnabled } from '../lib/supabase';
import type { KitchenOrder } from '../types';
import { computeMetrics, ordersInRange, startOfDay } from './metrics';
import { shekels } from '../lib/money';
import { CountUp } from '../components/CountUp';
import { Wordmark } from '../components/Wordmark';

const DAY = 24 * 60 * 60 * 1000;
const fmtFull = new Intl.DateTimeFormat('he-IL', { weekday: 'long', day: 'numeric', month: 'long' });

interface Range {
  key: 'today' | 'yesterday' | 'last7' | 'date';
  from: number;
  to: number;
  label: string;
}

const todayRange = (): Range => {
  const from = startOfDay(Date.now());
  return { key: 'today', from, to: from + DAY, label: fmtFull.format(from) };
};
const yesterdayRange = (): Range => {
  const from = startOfDay(Date.now()) - DAY;
  return { key: 'yesterday', from, to: from + DAY, label: fmtFull.format(from) };
};
const last7Range = (): Range => {
  const to = startOfDay(Date.now()) + DAY;
  return { key: 'last7', from: to - 7 * DAY, to, label: '7 הימים האחרונים' };
};
const dateRange = (value: string): Range => {
  const [y, m, d] = value.split('-').map(Number);
  const from = new Date(y, m - 1, d).getTime();
  return { key: 'date', from, to: from + DAY, label: fmtFull.format(from) };
};

function toDateInput(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function Stat({ label, value, money, hero }: { label: string; value: number; money?: boolean; hero?: boolean }) {
  return (
    <div className={`stat ${hero ? 'stat--hero' : ''}`}>
      <span className="stat__label">{label}</span>
      <span className="stat__value">
        <CountUp value={value} format={money ? (n) => shekels(Math.round(n)) : undefined} />
      </span>
    </div>
  );
}

function SplitBar({ a, b, aColor, bColor }: { a: number; b: number; aColor: string; bColor: string }) {
  const total = a + b || 1;
  return (
    <div className="splitbar">
      <span style={{ width: `${(a / total) * 100}%`, background: aColor }} />
      <span style={{ width: `${(b / total) * 100}%`, background: bColor }} />
    </div>
  );
}

export function Reports() {
  const [orders, setOrders] = useState(loadOrders);
  const [range, setRange] = useState<Range>(todayRange);
  const [dateValue, setDateValue] = useState('');

  const [pastOrders, setPastOrders] = useState<KitchenOrder[] | null>(null);

  useEffect(() => {
    setOrders(loadOrders());
    return subscribe(setOrders);
  }, []);

  // Ranges entirely in the past can fall outside the bus's rolling window —
  // fetch them straight from the DB. Ranges including today stay live off the bus.
  useEffect(() => {
    if (!isSupabaseEnabled || range.to > startOfDay(Date.now())) {
      setPastOrders(null);
      return;
    }
    let active = true;
    void loadOrdersRange(range.from, range.to).then((list) => {
      if (active) setPastOrders(list);
    });
    return () => {
      active = false;
    };
  }, [range]);

  const m = computeMetrics(ordersInRange(pastOrders ?? orders, range.from, range.to));
  const peakHour = Math.max(1, ...m.byHour.map((h) => h.count));
  const topMax = Math.max(1, ...m.topItems.map((t) => t.qty));

  function pickPreset(next: Range) {
    setRange(next);
    setDateValue('');
  }

  return (
    <div className="reports">
      <header className="rtop">
        <div>
          <span className="rtop__brand"><Wordmark /> · דוח</span>
          <span className="rtop__date">{range.label}</span>
        </div>
        <nav className="rtop__nav">
          <a href="/">← הזמנה</a>
          <a href="/kitchen">מטבח</a>
          <a href="/orders">הזמנות</a>
        </nav>
      </header>

      <main className="rbody">
        <div className="rfilter" role="group" aria-label="טווח תאריכים">
          {[
            { k: 'today', label: 'היום', make: todayRange },
            { k: 'yesterday', label: 'אתמול', make: yesterdayRange },
            { k: 'last7', label: '7 ימים', make: last7Range },
          ].map((p) => (
            <button key={p.k} className={range.key === p.k ? 'is-active' : ''} onClick={() => pickPreset(p.make())}>
              {p.label}
            </button>
          ))}
          <label className={`rfilter__date ${range.key === 'date' ? 'is-active' : ''}`}>
            <span>תאריך</span>
            <input
              type="date"
              value={dateValue}
              max={toDateInput(Date.now())}
              onChange={(e) => {
                if (e.target.value) {
                  setRange(dateRange(e.target.value));
                  setDateValue(e.target.value);
                }
              }}
            />
          </label>
        </div>

        <div className="rsections">
          <section className="stats">
            <Stat hero money label="הכנסות" value={m.revenue} />
            <Stat label="הזמנות" value={m.orderCount} />
            <Stat label="פיצות שנמכרו" value={m.pizzaCount} />
            <Stat money label="ממוצע להזמנה" value={m.avgOrder} />
          </section>

          <section className="cards">
            <div className="card">
              <h3 className="card__title">תשלום</h3>
              <SplitBar a={m.paidRevenue} b={m.unpaidRevenue} aColor="var(--basil)" bColor="var(--amber)" />
              <div className="legend">
                <span><i className="dot dot--paid" />שולם · {shekels(m.paidRevenue)} ({m.paidCount})</span>
                <span><i className="dot dot--unpaid" />לא שולם · {shekels(m.unpaidRevenue)} ({m.unpaidCount})</span>
              </div>
            </div>

            <div className="card">
              <h3 className="card__title">סוג הזמנה</h3>
              <SplitBar a={m.deliveryCount} b={m.pickupCount} aColor="var(--vino)" bColor="var(--ink-soft)" />
              <div className="legend">
                <span><i className="dot dot--delivery" />משלוח · {m.deliveryCount}</span>
                <span><i className="dot dot--pickup" />איסוף · {m.pickupCount}</span>
              </div>
            </div>

            {m.discountTotal > 0 && (
              <div className="card card--deals">
                <h3 className="card__title">מבצעים</h3>
                <ul className="breakdown">
                  <li><span>מחיר מלא</span><span>{shekels(m.grossRevenue)}</span></li>
                  <li className="breakdown--save"><span>הנחות מבצעים</span><span>−{shekels(m.discountTotal)}</span></li>
                  <li className="breakdown--net"><span>הכנסה בפועל</span><span>{shekels(m.revenue)}</span></li>
                </ul>
              </div>
            )}
          </section>

          <section className="panels">
            <div className="panel">
              <h3 className="card__title">המנות הנמכרות ביותר</h3>
              <ul className="top">
                {m.topItems.length === 0 && <li className="top__empty">אין נתונים לטווח זה</li>}
                {m.topItems.map((t) => (
                  <li className="top__row" key={t.name}>
                    <span className="top__name">{t.name}</span>
                    <div className="top__bar">
                      <span style={{ width: `${(t.qty / topMax) * 100}%` }} />
                    </div>
                    <span className="top__qty">{t.qty}</span>
                    <span className="top__rev">{shekels(t.revenue)}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="panel">
              <h3 className="card__title">הזמנות לפי שעה</h3>
              <div className="hours">
                {m.byHour.length === 0 && <p className="top__empty">אין נתונים לטווח זה</p>}
                {m.byHour.map((h) => (
                  <div className="hour" key={h.hour}>
                    <div className="hour__bar" style={{ height: `${(h.count / peakHour) * 100}%` }}>
                      <span className="hour__count">{h.count}</span>
                    </div>
                    <span className="hour__label">{String(h.hour).padStart(2, '0')}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
