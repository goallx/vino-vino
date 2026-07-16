import { useState } from 'react';
import type { Topping } from '../types';
import { newToppingId, removeTopping, saveTopping, toppings } from '../lib/menuStore';
import { shekels } from '../lib/money';
import { useConfirm } from '../components/ConfirmDialog';

interface ToppingsAdminProps {
  editing: Topping | null;
  onEdit: (t: Topping | null) => void;
}

export function blankTopping(): Topping {
  return { id: newToppingId(), name: '', price: 0, pricePersonal: 0, priceFamily: 0 };
}

export function ToppingsAdmin({ editing, onEdit }: ToppingsAdminProps) {
  // `toppings` is the store's live binding; bump local state to re-render after mutations.
  const [, setStamp] = useState(0);
  const bump = () => setStamp((n) => n + 1);
  const confirm = useConfirm();

  async function del(t: Topping) {
    if (!(await confirm({ message: `למחוק את התוספת "${t.name || 'ללא שם'}"?`, danger: true, confirmLabel: 'מחק' }))) return;
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
                  <span className="mcard__price">
                    אישית {shekels(t.pricePersonal ?? t.price)} · משפחתית {shekels(t.priceFamily ?? t.price)}
                  </span>
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

      {editing && <ToppingEditor key={editing.id} initial={editing} onCancel={() => onEdit(null)} onSave={onSave} />}
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
  const personal = draft.pricePersonal ?? draft.price;
  const family = draft.priceFamily ?? draft.price;
  const valid = draft.name.trim().length > 0 && personal > 0 && family > 0;

  const toAgorot = (s: string) => {
    const n = Math.max(0, Math.round(Number(s) * 100));
    return Number.isFinite(n) ? n : 0;
  };
  // legacy `price` tracks the personal tier so older readers stay correct.
  function setPersonal(s: string) {
    const n = toAgorot(s);
    setDraft((d) => ({ ...d, pricePersonal: n, price: n }));
  }
  function setFamily(s: string) {
    setDraft((d) => ({ ...d, priceFamily: toAgorot(s) }));
  }

  return (
    <div className="scrim" onClick={onCancel}>
      <div
        className="deditor"
        role="dialog"
        aria-label="עריכת תוספת"
        onClick={(e) => e.stopPropagation()}
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
            <span>מחיר אישית</span>
            <div className="dprice">
              <span className="dprice__shekel">₪</span>
              <input
                inputMode="numeric"
                value={draft.pricePersonal ? String(draft.pricePersonal / 100) : ''}
                placeholder="0"
                onChange={(e) => setPersonal(e.target.value)}
              />
            </div>
          </label>

          <label className="dfield">
            <span>מחיר משפחתית</span>
            <div className="dprice">
              <span className="dprice__shekel">₪</span>
              <input
                inputMode="numeric"
                value={draft.priceFamily ? String(draft.priceFamily / 100) : ''}
                placeholder="0"
                onChange={(e) => setFamily(e.target.value)}
              />
            </div>
          </label>

          <div className="dactive">
            <span className="dfield"><span>מחיר פתיחה (תוספת ראשונה במחיר אישית)</span></span>
            <div className="seg" role="group" aria-label="מחיר פתיחה">
              <button className={draft.starter ? 'is-active seg--paid' : ''} onClick={() => setDraft({ ...draft, starter: true })}>כן</button>
              <button className={!draft.starter ? 'is-active' : ''} onClick={() => setDraft({ ...draft, starter: undefined })}>לא</button>
            </div>
          </div>
        </div>

        <div className="deditor__foot">
          <button className="btn btn--ghost" onClick={onCancel}>ביטול</button>
          <button className="btn btn--send" disabled={!valid} onClick={() => onSave(draft)}>
            שמור תוספת
          </button>
        </div>
      </div>
    </div>
  );
}
