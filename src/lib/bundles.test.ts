import { describe, it, expect, beforeEach } from 'vitest';
import {
  bundleApplication,
  bundleGross,
  bundleSaving,
  buildBundleLines,
  detectBundles,
  listActiveBundles,
  loadBundles,
  removeBundle,
  saveBundle,
} from './bundles';
import { seedCatalog } from '../test/fixtures/seed';
import type { Bundle, CartLine } from '../types';

function line(productId: string, qty: number): CartLine {
  return { id: `l_${productId}_${qty}`, productId, name: productId, qty, unitPrice: 0, isSplit: false, parts: [] };
}

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

  it('returns lines plus a fixed-price combo, with the lines tagged to it', () => {
    const { lines, combo } = bundleApplication(twoVino);
    expect(lines).toHaveLength(2);
    expect(combo.bundleId).toBe('bnd_test');
    expect(combo.label).toBe('זוג וינו');
    expect(combo.price).toBe(twoVino.price);
    expect(combo.uid).toBeTruthy();
    // every line carries the combo uid so it prices under the combo, not alone
    expect(lines.every((l) => l.bundleUid === combo.uid)).toBe(true);
  });
});

describe('detectBundles (auto-apply from the cart)', () => {
  it('applies a deal once the cart holds its items', () => {
    const applied = detectBundles([line('p_vino', 2)], [twoVino]);
    expect(applied).toHaveLength(1);
    expect(applied[0].bundleId).toBe('bnd_test');
    expect(applied[0].amount).toBe(3000); // ₪190 gross − ₪160 deal
  });

  it('applies the deal as many whole times as the cart allows', () => {
    const applied = detectBundles([line('p_vino', 5)], [twoVino]);
    expect(applied).toHaveLength(2); // 5 pizzas → two pairs, one left over
    expect(applied.map((a) => a.uid)).toEqual(['bnd_test#0', 'bnd_test#1']);
  });

  it('does not apply when the cart is short of the required items', () => {
    expect(detectBundles([line('p_vino', 1)], [twoVino])).toHaveLength(0);
  });

  it('consumes matched units so one item cannot feed two deals', () => {
    const other: Bundle = { ...twoVino, id: 'bnd_other', name: 'עוד וינו' };
    // Only 2 pizzas in the cart but two deals both want 2 — only one can win.
    const applied = detectBundles([line('p_vino', 2)], [twoVino, other]);
    expect(applied).toHaveLength(1);
    expect(applied[0].bundleId).toBe('bnd_test');
  });

  it('skips a deal that would not beat the à-la-carte price', () => {
    const overpriced: Bundle = { ...twoVino, price: 25000 }; // dearer than ₪190 gross
    expect(detectBundles([line('p_vino', 2)], [overpriced])).toHaveLength(0);
  });
});
