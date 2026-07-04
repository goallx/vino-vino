import type { Product } from '../types';
import { products as seedProducts } from '../data/menu';
import { supabase, isSupabaseEnabled } from './supabase';

// Owner-managed menu.
//
// Supabase mode: the `products` table is the source of truth — fetched into
// the localStorage cache on load, refetched on realtime changes (cross-device
// edits), written through on save/remove. Reads stay synchronous off the
// cache so consumers render instantly and survive a network blip.
//
// Local mode (no env vars): localStorage seeded from the bundled menu.
//
// Consumers import the live `products` / `productsById` / `pizzaProducts`
// bindings (kept in sync in place after every mutation), so switching a file
// from '../data/menu' to this store is just the import line.

const KEY = 'vino:menu';

function load(): Product[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Product[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    /* fall through to seed */
  }
  const seeded = seedProducts.map((p) => ({ ...p }));
  persist(seeded);
  return seeded;
}

function persist(list: Product[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage full / unavailable — non-fatal */
  }
}

/* ---------------- Supabase row mapping ---------------- */

interface ProductRow {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  base_price: number;
  is_pizza: boolean;
  split_capable: boolean;
  included_toppings: number | null;
  variants: Product['variants'] | null;
  art: string[] | null;
  active: boolean;
  sort: number;
}

function rowToProduct(row: ProductRow): Product {
  return {
    id: row.id,
    categoryId: row.category_id,
    name: row.name,
    description: row.description ?? undefined,
    basePrice: row.base_price,
    isPizza: row.is_pizza || undefined,
    splitCapable: row.split_capable || undefined,
    includedToppings: row.included_toppings ?? undefined,
    variants: row.variants ?? undefined,
    art: row.art ?? undefined,
    active: row.active,
  };
}

function productToRow(p: Product, sort: number): ProductRow {
  return {
    id: p.id,
    category_id: p.categoryId,
    name: p.name,
    description: p.description ?? null,
    base_price: p.basePrice,
    is_pizza: !!p.isPizza,
    split_capable: !!p.splitCapable,
    included_toppings: p.includedToppings ?? null,
    variants: p.variants ?? null,
    art: p.art ?? null,
    active: p.active !== false,
    sort,
  };
}

async function fetchMenu(): Promise<void> {
  if (!supabase) return;
  const { data, error } = await supabase.from('products').select('*').order('sort');
  if (error || !data || data.length === 0) {
    if (error) console.error('[vino] failed to fetch menu', error);
    return; // keep serving cache/seed
  }
  const list = (data as ProductRow[]).map(rowToProduct);
  persist(list);
  refresh(list);
}

/* ---------------- live bindings ---------------- */

/** Live bindings — same shapes data/menu exported, refreshed in place. */
export const products: Product[] = [];
export const productsById: Record<string, Product> = {};
export const pizzaProducts: Product[] = [];

let version = 0;
const listeners = new Set<() => void>();

function refresh(list: Product[]) {
  products.length = 0;
  products.push(...list);
  for (const k of Object.keys(productsById)) delete productsById[k];
  for (const p of list) productsById[p.id] = p;
  pizzaProducts.length = 0;
  pizzaProducts.push(...list.filter((p) => p.isPizza && p.active !== false));
  version += 1;
  listeners.forEach((fn) => fn());
}

refresh(load());

if (isSupabaseEnabled && supabase) {
  void fetchMenu();
  // Another device edited the menu — pick it up live.
  supabase
    .channel('products-feed')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => void fetchMenu())
    .subscribe();
} else if (typeof window !== 'undefined') {
  // Another tab (e.g. the /deals admin) edited the menu — pick it up live.
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) refresh(load());
  });
}

/** Subscribe/snapshot pair for React's useSyncExternalStore. */
export function subscribeMenu(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function menuVersion(): number {
  return version;
}

/** Products the owner hasn't hidden — what the order screen sells. */
export function activeProducts(): Product[] {
  return products.filter((p) => p.active !== false);
}

/** Upsert a product by id (keeps menu order for edits, appends new items). */
export function saveProduct(product: Product): void {
  const list = [...products];
  const at = list.findIndex((p) => p.id === product.id);
  if (at >= 0) list[at] = product;
  else list.push(product);
  persist(list);
  refresh(list);
  if (supabase) {
    const sort = at >= 0 ? at : list.length - 1;
    void supabase
      .from('products')
      .upsert(productToRow(product, sort))
      .then(({ error }) => {
        if (error) console.error('[vino] failed to save product', error);
      });
  }
}

export function removeProduct(id: string): void {
  const list = products.filter((p) => p.id !== id);
  persist(list);
  refresh(list);
  if (supabase) {
    void supabase
      .from('products')
      .delete()
      .eq('id', id)
      .then(({ error }) => {
        if (error) console.error('[vino] failed to remove product', error);
      });
  }
}

export function newProductId(): string {
  return `c_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

/** Test/dev helper — re-read localStorage (e.g. after clearing it). */
export function reloadMenu(): void {
  refresh(load());
}
