import { useEffect, useState } from 'react';
import { motion, type Variants } from 'framer-motion';
import { loadOrders, subscribe } from '../lib/orderBus';
import { computeMetrics, ordersInRange, startOfDay } from './metrics';
import { seedReportsDemo } from './sampleReports';
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

const container: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.07 } } };
const rise: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 320, damping: 26 } },
};

const ease = [0.16, 1, 0.3, 1] as const;

function Stat({ label, value, money, hero }: { label: string; value: number; money?: boolean; hero?: boolean }) {
  return (
    <motion.div className={`stat ${hero ? 'stat--hero' : ''}`} variants={rise}>
      <span className="stat__label">{label}</span>
      <span className="stat__value">
        <CountUp value={value} format={money ? (n) => shekels(Math.round(n)) : undefined} />
      </span>
    </motion.div>
  );
}

function SplitBar({ a, b, aColor, bColor }: { a: number; b: number; aColor: string; bColor: string }) {
  const total = a + b || 1;
  return (
    <div className="splitbar">
      <motion.span initial={{ width: 0 }} animate={{ width: `${(a / total) * 100}%` }} transition={{ duration: 0.7, ease }} style={{ background: aColor }} />
      <motion.span initial={{ width: 0 }} animate={{ width: `${(b / total) * 100}%` }} transition={{ duration: 0.7, ease, delay: 0.05 }} style={{ background: bColor }} />
    </div>
  );
}

interface ReportsProps {
  onSignOut?: () => void;
}

export function Reports({ onSignOut }: ReportsProps = {}) {
  const [orders, setOrders] = useState(loadOrders);
  const [range, setRange] = useState<Range>(todayRange);
  const [dateValue, setDateValue] = useState('');

  useEffect(() => {
    if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('demo')) {
      seedReportsDemo();
    }
    setOrders(loadOrders());
    return subscribe(setOrders);
  }, []);

  const m = computeMetrics(ordersInRange(orders, range.from, range.to));
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
          <a href="/">קבלת הזמנות</a>
          <a href="/kitchen">מסך מטבח</a>
          {onSignOut && <button onClick={onSignOut}>יציאה</button>}
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

        {/* keyed by range so the whole report re-animates when the window changes */}
        <motion.div key={`${range.key}-${range.from}`} variants={container} initial="hidden" animate="show" className="rsections">
          <motion.section className="stats" variants={container}>
            <Stat hero money label="הכנסות" value={m.revenue} />
            <Stat label="הזמנות" value={m.orderCount} />
            <Stat label="פיצות שנמכרו" value={m.pizzaCount} />
            <Stat money label="ממוצע להזמנה" value={m.avgOrder} />
          </motion.section>

          <section className="cards">
            <motion.div className="card" variants={rise}>
              <h3 className="card__title">תשלום</h3>
              <SplitBar a={m.paidRevenue} b={m.unpaidRevenue} aColor="var(--basil)" bColor="var(--amber)" />
              <div className="legend">
                <span><i className="dot dot--paid" />שולם · {shekels(m.paidRevenue)} ({m.paidCount})</span>
                <span><i className="dot dot--unpaid" />לא שולם · {shekels(m.unpaidRevenue)} ({m.unpaidCount})</span>
              </div>
            </motion.div>

            <motion.div className="card" variants={rise}>
              <h3 className="card__title">סוג הזמנה</h3>
              <SplitBar a={m.deliveryCount} b={m.pickupCount} aColor="var(--vino)" bColor="var(--ink-soft)" />
              <div className="legend">
                <span><i className="dot dot--delivery" />משלוח · {m.deliveryCount}</span>
                <span><i className="dot dot--pickup" />איסוף · {m.pickupCount}</span>
              </div>
            </motion.div>

            {m.discountTotal > 0 && (
              <motion.div className="card card--deals" variants={rise}>
                <h3 className="card__title">מבצעים</h3>
                <ul className="breakdown">
                  <li><span>מחיר מלא</span><span>{shekels(m.grossRevenue)}</span></li>
                  <li className="breakdown--save"><span>הנחות מבצעים</span><span>−{shekels(m.discountTotal)}</span></li>
                  <li className="breakdown--net"><span>הכנסה בפועל</span><span>{shekels(m.revenue)}</span></li>
                </ul>
              </motion.div>
            )}
          </section>

          <section className="panels">
            <motion.div className="panel" variants={rise}>
              <h3 className="card__title">המנות הנמכרות ביותר</h3>
              <ul className="top">
                {m.topItems.length === 0 && <li className="top__empty">אין נתונים לטווח זה</li>}
                {m.topItems.map((t, i) => (
                  <li className="top__row" key={t.name}>
                    <span className="top__name">{t.name}</span>
                    <div className="top__bar">
                      <motion.span initial={{ width: 0 }} animate={{ width: `${(t.qty / topMax) * 100}%` }} transition={{ duration: 0.6, ease, delay: i * 0.05 }} />
                    </div>
                    <span className="top__qty">{t.qty}</span>
                    <span className="top__rev">{shekels(t.revenue)}</span>
                  </li>
                ))}
              </ul>
            </motion.div>

            <motion.div className="panel" variants={rise}>
              <h3 className="card__title">הזמנות לפי שעה</h3>
              <div className="hours">
                {m.byHour.length === 0 && <p className="top__empty">אין נתונים לטווח זה</p>}
                {m.byHour.map((h, i) => (
                  <div className="hour" key={h.hour}>
                    <motion.div
                      className="hour__bar"
                      initial={{ height: 0 }}
                      animate={{ height: `${(h.count / peakHour) * 100}%` }}
                      transition={{ duration: 0.5, ease, delay: i * 0.04 }}
                    >
                      <span className="hour__count">{h.count}</span>
                    </motion.div>
                    <span className="hour__label">{String(h.hour).padStart(2, '0')}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          </section>
        </motion.div>
      </main>
    </div>
  );
}
