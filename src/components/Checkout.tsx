import type { PastOrder } from '../types';
import type { OrderState } from '../state/order';
import { computeUnitPrice } from '../lib/cart';
import { shekels } from '../lib/money';
import { ReorderPanel } from './ReorderPanel';
import type { StoredCustomer, AddressSuggestion } from '../lib/customers';

const DELIVERY_FEES = [1000, 1500, 2000, 2500, 3000]; // ₪10 / ₪15 / ₪20 / ₪25 / ₪30, in agorot

interface CheckoutProps {
  state: OrderState;
  setField: (field: keyof OrderState, value: string) => void;
  subtotal: number;
  discountTotal: number;
  total: number;
  orderNumber: number;
  onBack: () => void;
  onSend: () => void;
  onSetDeliveryFee: (fee: number) => void;
  canSend: boolean;
  sending?: boolean;
  match: { name?: string; past: PastOrder[] } | null;
  onClonePast: (order: PastOrder) => void;
  onUseMatchedCustomer: () => void;
  onDismissMatch: () => void;
  suggestions: StoredCustomer[];
  onPickCustomer: (c: StoredCustomer) => void;
  addressSuggestions: AddressSuggestion[];
  onPickAddress: (address: string) => void;
}

/**
 * Full-width, keyboard-safe customer step (no modal — a centered dialog would
 * sit under the tablet's on-screen keyboard in landscape). The form column is
 * top-anchored so the fields stay above the keyboard; the summary rides
 * alongside so the owner keeps the order in view while typing.
 */
