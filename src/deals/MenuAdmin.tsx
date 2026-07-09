import { useState } from 'react';
import type { Product } from '../types';
import { categories, newProductId, products, removeProduct, saveProduct, toppings } from '../lib/menuStore';
import { uploadProductPhoto, removeProductPhoto } from '../lib/photos';
import { shekels } from '../lib/money';
import { DishMedia } from '../components/DishMedia';
import { useConfirm } from '../components/ConfirmDialog';

interface MenuAdminProps {
  editing: Product | null;
  onEdit: (p: Product | null) => void;
}

export function blankProduct(): Product {
  return { id: newProductId(), categoryId: categories[0]?.id ?? '', name: '', basePrice: 0, active: true };
}

/** Pizzas gain the builder defaults; toggling one back strips them. */
function normalize(p: Product): Product {
  if (p.isPizza) return { splitCapable: true, includedToppings: 3, art: [], ...p };
  const rest = { ...p };
  delete rest.isPizza;
  delete rest.splitCapable;
  delete rest.includedToppings;
  delete rest.art;
  return rest;
}

export function MenuAdmin({ editing, onEdit }: MenuAdminProps) {
  // `products` is the store's live binding; bump local state to re-render after mutations.
  const [, setStamp] = useState(0);
  const bump = () => setStamp((n) => n + 1);
  const confirm = useConfirm();

  function toggleActive(p: Product) {
    saveProduct({ ...p, active: p.active === false });
    bump();
  }

  async function del(p: Product) {
    if (!(await confirm({ message: `למחוק את "${p.name || 'ללא שם'}" מהתפריט?`, danger: true, confirmLabel: 'מחק' }))) return;
    removeProduct(p.id);
    if (p.photoUrl) void removeProductPhoto(p.id);
    bump();
  }

  function onSave(p: Product) {
    saveProduct(normalize({ ...p, name: p.name.trim() }));
    onEdit(null);
    bump();
  }

  // A brand-new product isn't in the list yet — its editor opens at the top.
  // Editing an existing one expands that card into a full-width row in place.
  const creating = editing != null && !products.some((p) => p.id === editing.id);

  return (
    <>
      {creating && (
        <ProductEditor key={editing.id} initial={editing} onCancel={() => onEdit(null)} onSave={onSave} />
      )}

      {categories.map((c) => {
        const items = products.filter((p) => p.categoryId === c.id);
        if (items.length === 0) return null;
        return (
          <section key={c.id} className="msec">
            <h2 className="msec__title">{c.name}</h2>
            <div className="dgrid">
              {items.map((p) =>
                editing?.id === p.id ? (
                  <ProductEditor key={p.id} row initial={editing} onCancel={() => onEdit(null)} onSave={onSave} />
                ) : (
                  <div key={p.id} className={`mcard ${p.active === false ? 'is-off' : ''}`}>
                    <div className="mcard__head">
                      <div className="mcard__thumb">
                        <DishMedia product={p} size={64} />
                      </div>
                      <div className="mcard__info">
                        <span className="mcard__name">{p.name}</span>
                        {p.description && <span className="mcard__desc">{p.description}</span>}
                        <span className="mcard__price">
                          {p.variants ? `מ־${shekels(p.variants[0].price)}` : shekels(p.basePrice)}
                        </span>
                      </div>
                      {p.active === false && <span className="mcard__hidden">מוסתר</span>}
                    </div>
                    <div className="dcard__actions mcard__actions">
                      <button className="dcard__edit" onClick={() => onEdit(p)}>עריכה</button>
                      <button className={`dcard__toggle ${p.active !== false ? 'is-on' : ''}`} onClick={() => toggleActive(p)}>
                        {p.active !== false ? 'זמין' : 'מוסתר'}
                      </button>
                      <button className="dcard__del" onClick={() => del(p)} aria-label={`מחק ${p.name}`}>🗑</button>
                    </div>
                  </div>
                ),
              )}
            </div>
          </section>
        );
      })}
    </>
  );
}

interface ProductEditorProps {
  initial: Product;
  onCancel: () => void;
  onSave: (p: Product) => void;
  /** When editing in place, span the full grid row. */
  row?: boolean;
}

