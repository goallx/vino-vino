import type { KitchenOrder, KitchenStatus } from '../types';

/**
 * A tiny order bus so the entry tablet and the kitchen tablet share live order
 * state without a backend yet: orders persist in localStorage and changes are
 * broadcast across same-origin tabs (BroadcastChannel) and within a tab (a
 * custom window event). Swapping this for Supabase realtime later touches only
 * this file.
 */
const KEY = 'vino:kitchen-orders';
const LOCAL_EVENT = 'vino:orders-changed';

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

export function publishOrder(order: KitchenOrder) {
  const list = loadOrders().filter((o) => o.id !== order.id);
  list.push(order);
  save(list);
  announce();
}

export function setStatus(id: string, status: KitchenStatus) {
  save(loadOrders().map((o) => (o.id === id ? { ...o, status } : o)));
  announce();
}

export function clearOrders() {
  save([]);
  announce();
}

/** Subscribe to any change; returns an unsubscribe fn. */
export function subscribe(cb: (orders: KitchenOrder[]) => void): () => void {
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
