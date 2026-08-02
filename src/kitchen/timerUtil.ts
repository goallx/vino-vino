import type { KitchenOrder } from '../types';

/**
 * Milliseconds left on an order's prep countdown, or null if it has none (not
 * preparing, or started without a timer). Negative = overdue. Derived from the
 * absolute start time so it's identical on every device and survives a reload.
 */
export function timerRemainingMs(order: KitchenOrder, now: number): number | null {
  if (order.status !== 'preparing' || order.prepStartedAt == null || order.timerSeconds == null) return null;
  if (!Number.isFinite(order.prepStartedAt) || !Number.isFinite(order.timerSeconds)) return null; // bad data → no timer
  return order.prepStartedAt + order.timerSeconds * 1000 - now;
}

/** mm:ss for a positive remaining span; clamps at 0:00. */
export function fmtCountdown(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
