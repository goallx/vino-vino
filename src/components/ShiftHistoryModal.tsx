import { useEffect } from 'react';
import { shekels } from '../lib/money';
import { loadShifts } from '../lib/shifts';

interface ShiftHistoryModalProps {
  onClose: () => void;
}

const fmtDate = new Intl.DateTimeFormat('he-IL', { weekday: 'short', day: 'numeric', month: 'short' });
const fmtTime = new Intl.DateTimeFormat('he-IL', { hour: '2-digit', minute: '2-digit' });

/** Read-only list of closed shifts — the analytics history the log accumulates. */
export function ShiftHistoryModal({ onClose }: ShiftHistoryModalProps) {
  const shifts = loadShifts();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="scrim" onClick={onClose}>
      <div
        className="settings shift"
        role="dialog"
        aria-modal="true"
        aria-label="היסטוריית משמרות"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="settings__head">
          <h2 className="settings__title">היסטוריית משמרות</h2>
          <button className="settings__x" onClick={onClose} aria-label="סגירה" autoFocus>
            ✕
          </button>
        </div>
        <div className="settings__perf" aria-hidden="true" />

        <div className="settings__body shift__body">
          {shifts.length === 0 ? (
            <p className="lines__empty">עדיין לא נסגרה אף משמרת.</p>
          ) : (
            <ul className="shiftlog">
              {shifts.map((s) => (
                <li key={s.closedAt} className="shiftlog__row">
                  <div className="shiftlog__when">
                    <span className="shiftlog__date">{fmtDate.format(s.date)}</span>
                    <span className="shiftlog__time">נסגרה {fmtTime.format(s.closedAt)}</span>
                  </div>
                  <div className="shiftlog__nums">
                    <span className="shiftlog__income">{shekels(s.income)}</span>
                    <span className="shiftlog__sub">
                      {s.orderCount} הזמנות · לשליח {shekels(s.courierOwed)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
