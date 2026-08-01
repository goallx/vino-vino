import { beforeAll, describe, it, expect } from 'vitest';
import type { CartLine, LinePart, ToppingSel } from '../types';
import { computeUnitPrice, lineSummary, wholePart, newLineId, lineTotal, linesSubtotal, discountsTotal, orderTotals, sizeOfProduct, toppingPrice, combosDiscount, pricedAddedToppings, partToppingCharges, manualDiscountAmount, manualDiscountBundle } from './cart';
import type { AppliedBundle, Product, Topping } from '../types';
import { productsById } from '../test/fixtures/catalog';
import { productsById as menuProducts } from './menuStore';
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

  it('charges every added topping when the pizza grants no bonus free toppings', () => {
    // A preset pie (p_vino: recipe in the base price, 0 bonus free) charges every
    // ADDED topping — the recipe no longer consumes any free allowance.
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

describe('computeUnitPrice() — bonus free toppings + eligibility whitelist', () => {
  // A chef pizza priced ₪100 that grants 2 bonus free toppings, but excludes the
  // premium chicken from the free allowance.
  const chef: Product = {
    id: 'p_chef', categoryId: 'pizza', name: 'פיצה עוף', basePrice: 10000, isPizza: true,
    splitCapable: true, includedToppings: 2, art: [],
    freeToppingIds: ['t_mushroom', 't_onion', 't_olives', 't_corn'], // NOT chicken
  };
  beforeAll(() => { menuProducts[chef.id] = chef; });

  const chefLine = (toppings: ToppingSel[]) =>
    line({ productId: chef.id, parts: [{ target: 'whole', baseProductId: chef.id, baseName: chef.name, toppings }] });

  it('waives 2 eligible adds free but charges an excluded topping (chicken)', () => {
    const l = chefLine([
      add('t_mushroom', 'פטריות', 500),
      add('t_onion', 'בצל', 500),
      add('t_chicken', 'נתחי עוף', 900), // excluded from free → always charged
    ]);
    expect(computeUnitPrice(l)).toBe(10000 + 900);
  });

  it('charges eligible adds beyond the free count', () => {
    const l = chefLine([
      add('t_mushroom', 'פטריות', 500),
      add('t_onion', 'בצל', 500),
      add('t_olives', 'זיתים', 500), // 3rd eligible → over the 2 free
      add('t_corn', 'תירס', 500),    // 4th eligible → over the 2 free
    ]);
    expect(computeUnitPrice(l)).toBe(10000 + 1000);
  });

  it('waives the priciest eligible toppings first (best-value)', () => {
    // 1 free slot, two eligible adds at ₪6 and ₪5 → the ₪6 is waived, ₪5 charged
    const one: Product = { ...chef, id: 'p_one', includedToppings: 1, freeToppingIds: undefined };
    menuProducts[one.id] = one;
    const l = line({ productId: one.id, parts: [{ target: 'whole', baseProductId: one.id, baseName: one.name, toppings: [
      add('t_bulgarit', 'בולגרית', 600),
      add('t_mushroom', 'פטריות', 500),
    ] }] });
    expect(computeUnitPrice(l)).toBe(10000 + 500);
  });

  it('treats an absent whitelist as all-eligible', () => {
    const all: Product = { ...chef, id: 'p_all', includedToppings: 2, freeToppingIds: undefined };
    menuProducts[all.id] = all;
    const l = line({ productId: all.id, parts: [{ target: 'whole', baseProductId: all.id, baseName: all.name, toppings: [
      add('t_mushroom', 'פטריות', 500),
      add('t_chicken', 'נתחי עוף', 900), // now eligible (no whitelist) and priciest → waived
    ] }] });
    expect(computeUnitPrice(l)).toBe(10000); // both within the 2 free
  });

  it('partToppingCharges (builder hints) sums to the line total extras', () => {
    // The builder badges each topping from partToppingCharges; those must add up
    // to exactly what the total charges. chef: 2 free, chicken excluded.
    const toppings: ToppingSel[] = [
      add('t_mushroom', 'פטריות', 500),
      add('t_onion', 'בצל', 500),
      add('t_olives', 'זיתים', 500), // 3rd eligible → charged
      add('t_chicken', 'נתחי עוף', 900), // excluded → charged
    ];
    const part: LinePart = { target: 'whole', baseProductId: chef.id, baseName: chef.name, toppings };
    const charges = partToppingCharges(part, 2);
    const badgeSum = [...charges.values()].reduce((a, b) => a + b, 0);
    expect(charges.get('t_chicken')).toBe(900);
    expect(badgeSum).toBe(computeUnitPrice(line({ productId: chef.id, parts: [part] })) - 10000);
    expect(badgeSum).toBe(1400); // olives ₪5 + chicken ₪9
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

describe('manual owner discount', () => {
  it('computes a percentage off the base, rounding the final price up to a whole shekel', () => {
    expect(manualDiscountAmount({ kind: 'percent', value: 10 }, 10000)).toBe(1000); // ₪100 → ₪90, already whole
    // ₪13 − 10% = ₪11.70 → final rounds up to ₪12, so the discount is ₪1
    expect(manualDiscountAmount({ kind: 'percent', value: 10 }, 1300)).toBe(100);
    // ₪65 − 15% = ₪55.25 → final rounds up to ₪56, so the discount is ₪9
    expect(manualDiscountAmount({ kind: 'percent', value: 15 }, 6500)).toBe(900);
  });
  it('caps a fixed amount at the base and rounds', () => {
    expect(manualDiscountAmount({ kind: 'amount', value: 2000 }, 10000)).toBe(2000);
    expect(manualDiscountAmount({ kind: 'amount', value: 99999 }, 5000)).toBe(5000);
  });
  it('is zero for no/empty discount or empty order', () => {
    expect(manualDiscountAmount(undefined, 10000)).toBe(0);
    expect(manualDiscountAmount({ kind: 'percent', value: 0 }, 10000)).toBe(0);
    expect(manualDiscountAmount({ kind: 'percent', value: 10 }, 0)).toBe(0);
  });
  it('produces a labelled bundle that folds into order totals', () => {
    const b = manualDiscountBundle({ kind: 'percent', value: 20 }, 10000);
    expect(b).toEqual({ uid: 'manual', bundleId: 'manual', label: 'הנחה 20%', amount: 2000 });
    // ₪100 order, 20% off → ₪80
    expect(orderTotals([line({ productId: 'd_coke', qty: 10 })], [b!]).total).toBe(8000);
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

describe('free-topping perk', () => {
  // p_vino: base ₪95, its recipe (art=3) exactly fills its included allowance
  // (inc=3), so every ADDED topping here is charged — clean pool to reason about.
  const pizza = (uid = 'ft') =>
    line({
      productId: 'p_vino',
      bundleUid: uid,
      parts: [
        {
          target: 'whole',
          baseProductId: 'p_vino',
          baseName: 'וינו וינו',
          toppings: [
            add('t_mushroom', 'פטריות', 500),
            add('t_bulgarit', 'בולגרית', 700),
            add('t_pepperoni', 'פפרוני', 700),
          ],
        },
      ],
    });

  it('waives the priciest N added toppings (best-value-first)', () => {
    // charged portions [500,700,700]; perk of 2 waives the two ₪7 → ₪14 off,
    // on top of base netting (₪95 base vs ₪95 deal price = 0).
    const combo = { uid: 'ft', bundleId: 'b', label: 'תוספות חינם', price: 9500, freeToppings: 2 };
    expect(combosDiscount([pizza()], [combo])).toBe(1400);
    // pays base + only the cheapest topping left: 9500 + 500 = 10000
    expect(orderTotals([pizza()], [], 0, [combo]).total).toBe(10000);
  });

  it('applies the free toppings per pizza, not as a shared pool', () => {
    // two pizzas, each charged [500,700,700]; perk of 2 waives the two ₪7 on
    // EACH pizza → 1400 per pizza, 2800 total (a shared pool would give 1400).
    const combo = { uid: 'ft', bundleId: 'b', label: 'תוספות חינם', price: 19000, freeToppings: 2 };
    expect(combosDiscount([pizza(), pizza()], [combo])).toBe(2800);
  });

  it('a pizza cannot spend another pizza’s free slots', () => {
    // one pizza with no added toppings, one with three; perk of 2 per pizza. The
    // bare pizza waives nothing (its 2 slots don't transfer), the loaded one
    // waives its two ₪7 = 1400. A shared pool of 2 would also land on the ₪7s,
    // but the point is the empty pizza's allowance is NOT reused.
    const bare = line({ productId: 'p_vino', bundleUid: 'ft', parts: [{ target: 'whole', baseProductId: 'p_vino', baseName: 'וינו וינו', toppings: [] }] });
    const combo = { uid: 'ft', bundleId: 'b', label: 'תוספות חינם', price: 19000, freeToppings: 2 };
    expect(combosDiscount([bare, pizza()], [combo])).toBe(1400);
  });

  it('only waives toppings on the deal’s eligible list (premium ones stay charged)', () => {
    // charged pool [500,700,700] = mushroom, bulgarit, pepperoni. The deal's perk
    // covers only mushroom + bulgarit, so pepperoni (₪7) can never come off even
    // though it's the priciest. Perk of 2 waives 500 + 700 = ₪12, not ₪14.
    const combo = {
      uid: 'ft', bundleId: 'b', label: 'תוספות ירקות חינם', price: 9500,
      freeToppings: 2, freeToppingIds: ['t_mushroom', 't_bulgarit'],
    };
    expect(combosDiscount([pizza()], [combo])).toBe(1200);
    // pays base + the always-charged pepperoni: 9500 + 700 = 10200
    expect(orderTotals([pizza()], [], 0, [combo]).total).toBe(10200);
  });

  it('treats an absent eligible list as covering every topping', () => {
    const combo = { uid: 'ft', bundleId: 'b', label: 'תוספות חינם', price: 9500, freeToppings: 2 };
    expect(combosDiscount([pizza()], [combo])).toBe(1400); // waives the two ₪7 as before
  });

  it('waives nothing when the deal has no perk', () => {
    const combo = { uid: 'ft', bundleId: 'b', label: 'ללא הטבה', price: 9500, freeToppings: 0 };
    expect(combosDiscount([pizza()], [combo])).toBe(0);
  });

  it('never waives more than the toppings actually on the pizza', () => {
    // perk of 5 but only 3 charged portions → caps at their sum (1900)
    const combo = { uid: 'ft', bundleId: 'b', label: 'הטבה גדולה', price: 9500, freeToppings: 5 };
    expect(combosDiscount([pizza()], [combo])).toBe(1900);
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
