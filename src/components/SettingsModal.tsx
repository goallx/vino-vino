import { useEffect, useState } from 'react';
import { ShiftSummaryModal } from './ShiftSummaryModal';

interface SettingsModalProps {
  username?: string;
  onClose: () => void;
}

/**
 * The "manager's chit": everything that used to crowd the topbar —
 * admin pages, the other screens — grouped in one panel.
 * Links navigate in place (no new tab — tablet browsers hide tabs and a
 * stray one is easy to lose); the in-progress order is autosaved as a draft.
 */
export function SettingsModal({ username, onClose }: SettingsModalProps) {
  const [shiftOpen, setShiftOpen] = useState(false);

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
        className="settings"
        role="dialog"
        aria-modal="true"
        aria-label="הגדרות"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="settings__head">
          <h2 className="settings__title">הגדרות</h2>
          {username && <span className="settings__user">{username}</span>}
          <button className="settings__x" onClick={onClose} aria-label="סגירה" autoFocus>
            ✕
          </button>
        </div>
        <div className="settings__perf" aria-hidden="true" />

        <div className="settings__body">
          <section className="sgroup" aria-label="ניהול">
            <h3 className="sgroup__label">ניהול</h3>
            <a className="srow" href="/menu">
              <span className="srow__icon" aria-hidden="true">📋</span>
              <span className="srow__text">
                <span className="srow__name">תפריט</span>
                <span className="srow__desc">הוספה ועריכה של פריטים ומחירים</span>
              </span>
              <span className="srow__go" aria-hidden="true">←</span>
            </a>
            <a className="srow" href="/deals">
              <span className="srow__icon" aria-hidden="true">🏷️</span>
              <span className="srow__text">
                <span className="srow__name">מבצעים</span>
                <span className="srow__desc">חבילות במחיר קבוע</span>
              </span>
              <span className="srow__go" aria-hidden="true">←</span>
            </a>
          </section>

          <section className="sgroup" aria-label="מסכים">
            <h3 className="sgroup__label">מסכים</h3>
            <a className="srow" href="/orders">
              <span className="srow__icon" aria-hidden="true">🧾</span>
              <span className="srow__text">
                <span className="srow__name">הזמנות</span>
                <span className="srow__desc">כל ההזמנות של היום</span>
              </span>
              <span className="srow__go" aria-hidden="true">←</span>
            </a>
            <a className="srow" href="/reports">
              <span className="srow__icon" aria-hidden="true">📈</span>
              <span className="srow__text">
                <span className="srow__name">דוח יומי</span>
                <span className="srow__desc">הכנסות ונתוני מכירה</span>
              </span>
              <span className="srow__go" aria-hidden="true">←</span>
            </a>
          </section>

          <section className="sgroup" aria-label="קופה">
            <h3 className="sgroup__label">קופה</h3>
            <button type="button" className="srow" onClick={() => setShiftOpen(true)}>
              <span className="srow__icon" aria-hidden="true">💰</span>
              <span className="srow__text">
                <span className="srow__name">סגירת משמרת</span>
                <span className="srow__desc">סיכום הכנסות ותשלום לשליח</span>
              </span>
              <span className="srow__go" aria-hidden="true">←</span>
            </button>
          </section>
        </div>
      </div>

      {shiftOpen && <ShiftSummaryModal onClose={() => setShiftOpen(false)} />}
    </div>
  );
}
