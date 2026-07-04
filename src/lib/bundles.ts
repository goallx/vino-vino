import type { AppliedBundle, Bundle, CartLine, Money } from '../types';
import { productsById } from './menuStore';
import { computeUnitPrice, newLineId, wholePart } from './cart';
import { supabase, isSupabaseEnabled } from './supabase';

// Owner-managed combo deals.
//
// Supabase mode: the `bundles` table is the source of truth — fetched into the
// localStorage cache on load, refetched on realtime changes, written through
// on save/remove. Reads stay synchronous off the cache.
// Local mode (no env vars): localStorage seeded with two example deals.

const KEY = 'vino:bundles';

let version = 0;
const listeners = new Set<() => void>();
function notify() {
  version += 1;
  listeners.forEach((fn) => fn());
}

/** Subscribe/snapshot pair for React's useSyncExternalStore. */
export function subscribeBundles(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function bundlesVersion(): number {
  return version;
}

async function fetchBundles(): Promise<void> {
  if (!supabase) return;
  const { data, error } = await supabase.from('bundles').select('id, name, items, price, active');
  if (error || !data) {
    if (error) console.error('[vino] failed to fetch bundles', error);
    return; // keep serving cache/seed
  }
  persist(data as Bundle[]);
  notify();
}

if (isSupabaseEnabled && supabase) {
  void fetchBundles();
  supabase
    .channel('bundles-feed')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'bundles' }, () => void fetchBundles())
    .subscribe();
}

/** First-run seed so /deals and the order screen aren't empty on a fresh install. */
function seed(): Bundle[] {
  return [
    { id: 'bnd_two_family', name: 'זוג משפחתיות', items: [{ productId: 'p_vino', qty: 2 }], price: 16000, active: true },
    { id: 'bnd_pizza_chips', name: 'משפחתית + צ׳יפס גדול', items: [{ productId: 'p_veg', qty: 1 }, { productId: 's_chips', qty: 1 }], price: 10000, active: true },
  ];
}

export function loadBundles(): Bundle[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Bundle[];
  } catch {
    /* fall through to seed */
  }
  const seeded = seed();
  persist(seeded);
  return seeded;
}

function persist(list: Bundle[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage full / unavailable — non-fatal */
  }
}

/** Upsert a bundle by id; returns the full list after the change. */
export function saveBundle(bundle: Bundle): Bundle[] {
  const list = loadBundles().filter((b) => b.id !== bundle.id);
  list.push(bundle);
  persist(list);
  notify();
  if (supabase) {
    const { id, name, items, price, active } = bundle;
    void supabase
      .from('bundles')
      .upsert({ id, name, items, price, active })
      .then(({ error }) => {
        if (error) console.error('[vino] failed to save bundle', error);
      });
  }
  return list;
}

export function removeBundle(id: string): Bundle[] {
  const list = loadBundles().filter((b) => b.id !== id);
  persist(list);
  notify();
  if (supabase) {
    void supabase
      .from('bundles')
      .delete()
      .eq('id', id)
      .then(({ error }) => {
        if (error) console.error('[vino] failed to remove bundle', error);
      });
  }
  return list;
}

/** Only bundles the owner has switched on and that still have items. */
export function listActiveBundles(): Bundle[] {
  return loadBundles().filter((b) => b.active && b.items.length > 0);
}

export function newBundleId(): string {
  return `bnd_${Date.now().toString(36)}`;
}

/** Full menu price of the bundle's contents, before the deal — used to show the saving. */
export function bundleGross(bundle: Bundle): Money {
  return bundle.items.reduce((sum, it) => {
    const p = productsById[it.productId];
    return sum + (p ? p.basePrice * it.qty : 0);
  }, 0);
}

/** How much the customer saves vs. ordering the items separately (never negative). */
export function bundleSaving(bundle: Bundle): Money {
  return Math.max(0, bundleGross(bundle) - bundle.price);
}

/**
 * Full-price cart lines for a bundle (the kitchen sees the real dishes).
 * Pizzas split into one line each so the owner can customise every pie
 * individually — toppings / half-half — via the ticket's edit (✎) button.
 * Non-pizza items stay as a single line carrying their quantity.
 */
export function buildBundleLines(bundle: Bundle): CartLine[] {
  const lines: CartLine[] = [];
  for (const it of bundle.items) {
    const product = productsById[it.productId];
    if (!product) continue;
    const lineCount = product.isPizza ? it.qty : 1;
    const perLineQty = product.isPizza ? 1 : it.qty;
    for (let i = 0; i < lineCount; i += 1) {
      const line: CartLine = {
        id: newLineId(),
        productId: product.id,
        name: product.name,
        qty: perLineQty,
        unitPrice: 0,
        isSplit: false,
        parts: product.isPizza ? [wholePart(product)] : [],
      };
      line.unitPrice = computeUnitPrice(line);
      lines.push(line);
    }
  }
  return lines;
}

/** Everything needed to drop a bundle into an order: its lines + the discount. */
export function bundleApplication(bundle: Bundle): { lines: CartLine[]; discount: AppliedBundle } {
  return {
    lines: buildBundleLines(bundle),
    discount: {
      uid: `ab_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      bundleId: bundle.id,
      label: bundle.name,
      amount: bundleSaving(bundle),
    },
  };
}
