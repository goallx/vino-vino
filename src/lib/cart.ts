import type { AppliedBundle, CartLine, LinePart, Money, Product } from '../types';
import { productsById } from './menuStore';

let counter = 0;
export function newLineId(): string {
  counter += 1;
  return `l_${Date.now().toString(36)}_${counter}`;
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
  const added = part.toppings.filter((t) => t.action === 'add');
  return added.slice(freeAdded).reduce((sum, t) => sum + t.price, 0);
}

export function computeUnitPrice(line: CartLine): Money {
  const product = productsById[line.productId];
  if (!product) return line.unitPrice;

  let base = product.basePrice;
  if (line.variantLabel && product.variants) {
    const v = product.variants.find((x) => x.label === line.variantLabel);
    if (v) base = v.price;
  }

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
): OrderTotals {
  const subtotal = linesSubtotal(lines);
  const discount = discountsTotal(discounts);
  return { subtotal, discount, total: Math.max(0, subtotal - discount) + deliveryFee };
}

/** One whole part that mirrors the product itself (no modifications). */
export function wholePart(product: Product): LinePart {
  return { target: 'whole', baseProductId: product.id, baseName: product.name, toppings: [] };
}

function partToppingText(part: LinePart): string {
  const adds = part.toppings.filter((t) => t.action === 'add').map((t) => `+${t.name}`);
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
