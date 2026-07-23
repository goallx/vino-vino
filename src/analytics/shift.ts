import type { KitchenOrder, Money } from '../types';
import { computeMetrics, ordersForDay, startOfDay } from './metrics';

/**
 * Share of the collected delivery fees that is paid out to the courier.
 *
 * ASSUMPTION: the courier receives 100% of every delivery fee collected today
 * (the fee is a straight pass-through — the shop keeps nothing from it). If the
 * shop later decides to keep a cut, change this single constant (e.g. 0.8 to pay
 * the courier 80% of collected fees) — every figure below follows automatically.
 */
export const COURIER_FEE_SHARE = 1;

export interface ShiftSummary {
  /** Start-of-day timestamp the summary covers. */
  date: number;
  /** Completed (non-cancelled) orders in the shift. */
  orderCount: number;
  /** Total income collected this shift — net of deal discounts, delivery fees included. */
  income: Money;
  /** Delivery fees collected today (non-cancelled delivery orders only). */
  deliveryFeeTotal: Money;
  /** Amount owed to the courier = deliveryFeeTotal × COURIER_FEE_SHARE. */
  courierOwed: Money;
  /** What the shop keeps after paying the courier: income − courierOwed. */
  netAfterCourier: Money;
  deliveryCount: number;
  pickupCount: number;
  paidRevenue: Money;
  unpaidRevenue: Money;
  paidCount: number;
  unpaidCount: number;
}

/**
 * End-of-shift cash summary for the calendar day containing `ref` (default: now).
 *
 * READ-ONLY aggregation over already-loaded orders — it never mutates or resets
 * anything. Cancelled orders are excluded from every figure.
 */
export function shiftSummary(orders: KitchenOrder[], ref: number = Date.now()): ShiftSummary {
  const day = ordersForDay(orders, ref).filter((o) => o.status !== 'cancelled');
  const m = computeMetrics(day); // computeMetrics also drops cancelled — belt and suspenders

  const deliveryFeeTotal = day
    .filter((o) => o.type === 'delivery')
    .reduce((sum, o) => sum + (o.deliveryFee ?? 0), 0);
  const courierOwed = Math.round(deliveryFeeTotal * COURIER_FEE_SHARE);

  return {
    date: startOfDay(ref),
    orderCount: m.orderCount,
    income: m.revenue,
    deliveryFeeTotal,
    courierOwed,
    netAfterCourier: m.revenue - courierOwed,
    deliveryCount: m.deliveryCount,
    pickupCount: m.pickupCount,
    paidRevenue: m.paidRevenue,
    unpaidRevenue: m.unpaidRevenue,
    paidCount: m.paidCount,
    unpaidCount: m.unpaidCount,
  };
}
