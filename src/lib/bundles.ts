import type { AppliedBundle, AppliedCombo, Bundle, CartLine, Money } from '../types';
import { productsById } from './menuStore';
import { computeUnitPrice, newLineId, wholePart } from './cart';
import { supabase, isSupabaseEnabled, refetchOnAuth } from './supabase';

// Owner-managed combo deals.
//
// The `bundles` table is the source of truth — fetched into the localStorage
// cache on load, refetched on realtime changes, written through on
// save/remove. Reads stay synchronous off the cache. Tests seed the cache
// from src/test/fixtures/catalog.ts.

const KEY = 'vino:bundles';
let cachedRaw: string | null | undefined;
let cachedBundles: Bundle[] = [];

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

interface BundleRow {
  id: string;
  name: string;
  items: Bundle['items'];
  price: Money;
  active: boolean;
  free_toppings?: number | null;
  free_topping_ids?: string[] | null;
}

function rowToBundle(row: BundleRow): Bundle {
  return {
    id: row.id,
    name: row.name,
    items: row.items,
    price: row.price,
    active: row.active,
    freeToppings: row.free_toppings ?? undefined,
    freeToppingIds: row.free_topping_ids ?? undefined,
  };
}

async function fetchBundles(): Promise<void> {
  if (!supabase) return;
  // select('*') tolerates a DB where the free_toppings column isn't migrated yet.
  const { data, error } = await supabase.from('bundles').select('*');
  if (error || !data) {
    if (error) console.error('[vino] failed to fetch bundles', error);
    return; // keep serving cache/seed
  }
  persist((data as BundleRow[]).map(rowToBundle));
  notify();
}

if (isSupabaseEnabled && supabase) {
  void fetchBundles();
  refetchOnAuth(() => void fetchBundles());
  supabase
    .channel('bundles-feed')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'bundles' }, () => void fetchBundles())
    .subscribe();
}

export function loadBundles(): Bundle[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === cachedRaw) return cachedBundles;
    cachedRaw = raw;
    cachedBundles = raw ? (JSON.parse(raw) as Bundle[]) : [];
  } catch {
    /* keep the last usable in-memory snapshot */
  }
  return cachedBundles;
}

function persist(list: Bundle[]) {
  const raw = JSON.stringify(list);
  cachedRaw = raw;
  cachedBundles = list;
  try {
    localStorage.setItem(KEY, raw);
  } catch {
    /* storage full / unavailable — non-fatal */
  }
}

/** A row was rejected because a perk column (free_toppings / free_topping_ids) isn't in the DB yet. */
function isMissingPerkColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === '42703' || // Postgres: undefined_column
    error.code === 'PGRST204' || // PostgREST: column not found in schema cache
    (error.message?.includes('free_topping') ?? false) // matches free_toppings and free_topping_ids
  );
}

/** Upsert a bundle by id; returns the full list after the change. */
export function saveBundle(bundle: Bundle): Bundle[] {
  const list = loadBundles().filter((b) => b.id !== bundle.id);
  list.push(bundle);
  persist(list);
  notify();
  if (supabase) {
    const db = supabase;
    const { id, name, items, price, active, freeToppings, freeToppingIds } = bundle;
    const row = {
      id, name, items, price, active,
      free_toppings: freeToppings ?? 0,
      free_topping_ids: freeToppingIds ?? null,
    };
    void (async () => {
      let { error } = await db.from('bundles').upsert(row);
      // Older DB without the perk columns yet — drop them and retry so saving
      // never breaks; the perk simply won't persist until the migration is
      // applied. (Mirrors saveOrder's delivery_fee fallback.)
      if (isMissingPerkColumn(error)) {
        const { free_toppings: _t, free_topping_ids: _ids, ...rest } = row;
        void _t; void _ids;
        ({ error } = await db.from('bundles').upsert(rest));
      }
      if (error) console.error('[vino] failed to save bundle', error);
    })();
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
    if (!p) return sum;
    const v = it.variantLabel && p.variants?.find((x) => x.label === it.variantLabel);
    return sum + (v ? v.price : p.basePrice) * it.qty;
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
export function buildBundleLines(bundle: Bundle, uid?: string): CartLine[] {
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
        variantLabel: it.variantLabel,
        parts: product.isPizza ? [wholePart(product)] : [],
        bundleUid: uid,
      };
      line.unitPrice = computeUnitPrice(line);
      lines.push(line);
    }
  }
  return lines;
}

