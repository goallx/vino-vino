import { describe, it, expect } from 'vitest';
import { reducer, emptyOrder, type OrderState } from './order';
import type { CartLine } from '../types';
import { newLineId } from '../lib/cart';

function mkLine(over: Partial<CartLine> = {}): CartLine {
  return {
    id: newLineId(),
    productId: 'd_coke',
    name: 'קוקה קולה 0.33',
    qty: 1,
    unitPrice: 1000,
    isSplit: false,
    parts: [],
    ...over,
  };
}

describe('order reducer', () => {
  it('adds a line', () => {
    const s = reducer(emptyOrder, { kind: 'addLine', line: mkLine() });
    expect(s.lines).toHaveLength(1);
  });

  it('merges an identical line into a quantity bump', () => {
    let s: OrderState = reducer(emptyOrder, { kind: 'addLine', line: mkLine() });
    s = reducer(s, { kind: 'addLine', line: mkLine() });
    expect(s.lines).toHaveLength(1);
    expect(s.lines[0].qty).toBe(2);
  });

  it('keeps lines separate when a note differs', () => {
    let s = reducer(emptyOrder, { kind: 'addLine', line: mkLine() });
    s = reducer(s, { kind: 'addLine', line: mkLine({ note: 'קר' }) });
    expect(s.lines).toHaveLength(2);
  });

  it('treats differently-topped pizzas as distinct lines', () => {
    const a = mkLine({ productId: 'b_family', isSplit: false, parts: [{ target: 'whole', baseProductId: 'b_family', baseName: 'משפחתית בהרכבה', toppings: [{ toppingId: 't_mushroom', name: 'פטריות', action: 'add', price: 500 }] }] });
    const b = mkLine({ productId: 'b_family', isSplit: false, parts: [{ target: 'whole', baseProductId: 'b_family', baseName: 'משפחתית בהרכבה', toppings: [{ toppingId: 't_onion', name: 'בצל', action: 'add', price: 500 }] }] });
    let s = reducer(emptyOrder, { kind: 'addLine', line: a });
    s = reducer(s, { kind: 'addLine', line: b });
    expect(s.lines).toHaveLength(2);
  });

  it('updates quantity and removes the line at zero', () => {
    const line = mkLine();
    let s = reducer(emptyOrder, { kind: 'addLine', line });
    s = reducer(s, { kind: 'setQty', id: line.id, qty: 3 });
    expect(s.lines[0].qty).toBe(3);
    s = reducer(s, { kind: 'setQty', id: line.id, qty: 0 });
    expect(s.lines).toHaveLength(0);
  });

  it('removes a line and can restore it at its original index', () => {
    const a = mkLine();
    const b = mkLine({ productId: 'd_sprite', name: 'ספרייט 0.33' });
    let s = reducer(emptyOrder, { kind: 'addLine', line: a });
    s = reducer(s, { kind: 'addLine', line: b });
    s = reducer(s, { kind: 'removeLine', id: a.id });
    expect(s.lines.map((l) => l.id)).toEqual([b.id]);
    s = reducer(s, { kind: 'restoreLine', line: a, index: 0 });
    expect(s.lines.map((l) => l.id)).toEqual([a.id, b.id]);
  });

  it('sets customer + order fields', () => {
    let s = reducer(emptyOrder, { kind: 'setField', field: 'phone', value: '0501234567' });
    s = reducer(s, { kind: 'setField', field: 'type', value: 'pickup' });
    expect(s.phone).toBe('0501234567');
    expect(s.type).toBe('pickup');
  });

  it('loads cloned lines and resets to empty', () => {
    let s = reducer(emptyOrder, { kind: 'loadLines', lines: [mkLine(), mkLine()] });
    expect(s.lines).toHaveLength(2);
    s = reducer(s, { kind: 'reset' });
    expect(s).toEqual(emptyOrder);
  });

  it('applies a bundle: appends its lines and a discount', () => {
    const discount = { uid: 'ab_1', bundleId: 'bnd_test', label: 'זוג וינו', amount: 3000 };
    const s = reducer(emptyOrder, {
      kind: 'applyBundle',
      lines: [mkLine({ productId: 'p_vino', qty: 2 })],
      discount,
    });
    expect(s.lines).toHaveLength(1);
    expect(s.discounts).toEqual([discount]);
  });

  it('removes a discount by uid while leaving the lines in place', () => {
    let s = reducer(emptyOrder, {
      kind: 'applyBundle',
      lines: [mkLine({ productId: 'p_vino' })],
      discount: { uid: 'ab_1', bundleId: 'bnd_test', label: 'זוג וינו', amount: 3000 },
    });
    s = reducer(s, { kind: 'removeDiscount', uid: 'ab_1' });
    expect(s.discounts).toHaveLength(0);
    expect(s.lines).toHaveLength(1);
  });

  it('clears discounts on reset', () => {
    let s = reducer(emptyOrder, {
      kind: 'applyBundle',
      lines: [mkLine()],
      discount: { uid: 'ab_1', bundleId: 'b', label: 'x', amount: 100 },
    });
    s = reducer(s, { kind: 'reset' });
    expect(s.discounts).toHaveLength(0);
  });
});
