import type { AppliedBundle, CartLine, KitchenOrder, KitchenStatus } from '../types';
import { supabase, isSupabaseEnabled } from './supabase';

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

const channel: BroadcastChannel | null =
  typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('vino-orders') : null;

export function loadOrders(): KitchenOrder[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as KitchenOrder[]) : [];
  } catch {
    return [];
  }
}

function save(list: KitchenOrder[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
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
  created_at: string;
}

function rowToOrder(row: OrderRow): KitchenOrder {
  return {
    id: row.id,
    number: row.daily_number,
    type: row.type,
    payment: row.payment_status,
    createdAt: Date.parse(row.created_at),
    status: row.status,
    customerName: row.customer_name ?? undefined,
    phone: row.customer_phone ?? undefined,
    address: row.address ?? undefined,
    note: row.note ?? undefined,
    lines: row.lines ?? [],
    discounts: row.discounts ?? undefined,
  };
}

/** Local calendar date (the device runs in the restaurant's timezone). */
function dayString(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function refetch(): Promise<void> {
  if (!supabase) return;
  const since = dayString(Date.now() - (WINDOW_DAYS - 1) * 86_400_000);
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .gte('order_day', since)
    .order('created_at');
  if (error) {
    console.error('[vino] failed to fetch orders', error);
    return; // keep serving the cached list
  }
  save((data as OrderRow[]).map(rowToOrder));
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

export function setStatus(id: string, status: KitchenStatus) {
  save(loadOrders().map((o) => (o.id === id ? { ...o, status } : o)));
  announce();
  if (supabase) {
    void supabase
      .from('orders')
      .update({ status })
      .eq('id', id)
      .then(({ error }) => {
        if (error) console.error('[vino] failed to update order status', error);
      });
  }
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