/**
 * Everything needed to drop a deal into an order as a fixed-price combo: its
 * dishes (tagged with the combo's uid) plus the combo record that pins them to
 * the deal price. The lines stay swappable; the price holds.
 */
export function bundleApplication(bundle: Bundle): { lines: CartLine[]; combo: AppliedCombo } {
  const uid = `ab_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  return {
    lines: buildBundleLines(bundle, uid),
    combo: {
      uid,
      bundleId: bundle.id,
      label: bundle.name,
      price: bundle.price,
      freeToppings: bundle.freeToppings,
      freeToppingIds: bundle.freeToppingIds,
    },
  };
}

/** A unit of one cart line still available to be claimed by a deal. */
interface PoolUnit {
  productId: string;
  price: Money; // this line's unit price (incl. its toppings/variant)
  remaining: number;
}

/**
 * Try to claim one full copy of the bundle from the pool. Returns the claims to
 * make and the full-price gross of the claimed units, or null if the cart
 * doesn't hold every required item. Non-mutating — the caller commits.
 */
function claimBundle(
  pool: PoolUnit[],
  bundle: Bundle,
): { claims: Array<{ unit: PoolUnit; take: number }>; gross: Money } | null {
  const claims: Array<{ unit: PoolUnit; take: number }> = [];
  // Track how much of each unit we've tentatively reserved this pass.
  const reserved = new Map<PoolUnit, number>();
  let gross = 0;
  for (const item of bundle.items) {
    let need = item.qty;
    for (const unit of pool) {
      if (need <= 0) break;
      if (unit.productId !== item.productId) continue;
      const free = unit.remaining - (reserved.get(unit) ?? 0);
      if (free <= 0) continue;
      const take = Math.min(free, need);
      reserved.set(unit, (reserved.get(unit) ?? 0) + take);
      claims.push({ unit, take });
      gross += unit.price * take;
      need -= take;
    }
    if (need > 0) return null; // not enough of this item in the cart
  }
  return { claims, gross };
}

/**
 * Scan the cart for owner-defined deals and return the savings to apply.
 *
 * Each active bundle is matched as many whole times as the cart's items allow,
 * consuming the matched units so a pizza can't count toward two deals at once.
 * The saving is the *actual* full price of the claimed lines minus the deal
 * price, so it stays correct even when a matched pizza carries paid toppings.
 * Deals that wouldn't save anything for these lines are skipped.
 */
export function detectBundles(lines: CartLine[], bundles: Bundle[] = listActiveBundles()): AppliedBundle[] {
  // Lines that belong to a fixed-price combo are already priced by that combo —
  // never let auto-detect claim them for a second deal.
  const pool: PoolUnit[] = lines
    .filter((l) => !l.bundleUid)
    .map((l) => ({
      productId: l.productId,
      price: computeUnitPrice(l),
      remaining: l.qty,
    }));
  const applied: AppliedBundle[] = [];
  for (const bundle of bundles) {
    if (bundle.items.length === 0) continue;
    for (let n = 0; ; n += 1) {
      const claim = claimBundle(pool, bundle);
      if (!claim) break;
      const amount = claim.gross - bundle.price;
      if (amount <= 0) break; // this deal doesn't beat the à-la-carte price here
      for (const { unit, take } of claim.claims) unit.remaining -= take;
      applied.push({ uid: `${bundle.id}#${n}`, bundleId: bundle.id, label: bundle.name, amount });
    }
  }
  return applied;
}
