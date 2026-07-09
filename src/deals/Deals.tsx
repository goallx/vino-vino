import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Bundle, Product, Topping } from '../types';
import { categories, products, productsById } from '../lib/menuStore';
import { shekels } from '../lib/money';
import { Wordmark } from '../components/Wordmark';
import { bundleGross, bundleSaving, loadBundles, newBundleId, removeBundle, saveBundle, subscribeBundles } from '../lib/bundles';
import { blankProduct, MenuAdmin } from './MenuAdmin';
import { blankTopping, ToppingsAdmin } from './ToppingsAdmin';
import { useConfirm } from '../components/ConfirmDialog';

type Tab = 'deals' | 'menu' | 'toppings';

function blankBundle(): Bundle {
  return { id: newBundleId(), name: '', items: [], price: 0, active: true };
}

export function Deals() {
  // /menu deep-links straight to the menu tab (same admin page).
  const [tab, setTab] = useState<Tab>(() => (window.location.pathname.startsWith('/menu') ? 'menu' : 'deals'));
  const [bundles, setBundles] = useState<Bundle[]>(() => loadBundles());
  const [editing, setEditing] = useState<Bundle | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editingTopping, setEditingTopping] = useState<Topping | null>(null);
  const confirm = useConfirm();

  // The store may refresh from the DB after mount (or another device edits).
  useEffect(() => subscribeBundles(() => setBundles(loadBundles())), []);

  function persist(next: Bundle[]) {
    setBundles([...next].sort((a, b) => Number(b.active) - Number(a.active)));
  }

  function toggleActive(b: Bundle) {
    persist(saveBundle({ ...b, active: !b.active }));
  }

  async function del(b: Bundle) {
    if (!(await confirm({ message: `למחוק את המבצע "${b.name || 'ללא שם'}"?`, danger: true, confirmLabel: 'מחק' }))) return;
    persist(removeBundle(b.id));
  }

  function onSave(b: Bundle) {
    persist(saveBundle(b));
    setEditing(null);
  }

  return (
    <div className="deals">
      <header className="dtop">
        <Wordmark className="dtop__brand" />
        <div className="dtabs" role="tablist" aria-label="ניהול">
          <button role="tab" aria-selected={tab === 'deals'} className={tab === 'deals' ? 'is-active' : ''} onClick={() => setTab('deals')}>מבצעים</button>
          <button role="tab" aria-selected={tab === 'menu'} className={tab === 'menu' ? 'is-active' : ''} onClick={() => setTab('menu')}>תפריט</button>
          <button role="tab" aria-selected={tab === 'toppings'} className={tab === 'toppings' ? 'is-active' : ''} onClick={() => setTab('toppings')}>תוספות</button>
        </div>
        <nav className="dtop__nav">
          {tab === 'deals' ? (
            <button className="dtop__new" onClick={() => setEditing(blankBundle())}>+ מבצע חדש</button>
          ) : tab === 'menu' ? (
            <button className="dtop__new" onClick={() => setEditingProduct(blankProduct())}>+ פריט חדש</button>
          ) : (
            <button className="dtop__new" onClick={() => setEditingTopping(blankTopping())}>+ תוספת חדשה</button>
          )}
          <a href="/">קבלת הזמנות ←</a>
          <a href="/reports">דוח יומי ←</a>
        </nav>
      </header>

      <main className="dbody">
        {tab === 'menu' ? (
          <MenuAdmin editing={editingProduct} onEdit={setEditingProduct} />
        ) : tab === 'toppings' ? (
          <ToppingsAdmin editing={editingTopping} onEdit={setEditingTopping} />
        ) : bundles.length === 0 ? (
          <div className="dempty">
            <p>עדיין אין מבצעים. צרו מבצע כדי שיופיע במסך קבלת ההזמנות.</p>
            <button className="btn btn--add" onClick={() => setEditing(blankBundle())}>+ מבצע חדש</button>
          </div>
        ) : (
          <div className="dgrid">
            {bundles.map((b) => {
              const saving = bundleSaving(b);
              const items = b.items.map((it) => `${it.qty}× ${productsById[it.productId]?.name ?? '—'}`).join(' + ');
              return (
                <div key={b.id} className={`coupon dcard ${b.active ? '' : 'is-off'}`}>
                  <span className="coupon__perf" aria-hidden="true" />
                  <span className="coupon__name">{b.name || 'ללא שם'}</span>
                  <span className="coupon__items">{items || 'ללא פריטים'}</span>
                  <span className="coupon__foot">
                    {saving > 0 && <span className="coupon__was">{shekels(bundleGross(b))}</span>}
                    <span className="coupon__price">{shekels(b.price)}</span>
                  </span>
                  <div className="dcard__actions">
                    <button className="dcard__edit" onClick={() => setEditing(b)}>עריכה</button>
                    <button className={`dcard__toggle ${b.active ? 'is-on' : ''}`} onClick={() => toggleActive(b)}>
                      {b.active ? 'פעיל' : 'כבוי'}
                    </button>
                    <button className="dcard__del" onClick={() => del(b)} aria-label="מחק מבצע">🗑</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      <AnimatePresence>
        {editing && <Editor key="editor" initial={editing} onCancel={() => setEditing(null)} onSave={onSave} />}
      </AnimatePresence>
    </div>
  );
}

interface EditorProps {
  initial: Bundle;
  onCancel: () => void;
  onSave: (b: Bundle) => void;
}

function Editor({ initial, onCancel, onSave }: EditorProps) {
  const [draft, setDraft] = useState<Bundle>(initial);
  const gross = bundleGross(draft);
  const saving = bundleSaving(draft);
  const valid = draft.name.trim().length > 0 && draft.items.length > 0 && draft.price > 0;

  function addItem(productId: string) {
    setDraft((d) => {
      const existing = d.items.find((it) => it.productId === productId);
      const items = existing
        ? d.items.map((it) => (it.productId === productId ? { ...it, qty: it.qty + 1 } : it))
        : [...d.items, { productId, qty: 1 }];
      return { ...d, items };
    });
  }

  function setQty(productId: string, qty: number) {
    setDraft((d) => ({
      ...d,
      items: qty <= 0 ? d.items.filter((it) => it.productId !== productId) : d.items.map((it) => (it.productId === productId ? { ...it, qty } : it)),
    }));
  }

  function setPrice(shekelText: string) {
    const n = Math.max(0, Math.round(Number(shekelText) * 100));
    setDraft((d) => ({ ...d, price: Number.isFinite(n) ? n : 0 }));
  }

  return (
    <motion.div className="scrim" onClick={onCancel} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
      <motion.div
        className="deditor"
        role="dialog"
        aria-label="עריכת מבצע"
        onClick={(e) => e.stopPropagation()}
        initial={{ scale: 0.94, opacity: 0, y: 12 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.94, opacity: 0, y: 12 }}
        transition={{ type: 'spring', stiffness: 360, damping: 28 }}
      >
        <div className="deditor__head">
          <h2 className="deditor__title">{initial.name ? 'עריכת מבצע' : 'מבצע חדש'}</h2>
          <button className="btn btn--ghost btn--sm" onClick={onCancel}>סגור</button>
        </div>

        <div className="deditor__body">
          <label className="dfield">
            <span>שם המבצע</span>
            <input type="text" placeholder="לדוגמה: זוג משפחתיות" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} autoFocus />
          </label>

          <div className="dfield">
            <span>פריטים במבצע</span>
            <div className="ditems">
              {draft.items.length === 0 && <p className="ditems__empty">הוסיפו פריטים מהרשימה למטה.</p>}
              {draft.items.map((it) => (
                <div key={it.productId} className="ditem">
                  <span className="ditem__name">{productsById[it.productId]?.name ?? it.productId}</span>
                  <div className="stepper">
                    <button onClick={() => setQty(it.productId, it.qty - 1)} aria-label="הפחת">−</button>
                    <span>{it.qty}</span>
                    <button onClick={() => setQty(it.productId, it.qty + 1)} aria-label="הוסף">+</button>
                  </div>
                  <button className="ditem__x" onClick={() => setQty(it.productId, 0)} aria-label="הסר פריט">✕</button>
                </div>
              ))}
            </div>
            <div className="dadd">
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value) addItem(e.target.value);
                  e.target.value = '';
                }}
              >
                <option value="">+ הוסיפו פריט…</option>
                {categories.map((c) => (
                  <optgroup key={c.id} label={c.name}>
                    {products
                      .filter((p) => p.categoryId === c.id)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} · {shekels(p.basePrice)}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
            </div>
          </div>

          <label className="dfield">
            <span>מחיר המבצע</span>
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

          <div className={`dsaving ${saving > 0 ? '' : 'dsaving--none'}`}>
            <span>מחיר רגיל</span>
            <span className="dsaving__was">{shekels(gross)}</span>
            <span className="dsaving__amount">{saving > 0 ? `חיסכון ${shekels(saving)}` : 'אין חיסכון'}</span>
          </div>

          <div className="dactive">
            <span className="dfield"><span>סטטוס</span></span>
            <div className="seg" role="group" aria-label="סטטוס מבצע">
              <button className={draft.active ? 'is-active seg--paid' : ''} onClick={() => setDraft({ ...draft, active: true })}>פעיל</button>
              <button className={!draft.active ? 'is-active' : ''} onClick={() => setDraft({ ...draft, active: false })}>כבוי</button>
            </div>
          </div>
        </div>

        <div className="deditor__foot">
          <button className="btn btn--ghost" onClick={onCancel}>ביטול</button>
          <button className="btn btn--send" disabled={!valid} onClick={() => onSave({ ...draft, name: draft.name.trim() })}>
            שמור מבצע
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
