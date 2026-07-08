import { useEffect } from 'react';
import { motion } from 'framer-motion';

interface SettingsModalProps {
  username?: string;
  onSignOut?: () => void;
  onClose: () => void;
}

/**
 * The "manager's chit": everything that used to crowd the topbar —
 * admin pages, the other screens, sign-out — grouped in one panel.
 * Links navigate in place (no new tab — tablet browsers hide tabs and a
 * stray one is easy to lose); the in-progress order is autosaved as a draft.
 */
export function SettingsModal({ username, onSignOut, onClose }: SettingsModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <motion.div
      className="scrim"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      <motion.div
        className="settings"
        role="dialog"
        aria-modal="true"
        aria-label="הגדרות"
        onClick={(e) => e.stopPropagation()}
        initial={{ scale: 0.94, opacity: 0, y: 12 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.94, opacity: 0, y: 12 }}
        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
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
            <a className="srow" href="/kitchen">
              <span className="srow__icon" aria-hidden="true">👨‍🍳</span>
              <span className="srow__text">
                <span className="srow__name">מסך מטבח</span>
                <span className="srow__desc">לוח ההזמנות למטבח</span>
              </span>
              <span className="srow__go" aria-hidden="true">←</span>
            </a>
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

          {onSignOut && (
            <section className="sgroup" aria-label="חשבון">
              <h3 className="sgroup__label">חשבון</h3>
              <button className="srow srow--signout" onClick={onSignOut}>
                <span className="srow__icon" aria-hidden="true">🔒</span>
                <span className="srow__text">
                  <span className="srow__name">יציאה</span>
                  <span className="srow__desc">
                    {username ? `מחובר בתור ${username}` : 'התנתקות מהמערכת'}
                  </span>
                </span>
              </button>
            </section>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
