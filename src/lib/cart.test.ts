import { beforeAll, describe, it, expect } from 'vitest';
import type { CartLine, LinePart, ToppingSel } from '../types';
import { computeUnitPrice, lineSummary, wholePart, newLineId, lineTotal, linesSubtotal, discountsTotal, orderTotals, sizeOfProduct, toppingPrice, combosDiscount, pricedAddedToppings } from './cart';
import type { AppliedBundle, Product, Topping } from '../types';
import { productsById } from '../test/fixtures/catalog';
import { seedCatalog } from '../test/fixtures/seed';

beforeAll(seedCatalog);

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

describe('sizeOfProduct()', () => {
  const sized: Product = {
    id: 'r_x', categoryId: 'pizza', name: 'פיצה איקס', basePrice: 3000, isPizza: true,
    variants: [
      { id: 'r_x_p', label: 'אישית', price: 3000, size: 'personal' },
      { id: 'r_x_f', label: 'משפחתית', price: 6000, size: 'family' },
    ],
  };

  it('reads the size from the chosen variant', () => {
    expect(sizeOfProduct(sized, 'משפחתית')).toBe('family');
    expect(sizeOfProduct(sized, 'אישית')).toBe('personal');
  });

  it('falls back to the first variant when no label matches', () => {
    expect(sizeOfProduct(sized, undefined)).toBe('personal');
  });

  it('treats a single-size pizza as family, unless it is an אישית base', () => {
    const chef: Product = { id: 'p_x', categoryId: 'chef', name: 'פיצה שף', basePrice: 9500, isPizza: true };
    const personalBuild: Product = { id: 'b_personal', categoryId: 'build', name: 'אישית בהרכבה', basePrice: 3500, isPizza: true };
    expect(sizeOfProduct(chef)).toBe('family');
    expect(sizeOfProduct(personalBuild)).toBe('personal');
  });
});

describe('toppingPrice()', () => {
  const chicken: Topping = { id: 't_chicken', name: 'נתחי עוף', price: 1500, pricePersonal: 1500, priceFamily: 2000 };

  it('picks the family or personal per-portion price', () => {
    expect(toppingPrice(chicken, 'family')).toBe(2000);
    expect(toppingPrice(chicken, 'personal')).toBe(1500);
  });

  it('falls back to the legacy price when a tier is missing', () => {
    const legacy: Topping = { id: 't_legacy', name: 'ישן', price: 700 };
    expect(toppingPrice(legacy, 'family')).toBe(700);
    expect(toppingPrice(legacy, 'personal')).toBe(700);
  });
});

describe('pricedAddedToppings() — opening price', () => {
  const olives: Topping = { id: 't_olives', name: 'זיתים', price: 500, pricePersonal: 500, priceFamily: 1000, starter: true };
  const corn: Topping = { id: 't_corn', name: 'תירס', price: 500, pricePersonal: 500, priceFamily: 1000, starter: true };
  const mushroom: Topping = { id: 't_mushroom', name: 'פטריות', price: 500, pricePersonal: 500, priceFamily: 1000 };

  it('gives the first starter the personal (₪5) rate on a family tray', () => {
    expect(pricedAddedToppings([olives], 'family')).toEqual([500]);
    expect(pricedAddedToppings([olives, mushroom], 'family')).toEqual([500, 1000]);
  });

  it('charges a second starter at the full family rate (one shared slot)', () => {
    // corn first fills the slot at ₪5, olives then bills full ₪10
    expect(pricedAddedToppings([corn, olives], 'family')).toEqual([500, 1000]);
  });

  it('gives the first starter the ₪5 rate even after a non-starter topping', () => {
    // mushroom (₪10) then olives → olives still takes the opening slot (₪5)
    expect(pricedAddedToppings([mushroom, olives], 'family')).toEqual([1000, 500]);
  });

  it('changes nothing on a personal tray (already the personal rate)', () => {
    expect(pricedAddedToppings([olives, corn], 'personal')).toEqual([500, 500]);
  });

  it('spends the slot on a base starter, so an added starter bills full', () => {
    // Margarita already has olives in its recipe → adding corn is the 2nd starter
    expect(pricedAddedToppings([corn], 'family', true)).toEqual([1000]);
  });
});

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
        baseProductId: 'b_family', // build-your-own base (no base toppings) → full 3-free allowance
        baseName: 'משפחתית בהרכבה',
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

  it('charges every added topping when the base already includes its toppings', () => {
    // A preset pie (p_vino: 3 base toppings, included 3) has no free extras —
    // its price already covers the base, so all 3 additions are charged.
    const parts: LinePart[] = [
      {
        target: 'whole',
        baseProductId: 'p_vino',
        baseName: 'וינו וינו',
        toppings: [
          add('t_mushroom', 'פטריות', 500),
          add('t_onion', 'בצל', 500),
          add('t_corn', 'תירס', 500),
        ],
      },
    ];
    const l = line({ productId: 'p_vino', parts });
    expect(computeUnitPrice(l)).toBe(9500 + 1500);
  });

  it('bills both portions of a doubled (extra) topping', () => {
    // Preset pie (no free extras) + one topping served double → 2 portions charged.
    const parts: LinePart[] = [
      {
        target: 'whole',
        baseProductId: 'p_vino',
        baseName: 'וינו וינו',
        toppings: [{ toppingId: 't_mushroom', name: 'פטריות', action: 'add', price: 500, qty: 2 }],
      },
    ];
    const l = line({ productId: 'p_vino', parts });
    expect(computeUnitPrice(l)).toBe(9500 + 1000);
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

describe('fixed-price combos', () => {
  const combo = { uid: 'c1', bundleId: 'b', label: 'זוג משפחתיות', price: 16000 };
  const member = (extra = false) =>
    line({
      productId: 'p_vino', // base ₪95, recipe fills the included allowance
      bundleUid: 'c1',
      parts: [
        {
          target: 'whole',
          baseProductId: 'p_vino',
          baseName: 'וינו וינו',
          toppings: extra ? [add('t_mushroom', 'פטריות', 500)] : [],
        },
      ],
    });

  it('pins the tagged lines’ base prices to the deal price', () => {
    // two ₪95 pizzas = ₪190 base, deal ₪160 → ₪30 off
    expect(combosDiscount([member(), member()], [combo])).toBe(3000);
    expect(orderTotals([member(), member()], [], 0, [combo]).total).toBe(16000);
  });

  it('lets paid extra toppings add on top of the fixed price', () => {
    const totals = orderTotals([member(true), member()], [], 0, [combo]);
    expect(totals.total).toBe(16000 + 500); // deal price + the one paid topping
  });

  it('ignores a combo with no member lines in the cart', () => {
    expect(combosDiscount([line({ productId: 'd_coke' })], [combo])).toBe(0);
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
