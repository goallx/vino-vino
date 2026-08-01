import { memo, useMemo, useState, useSyncExternalStore } from 'react';
import type { Bundle, Product, Variant } from '../types';
import { activeProducts, categories, menuVersion, productsById, subscribeMenu } from '../lib/menuStore';
import { bundleSaving, bundlesVersion, listActiveBundles, subscribeBundles } from '../lib/bundles';
import { shekels } from '../lib/money';
import { DishMedia } from './DishMedia';

interface MenuProps {
  onAddProduct: (product: Product, variant?: Variant) => void;
  onOpenBuilder: (product: Product) => void;
  onAddBundle: (bundle: Bundle) => void;
}

export const Menu = memo(function Menu({ onAddProduct, onOpenBuilder, onAddBundle }: MenuProps) {
  const [pickedCat, setActiveCat] = useState<string | null>(null);
  const [variantFor, setVariantFor] = useState<Product | null>(null);

  // Re-render when the owner edits the menu or deals (another tab's /deals admin).
  // The catalog loads async, so the active tab is derived: the picked one if it
  // still exists, else the first category once data lands.
  const version = useSyncExternalStore(subscribeMenu, menuVersion);
  const bundleVersion = useSyncExternalStore(subscribeBundles, bundlesVersion, bundlesVersion);
  const bundles = useMemo(() => listActiveBundles(), [bundleVersion]);
  const activeCat =
    pickedCat && categories.some((c) => c.id === pickedCat)
      ? pickedCat
      : (categories[0]?.id ?? '');
  const visible = useMemo(
    () => activeProducts().filter((p) => p.categoryId === activeCat),
    [activeCat, version],
  );

  // Whole card → builder (pizzas / salads) / popover (sized) / add (simple).
  function handleTap(product: Product) {
    if (product.isPizza || product.categoryId === 'salads') onOpenBuilder(product);
    else if (product.variants && product.variants.length) setVariantFor(product);
    else onAddProduct(product);
  }

  // "+" icon → quick add, skipping the builder for pizzas (uses default toppings).
  function quickAdd(product: Product) {
    if (product.variants && product.variants.length) setVariantFor(product); // size still required
    else onAddProduct(product);
  }

  return (
    <section className="menu" aria-label="תפריט">
      <nav className="cats" aria-label="קטגוריות">
        <div className="cats__scroll">
          {categories.map((c) => (
            <button
              key={c.id}
              className={`cat ${c.id === activeCat ? 'is-active' : ''}`}
              onClick={() => setActiveCat(c.id)}
            >
              {c.name}
            </button>
          ))}
        </div>
      </nav>

      <div className="menuscroll" key={activeCat}>
        {bundles.length > 0 && (
          <>
            <div className="secttl secttl--deal"><span>מבצעים</span><i /></div>
            <div className="dealrail">
              {bundles.map((b) => {
                const saving = bundleSaving(b);
                const items = b.items
                  .map((it) => `${it.qty}× ${productsById[it.productId]?.name ?? '—'}`)
                  .join(' + ');
                return (
                  <button key={b.id} className="dealcard" onClick={() => onAddBundle(b)}>
                    <span className="dealcard__badge">{b.freeToppings ? `${b.freeToppings} תוספות חינם לכל פיצה` : 'מבצע'}</span>
                    <span className="dealcard__name">{b.name}</span>
                    {items && <span className="dealcard__items">{items}</span>}
                    <span className="dealcard__foot">
                      <span className="dealcard__price">{shekels(b.price)}</span>
                      {saving > 0 && <span className="dealcard__was">{shekels(b.price + saving)}</span>}
                      {saving > 0 && <span className="dealcard__save">חוסך {shekels(saving)}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}
        <div className="secttl"><span>{categories.find((c) => c.id === activeCat)?.name ?? ''}</span><i /></div>
        <div className="grid">
        {visible.map((p) => (
          <div
            key={p.id}
            className="item"
            role="button"
            tabIndex={0}
            onClick={() => handleTap(p)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleTap(p);
              }
            }}
          >
            <div className="item__media">
              <DishMedia product={p} size={64} />
              {p.isPizza && <span className="item__tag">בנייה</span>}
            </div>
            <div className="item__body">
              <span className="item__name">{p.name}</span>
              {p.description && <span className="item__desc">{p.description}</span>}
              <div className="item__foot">
                <span className="item__price">
                  {p.variants ? shekels(p.variants[0].price) : shekels(p.basePrice)}
                </span>
                {p.variants && <span className="item__size">ומעלה</span>}
                <button
                  className="item__add"
                  aria-label={`הוסף ${p.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    quickAdd(p);
                  }}
                >
                  +
                </button>
              </div>
            </div>
          </div>
        ))}
        </div>
      </div>

      {variantFor && (
        <div className="popover-scrim" onClick={() => setVariantFor(null)}>
          <div
            className="popover"
            role="dialog"
            aria-label="בחרו גודל"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="popover__title">{variantFor.name} · בחרו גודל</p>
            <div className="popover__opts">
              {variantFor.variants!.map((v) => (
                <button
                  key={v.id}
                  className="chip chip--lg"
                  onClick={() => {
                    onAddProduct(variantFor, v);
                    setVariantFor(null);
                  }}
                >
                  <span>{v.label}</span>
                  <span className="chip__price">{shekels(v.price)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
});
