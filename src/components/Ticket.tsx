import type { CartLine } from '../types';
import type { OrderState } from '../state/order';
import { computeUnitPrice, lineBasePrice, lineSummary } from '../lib/cart';
import { shekels } from '../lib/money';
import { DishThumb } from './DishThumb';

interface TicketProps {
  state: OrderState;
  setQty: (id: string, qty: number) => void;
  subtotal: number;
  discountTotal: number;
  total: number;
  orderNumber: number;
  onEditLine: (line: CartLine) => void;
  onRemoveLine: (line: CartLine) => void;
  onRemoveCombo: (uid: string) => void;
  onContinue: () => void;
  onNewOrder: () => void;
  canContinue: boolean;
}

export function Ticket(props: TicketProps) {
  const { state, setQty, subtotal, discountTotal, total, orderNumber } = props;
  const hasDiscount = discountTotal > 0;

  return (
    <aside className="ticket" aria-label="הזמנה נוכחית">
      <div className="ticket__perf" aria-hidden="true" />

      <header className="ticket__head">
        <div>
          <p className="ticket__eyebrow">הזמנה</p>
          <p className="ticket__number" data-testid="order-number">#{String(orderNumber).padStart(2, '0')}</p>
        </div>
        <div className="ticket__head-actions">
          <button
            className="ticket__restart"
            onClick={props.onNewOrder}
            aria-label="התחל הזמנה מחדש"
            title="התחל הזמנה מחדש"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M20 11a8 8 0 1 0-2.34 5.66M20 4v7h-7" />
            </svg>
          </button>
        </div>
      </header>

      <div className="lines" role="list">
        {state.lines.length === 0 && (
          <p className="lines__empty">הקש על פריט בתפריט כדי להתחיל הזמנה</p>
        )}
        {state.lines.map((l) => {
          const summary = lineSummary(l);
          return (
            <div key={l.id} className="line" role="listitem">
              <div className="line__top">
                <DishThumb productId={l.productId} size={46} />
                <div className="line__main">
                  <span className="line__name">{l.name}</span>
                  {summary && <span className="line__sub">{summary}</span>}
                  {l.note && <span className="line__note">“{l.note}”</span>}
                </div>
                <span className="line__price">{shekels(computeUnitPrice(l) * l.qty)}</span>
              </div>
              <div className="line__ctrl">
                <div className="stepper">
                  <button onClick={() => setQty(l.id, l.qty - 1)} aria-label="הפחת">−</button>
                  <span key={l.qty} className="stepper__qty">{l.qty}</span>
                  <button onClick={() => setQty(l.id, l.qty + 1)} aria-label="הוסף">+</button>
                </div>
                <div className="line__tools">
                  <button onClick={() => props.onEditLine(l)} aria-label="ערוך">✎ עריכה</button>
                  <button onClick={() => props.onRemoveLine(l)} aria-label="מחק">🗑</button>
                </div>
              </div>
            </div>
          );
        })}

        {state.combos.map((c) => {
          const base = state.lines
            .filter((l) => l.bundleUid === c.uid)
            .reduce((s, l) => s + lineBasePrice(l) * l.qty, 0);
          const saving = Math.max(0, base - c.price);
          return (
            <div key={c.uid} className="disc disc--combo" role="listitem">
              <span className="disc__tag">מבצע</span>
              <span className="disc__name">{c.label} · {shekels(c.price)}</span>
              {saving > 0 && <span className="disc__amount">−{shekels(saving)}</span>}
              <button className="disc__x" onClick={() => props.onRemoveCombo(c.uid)} aria-label={`הסר מבצע ${c.label}`}>✕</button>
            </div>
          );
        })}

        {state.discounts.map((d) => (
          <div key={d.uid} className="disc" role="listitem">
            <span className="disc__tag">מבצע</span>
            <span className="disc__name">{d.label}</span>
            <span className="disc__amount">−{shekels(d.amount)}</span>
          </div>
        ))}
      </div>

      <footer className="ticket__foot">
        {hasDiscount && (
          <div className="total total--saving">
            <span>חיסכון במבצעים</span>
            <span className="total__saving" data-testid="ticket-saving">−{shekels(discountTotal)}</span>
          </div>
        )}
        <div className="total">
          <span>סה״כ</span>
          <span className="total__wrap">
            {hasDiscount && <span className="total__was">{shekels(subtotal)}</span>}
            <span className="total__amount" data-testid="ticket-total" key={total}>
              {shekels(total)}
            </span>
          </span>
        </div>
        <button className="btn btn--send" disabled={!props.canContinue} onClick={props.onContinue}>
          המשך לפרטי הזמנה
        </button>
      </footer>
    </aside>
  );
}
