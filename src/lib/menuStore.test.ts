import { describe, it, expect, beforeEach } from 'vitest';
import {
  activeProducts,
  newProductId,
  pizzaProducts,
  products,
  productsById,
  reloadMenu,
  removeProduct,
  saveProduct,
} from './menuStore';
import { products as seedProducts } from '../test/fixtures/catalog';
import { seedCatalog } from '../test/fixtures/seed';
import type { Product } from '../types';

const calzone: Product = {
  id: 'c_test_calzone',
  categoryId: 'pizza',
  name: 'קלצונה',
  basePrice: 4500,
  active: true,
};

// module state survives between tests — resync from the freshly seeded storage
beforeEach(seedCatalog);

describe('menu store', () => {
  it('serves the cached catalog and is empty without one (DB is the source of truth)', () => {
    expect(products).toHaveLength(seedProducts.length);
    expect(productsById['p_vino'].name).toBe('וינו וינו');
    // no bundled fallback: an empty cache means an empty menu until the DB answers
    localStorage.clear();
    reloadMenu();
    expect(products).toHaveLength(0);
  });

  it('adds a new owner item and keeps the live lookups in sync', () => {
    saveProduct(calzone);
    expect(products).toHaveLength(seedProducts.length + 1);
    expect(productsById['c_test_calzone'].basePrice).toBe(4500);
    // persists — a fresh read from storage still has it
    reloadMenu();
    expect(productsById['c_test_calzone']).toBeDefined();
  });

  it('edits in place (upsert by id, position preserved)', () => {
    saveProduct({ ...productsById['p_vino'], basePrice: 9900 });
    expect(products).toHaveLength(seedProducts.length);
    expect(productsById['p_vino'].basePrice).toBe(9900);
    expect(products[0].id).toBe(seedProducts[0].id);
  });

  it('removes an item', () => {
    saveProduct(calzone);
    removeProduct('c_test_calzone');
    expect(productsById['c_test_calzone']).toBeUndefined();
    expect(products).toHaveLength(seedProducts.length);
  });

  it('hidden items leave activeProducts and pizzaProducts but stay in productsById', () => {
    saveProduct({ ...productsById['p_vino'], active: false });
    expect(activeProducts().some((p) => p.id === 'p_vino')).toBe(false);
    expect(pizzaProducts.some((p) => p.id === 'p_vino')).toBe(false);
    // old orders still resolve the product for names / kitchen icons
    expect(productsById['p_vino']).toBeDefined();
  });

  it('generates unique ids for new items', () => {
    expect(newProductId()).not.toBe(newProductId());
  });
});