function ProductEditor({ initial, onCancel, onSave, row }: ProductEditorProps) {
  const [draft, setDraft] = useState<Product>(initial);
  const [uploading, setUploading] = useState(false);
  const isNew = !initial.name;
  const valid = draft.name.trim().length > 0 && draft.basePrice > 0 && !uploading;

  function setPrice(shekelText: string) {
    const n = Math.max(0, Math.round(Number(shekelText) * 100));
    setDraft((d) => ({ ...d, basePrice: Number.isFinite(n) ? n : 0 }));
  }

  async function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    const url = await uploadProductPhoto(draft.id, file);
    setUploading(false);
    if (url) setDraft((d) => ({ ...d, photoUrl: url }));
    else window.alert('העלאת התמונה נכשלה — נסו שוב');
  }

  async function onRemovePhoto() {
    setDraft((d) => ({ ...d, photoUrl: undefined }));
    void removeProductPhoto(draft.id);
  }

  return (
    // Inline editor — no modal, so the page (not a trapped dialog) scrolls the
    // focused field above the tablet keyboard, and there's no double-scroll.
    <div className={`peditor ${row ? 'peditor--row' : ''}`} role="group" aria-label="עריכת פריט">
      <div className="peditor__head">
        <h2 className="peditor__title">{isNew ? 'פריט חדש' : 'עריכת פריט'}</h2>
        <div className="peditor__actions">
          <button className="btn btn--ghost btn--sm" onClick={onCancel}>ביטול</button>
          <button className="btn btn--send btn--sm" disabled={!valid} onClick={() => onSave(draft)}>
            שמור פריט
          </button>
        </div>
      </div>

      <div className="deditor__body--grid">
          <label className="dfield">
            <span>שם הפריט</span>
            <input type="text" placeholder="לדוגמה: פיצה מרגריטה" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} autoFocus />
          </label>

          <label className="dfield">
            <span>קטגוריה</span>
            <select className="dselect" value={draft.categoryId} onChange={(e) => setDraft({ ...draft, categoryId: e.target.value })}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>

          <label className="dfield">
            <span>{draft.variants ? 'מחיר בסיס (לפריט יש גם גדלים)' : 'מחיר'}</span>
            <div className="dprice">
              <span className="dprice__shekel">₪</span>
              <input
                inputMode="numeric"
                value={draft.basePrice ? String(draft.basePrice / 100) : ''}
                placeholder="0"
                onChange={(e) => setPrice(e.target.value)}
              />
            </div>
          </label>

          <div className="dactive">
            <span className="dfield"><span>סוג</span></span>
            <div className="seg" role="group" aria-label="סוג פריט">
              <button className={draft.isPizza ? 'is-active seg--paid' : ''} onClick={() => setDraft({ ...draft, isPizza: true })}>פיצה 🍕</button>
              <button className={!draft.isPizza ? 'is-active' : ''} onClick={() => setDraft({ ...draft, isPizza: undefined })}>מנה רגילה</button>
            </div>
          </div>

          <label className="dfield">
            <span>תיאור (רשות)</span>
            <input type="text" placeholder="לדוגמה: פטריות, בצל, זיתים" value={draft.description ?? ''} onChange={(e) => setDraft({ ...draft, description: e.target.value || undefined })} />
          </label>

          <div className="dactive">
            <span className="dfield"><span>זמינות</span></span>
            <div className="seg" role="group" aria-label="זמינות פריט">
              <button className={draft.active !== false ? 'is-active seg--paid' : ''} onClick={() => setDraft({ ...draft, active: true })}>זמין</button>
              <button className={draft.active === false ? 'is-active' : ''} onClick={() => setDraft({ ...draft, active: false })}>מוסתר</button>
            </div>
          </div>

          <div className="dfield dfield--full">
            <span>תמונה (רשות)</span>
            <div className="dphoto">
              {draft.photoUrl ? (
                <img className="dphoto__preview" src={draft.photoUrl} alt="" />
              ) : (
                <span className="dphoto__none">ללא תמונה</span>
              )}
              <label className="btn btn--ghost btn--sm dphoto__pick">
                {uploading ? 'מעלה…' : draft.photoUrl ? 'החלפה' : 'העלאת תמונה'}
                <input type="file" accept="image/*" hidden onChange={onPickPhoto} disabled={uploading} />
              </label>
              {draft.photoUrl && !uploading && (
                <button className="btn btn--ghost btn--sm" onClick={onRemovePhoto}>הסרה</button>
              )}
            </div>
          </div>

          {draft.isPizza && (
            <label className="dfield dfield--full">
              <span>תוספות בבסיס (מה כלול בפיצה כברירת מחדל)</span>
              <select
                multiple
                className="dselect dselect--multi"
                size={Math.min(5, Math.max(4, toppings.length))}
                value={draft.art ?? []}
                onChange={(e) => {
                  const ids = Array.from(e.target.selectedOptions).map((o) => o.value);
                  setDraft({ ...draft, art: ids });
                }}
              >
                {toppings.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </label>
          )}
      </div>
    </div>
  );
}
