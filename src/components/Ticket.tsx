import { AnimatePresence, motion } from 'framer-motion';
import type { CartLine, PastOrder } from '../types';
import type { OrderState } from '../state/order';
import { computeUnitPrice, lineSummary } from '../lib/cart';
import { shekels } from '../lib/money';
import { ReorderPanel } from './ReorderPanel';
import { DishThumb } from './DishThumb';
import type { StoredCustomer, AddressSuggestion } from '../lib/customers';

interface TicketProps {
  state: OrderState;
  setField: (field: keyof OrderState, value: string) => void;
  setQty: (id: string, qty: number) => void;
  subtotal: number;
  discountTotal: number;
  total: number;
  onRemoveDiscount: (uid: string) => void;
  orderNumber: number;
  onEditLine: (line: CartLine) => void;
  onRemoveLine: (line: CartLine) => void;
  onSend: () => void;
  onNewOrder: () => void;
  match: { name?: string; past: PastOrder[] } | null;
  onClonePast: (order: PastOrder) => void;
  onDismissMatch: () => void;
  suggestions: StoredCustomer[];
  onPickCustomer: (c: StoredCustomer) => void;
  addressSuggestions: AddressSuggestion[];
  onPickAddress: (address: string) => void;
  canSend: boolean;
}

export function Ticket(props: TicketProps) {
  const { state, setField, setQty, subtotal, discountTotal, total, orderNumber } = props;
  const hasDiscount = discountTotal > 0;

  return (
    <aside className="ticket" aria-label="הזמנה נוכחית">
      <div className="ticket__perf" aria-hidden="true" />

      <header className="ticket__head">
        <div>
          <p className="ticket__eyebrow">הזמנה</p>
          <p className="ticket__number" data-testid="order-number">#{String(orderNumber).padStart(2, '0')}</p>
        </div>
        <motion.button className="btn btn--ghost btn--sm" whileTap={{ scale: 0.95 }} onClick={props.onNewOrder}>
          הזמנה חדשה
        </motion.button>
      </header>

      <div className="lines" role="list">
        {state.lines.length === 0 && (
          <motion.p className="lines__empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            הקש על פריט בתפריט כדי להתחיל הזמנה
          </motion.p>
        )}
        <AnimatePresence initial={false}>
          {state.lines.map((l) => {
            const summary = lineSummary(l);
            return (
              <motion.div
                key={l.id}
                className="line"
                role="listitem"
                layout
                initial={{ opacity: 0, x: 28 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 28, transition: { duration: 0.15 } }}
                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              >
                <DishThumb productId={l.productId} size={46} />
                <div className="line__main">
                  <span className="line__name">{l.name}</span>
                  {summary && <span className="line__sub">{summary}</span>}
                  {l.note && <span className="line__note">“{l.note}”</span>}
                </div>
                <div className="line__side">
                  <span className="line__price">{shekels(computeUnitPrice(l) * l.qty)}</span>
                  <div className="stepper">
                    <button onClick={() => setQty(l.id, l.qty - 1)} aria-label="הפחת">−</button>
                    <motion.span key={l.qty} initial={{ scale: 1.3 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 24 }}>
                      {l.qty}
                    </motion.span>
                    <button onClick={() => setQty(l.id, l.qty + 1)} aria-label="הוסף">+</button>
                  </div>
                  <div className="line__tools">
                    <button onClick={() => props.onEditLine(l)} aria-label="ערוך">✎</button>
                    <button onClick={() => props.onRemoveLine(l)} aria-label="מחק">🗑</button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        <AnimatePresence initial={false}>
          {state.discounts.map((d) => (
            <motion.div
              key={d.uid}
              className="disc"
              role="listitem"
              layout
              initial={{ opacity: 0, x: 28 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 28, transition: { duration: 0.15 } }}
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            >
              <span className="disc__tag">מבצע</span>
              <span className="disc__name">{d.label}</span>
              <span className="disc__amount">−{shekels(d.amount)}</span>
              <button className="disc__x" onClick={() => props.onRemoveDiscount(d.uid)} aria-label={`הסר מבצע ${d.label}`}>
                ✕
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <div className="customer">
        <div className="field field--phone">
          <span className="field__icon">☎</span>
          <input inputMode="tel" placeholder="טלפון" value={state.phone} onChange={(e) => setField('phone', e.target.value)} />
        </div>

        <AnimatePresence>
          {props.suggestions.length > 0 && !props.match && (
            <motion.ul
              className="ac"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.16 }}
              style={{ overflow: 'hidden' }}
            >
              {props.suggestions.map((s) => (
                <li key={s.phone}>
                  <button className="ac__row" onClick={() => props.onPickCustomer(s)}>
                    <span className="ac__name">{s.name || 'לקוח'}</span>
                    <span className="ac__phone">{s.phone}</span>
                    {s.orderCount > 0 && <span className="ac__count">{s.orderCount} הזמנות</span>}
                  </button>
                </li>
              ))}
            </motion.ul>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {props.match && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              style={{ overflow: 'hidden' }}
            >
              <ReorderPanel
                customerName={props.match.name}
                past={props.match.past}
                onClone={props.onClonePast}
                onDismiss={props.onDismissMatch}
              />
            </motion.div>
          )}
        </AnimatePresence>
        <div className="field">
          <span className="field__icon">👤</span>
          <input placeholder="שם" value={state.name} onChange={(e) => setField('name', e.target.value)} />
        </div>
        <AnimatePresence initial={false}>
          {state.type === 'delivery' && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.18 }} style={{ overflow: 'hidden' }}>
              <div className="field">
                <span className="field__icon">📍</span>
                <input placeholder="כתובת" value={state.address} onChange={(e) => setField('address', e.target.value)} />
              </div>
              <AnimatePresence>
                {props.addressSuggestions.length > 0 && (
                  <motion.ul
                    className="ac"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.16 }}
                    style={{ overflow: 'hidden' }}
                  >
                    {props.addressSuggestions.map((s) => (
                      <li key={s.address}>
                        <button className="ac__row" onClick={() => props.onPickAddress(s.address)}>
                          <span className="ac__name">{s.address}</span>
                          {s.name && <span className="ac__phone">{s.name}</span>}
                          {s.count > 1 && <span className="ac__count">{s.count} לקוחות</span>}
                        </button>
                      </li>
                    ))}
                  </motion.ul>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="toggles">
          <div className="seg" role="group" aria-label="סוג הזמנה">
            <button className={state.type === 'delivery' ? 'is-active' : ''} onClick={() => setField('type', 'delivery')}>משלוח</button>
            <button className={state.type === 'pickup' ? 'is-active' : ''} onClick={() => setField('type', 'pickup')}>איסוף</button>
          </div>
          <div className="seg" role="group" aria-label="תשלום">
            <button className={state.payment === 'paid' ? 'is-active seg--paid' : ''} onClick={() => setField('payment', 'paid')}>שולם</button>
            <button className={state.payment === 'unpaid' ? 'is-active seg--unpaid' : ''} onClick={() => setField('payment', 'unpaid')}>לא שולם</button>
          </div>
        </div>
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
            <motion.span
              className="total__amount"
              data-testid="ticket-total"
              key={total}
              initial={{ scale: 1.18 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 460, damping: 22 }}
            >
              {shekels(total)}
            </motion.span>
          </span>
        </div>
        <motion.button className="btn btn--send" whileTap={{ scale: 0.98 }} disabled={!props.canSend} onClick={props.onSend}>
          שלח למטבח →
        </motion.button>
      </footer>
    </aside>
  );
}
