import { useState, useSyncExternalStore } from 'react';
import { AnimatePresence, motion, type Variants } from 'framer-motion';
import type { Bundle, Product, Variant } from '../types';
import { activeProducts, categories, menuVersion, productsById, subscribeMenu } from '../lib/menuStore';
import { shekels } from '../lib/money';
import { bundleGross, bundleSaving, bundlesVersion, listActiveBundles, subscribeBundles } from '../lib/bundles';
import { DishMedia } from './DishMedia';

interface MenuProps {
  onAddProduct: (product: Product, variant?: Variant) => void;
  onOpenBuilder: (product: Product) => void;
  onApplyBundle: (bundle: Bundle) => void;
}

const DEALS_CAT = 'deals';

const grid: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.025 } } };
const card: Variants = {
  hidden: { opacity: 0, y: 12, scale: 0.97 },
  show: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 420, damping: 30 } },
};

export function Menu({ onAddProduct, onOpenBuilder, onApplyBundle }: MenuProps) {
  // Bundles are owner-managed in /deals; re-read when the store changes.
  useSyncExternalStore(subscribeBundles, bundlesVersion);
  const bundles = listActiveBundles();
  const cats = bundles.length > 0 ? [{ id: DEALS_CAT, name: 'מבצעים' }, ...categories] : categories;

  // The deals tab leads the list for prominence, but pizzas stay the default
  // view. The catalog loads async, so the active tab is derived: the picked
  // one if it still exists, else the first real category once data lands.
  const [pickedCat, setActiveCat] = useState<string | null>(null);
  const [variantFor, setVariantFor] = useState<Product | null>(null);

  // Re-render when the owner edits the menu (another tab's /deals admin).
  useSyncExternalStore(subscribeMenu, menuVersion);
  const activeCat =
    pickedCat && cats.some((c) => c.id === pickedCat) ? pickedCat : (categories[0]?.id ?? '');
  const onDeals = activeCat === DEALS_CAT;
  const visible = onDeals ? [] : activeProducts().filter((p) => p.categoryId === activeCat);

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
        {cats.map((c) => (
          <motion.button
            key={c.id}
            className={`cat ${c.id === DEALS_CAT ? 'cat--deals' : ''} ${c.id === activeCat ? 'is-active' : ''}`}
            onClick={() => setActiveCat(c.id)}
            whileTap={{ scale: 0.94 }}
          >
            {c.id === DEALS_CAT && <span aria-hidden="true">★ </span>}
            {c.name}
          </motion.button>
        ))}
      </nav>

      <motion.div className={`grid ${onDeals ? 'grid--deals' : ''}`} key={activeCat} variants={grid} initial="hidden" animate="show">
        {onDeals &&
          bundles.map((b) => {
            const saving = bundleSaving(b);
            const items = b.items
              .map((it) => `${it.qty}× ${productsById[it.productId]?.name ?? '—'}`)
              .join(' + ');
            return (
              <motion.button
                key={b.id}
                className="coupon"
                onClick={() => onApplyBundle(b)}
                variants={card}
                whileHover={{ y: -4 }}
                whileTap={{ scale: 0.97 }}
              >
                <span className="coupon__perf" aria-hidden="true" />
                <span className="coupon__name">{b.name}</span>
                <span className="coupon__items">{items}</span>
                <span className="coupon__foot">
                  {saving > 0 && <span className="coupon__was">{shekels(bundleGross(b))}</span>}
                  <span className="coupon__price">{shekels(b.price)}</span>
                </span>
              </motion.button>
            );
          })}
        {visible.map((p) => (
          <motion.div
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
            variants={card}
            whileHover={{ y: -4 }}
            whileTap={{ scale: 0.97 }}
          >
            <div className="item__media">
              <DishMedia product={p} size={140} />
              {p.isPizza && <span className="item__tag">בנייה</span>}
              <motion.button
                className="item__add"
                aria-label={`הוסף ${p.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  quickAdd(p);
                }}
                whileTap={{ scale: 0.85 }}
              >
                +
              </motion.button>
            </div>
            <span className="item__name">{p.name}</span>
            {p.description && <span className="item__desc">{p.description}</span>}
            <span className="item__price">
              {p.variants ? `מ־${shekels(p.variants[0].price)}` : shekels(p.basePrice)}
            </span>
          </motion.div>
        ))}
      </motion.div>

      <AnimatePresence>
        {variantFor && (
          <motion.div
            className="popover-scrim"
            onClick={() => setVariantFor(null)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <motion.div
              className="popover"
              role="dialog"
              aria-label="בחרו גודל"
              onClick={(e) => e.stopPropagation()}
              initial={{ scale: 0.9, opacity: 0, y: 8 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 8 }}
              transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            >
              <p className="popover__title">{variantFor.name} · בחרו גודל</p>
              <div className="popover__opts">
                {variantFor.variants!.map((v) => (
                  <motion.button
                    key={v.id}
                    className="chip chip--lg"
                    whileTap={{ scale: 0.95 }}
                    onClick={() => {
                      onAddProduct(variantFor, v);
                      setVariantFor(null);
                    }}
                  >
                    <span>{v.label}</span>
                    <span className="chip__price">{shekels(v.price)}</span>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
