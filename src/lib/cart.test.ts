import { describe, it, expect } from 'vitest';
import type { CartLine, LinePart, ToppingSel } from '../types';
import { computeUnitPrice, lineSummary, wholePart, newLineId, lineTotal, linesSubtotal, discountsTotal, orderTotals } from './cart';
import type { AppliedBundle } from '../types';
import { productsById } from '../data/menu';

function add(id: string, name: string, price: number): ToppingSel {
  return { toppingId: id, name, action: 'add', price };
}

function line(partial: Partial<CartLine>): CartLine {
  return {
    id: newLineId(),
    productId: 'd_coke',
    name: 'קוקה קולה 0.33',
    qty: 1,
    unitPrice: 0,
    isSplit: false,
    parts: [],
    ...partial,
  };
}

describe('computeUnitPrice()', () => {
  it('prices a plain non-pizza item at its base price', () => {
    expect(computeUnitPrice(line({ productId: 'd_coke' }))).toBe(1000);
  });

  it('uses the chosen variant price for sized items', () => {
    const l = line({ productId: 's_chips', variantLabel: 'גדול' });
    expect(computeUnitPrice(l)).toBe(3000);
  });

  it('prices a whole pizza with no extra toppings at base price', () => {
    const vino = productsById['p_vino'];
    const l = line({ productId: 'p_vino', isSplit: false, parts: [wholePart(vino)] });
    expect(computeUnitPrice(l)).toBe(9500);
  });

  it('keeps the first 3 toppings free, then charges extras', () => {
    const parts: LinePart[] = [
      {
        target: 'whole',
        baseProductId: 'b_family',
        baseName: 'משפחתית בהרכבה',
        toppings: [
          add('t_mushroom', 'פטריות', 500),
          add('t_onion', 'בצל', 500),
          add('t_olives', 'זיתים', 500),
          add('t_corn', 'תירס', 500), // 4th → charged
        ],
      },
    ];
    const l = line({ productId: 'b_family', parts });
    expect(computeUnitPrice(l)).toBe(6900 + 500);
  });

  it('applies the included count per half on a split pizza', () => {
    const parts: LinePart[] = [
      {
        target: 'half_1',
        baseProductId: 'p_vino',
        baseName: 'וינו וינו',
        toppings: [
          add('t_mushroom', 'פטריות', 500),
          add('t_onion', 'בצל', 500),
          add('t_olives', 'זיתים', 500),
          add('t_corn', 'תירס', 500), // 4th on this half → charged
        ],
      },
      { target: 'half_2', baseProductId: 'p_shchitut', baseName: 'שחיתות', toppings: [] },
    ];
    const l = line({ productId: 'b_family', isSplit: true, parts });
    expect(computeUnitPrice(l)).toBe(6900 + 500);
  });
});

describe('lineSummary()', () => {
  it('shows the variant label for sized non-pizza items', () => {
    expect(lineSummary(line({ productId: 's_chips', variantLabel: 'גדול' }))).toBe('גדול');
  });

  it('lists added toppings for a whole pizza', () => {
    const l = line({
      productId: 'b_family',
      parts: [{ target: 'whole', baseProductId: 'b_family', baseName: 'משפחתית בהרכבה', toppings: [add('t_mushroom', 'פטריות', 500), add('t_onion', 'בצל', 500)] }],
    });
    expect(lineSummary(l)).toBe('+פטריות +בצל');
  });

  it('describes a half/half pizza with each base and its toppings', () => {
    const l = line({
      productId: 'b_family',
      isSplit: true,
      parts: [
        { target: 'half_1', baseProductId: 'p_vino', baseName: 'וינו וינו', toppings: [add('t_mushroom', 'פטריות', 500)] },
        { target: 'half_2', baseProductId: 'p_shchitut', baseName: 'שחיתות', toppings: [] },
      ],
    });
    expect(lineSummary(l)).toBe('חצי / חצי · ½ וינו וינו +פטריות · ½ שחיתות');
  });
});

describe('order totals', () => {
  const coke = (qty: number) => line({ productId: 'd_coke', qty }); // ₪10 each
  const disc = (amount: number): AppliedBundle => ({ uid: `u${amount}`, bundleId: 'b', label: 'מבצע', amount });

  it('lineTotal multiplies unit price by quantity', () => {
    expect(lineTotal(coke(3))).toBe(3000);
  });

  it('linesSubtotal sums every line at full price', () => {
    expect(linesSubtotal([coke(2), coke(1)])).toBe(3000);
  });

  it('discountsTotal sums applied bundle savings', () => {
    expect(discountsTotal([disc(500), disc(1500)])).toBe(2000);
  });

  it('orderTotals returns gross, saving, and net', () => {
    expect(orderTotals([coke(2)], [disc(500)])).toEqual({ subtotal: 2000, discount: 500, total: 1500 });
  });

  it('never lets a discount push the net below zero', () => {
    expect(orderTotals([coke(1)], [disc(9999)]).total).toBe(0);
  });

  it('treats a discount-free order as gross == net', () => {
    expect(orderTotals([coke(2)])).toEqual({ subtotal: 2000, discount: 0, total: 2000 });
  });
});

describe('wholePart()', () => {
  it('mirrors the product with no toppings', () => {
    expect(wholePart(productsById['p_vino'])).toEqual({
      target: 'whole',
      baseProductId: 'p_vino',
      baseName: 'וינו וינו',
      toppings: [],
    });
  });
});
