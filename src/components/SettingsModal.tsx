import { useEffect, useState } from 'react';
import { useAuthOptional } from '../auth/AuthContext';
import { ShiftSummaryModal } from './ShiftSummaryModal';
import { ShiftHistoryModal } from './ShiftHistoryModal';

interface SettingsModalProps {
  username?: string;
  /** Reset order numbering + the ticket after a shift is closed. */
  onShiftClosed: () => void;
  onClose: () => void;
}

interface Tile {
  name: string;
  sub: string;
  href?: string;
  onClick?: () => void;
}

/**
 * The manager's hub: a full-screen grid of everything off the order screen —
 * the other displays, admin pages, and the cash tools — grouped by area.
 * Links navigate in place (tablet browsers hide tabs; the order autosaves).
 */
export function SettingsModal({ username, onShiftClosed, onClose }: SettingsModalProps) {
  const auth = useAuthOptional();
  const [shiftOpen, setShiftOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const groups: { title: string; tiles: Tile[] }[] = [
    {
      title: 'ניהול',
      tiles: [
        { name: 'תפריט', sub: 'מוצרים, מחירים, זמינות', href: '/menu' },
        { name: 'מבצעים', sub: 'קופונים וחבילות', href: '/deals' },
      ],
    },
    {
      title: 'קופה',
      tiles: [
        { name: 'סגירת משמרת', sub: 'סיכום קופה ותשלום לשליח', onClick: () => setShiftOpen(true) },
        { name: 'היסטוריית משמרות', sub: 'משמרות שנסגרו — הכנסות ותשלומים', onClick: () => setHistoryOpen(true) },
      ],
    },
    {
      title: 'דוחות',
      tiles: [{ name: 'דוח יומי', sub: 'הכנסות ונתוני מכירה', href: '/reports' }],
    },
  ];

  const renderTile = (t: Tile) =>
    t.href ? (
      <a key={t.name} className="hubtile" href={t.href}>
        <span className="hubtile__name">{t.name}</span>
        <span className="hubtile__sub">{t.sub}</span>
      </a>
    ) : (
      <button key={t.name} type="button" className="hubtile" onClick={t.onClick}>
        <span className="hubtile__name">{t.name}</span>
        <span className="hubtile__sub">{t.sub}</span>
      </button>
    );

  return (
    <div className="scrim scrim--settings" onClick={onClose}>
      <div className="settings" role="dialog" aria-modal="true" aria-label="הגדרות" onClick={(e) => e.stopPropagation()}>
        <div className="settings__head">
          <h2 className="settings__title">הגדרות</h2>
          <div className="settings__spacer" />
          {username && <span className="settings__user">{username}</span>}
          <button className="settings__x" onClick={onClose} aria-label="סגירה" autoFocus>✕</button>
        </div>

        <div className="settings__body">
          <div className="hub">
            {groups.map((g) => (
              <section key={g.title} className="hubcard" aria-label={g.title}>
                <span className="hubcard__label">{g.title}</span>
                {g.tiles.map(renderTile)}
              </section>
            ))}
          </div>
        </div>

        <footer className="settings__foot">
          {username && (
            <span className="settings__conn">
              מחובר כ־<strong>{username}</strong>
            </span>
          )}
          <div className="settings__spacer" />
          <button className="settings__logout" onClick={() => void auth?.signOut()}>התנתקות</button>
        </footer>
      </div>

      {shiftOpen && (
        <ShiftSummaryModal
          username={username}
          onShiftClosed={() => {
            onShiftClosed();
            setShiftOpen(false);
            onClose();
          }}
          onClose={() => setShiftOpen(false)}
        />
      )}
      {historyOpen && <ShiftHistoryModal onClose={() => setHistoryOpen(false)} />}
    </div>
  );
}
