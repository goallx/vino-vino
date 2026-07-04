import type { Product } from '../types';
import { products as seedProducts } from '../data/menu';

// Owner-managed menu. localStorage stand-in for the planned Supabase
// `products` table — swapping the backend should touch only this file
// (same pattern as bundles.ts / customers.ts / orderBus.ts).
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

// Another tab (e.g. the /deals admin) edited the menu — pick it up live.
if (typeof window !== 'undefined') {
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
}

export function removeProduct(id: string): void {
  const list = products.filter((p) => p.id !== id);
  persist(list);
  refresh(list);
}

export function newProductId(): string {
  return `c_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

/** Test/dev helper — re-read localStorage (e.g. after clearing it). */
export function reloadMenu(): void {
  refresh(load());
}
