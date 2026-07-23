import { useMemo, useRef, useState } from 'react';
import type { CartLine, LinePart, Product, ToppingSel } from '../types';
import { toppingsById } from '../lib/menuStore';
import { computeUnitPrice, newLineId, toppingPrice } from '../lib/cart';
import { shekels } from '../lib/money';
import { ToppingIcon } from './toppings';

interface BuilderProps {
  product: Product;
  editing?: CartLine;
  onCancel: () => void;
  onConfirm: (line: CartLine) => void;
}

// Every salad shares the same removable base; the chef leaves salads unseasoned
// unless asked. Both are kitchen instructions only — they never change the price.
const SALAD_BASE = [
  { id: 'base_lettuce', name: 'חסה' },
  { id: 'base_tomato', name: 'עגבניה' },
  { id: 'base_cucumber', name: 'מלפפון' },
] as const;
const SEASONING_ID = 'seasoning';

function toggle(set: Set<string>, id: string): Set<string> {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export function SaladBuilder({ product, editing, onCancel, onConfirm }: BuilderProps) {
  // The salad's own toppings (its `art`) are what can be added as paid extras,
  // each at the personal/half-pizza topping price.
  const extrasList = useMemo(
    () => (product.art ?? []).map((id) => toppingsById[id]).filter(Boolean),
    [product.art],
  );

  const editToppings = editing?.parts[0]?.toppings ?? [];
  const [removed, setRemoved] = useState<Set<string>>(
    () => new Set(editToppings.filter((t) => t.action === 'remove').map((t) => t.toppingId)),
  );
  const [seasoned, setSeasoned] = useState(
    () => editToppings.some((t) => t.action === 'add' && t.toppingId === SEASONING_ID),
  );
  const [chosen, setChosen] = useState<Set<string>>(
    () => new Set(editToppings.filter((t) => t.action === 'add' && t.toppingId !== SEASONING_ID).map((t) => t.toppingId)),
  );

  const [note, setNote] = useState(editing?.note ?? '');
  const [noteOpen, setNoteOpen] = useState(!!editing?.note?.trim());
  const noteRef = useRef<HTMLTextAreaElement>(null);
  function openNote() {
    setNoteOpen(true);
    setTimeout(() => noteRef.current?.focus(), 0);
  }

  // "without" and "extra" on the same ingredient are mutually exclusive.
  function without(id: string) {
    setChosen((s) => (s.has(id) ? toggle(s, id) : s));
    setRemoved((s) => toggle(s, id));
  }
  function extra(id: string) {
    setRemoved((s) => (s.has(id) ? toggle(s, id) : s));
    setChosen((s) => toggle(s, id));
  }

  const draft = useMemo<CartLine>(() => {
    const toppings: ToppingSel[] = [
      // removals (free): base veg + any of the salad's own ingredients marked "without"
      ...SALAD_BASE.filter((b) => removed.has(b.id)).map((b) => ({
        toppingId: b.id,
        name: b.name,
        action: 'remove' as const,
        price: 0,
      })),
      ...extrasList.filter((t) => removed.has(t.id)).map((t) => ({
        toppingId: t.id,
        name: t.name,
        action: 'remove' as const,
        price: 0,
      })),
      ...(seasoned ? [{ toppingId: SEASONING_ID, name: 'תיבול', action: 'add' as const, price: 0 }] : []),
      // extras (paid): more of the salad's own ingredients
      ...extrasList
        .filter((t) => chosen.has(t.id))
        .map((t) => ({
          toppingId: t.id,
          name: t.name,
          action: 'add' as const,
          price: toppingPrice(t, 'personal'),
        })),
    ];
    const part: LinePart = { target: 'whole', baseProductId: product.id, baseName: product.name, toppings };
    const line: CartLine = {
      id: editing?.id ?? newLineId(),
      productId: product.id,
      name: product.name,
      qty: editing?.qty ?? 1,
      unitPrice: 0,
      isSplit: false,
      parts: [part],
      note: note.trim() || undefined,
      bundleUid: editing?.bundleUid,
    };
    line.unitPrice = computeUnitPrice(line);
    return line;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [removed, seasoned, chosen, note, extrasList]);

  return (
    <div className="scrim" onClick={onCancel}>
      <div
        className="builder"
        role="dialog"
        aria-label={`עריכת ${product.name}`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="builder__head">
          <div>
            <p className="builder__eyebrow">סלט</p>
            <h2 className="builder__title">{product.name}</h2>
          </div>
          {!noteOpen && (
            <button type="button" className="note-chip" onClick={openNote}>
              <span className="note-chip__plus">＋</span> הערה
            </button>
          )}
        </header>

        {noteOpen && (
          <div className="note-field">
            <textarea
              ref={noteRef}
              className="note-input"
              placeholder="הערה למטבח — פחות רוטב, בצד…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
            />
            <button type="button" className="note-close" aria-label="סגירת הערה" onClick={() => setNoteOpen(false)}>×</button>
          </div>
        )}

        <div className="saladbody">
          <p className="picker__caption">בסיס ותיבול</p>
          <div className="saladgrid" role="group" aria-label="בסיס ותיבול">
            {SALAD_BASE.map((b) => {
              const off = removed.has(b.id);
              return (
                <button
                  key={b.id}
                  type="button"
                  aria-pressed={off}
                  className={`saladtoggle saladtoggle--remove ${off ? 'is-on' : ''}`}
                  onClick={() => without(b.id)}
                >
                  <span className="saladtoggle__label">בלי {b.name}</span>
                  <span className="saladtoggle__mark">{off ? '✓' : ''}</span>
                </button>
              );
            })}
            <button
              type="button"
              aria-pressed={seasoned}
              className={`saladtoggle saladtoggle--season ${seasoned ? 'is-on' : ''}`}
              onClick={() => setSeasoned((v) => !v)}
            >
              <span className="saladtoggle__label">עם תיבול</span>
              <span className="saladtoggle__mark">{seasoned ? '✓' : ''}</span>
            </button>
          </div>

          {extrasList.length > 0 && (
            <>
              <p className="picker__caption">מרכיבי הסלט</p>
              <div className="ingrlist" role="list">
                {extrasList.map((t) => {
                  const isOut = removed.has(t.id);
                  const isExtra = chosen.has(t.id);
                  return (
                    <div key={t.id} role="listitem" className={`saladingr ${isOut ? 'is-out' : ''}`}>
                      <span className="saladingr__icon"><ToppingIcon id={t.id} size={22} /></span>
                      <span className="saladingr__name">{t.name}</span>
                      <div className="saladingr__actions">
                        <button
                          type="button"
                          aria-label={`בלי ${t.name}`}
                          aria-pressed={isOut}
                          className={`ingrbtn ingrbtn--remove ${isOut ? 'is-on' : ''}`}
                          onClick={() => without(t.id)}
                        >
                          בלי
                        </button>
                        <button
                          type="button"
                          aria-label={`תוספת ${t.name}`}
                          aria-pressed={isExtra}
                          className={`ingrbtn ingrbtn--extra ${isExtra ? 'is-on' : ''}`}
                          onClick={() => extra(t.id)}
                        >
                          תוספת +{shekels(toppingPrice(t, 'personal'))}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <footer className="builder__foot">
          <button className="btn btn--ghost" onClick={onCancel}>ביטול</button>
          <button className="btn btn--add" onClick={() => onConfirm(draft)}>
            {editing ? 'עדכן' : 'הוסף להזמנה'} · {shekels(draft.unitPrice)}
          </button>
        </footer>
      </div>
    </div>
  );
}
