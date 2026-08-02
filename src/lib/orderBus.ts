import type { AppliedBundle, CartLine, KitchenOrder, KitchenStatus } from '../types';
import { supabase, isSupabaseEnabled, isMissingColumn } from './supabase';

/**
 * The live order feed shared by the entry, kitchen, orders and reports screens.
 *
 * Supabase mode: the `orders` table is the source of truth — a rolling
 * 14-day window is fetched into a local cache (mirrored to localStorage so
 * the kitchen still renders through a network blip) and a realtime
 * subscription refetches on any change. Reads stay synchronous off the cache,
 * so the screens are identical in both modes.
 *
 * Local mode (no env vars): orders persist in localStorage and changes are
 * broadcast across same-origin tabs (BroadcastChannel) and within a tab
 * (a custom window event) — dev and tests run fully offline.
 */
const KEY = 'vino:kitchen-orders';
const LOCAL_EVENT = 'vino:orders-changed';
const WINDOW_DAYS = 14; // covers every report preset; older dates query directly

// Realtime events, reconnects and optimistic writes can start overlapping
// fetches. Only the newest response may replace the cache, and a field being
// written (status, timer) must win over any response that still carries the
// previous value — so we pin a per-order patch until a confirmed post-write
// fetch has refreshed the cache.
let refetchGeneration = 0;
const pendingPatches = new Map<string, Partial<KitchenOrder>>();
// How many writes are still in flight per order — the pin is only released once
// the last one has confirmed, so two overlapping writes can't unpin each other.
const inFlightWrites = new Map<string, number>();

const channel: BroadcastChannel | null =
  typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('vino-orders') : null;
let cachedRaw: string | null | undefined;
let cachedOrders: KitchenOrder[] = [];

export function loadOrders(): KitchenOrder[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === cachedRaw) return cachedOrders;
    cachedRaw = raw;
    cachedOrders = raw ? (JSON.parse(raw) as KitchenOrder[]) : [];
  } catch {
    /* keep the last usable in-memory snapshot */
  }
  return cachedOrders;
}

function save(list: KitchenOrder[]) {
  const raw = JSON.stringify(list);
  cachedRaw = raw;
  cachedOrders = list;
  try {
    localStorage.setItem(KEY, raw);
  } catch {
    /* storage unavailable — non-fatal */
  }
}

function announce() {
  channel?.postMessage('changed');
  window.dispatchEvent(new Event(LOCAL_EVENT));
}

/* ---------------- Supabase feed ---------------- */

interface OrderRow {
  id: string;
  daily_number: number;
  type: KitchenOrder['type'];
  status: KitchenStatus;
  customer_name: string | null;
  customer_phone: string | null;
  address: string | null;
  note: string | null;
  payment_status: KitchenOrder['payment'];
  lines: CartLine[] | null;
  discounts: AppliedBundle[] | null;
  delivery_fee: number | null;
  total: number;
  created_at: string;
  prep_started_at: string | null;
  timer_seconds: number | null;
}

/** epoch ms from a timestamptz string, or undefined if absent/unparseable. */
function parseTs(ts: string | null): number | undefined {
  if (!ts) return undefined;
  const ms = Date.parse(ts);
  return Number.isNaN(ms) ? undefined : ms;
}

function rowToOrder(row: OrderRow): KitchenOrder {
  return {
    id: row.id,
    number: row.daily_number,
    type: row.type,
    payment: row.payment_status,
    createdAt: Date.parse(row.created_at),
    status: row.status,
    prepStartedAt: parseTs(row.prep_started_at),
    timerSeconds: row.timer_seconds ?? undefined,
    customerName: row.customer_name ?? undefined,
    phone: row.customer_phone ?? undefined,
    address: row.address ?? undefined,
    note: row.note ?? undefined,
    lines: row.lines ?? [],
    discounts: row.discounts ?? undefined,
    deliveryFee: row.delivery_fee ?? undefined,
    total: row.total,
  };
}

/** Local calendar date (the device runs in the restaurant's timezone). */
function dayString(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function refetch(): Promise<void> {
  if (!supabase) return;
  const generation = ++refetchGeneration;
  const since = dayString(Date.now() - (WINDOW_DAYS - 1) * 86_400_000);
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .gte('order_day', since)
    .order('created_at');
  if (generation !== refetchGeneration) return;
  if (error) {
    console.error('[vino] failed to fetch orders', error);
    return; // keep serving the cached list
  }
  const orders = (data as OrderRow[]).map(rowToOrder).map((order) => {
    const patch = pendingPatches.get(order.id);
    return patch ? { ...order, ...patch } : order;
  });
  save(orders);
  announce();
}

/** One-shot window for reports on older dates (outside the rolling cache). */
export async function loadOrdersRange(fromMs: number, toMs: number): Promise<KitchenOrder[]> {
  if (!supabase) return loadOrders();
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .gte('order_day', dayString(fromMs))
    .lt('order_day', dayString(toMs))
    .order('created_at');
  if (error) {
    console.error('[vino] failed to fetch orders range', error);
    return [];
  }
  return (data as OrderRow[]).map(rowToOrder);
}

// One realtime channel for the whole app, created on first use; every screen's
// subscribe() shares it. On (re)connect we refetch — never trust missed events.
let realtimeStarted = false;
function ensureRealtime() {
  if (realtimeStarted || !supabase) return;
  realtimeStarted = true;
  supabase
    .channel('orders-feed')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => void refetch())
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') void refetch();
    });
}

