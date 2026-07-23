import type { ShiftSummary } from '../analytics/shift';
import { startOfDay } from '../analytics/metrics';
import { supabase, isSupabaseEnabled } from './supabase';

/**
 * Shift lifecycle + history.
 *
 * A shift is the working day. It opens at `currentShiftStart()` and closes when
 * the owner taps "סגור משמרת", which snapshots the day's figures into the log
 * and moves the boundary to now — so the next order is #01 again.
 *
 * Non-destructive: closing never deletes orders (reports still see them). The
 * boundary is just a timestamp; numbering and the live summary count only
 * orders created after it.
 */
const CLOSED_AT_KEY = 'vino:shift-closed-at';
const LOG_KEY = 'vino:shift-log';
const LOG_CAP = 180; // ~6 months of daily shifts kept on-device

/** A closed shift: the summary snapshot plus who closed it and when. */
export interface ShiftRecord extends ShiftSummary {
  openedAt: number;
  closedAt: number;
  closedBy?: string;
}

function lastClosedAt(): number {
  try {
    const raw = localStorage.getItem(CLOSED_AT_KEY);
    return raw ? Number(raw) || 0 : 0;
  } catch {
    return 0;
  }
}

/**
 * When the current (open) shift began: the later of midnight and the last close.
 * Using midnight as a floor means the natural daily reset still happens on its
 * own — a stale close from a previous day never holds the boundary back.
 */
export function currentShiftStart(now: number = Date.now()): number {
  return Math.max(startOfDay(now), lastClosedAt());
}

export function loadShifts(): ShiftRecord[] {
  try {
    const raw = localStorage.getItem(LOG_KEY);
    return raw ? (JSON.parse(raw) as ShiftRecord[]) : [];
  } catch {
    return [];
  }
}

/**
 * Persist a closed shift and advance the boundary to `record.closedAt`. Writes
 * to localStorage always (the on-device history); mirrors to Supabase when
 * configured (fire-and-forget — the local log is the source of truth for the
 * in-store screen).
 */
export function closeShift(record: ShiftRecord): void {
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify([record, ...loadShifts()].slice(0, LOG_CAP)));
    localStorage.setItem(CLOSED_AT_KEY, String(record.closedAt));
  } catch {
    /* storage unavailable — non-fatal, the reset still happens in-memory */
  }
  if (isSupabaseEnabled) void persistRemote(record);
}

async function persistRemote(record: ShiftRecord): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('shifts').insert({
    opened_at: new Date(record.openedAt).toISOString(),
    closed_at: new Date(record.closedAt).toISOString(),
    closed_by: record.closedBy ?? null,
    order_count: record.orderCount,
    income: record.income,
    delivery_fee_total: record.deliveryFeeTotal,
    courier_owed: record.courierOwed,
    net_after_courier: record.netAfterCourier,
    delivery_count: record.deliveryCount,
    pickup_count: record.pickupCount,
    paid_revenue: record.paidRevenue,
    unpaid_revenue: record.unpaidRevenue,
    paid_count: record.paidCount,
    unpaid_count: record.unpaidCount,
  });
  if (error) console.error('[vino] failed to save shift', error);
}
