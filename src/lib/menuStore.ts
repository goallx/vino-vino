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
  free_topping_ids: string[] | null;
  active: boolean;
  sort: number;
  photo_url?: string | null;
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
    freeToppingIds: row.free_topping_ids ?? undefined,
    active: row.active,
    photoUrl: row.photo_url ?? undefined,
  };
}

interface ToppingRow {
  id: string;
  name: string;
  price: number;
  price_personal?: number | null;
  price_family?: number | null;
  starter?: boolean | null;
}

function rowToTopping(row: ToppingRow): Topping {
  return {
    id: row.id,
    name: row.name,
    price: row.price,
    pricePersonal: row.price_personal ?? undefined,
    priceFamily: row.price_family ?? undefined,
    starter: row.starter || undefined,
  };
}

function toppingToRow(t: Topping): ToppingRow {
  // legacy `price` stays in sync with the personal tier for older readers.
  const personal = t.pricePersonal ?? t.price;
  return {
    id: t.id,
    name: t.name,
    price: personal,
    price_personal: personal,
    price_family: t.priceFamily ?? t.price,
    starter: !!t.starter,
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
    free_topping_ids: p.freeToppingIds ?? null,
    active: p.active !== false,
    sort,
    photo_url: p.photoUrl ?? null,
  };
}

async function fetchCatalog(): Promise<void> {
  if (!supabase) return;
  const [prodRes, catRes, topRes] = await Promise.all([
    supabase.from('products').select('*').order('sort'),
    supabase.from('categories').select('id, name').order('sort'),
    supabase.from('toppings').select('id, name, price, price_personal, price_family, starter').order('price').order('id'),
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
    const list = (topRes.data as ToppingRow[]).map(rowToTopping);
    persist(TOPPINGS_KEY, list);
    replaceInPlace(toppings, list);
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
  supabase
    .channel('toppings-feed')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'toppings' }, () => void fetchCatalog())
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

/** Upsert a topping by id (keeps list order for edits, appends new items). */
export function saveTopping(topping: Topping): void {
  const list = [...toppings];
  const at = list.findIndex((t) => t.id === topping.id);
  if (at >= 0) list[at] = topping;
  else list.push(topping);
  persist(TOPPINGS_KEY, list);
  replaceInPlace(toppings, list);
  for (const k of Object.keys(toppingsById)) delete toppingsById[k];
  for (const t of toppings) toppingsById[t.id] = t;
  bump();
  if (supabase) {
    void supabase
      .from('toppings')
      .upsert(toppingToRow(topping))
      .then(({ error }) => {
        if (error) console.error('[vino] failed to save topping', error);
      });
  }
}

export function removeTopping(id: string): void {
  const list = toppings.filter((t) => t.id !== id);
  persist(TOPPINGS_KEY, list);
  replaceInPlace(toppings, list);
  delete toppingsById[id];
  bump();
  if (supabase) {
    void supabase
      .from('toppings')
      .delete()
      .eq('id', id)
      .then(({ error }) => {
        if (error) console.error('[vino] failed to remove topping', error);
      });
  }
}

export function newToppingId(): string {
  return `t_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

/** Test/dev helper — re-read the caches (e.g. after (re)seeding localStorage). */
export function reloadMenu(): void {
  loadAll();
}