/* ---------------- shared API (both modes) ---------------- */

export function publishOrder(order: KitchenOrder) {
  // Optimistic local write so this device's screens update instantly; in
  // Supabase mode the row was already inserted by saveOrder, and the next
  // refetch replaces this copy with the canonical one (uuid + daily number).
  const list = loadOrders().filter((o) => o.id !== order.id);
  list.push(order);
  save(list);
  announce();
  if (isSupabaseEnabled) void refetch();
}

const TIMER_COLUMNS = ['prep_started_at', 'timer_seconds'];

/** Release the pin once every in-flight write for this order has confirmed. */
function releasePin(id: string) {
  const left = (inFlightWrites.get(id) ?? 1) - 1;
  if (left > 0) {
    inFlightWrites.set(id, left);
  } else {
    inFlightWrites.delete(id);
    pendingPatches.delete(id);
  }
}

/**
 * Optimistically patch one order and write it through. `patch` updates the
 * in-app order (and is pinned so a concurrent refetch can't clobber it until
 * the write is confirmed); `row` is the matching snake_case column update.
 * Timer columns drop-and-retry so writes never break on an un-migrated DB. The
 * pin is ref-counted so two overlapping writes to the same order can't unpin
 * each other before both have landed.
 */
function patchOrder(id: string, patch: Partial<KitchenOrder>, row: Record<string, unknown>) {
  pendingPatches.set(id, { ...pendingPatches.get(id), ...patch });
  inFlightWrites.set(id, (inFlightWrites.get(id) ?? 0) + 1);
  refetchGeneration += 1; // invalidate a fetch that started before this tap
  save(loadOrders().map((o) => (o.id === id ? { ...o, ...patch } : o)));
  announce();
  if (!supabase) {
    releasePin(id);
    return;
  }
  const db = supabase;

  void (async () => {
    let { error } = await db.from('orders').update(row).eq('id', id);
    if (error && isMissingColumn(error, TIMER_COLUMNS)) {
      // Strip the timer columns and retry with whatever's left (e.g. status).
      const rest = { ...row };
      for (const c of TIMER_COLUMNS) delete rest[c];
      error = Object.keys(rest).length ? (await db.from('orders').update(rest).eq('id', id)).error : null;
    }
    if (error) {
      console.error('[vino] failed to update order', error);
      inFlightWrites.delete(id);
      pendingPatches.delete(id);
      refetchGeneration += 1;
      await refetch(); // roll the optimistic value back to database truth
      return;
    }

    // Keep the optimistic patch pinned until every in-flight write has confirmed
    // (releasePin). The realtime event may trigger another fetch; the generation
    // guard ensures whichever starts last is authoritative.
    await refetch();
    releasePin(id);
  })();
}

export function setStatus(id: string, status: KitchenStatus) {
  patchOrder(id, { status }, { status });
}

/**
 * Move an order into prep and (optionally) start a countdown of `timerSeconds`.
 * Called by the kitchen "התחל הכנה" flow — a preset chip passes its seconds; the
 * "start without timer" path passes nothing.
 */
export function startPrep(id: string, timerSeconds?: number) {
  const prepStartedAt = Date.now();
  patchOrder(
    id,
    { status: 'preparing', prepStartedAt, timerSeconds },
    {
      status: 'preparing',
      prep_started_at: new Date(prepStartedAt).toISOString(),
      timer_seconds: timerSeconds ?? null,
    },
  );
}

/**
 * Change or clear the countdown on an order already in prep. A number restarts
 * the timer from now; `null` clears it (prep keeps running, just untimed).
 */
export function setTimer(id: string, timerSeconds: number | null) {
  if (timerSeconds == null) {
    patchOrder(id, { timerSeconds: undefined }, { timer_seconds: null });
    return;
  }
  const prepStartedAt = Date.now();
  patchOrder(
    id,
    { prepStartedAt, timerSeconds },
    { prep_started_at: new Date(prepStartedAt).toISOString(), timer_seconds: timerSeconds },
  );
}

export function clearOrders() {
  save([]);
  announce();
}

/** Subscribe to any change; returns an unsubscribe fn. */
export function subscribe(cb: (orders: KitchenOrder[]) => void): () => void {
  ensureRealtime();
  const handler = () => cb(loadOrders());
  channel?.addEventListener('message', handler);
  window.addEventListener(LOCAL_EVENT, handler);
  window.addEventListener('storage', handler); // other tabs without BroadcastChannel
  return () => {
    channel?.removeEventListener('message', handler);
    window.removeEventListener(LOCAL_EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}
