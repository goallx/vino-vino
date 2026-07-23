import type { KitchenOrder, Money } from '../types';
import { computeMetrics, startOfDay } from './metrics';

const DAY_MS = 24 * 60 * 60 * 1000;

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
 * End-of-shift cash summary for the shift that began at `since` (default: the
 * start of today, i.e. the natural calendar-day window). A shift is bounded to
 * at most one day — orders from `since` up to `since + 24h` are counted.
 *
 * READ-ONLY aggregation over already-loaded orders — it never mutates or resets
 * anything. Cancelled orders are excluded from every figure. The reset that
 * closing a shift performs lives in the UI layer (see lib/shifts + App), not
 * here, so this stays a pure function.
 */
export function shiftSummary(
  orders: KitchenOrder[],
  since: number = startOfDay(Date.now()),
): ShiftSummary {
  const window = orders.filter(
    (o) => o.createdAt >= since && o.createdAt < since + DAY_MS && o.status !== 'cancelled',
  );
  const m = computeMetrics(window); // computeMetrics also drops cancelled — belt and suspenders

  const deliveryFeeTotal = window
    .filter((o) => o.type === 'delivery')
    .reduce((sum, o) => sum + (o.deliveryFee ?? 0), 0);
  const courierOwed = Math.round(deliveryFeeTotal * COURIER_FEE_SHARE);

  return {
    date: startOfDay(since),
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
