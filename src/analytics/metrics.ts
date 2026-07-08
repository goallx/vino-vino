import type { KitchenOrder, Money } from '../types';
import { discountsTotal, lineTotal, linesSubtotal } from '../lib/cart';
import { productsById } from '../lib/menuStore';

export interface TopItem {
  name: string;
  qty: number;
  revenue: Money;
}

export interface HourBucket {
  hour: number; // 0–23
  count: number;
  revenue: Money;
}

export interface DailyMetrics {
  orderCount: number;
  revenue: Money; // net — what was actually charged (gross − bundle discounts)
  grossRevenue: Money; // full menu price before any deal
  discountTotal: Money; // total saved via bundle deals
  paidRevenue: Money;
  unpaidRevenue: Money;
  paidCount: number;
  unpaidCount: number;
  pizzaCount: number;
  itemCount: number;
  avgOrder: Money;
  deliveryCount: number;
  pickupCount: number;
  topItems: TopItem[];
  byHour: HourBucket[];
}

export function orderRevenue(order: KitchenOrder): Money {
  return linesSubtotal(order.lines) + (order.deliveryFee ?? 0);
}

/** Bundle saving applied to an order, never more than the order is worth. */
export function orderDiscount(order: KitchenOrder): Money {
  return Math.min(discountsTotal(order.discounts ?? []), orderRevenue(order));
}

export function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Orders with createdAt in [from, to). */
export function ordersInRange(orders: KitchenOrder[], from: number, to: number): KitchenOrder[] {
  return orders.filter((o) => o.createdAt >= from && o.createdAt < to);
}

/** Orders placed on the same calendar day as `ref` (default: now). */
export function ordersForDay(orders: KitchenOrder[], ref: number = Date.now()): KitchenOrder[] {
  const from = startOfDay(ref);
  return ordersInRange(orders, from, from + DAY_MS);
}

/** Aggregate metrics over whatever set of orders is passed in (cancelled excluded). */
export function computeMetrics(all: KitchenOrder[]): DailyMetrics {
  const day = all.filter((o) => o.status !== 'cancelled');
  let revenue = 0;
  let grossRevenue = 0;
  let discountTotal = 0;
  let paidRevenue = 0;
  let unpaidRevenue = 0;
  let paidCount = 0;
  let unpaidCount = 0;
  let pizzaCount = 0;
  let itemCount = 0;
  let deliveryCount = 0;
  let pickupCount = 0;

  const items = new Map<string, TopItem>();
  const hours = new Map<number, HourBucket>();

  for (const order of day) {
    const gross = orderRevenue(order);
    const disc = orderDiscount(order);
    const rev = gross - disc; // net charged
    grossRevenue += gross;
    discountTotal += disc;
    revenue += rev;
    if (order.payment === 'paid') {
      paidRevenue += rev;
      paidCount += 1;
    } else {
      unpaidRevenue += rev;
      unpaidCount += 1;
    }
    if (order.type === 'delivery') deliveryCount += 1;
    else pickupCount += 1;

    for (const line of order.lines) {
      itemCount += line.qty;
      if (productsById[line.productId]?.isPizza) pizzaCount += line.qty;
      const prev = items.get(line.name) ?? { name: line.name, qty: 0, revenue: 0 };
      prev.qty += line.qty;
      prev.revenue += lineTotal(line);
      items.set(line.name, prev);
    }

    const hour = new Date(order.createdAt).getHours();
    const bucket = hours.get(hour) ?? { hour, count: 0, revenue: 0 };
    bucket.count += 1;
    bucket.revenue += rev;
    hours.set(hour, bucket);
  }

  const topItems = [...items.values()].sort((a, b) => b.qty - a.qty).slice(0, 6);
  const byHour = [...hours.values()].sort((a, b) => a.hour - b.hour);
  const orderCount = day.length;

  return {
    orderCount,
    revenue,
    grossRevenue,
    discountTotal,
    paidRevenue,
    unpaidRevenue,
    paidCount,
    unpaidCount,
    pizzaCount,
    itemCount,
    avgOrder: orderCount ? Math.round(revenue / orderCount) : 0,
    deliveryCount,
    pickupCount,
    topItems,
    byHour,
  };
}

/** Convenience: metrics for the calendar day containing `ref`. */
export function dailyMetrics(orders: KitchenOrder[], ref: number = Date.now()): DailyMetrics {
  return computeMetrics(ordersForDay(orders, ref));
}
