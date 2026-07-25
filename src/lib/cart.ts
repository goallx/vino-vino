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
 * slot — and everything else bills at the tray's size rate. Pass
 * `slotClaimed` when the pizza's recipe already carries a starter (e.g. a
 * Margarita's base olives), so the slot is spent and added starters bill full.
 */
export function pricedAddedToppings(added: Topping[], size: PizzaSize, slotClaimed = false): Money[] {
  let starterClaimed = slotClaimed;
  return added.map((t) => {
    const isStarter = !!t.starter && !starterClaimed;
    if (isStarter) starterClaimed = true;
    return isStarter ? toppingPrice(t, 'personal') : toppingPrice(t, size);
  });
}

/**
 * The added-topping portions on one part that remain *charged* after the free
 * allowance. The product's fixed price already includes its base toppings (its
 * `art`), so those consume the free allowance first: only `includedToppings −
 * baseCount` *added* toppings stay free, the rest are charged. A build-your-own
 * pie (no base art) keeps its full free allowance. Each add expands to its
 * portions (extra = 2) so a doubled topping bills its second portion.
 */
function partChargedPortions(part: LinePart, included: number): Money[] {
  const baseCount = productsById[part.baseProductId]?.art?.length ?? 0;
  const freeAdded = Math.max(0, included - baseCount);
  const portions: Money[] = [];
  for (const t of part.toppings) {
    if (t.action !== 'add') continue;
    for (let i = 0; i < (t.qty ?? 1); i += 1) portions.push(t.price);
  }
  return portions.slice(freeAdded);
}

/** Sum of a part's charged added-topping portions. */
function partExtraCost(part: LinePart, included: number): Money {
  return partChargedPortions(part, included).reduce((sum, p) => sum + p, 0);
}

/**
 * Every charged added-topping portion on a pizza line (across its parts), after
 * the line's own free allowance. Used to price a deal's free-topping perk: the
 * perk waives the priciest of these across the combo's pizzas.
 */
export function chargedToppingPortions(line: CartLine): Money[] {
  const product = productsById[line.productId];
  if (!product?.isPizza) return [];
  const included = product.includedToppings ?? 0;
  return line.parts.flatMap((part) => partChargedPortions(part, included));
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
  if (!product.isPizza) {
    // Non-pizza dishes (e.g. salads) charge each added extra directly; base
    // ingredients and free toggles (seasoning) carry price 0, so they add nothing.
    const extras = line.parts.reduce(
      (sum, part) =>
        sum + part.toppings.reduce((s, t) => (t.action === 'add' ? s + t.price * (t.qty ?? 1) : s), 0),
      0,
    );
    return base + extras;
  }

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
 * A deal's free-topping perk: it waives the `freeToppings` priciest charged
 * added-topping portions across the combo's pizzas (best-value-first, so the
 * customer's most expensive toppings come off). Returns the saving in agorot.
 */
export function comboFreeToppingsSaving(members: CartLine[], freeToppings = 0): Money {
  if (freeToppings <= 0) return 0;
  const portions = members.flatMap(chargedToppingPortions).sort((a, b) => b - a);
  return portions.slice(0, freeToppings).reduce((sum, p) => sum + p, 0);
}

/** A combo's full saving: base-price netting plus its free-topping perk. */
function comboSaving(members: CartLine[], combo: AppliedCombo): Money {
  const base = members.reduce((s, l) => s + lineBasePrice(l) * l.qty, 0);
  return Math.max(0, base - combo.price) + comboFreeToppingsSaving(members, combo.freeToppings);
}

/**
 * Fixed-price combos: each combo's member lines (tagged with its uid) have
 * their *base* prices pinned to the deal `price`, so swapping which pizzas fill
 * the combo never changes what it costs. Paid extra toppings stay on top —
 * minus any free-topping perk the deal grants.
 */
export function combosDiscount(lines: CartLine[], combos: AppliedCombo[]): Money {
  return combos.reduce((sum, c) => {
    const members = lines.filter((l) => l.bundleUid === c.uid);
    return sum + comboSaving(members, c);
  }, 0);
}

/**
 * Flatten fixed-price combos into the same AppliedBundle shape the auto-detect
 * deals use — so persistence, the kitchen board, and reports all see a combo's
 * saving uniformly (each combo's amount = base netting + free-topping perk).
 */
export function combosAsDiscounts(lines: CartLine[], combos: AppliedCombo[]): AppliedBundle[] {
  return combos.map((c) => {
    const members = lines.filter((l) => l.bundleUid === c.uid);
    return { uid: c.uid, bundleId: c.bundleId, label: c.label, amount: comboSaving(members, c) };
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

// Only pizzas, salads and meat meals are customizable — drinks, desserts and
// sides are added as-is with no edit page.
const EDITABLE_CATEGORIES = new Set(['salads', 'meat']);
export function isEditableLine(line: CartLine): boolean {
  const p = productsById[line.productId];
  if (!p) return false;
  return !!p.isPizza || EDITABLE_CATEGORIES.has(p.categoryId);
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
    // Salads and other customizable dishes carry their removals/extras on the
    // whole part; show them next to any size label.
    const whole = line.parts[0];
    const toppingText = whole ? partToppingText(whole) : '';
    return [line.variantLabel, toppingText].filter(Boolean).join(' · ');
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
