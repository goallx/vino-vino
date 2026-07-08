import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Topping } from '../types';
import { newToppingId, removeTopping, saveTopping, toppings } from '../lib/menuStore';
import { shekels } from '../lib/money';

interface ToppingsAdminProps {
  editing: Topping | null;
  onEdit: (t: Topping | null) => void;
}

export function blankTopping(): Topping {
  return { id: newToppingId(), name: '', price: 0 };
}

export function ToppingsAdmin({ editing, onEdit }: ToppingsAdminProps) {
  // `toppings` is the store's live binding; bump local state to re-render after mutations.
  const [, setStamp] = useState(0);
  const bump = () => setStamp((n) => n + 1);

  function del(t: Topping) {
    if (!window.confirm(`למחוק את התוספת "${t.name || 'ללא שם'}"?`)) return;
    removeTopping(t.id);
    bump();
  }

  function onSave(t: Topping) {
    saveTopping({ ...t, name: t.name.trim() });
    onEdit(null);
    bump();
  }

  return (
    <>
      {toppings.length === 0 ? (
        <div className="dempty">
          <p>עדיין אין תוספות. הוסיפו תוספת כדי שתופיע בבניית הפיצה.</p>
          <button className="btn btn--add" onClick={() => onEdit(blankTopping())}>+ תוספת חדשה</button>
        </div>
      ) : (
        <div className="dgrid">
          {toppings.map((t) => (
            <div key={t.id} className="mcard tcard">
              <div className="mcard__head">
                <div className="mcard__info">
                  <span className="mcard__name">{t.name}</span>
                  <span className="mcard__price">{shekels(t.price)}</span>
                </div>
              </div>
              <div className="dcard__actions mcard__actions">
                <button className="dcard__edit" onClick={() => onEdit(t)}>עריכה</button>
                <button className="dcard__del" onClick={() => del(t)} aria-label={`מחק ${t.name}`}>🗑</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {editing && <ToppingEditor key={editing.id} initial={editing} onCancel={() => onEdit(null)} onSave={onSave} />}
      </AnimatePresence>
    </>
  );
}

interface ToppingEditorProps {
  initial: Topping;
  onCancel: () => void;
  onSave: (t: Topping) => void;
}

function ToppingEditor({ initial, onCancel, onSave }: ToppingEditorProps) {
  const [draft, setDraft] = useState<Topping>(initial);
  const isNew = !initial.name;
  const valid = draft.name.trim().length > 0 && draft.price > 0;

  function setPrice(shekelText: string) {
    const n = Math.max(0, Math.round(Number(shekelText) * 100));
    setDraft((d) => ({ ...d, price: Number.isFinite(n) ? n : 0 }));
  }

  return (
    <motion.div className="scrim" onClick={onCancel} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
      <motion.div
        className="deditor"
        role="dialog"
        aria-label="עריכת תוספת"
        onClick={(e) => e.stopPropagation()}
        initial={{ scale: 0.94, opacity: 0, y: 12 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.94, opacity: 0, y: 12 }}
        transition={{ type: 'spring', stiffness: 360, damping: 28 }}
      >
        <div className="deditor__head">
          <h2 className="deditor__title">{isNew ? 'תוספת חדשה' : 'עריכת תוספת'}</h2>
          <button className="btn btn--ghost btn--sm" onClick={onCancel}>סגור</button>
        </div>

        <div className="deditor__body">
          <label className="dfield">
            <span>שם התוספת</span>
            <input type="text" placeholder="לדוגמה: פטריות" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} autoFocus />
          </label>

          <label className="dfield">
            <span>מחיר</span>
            <div className="dprice">
              <span className="dprice__shekel">₪</span>
              <input
                inputMode="numeric"
                value={draft.price ? String(draft.price / 100) : ''}
                placeholder="0"
                onChange={(e) => setPrice(e.target.value)}
              />
            </div>
          </label>
        </div>

        <div className="deditor__foot">
          <button className="btn btn--ghost" onClick={onCancel}>ביטול</button>
          <button className="btn btn--send" disabled={!valid} onClick={() => onSave(draft)}>
            שמור תוספת
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
