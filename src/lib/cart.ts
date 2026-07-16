import type { AppliedBundle, AppliedCombo, CartLine, LinePart, Money, PizzaSize, Product, Topping } from '../types';
import { productsById } from './menuStore';

let counter = 0;
export function newLineId(): string {
  counter += 1;
  return `l_${Date.now().toString(36)}_${counter}`;
}

/**
 * Which topping-price tier a line bills at. A sized pizza (family/personal
 * variants) is decided by the chosen size variant; a single-size pizza is
 * family by default, except an explicitly-personal base (e.g. אישית בהרכבה).
 */
export function sizeOfProduct(product: Product, variantLabel?: string): PizzaSize {
  if (product.variants?.length) {
    const v = product.variants.find((x) => x.label === variantLabel) ?? product.variants[0];
    if (v?.size) return v.size;
  }
  return /אישית/.test(product.name) ? 'personal' : 'family';
}

/** Per-portion topping price for the given tray size, falling back to `price`. */
export function toppingPrice(t: Topping, size: PizzaSize): Money {
  const sized = size === 'family' ? t.priceFamily : t.pricePersonal;
  return sized ?? t.price;
}

/**
 * Per-portion prices for a pizza's ADDED toppings (in the order they were
 * added), applying the "opening price" rule: the first starter topping
 * (olives/corn) bills at the personal rate even on a family tray — one shared
 * slot — and everything else bills at the tray's size rate.
 */
export function pricedAddedToppings(added: Topping[], size: PizzaSize): Money[] {
  let starterClaimed = false;
  return added.map((t) => {
    const isStarter = !!t.starter && !starterClaimed;
    if (isStarter) starterClaimed = true;
    return isStarter ? toppingPrice(t, 'personal') : toppingPrice(t, size);
  });
}

/**
 * Paid toppings on one part. The product's fixed price already includes its
 * base toppings (its `art`), so those consume the free allowance first: only
 * `includedToppings − baseCount` *added* toppings stay free, the rest are
 * charged. A build-your-own pie (no base art) keeps its full free allowance.
 */
function partExtraCost(part: LinePart, included: number): Money {
  const baseCount = productsById[part.baseProductId]?.art?.length ?? 0;
  const freeAdded = Math.max(0, included - baseCount);
  // Expand each add to its portions (extra = 2) so a doubled topping bills the
  // second portion; the free allowance covers the first `freeAdded` portions.
  const portions: Money[] = [];
  for (const t of part.toppings) {
    if (t.action !== 'add') continue;
    for (let i = 0; i < (t.qty ?? 1); i += 1) portions.push(t.price);
  }
  return portions.slice(freeAdded).reduce((sum, p) => sum + p, 0);
}

/** A line's base (size-aware) price, before any added toppings. */
export function lineBasePrice(line: CartLine): Money {
  const product = productsById[line.productId];
  if (!product) return line.unitPrice;
  if (line.variantLabel && product.variants) {
    const v = product.variants.find((x) => x.label === line.variantLabel);
    if (v) return v.price;
  }
  return product.basePrice;
}

export function computeUnitPrice(line: CartLine): Money {
  const product = productsById[line.productId];
  if (!product) return line.unitPrice;

  const base = lineBasePrice(line);
  if (!product.isPizza) return base;

  const included = product.includedToppings ?? 0;
  const extras = line.parts.reduce((sum, part) => sum + partExtraCost(part, included), 0);
  return base + extras;
}

/** Price of a single cart line including its quantity. */
export function lineTotal(line: CartLine): Money {
  return computeUnitPrice(line) * line.qty;
}

/** Gross price of every line at full menu price, before any deal. */
export function linesSubtotal(lines: CartLine[]): Money {
  return lines.reduce((sum, l) => sum + lineTotal(l), 0);
}

/** Sum of applied bundle savings. */
export function discountsTotal(discounts: AppliedBundle[]): Money {
  return discounts.reduce((sum, d) => sum + d.amount, 0);
}

/**
 * Fixed-price combos: each combo's member lines (tagged with its uid) have
 * their *base* prices pinned to the deal `price`, so swapping which pizzas fill
 * the combo never changes what it costs. Paid extra toppings stay on top.
 */
export function combosDiscount(lines: CartLine[], combos: AppliedCombo[]): Money {
  return combos.reduce((sum, c) => {
    const base = lines
      .filter((l) => l.bundleUid === c.uid)
      .reduce((s, l) => s + lineBasePrice(l) * l.qty, 0);
    return sum + Math.max(0, base - c.price);
  }, 0);
}

/**
 * Flatten fixed-price combos into the same AppliedBundle shape the auto-detect
 * deals use — so persistence, the kitchen board, and reports all see a combo's
 * saving uniformly (each combo's amount = its members' base minus the deal price).
 */
export function combosAsDiscounts(lines: CartLine[], combos: AppliedCombo[]): AppliedBundle[] {
  return combos.map((c) => {
    const base = lines
      .filter((l) => l.bundleUid === c.uid)
      .reduce((s, l) => s + lineBasePrice(l) * l.qty, 0);
    return { uid: c.uid, bundleId: c.bundleId, label: c.label, amount: Math.max(0, base - c.price) };
  });
}

export interface OrderTotals {
  subtotal: Money; // gross, before deals
  discount: Money; // total bundle saving
  total: Money; // net charged, never below 0
}

/**
 * The three figures every order needs — gross, saving, net. The single source
 * of truth shared by the live ticket, the persisted order, and the reports, so
 * the number the owner quotes can never drift from what gets saved or reported.
 */
export function orderTotals(
  lines: CartLine[],
  discounts: AppliedBundle[] = [],
  deliveryFee: Money = 0,
  combos: AppliedCombo[] = [],
): OrderTotals {
  const subtotal = linesSubtotal(lines);
  const discount = discountsTotal(discounts) + combosDiscount(lines, combos);
  return { subtotal, discount, total: Math.max(0, subtotal - discount) + deliveryFee };
}

/** One whole part that mirrors the product itself (no modifications). */
export function wholePart(product: Product): LinePart {
  return { target: 'whole', baseProductId: product.id, baseName: product.name, toppings: [] };
}

function partToppingText(part: LinePart): string {
  const adds = part.toppings
    .filter((t) => t.action === 'add')
    .map((t) => `+${t.name}${(t.qty ?? 1) > 1 ? ' ×2' : ''}`);
  const removes = part.toppings.filter((t) => t.action === 'remove').map((t) => `−${t.name}`);
  return [...adds, ...removes].join(' ');
}

/** Short human summary for the ticket and kitchen card. */
export function lineSummary(line: CartLine): string {
  const product = productsById[line.productId];
  if (product && !product.isPizza) {
    return line.variantLabel ?? '';
  }
  if (!line.isSplit) {
    const whole = line.parts[0];
    return whole ? partToppingText(whole) : '';
  }
  const half = (t: 'half_1' | 'half_2') => {
    const p = line.parts.find((x) => x.target === t);
    if (!p) return '';
    const toppings = partToppingText(p);
    return `½ ${p.baseName}${toppings ? ' ' + toppings : ''}`;
  };
  return `חצי / חצי · ${half('half_1')} · ${half('half_2')}`;
}
