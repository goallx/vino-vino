import { useMemo, useState } from 'react';
import type { CartLine, LinePart, Product, Target, ToppingSel } from '../types';
import { pizzaProducts, productsById, toppings, toppingsById } from '../lib/menuStore';
import { computeUnitPrice, newLineId } from '../lib/cart';
import { shekels } from '../lib/money';
import { PizzaArt } from './PizzaArt';
import { ToppingIcon } from './toppings';

interface BuilderProps {
  product: Product;
  editing?: CartLine;
  onCancel: () => void;
  onConfirm: (line: CartLine) => void;
}

// `selected` holds the FULL set of toppings on the pizza, initialised to the
// base pizza's standard toppings — so the list always matches the illustration.
// `extra` is the subset served double (כפול), billed as a second portion.
interface HalfState {
  baseProductId: string;
  selected: string[];
  extra: string[];
}

const artOf = (pid: string) => productsById[pid]?.art ?? [];

function halfFromPart(part: LinePart | undefined, fallbackBase: string): HalfState {
  const base = part?.baseProductId ?? fallbackBase;
  const defaults = artOf(base);
  if (!part) return { baseProductId: base, selected: [...defaults], extra: [] };
  const removed = new Set(part.toppings.filter((t) => t.action === 'remove').map((t) => t.toppingId));
  const selected = [...defaults.filter((id) => !removed.has(id))];
  const extra: string[] = [];
  for (const t of part.toppings) {
    if (t.action !== 'add') continue;
    if (!selected.includes(t.toppingId)) selected.push(t.toppingId);
    if ((t.qty ?? 1) > 1 && !extra.includes(t.toppingId)) extra.push(t.toppingId);
  }
  return { baseProductId: base, selected, extra };
}

/** Diff a part's current toppings against its base defaults → add/remove ops. */
function partToppings(base: string, selected: string[], extra: string[]): ToppingSel[] {
  const defaults = artOf(base);
  const adds = selected
    .filter((id) => (!defaults.includes(id) || extra.includes(id)) && toppingsById[id])
    .map((id) => ({
      toppingId: id,
      name: toppingsById[id].name,
      action: 'add' as const,
      price: toppingsById[id].price,
      // A doubled base topping bills only its extra portion (qty 1); a doubled
      // non-base topping bills both portions (qty 2).
      qty: extra.includes(id) ? (defaults.includes(id) ? 1 : 2) : 1,
    }));
  const removed = defaults
    .filter((id) => !selected.includes(id) && toppingsById[id])
    .map((id) => ({ toppingId: id, name: toppingsById[id].name, action: 'remove' as const, price: 0 }));
  return [...adds, ...removed];
}

