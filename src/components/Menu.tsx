import { useState, useSyncExternalStore } from 'react';
import type { Product, Variant } from '../types';
import { activeProducts, categories, menuVersion, subscribeMenu } from '../lib/menuStore';
import { shekels } from '../lib/money';
import { DishMedia } from './DishMedia';

interface MenuProps {
  onAddProduct: (product: Product, variant?: Variant) => void;
  onOpenBuilder: (product: Product) => void;
}

export function Menu({ onAddProduct, onOpenBuilder }: MenuProps) {
  const [pickedCat, setActiveCat] = useState<string | null>(null);
  const [variantFor, setVariantFor] = useState<Product | null>(null);

  // Re-render when the owner edits the menu (another tab's /deals admin). The
  // catalog loads async, so the active tab is derived: the picked one if it
  // still exists, else the first category once data lands.
  useSyncExternalStore(subscribeMenu, menuVersion);
  const activeCat =
    pickedCat && categories.some((c) => c.id === pickedCat) ? pickedCat : (categories[0]?.id ?? '');
  const visible = activeProducts().filter((p) => p.categoryId === activeCat);

  // Whole card → builder (pizzas) / popover (sized) / add (simple).
  function handleTap(product: Product) {
    if (product.isPizza) onOpenBuilder(product);
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
        {categories.map((c) => (
          <button
            key={c.id}
            className={`cat ${c.id === activeCat ? 'is-active' : ''}`}
            onClick={() => setActiveCat(c.id)}
          >
            {c.name}
          </button>
        ))}
      </nav>

      <div className="grid" key={activeCat}>
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
              <DishMedia product={p} size={140} />
              {p.isPizza && <span className="item__tag">בנייה</span>}
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
            <span className="item__name">{p.name}</span>
            {p.description && <span className="item__desc">{p.description}</span>}
            <span className="item__price">
              {p.variants ? `מ־${shekels(p.variants[0].price)}` : shekels(p.basePrice)}
            </span>
          </div>
        ))}
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
}