export function Checkout(props: CheckoutProps) {
  const { state, setField, subtotal, discountTotal, total, orderNumber } = props;
  const hasDiscount = discountTotal > 0;
  const hasCustomDeliveryFee = state.deliveryFee > 0 && !DELIVERY_FEES.includes(state.deliveryFee);

  return (
    <section className="checkout" aria-label="פרטי הזמנה">
      <header className="checkout__top">
        <button className="checkout__back" onClick={props.onBack}>→ חזרה להזמנה</button>
        <span className="checkout__num">הזמנה #{String(orderNumber).padStart(2, '0')}</span>
      </header>

      <div className="checkout__cols">
        <div className="checkout__form">
          <div className="customer__row">
            <div className="field field--phone">
              <span className="field__icon">☎</span>
              <input inputMode="tel" placeholder="טלפון" value={state.phone} onChange={(e) => setField('phone', e.target.value)} autoFocus />
            </div>
            <div className="field">
              <span className="field__icon">👤</span>
              <input placeholder="שם" value={state.name} onChange={(e) => setField('name', e.target.value)} />
            </div>
          </div>

          {props.suggestions.length > 0 && !props.match && (
            <ul className="ac">
              {props.suggestions.map((s) => (
                <li key={s.phone}>
                  <button className="ac__row" onClick={() => props.onPickCustomer(s)}>
                    <span className="ac__name">{s.name || 'לקוח'}</span>
                    <span className="ac__phone">{s.phone}</span>
                    {s.orderCount > 0 && <span className="ac__count">{s.orderCount} הזמנות</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {props.match && (
            <ReorderPanel
              customerName={props.match.name}
              past={props.match.past}
              onUseCustomer={props.onUseMatchedCustomer}
              onClone={props.onClonePast}
              onDismiss={props.onDismissMatch}
            />
          )}

          {state.type === 'delivery' && (
            <>
              <div className="field">
                <span className="field__icon">📍</span>
                <input placeholder="כתובת" value={state.address} onChange={(e) => setField('address', e.target.value)} />
              </div>
              {props.addressSuggestions.length > 0 && (
                <ul className="ac">
                  {props.addressSuggestions.map((s) => (
                    <li key={s.address}>
                      <button className="ac__row" onClick={() => props.onPickAddress(s.address)}>
                        <span className="ac__name">{s.address}</span>
                        {s.name && <span className="ac__phone">{s.name}</span>}
                        {s.count > 1 && <span className="ac__count">{s.count} לקוחות</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

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

        <aside className="checkout__summary" aria-label="סיכום הזמנה">
          <p className="checkout__sumtitle">סיכום הזמנה</p>
          <ul className="csum">
            {state.lines.length === 0 && <li className="csum__empty">אין פריטים בהזמנה</li>}
            {state.lines.map((l) => (
              <li key={l.id} className="csum__row">
                <span className="csum__qty">{l.qty}×</span>
                <span className="csum__name">{l.name}</span>
                <span className="csum__price">{shekels(computeUnitPrice(l) * l.qty)}</span>
              </li>
            ))}
            {state.discounts.map((d) => (
              <li key={d.uid} className="csum__row csum__row--disc">
                <span className="csum__qty">מבצע</span>
                <span className="csum__name">{d.label}</span>
                <span className="csum__price">−{shekels(d.amount)}</span>
              </li>
            ))}
            {state.deliveryFee > 0 && (
              <li className="csum__row csum__row--fee">
                <span className="csum__qty">משלוח</span>
                <span className="csum__name">דמי משלוח</span>
                <span className="csum__price">+{shekels(state.deliveryFee)}</span>
              </li>
            )}
          </ul>

          <footer className="checkout__foot">
            {hasDiscount && (
              <div className="total total--saving">
                <span>חיסכון במבצעים</span>
                <span className="total__saving">−{shekels(discountTotal)}</span>
              </div>
            )}
            <div className="total">
              <span>סה״כ</span>
              <span className="total__wrap">
                {hasDiscount && <span className="total__was">{shekels(subtotal)}</span>}
                <span className="total__amount" data-testid="ticket-total">{shekels(total)}</span>
              </span>
            </div>
            {state.type === 'delivery' && (
              <div className="deliv">
                <div className="deliv__head">
                  <span className="deliv__heading">
                    <strong className="deliv__label">דמי משלוח</strong>
                    <span className="deliv__hint">בחרו את הסכום לחיוב</span>
                  </span>
                  <output className="deliv__current" aria-live="polite">
                    {state.deliveryFee === 0 ? 'ללא עלות' : shekels(state.deliveryFee)}
                  </output>
                </div>
                <div className="deliv__controls" role="group" aria-label="דמי משלוח">
                  <div className="deliv__pills">
                    {DELIVERY_FEES.map((f) => (
                      <button
                        key={f}
                        className={`deliv__pill ${state.deliveryFee === f ? 'is-active' : ''}`}
                        aria-pressed={state.deliveryFee === f}
                        onClick={() => props.onSetDeliveryFee(f)}
                      >
                        {shekels(f)}
                      </button>
                    ))}
                  </div>
                  <label className={`deliv__custom ${hasCustomDeliveryFee ? 'is-active' : ''}`}>
                    <span className="deliv__custom-label">סכום אחר</span>
                    <span className="deliv__input">
                      <input
                        inputMode="numeric"
                        placeholder="0"
                        aria-label="דמי משלוח אחר"
                        value={hasCustomDeliveryFee ? String(state.deliveryFee / 100) : ''}
                        onChange={(e) => {
                          const n = Math.max(0, Math.round(Number(e.target.value) * 100));
                          props.onSetDeliveryFee(Number.isFinite(n) ? n : 0);
                        }}
                      />
                      <span className="deliv__shekel" aria-hidden="true">₪</span>
                    </span>
                  </label>
                </div>
              </div>
            )}
            <button className="btn btn--send" disabled={!props.canSend || props.sending} onClick={props.onSend}>
              {props.sending ? (
                <>
                  <span className="spinner" aria-hidden="true" /> שולח…
                </>
              ) : (
                'שלח למטבח'
              )}
            </button>
          </footer>
        </aside>
      </div>
    </section>
  );
}