export function PizzaBuilder({ product, editing, onCancel, onConfirm }: BuilderProps) {
  const included = product.includedToppings ?? 3;
  const [isSplit, setSplit] = useState(editing?.isSplit ?? false);
  const [activeHalf, setActiveHalf] = useState<'half_1' | 'half_2'>('half_1');
  const [note, setNote] = useState(editing?.note ?? '');

  const [whole, setWhole] = useState<HalfState>(() => halfFromPart(editing?.parts.find((p) => p.target === 'whole'), product.id));
  const [h1, setH1] = useState<HalfState>(() => halfFromPart(editing?.parts.find((p) => p.target === 'half_1'), product.id));
  const [h2, setH2] = useState<HalfState>(() => halfFromPart(editing?.parts.find((p) => p.target === 'half_2'), product.id));

  const active = !isSplit ? whole : activeHalf === 'half_1' ? h1 : h2;
  const setActive = !isSplit ? setWhole : activeHalf === 'half_1' ? setH1 : setH2;

  // Cycle a topping: off → on (×1) → extra (×2, כפול) → off.
  function cycleTopping(id: string) {
    const on = active.selected.includes(id);
    const isExtra = active.extra.includes(id);
    if (!on) {
      setActive({ ...active, selected: [...active.selected, id] });
    } else if (!isExtra) {
      setActive({ ...active, extra: [...active.extra, id] });
    } else {
      setActive({ ...active, selected: active.selected.filter((t) => t !== id), extra: active.extra.filter((t) => t !== id) });
    }
  }

  function chooseBase(id: string) {
    setActive({ baseProductId: id, selected: [...artOf(id)], extra: [] });
  }

  // toppings that are extras (not part of the base) — these are what gets charged.
  // The base toppings are already in the price, so they consume the free
  // allowance first: only `included − baseCount` further toppings stay free.
  const defaults = artOf(active.baseProductId);
  const freeExtra = Math.max(0, included - defaults.length);
  const extras = active.selected.filter((id) => !defaults.includes(id));
  const usedExtra = Math.max(0, extras.length - freeExtra);

  function buildParts(): LinePart[] {
    const part = (state: HalfState, target: Target): LinePart => {
      const base = pizzaProducts.find((p) => p.id === state.baseProductId) ?? product;
      return { target, baseProductId: base.id, baseName: base.name, toppings: partToppings(base.id, state.selected, state.extra) };
    };
    return isSplit ? [part(h1, 'half_1'), part(h2, 'half_2')] : [part(whole, 'whole')];
  }

  const draft: CartLine = useMemo(() => {
    const line: CartLine = {
      id: editing?.id ?? newLineId(),
      productId: product.id,
      name: product.name,
      qty: editing?.qty ?? 1,
      unitPrice: 0,
      isSplit,
      variantLabel: editing?.variantLabel,
      parts: buildParts(),
      note: note.trim() || undefined,
    };
    line.unitPrice = computeUnitPrice(line);
    return line;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSplit, whole, h1, h2, note]);

  return (
    <div className="scrim" onClick={onCancel}>
      <div
        className="builder builder--wide"
        role="dialog"
        aria-label={`בניית ${product.name}`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="builder__head">
          <div>
            <p className="builder__eyebrow">בנייה</p>
            <h2 className="builder__title">{product.name}</h2>
          </div>
          <div className="layout-toggle" role="tablist" aria-label="פריסה">
            <button role="tab" aria-selected={!isSplit} className={!isSplit ? 'is-active' : ''} onClick={() => setSplit(false)}>מגש שלם</button>
            <button role="tab" aria-selected={isSplit} className={isSplit ? 'is-active' : ''} onClick={() => setSplit(true)}>חצי / חצי</button>
          </div>
        </header>

        <div className="builder__body">
          <div className="builder__stage">
            <PizzaArt
              split={isSplit}
              whole={whole.selected}
              left={h1.selected}
              right={h2.selected}
              focus={isSplit ? activeHalf : undefined}
              size={280}
            />
            <input className="note-input" placeholder="הערה (בלי בצל, דק…)" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

          <div className="builder__picker">
            {isSplit && (
              <div className="seg seg--halves" role="tablist" aria-label="בחירת חצי">
                <button role="tab" aria-selected={activeHalf === 'half_1'} className={activeHalf === 'half_1' ? 'is-active' : ''} onClick={() => setActiveHalf('half_1')}>חצי 1</button>
                <button role="tab" aria-selected={activeHalf === 'half_2'} className={activeHalf === 'half_2' ? 'is-active' : ''} onClick={() => setActiveHalf('half_2')}>חצי 2</button>
              </div>
            )}

            {isSplit && (
              <>
                <p className="picker__caption">בסיס {activeHalf === 'half_1' ? 'לחצי 1' : 'לחצי 2'}</p>
                <div className="basepicker" role="listbox" aria-label="בסיס">
                  {pizzaProducts.map((p) => (
                    <button
                      key={p.id}
                      role="option"
                      aria-selected={active.baseProductId === p.id}
                      className={`basecard ${active.baseProductId === p.id ? 'is-active' : ''}`}
                      onClick={() => chooseBase(p.id)}
                    >
                      <PizzaArt whole={artOf(p.id)} size={46} />
                      <span>{p.name}</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            <p className="picker__caption">תוספות</p>
            <div className="toplist" role="list">
              {toppings.map((t) => {
                const on = active.selected.includes(t.id);
                const isExtra = active.extra.includes(t.id);
                const isDefault = defaults.includes(t.id);
                const extraIdx = extras.indexOf(t.id);
                const charged = (on && !isDefault && extraIdx >= freeExtra) || isExtra;
                return (
                  <button
                    key={t.id}
                    role="listitem"
                    className={`toprow ${on ? 'is-on' : ''} ${isExtra ? 'is-extra' : ''}`}
                    onClick={() => cycleTopping(t.id)}
                  >
                    <span className="toprow__icon"><ToppingIcon id={t.id} size={22} /></span>
                    <span className="toprow__name">
                      {t.name}
                      {isExtra && <span className="toprow__x2"> · כפול</span>}
                      {isDefault && on && !isExtra && <span className="toprow__base"> · בסיס</span>}
                    </span>
                    {charged && <span className="toprow__price">+{shekels(t.price)}</span>}
                    <span className="toprow__check">{isExtra ? '×2' : on ? '✓' : '+'}</span>
                  </button>
                );
              })}
            </div>

            <p className="picker__hint">
              {freeExtra > 0
                ? `${freeExtra} תוספות נוספות כלולות${usedExtra > 0 ? ` · ${usedExtra} בתשלום` : ''}`
                : usedExtra > 0
                  ? `${usedExtra} תוספות בתשלום`
                  : 'כל תוספת נוספת בתשלום'}
            </p>
            <p className="picker__tip">הקשה נוספת על תוספת = כפול ×2</p>
          </div>
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
