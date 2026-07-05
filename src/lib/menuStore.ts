import type { Category, Product, Topping } from '../types';
import { supabase, isSupabaseEnabled, refetchOnAuth } from './supabase';

// The catalog store: products, categories and toppings.
//
// The database is the single source of truth. Everything is fetched into a
// localStorage cache on load (so screens render instantly and survive a
// network blip), refetched on realtime changes (cross-device edits), and
// written through on save/remove. Reads stay synchronous off the cache.
//
// Without env vars (tests, offline dev) the store serves whatever is in the
// cache — tests seed it from src/test/fixtures/catalog.ts.

const MENU_KEY = 'vino:menu';
const CATEGORIES_KEY = 'vino:categories';
const TOPPINGS_KEY = 'vino:toppings';

function loadKey<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw) as T[];
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    /* fall through */
  }
  return [];
}

function persist(key: string, list: unknown[]) {
  try {
    localStorage.setItem(key, JSON.stringify(list));
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

async function fetchCatalog(): Promise<void> {
  if (!supabase) return;
  const [prodRes, catRes, topRes] = await Promise.all([
    supabase.from('products').select('*').order('sort'),
    supabase.from('categories').select('id, name').order('sort'),
    supabase.from('toppings').select('id, name, price').order('price').order('id'),
  ]);
  const err = prodRes.error ?? catRes.error ?? topRes.error;
  if (err) {
    console.error('[vino] failed to fetch catalog', err);
    return; // keep serving the cache
  }
  if (prodRes.data?.length) {
    const list = (prodRes.data as ProductRow[]).map(rowToProduct);
    persist(MENU_KEY, list);
    refreshProducts(list);
  }
  if (catRes.data?.length) {
    persist(CATEGORIES_KEY, catRes.data);
    replaceInPlace(categories, catRes.data as Category[]);
  }
  if (topRes.data?.length) {
    persist(TOPPINGS_KEY, topRes.data);
    replaceInPlace(toppings, topRes.data as Topping[]);
    for (const k of Object.keys(toppingsById)) delete toppingsById[k];
    for (const t of toppings) toppingsById[t.id] = t;
  }
  bump();
}

/* ---------------- live bindings ---------------- */

/** Live bindings — refreshed in place so consumers keep their references. */
export const products: Product[] = [];
export const productsById: Record<string, Product> = {};
export const pizzaProducts: Product[] = [];
export const categories: Category[] = [];
export const toppings: Topping[] = [];
export const toppingsById: Record<string, Topping> = {};

let version = 0;
const listeners = new Set<() => void>();

function bump() {
  version += 1;
  listeners.forEach((fn) => fn());
}

function replaceInPlace<T>(target: T[], next: T[]) {
  target.length = 0;
  target.push(...next);
}

function refreshProducts(list: Product[]) {
  replaceInPlace(products, list);
  for (const k of Object.keys(productsById)) delete productsById[k];
  for (const p of list) productsById[p.id] = p;
  replaceInPlace(pizzaProducts, list.filter((p) => p.isPizza && p.active !== false));
}

function loadAll() {
  refreshProducts(loadKey<Product>(MENU_KEY));
  replaceInPlace(categories, loadKey<Category>(CATEGORIES_KEY));
  replaceInPlace(toppings, loadKey<Topping>(TOPPINGS_KEY));
  for (const k of Object.keys(toppingsById)) delete toppingsById[k];
  for (const t of toppings) toppingsById[t.id] = t;
  bump();
}

loadAll();

if (isSupabaseEnabled && supabase) {
  void fetchCatalog();
  refetchOnAuth(() => void fetchCatalog());
  // Another device edited the menu — pick it up live.
  supabase
    .channel('products-feed')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => void fetchCatalog())
    .subscribe();
} else if (typeof window !== 'undefined') {
  // Another tab (e.g. the /deals admin) edited the menu — pick it up live.
  window.addEventListener('storage', (e) => {
    if (e.key === MENU_KEY) loadAll();
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
  persist(MENU_KEY, list);
  refreshProducts(list);
  bump();
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
  persist(MENU_KEY, list);
  refreshProducts(list);
  bump();
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

/** Test/dev helper — re-read the caches (e.g. after (re)seeding localStorage). */
export function reloadMenu(): void {
  loadAll();
}
