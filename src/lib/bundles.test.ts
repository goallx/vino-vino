import { describe, it, expect, beforeEach } from 'vitest';
import {
  bundleApplication,
  bundleGross,
  bundleSaving,
  buildBundleLines,
  listActiveBundles,
  loadBundles,
  removeBundle,
  saveBundle,
} from './bundles';
import { seedCatalog } from '../test/fixtures/seed';
import type { Bundle } from '../types';

const twoVino: Bundle = {
  id: 'bnd_test',
  name: 'זוג וינו',
  items: [{ productId: 'p_vino', qty: 2 }], // p_vino base = ₪95 → gross ₪190
  price: 16000, // ₪160
  active: true,
};

beforeEach(seedCatalog);

describe('bundles store', () => {
  it('serves cached bundles and is empty without a cache (DB is the source of truth)', () => {
    expect(loadBundles().length).toBeGreaterThan(0);
    expect(listActiveBundles().length).toBeGreaterThan(0);
    localStorage.clear();
    expect(loadBundles()).toHaveLength(0);
  });

  it('upserts by id rather than duplicating', () => {
    saveBundle(twoVino);
    const after = saveBundle({ ...twoVino, name: 'זוג וינו משודרג' });
    const mine = after.filter((b) => b.id === 'bnd_test');
    expect(mine).toHaveLength(1);
    expect(mine[0].name).toBe('זוג וינו משודרג');
  });

  it('removes a bundle', () => {
    saveBundle(twoVino);
    const after = removeBundle('bnd_test');
    expect(after.find((b) => b.id === 'bnd_test')).toBeUndefined();
  });

  it('excludes inactive and item-less bundles from the active list', () => {
    localStorage.setItem(
      'vino:bundles',
      JSON.stringify([
        twoVino,
        { ...twoVino, id: 'bnd_off', active: false },
        { ...twoVino, id: 'bnd_empty', items: [] },
      ]),
    );
    const ids = listActiveBundles().map((b) => b.id);
    expect(ids).toContain('bnd_test');
    expect(ids).not.toContain('bnd_off');
    expect(ids).not.toContain('bnd_empty');
  });
});

describe('bundle pricing', () => {
  it('computes gross from current menu prices', () => {
    expect(bundleGross(twoVino)).toBe(19000); // 2 × ₪95
  });

  it('computes the saving against the deal price', () => {
    expect(bundleSaving(twoVino)).toBe(3000); // ₪190 − ₪160
  });

  it('never reports a negative saving when the deal price is higher', () => {
    expect(bundleSaving({ ...twoVino, price: 25000 })).toBe(0);
  });
});

describe('bundle application', () => {
  it('splits pizzas into one editable line each at full menu price', () => {
    const lines = buildBundleLines(twoVino);
    expect(lines).toHaveLength(2); // 2× pizza → two independent lines
    expect(lines.every((l) => l.productId === 'p_vino' && l.qty === 1)).toBe(true);
    expect(lines.every((l) => l.unitPrice === 9500)).toBe(true); // full price, not discounted
    expect(lines[0].id).not.toBe(lines[1].id);
  });

  it('keeps a non-pizza item as a single line carrying its quantity', () => {
    const lines = buildBundleLines({ ...twoVino, items: [{ productId: 's_chips', qty: 2 }] });
    expect(lines).toHaveLength(1);
    expect(lines[0].qty).toBe(2);
  });

  it('returns lines plus a discount carrying the saving', () => {
    const { lines, discount } = bundleApplication(twoVino);
    expect(lines).toHaveLength(2);
    expect(discount.bundleId).toBe('bnd_test');
    expect(discount.label).toBe('זוג וינו');
    expect(discount.amount).toBe(3000);
    expect(discount.uid).toBeTruthy();
  });
});
