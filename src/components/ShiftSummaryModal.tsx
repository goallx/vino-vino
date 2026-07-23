import { useEffect, useState } from 'react';
import { loadOrders, subscribe } from '../lib/orderBus';
import { shekels } from '../lib/money';
import { shiftSummary } from '../analytics/shift';
import { closeShift, currentShiftStart } from '../lib/shifts';

interface ShiftSummaryModalProps {
  username?: string;
  /** Reset order numbering + the ticket after the shift is closed. */
  onShiftClosed: () => void;
  onClose: () => void;
}

const fmtDate = new Intl.DateTimeFormat('he-IL', { weekday: 'long', day: 'numeric', month: 'long' });

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'hero' | 'courier' }) {
  return (
    <div className={`stat ${tone === 'hero' ? 'stat--hero' : ''} ${tone === 'courier' ? 'stat--courier' : ''}`}>
      <span className="stat__label">{label}</span>
      <span className="stat__value">{value}</span>
    </div>
  );
}

/**
 * "סגירת משמרת" — the owner's end-of-day cash summary. READ-ONLY: it only reads
 * the live order feed and aggregates it; it never deletes or resets any order.
 * The daily reset happens naturally (orders roll off the 14-day window).
 */
export function ShiftSummaryModal({ username, onShiftClosed, onClose }: ShiftSummaryModalProps) {
  const [orders, setOrders] = useState(loadOrders);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    setOrders(loadOrders());
    return subscribe(setOrders);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const openedAt = currentShiftStart();
  const s = shiftSummary(orders, openedAt);

  function handleClose() {
    const closedAt = Date.now();
    closeShift({ ...s, openedAt, closedAt, closedBy: username });
    onShiftClosed(); // parent resets numbering + ticket and dismisses the modals
  }

  return (
    <div className="scrim" onClick={onClose}>
      <div
        className="settings shift"
        role="dialog"
        aria-modal="true"
        aria-label="סגירת משמרת"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="settings__head">
          <h2 className="settings__title">סגירת משמרת</h2>
          <span className="settings__user">{fmtDate.format(s.date)}</span>
          <button className="settings__x" onClick={onClose} aria-label="סגירה" autoFocus>
            ✕
          </button>
        </div>
        <div className="settings__perf" aria-hidden="true" />

        <div className="settings__body shift__body">
          <section className="shift__stats">
            <Stat tone="hero" label="הכנסות היום" value={shekels(s.income)} />
            <Stat tone="courier" label="לתשלום לשליח" value={shekels(s.courierOwed)} />
          </section>

          <section className="shift__mini">
            <Stat label="הזמנות" value={String(s.orderCount)} />
            <Stat label="משלוחים" value={String(s.deliveryCount)} />
            <Stat label="איסופים" value={String(s.pickupCount)} />
          </section>

          <div className="card">
            <h3 className="card__title">חשבון השליח</h3>
            <ul className="breakdown">
              <li>
                <span>דמי משלוח שנגבו ({s.deliveryCount})</span>
                <span>{shekels(s.deliveryFeeTotal)}</span>
              </li>
              <li className="breakdown--save">
                <span>לתשלום לשליח</span>
                <span>−{shekels(s.courierOwed)}</span>
              </li>
              <li className="breakdown--net">
                <span>נשאר לעסק</span>
                <span>{shekels(s.netAfterCourier)}</span>
              </li>
            </ul>
          </div>

          <div className="card">
            <h3 className="card__title">תשלום</h3>
            <div className="splitbar">
              <span style={{ width: `${(s.paidRevenue / (s.paidRevenue + s.unpaidRevenue || 1)) * 100}%`, background: 'var(--basil)' }} />
              <span style={{ width: `${(s.unpaidRevenue / (s.paidRevenue + s.unpaidRevenue || 1)) * 100}%`, background: 'var(--amber)' }} />
            </div>
            <div className="legend">
              <span><i className="dot dot--paid" />שולם · {shekels(s.paidRevenue)} ({s.paidCount})</span>
              <span><i className="dot dot--unpaid" />לא שולם · {shekels(s.unpaidRevenue)} ({s.unpaidCount})</span>
            </div>
          </div>
        </div>

        <footer className="shift__foot">
          {confirming ? (
            <div className="shift__confirm">
              <p className="shift__confirmnote">
                לסגור את המשמרת? ההזמנות יתאפסו והמספור יתחיל מחדש מ־#01.
              </p>
              <div className="shift__confirmrow">
                <button className="btn btn--ghost" onClick={() => setConfirming(false)}>
                  ביטול
                </button>
                <button className="btn btn--send" onClick={handleClose}>
                  כן, סגור משמרת
                </button>
              </div>
            </div>
          ) : (
            <button className="btn btn--send shift__close" onClick={() => setConfirming(true)}>
              סגור משמרת והתחל יום חדש
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
