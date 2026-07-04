import type { CartLine, PastOrder } from '../types';
import { supabase, isSupabaseEnabled } from './supabase';

export interface StoredCustomer {
  phone: string; // normalized digits
  name?: string;
  address?: string;
  orderCount: number;
  lastOrderAt: number;
  past: PastOrder[];
}

// Customer memory for phone/address autocomplete and the reorder panel.
//
// Supabase mode: the `customers` table is the source of truth — pulled whole
// into the localStorage cache on load (restaurant scale: small), written
// through on every sent order. Lookups stay synchronous off the cache.
// Local mode (no env vars): localStorage seeded with sample history for dev.

const KEY = 'vino:customers';
const digits = (s: string) => s.replace(/\D/g, '');
// (no bundled sample data — customers accumulate from real orders; tests seed
// the cache from src/test/fixtures/catalog.ts)

interface CustomerRow {
  phone: string;
  name: string | null;
  address: string | null;
  order_count: number;
  last_order_at: string | null;
  past: PastOrder[] | null;
}

async function fetchCustomers(): Promise<void> {
  if (!supabase) return;
  const { data, error } = await supabase.from('customers').select('*');
  if (error || !data) {
    if (error) console.error('[vino] failed to fetch customers', error);
    return; // keep serving the cache
  }
  const map: Record<string, StoredCustomer> = {};
  for (const row of data as CustomerRow[]) {
    map[row.phone] = {
      phone: row.phone,
      name: row.name ?? undefined,
      address: row.address ?? undefined,
      orderCount: row.order_count,
      lastOrderAt: row.last_order_at ? Date.parse(row.last_order_at) : 0,
      past: row.past ?? [],
    };
  }
  save(map);
}

if (isSupabaseEnabled) void fetchCustomers();

export function loadCustomers(): Record<string, StoredCustomer> {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Record<string, StoredCustomer>;
  } catch {
    /* fall through */
  }
  return {};
}

function save(map: Record<string, StoredCustomer>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

/** Exact lookup by full phone number. */
export function getByPhone(input: string): StoredCustomer | null {
  const d = digits(input);
  if (!d) return null;
  return loadCustomers()[d] ?? null;
}

/** Autocomplete: customers whose phone starts with what's been typed (≥3 digits). */
export function searchByPhonePrefix(input: string, limit = 5): StoredCustomer[] {
  const d = digits(input);
  if (d.length < 3) return [];
  return Object.values(loadCustomers())
    .filter((c) => c.phone.startsWith(d))
    .sort((a, b) => b.lastOrderAt - a.lastOrderAt)
    .slice(0, limit);
}

export interface AddressSuggestion {
  address: string;
  name?: string; // a customer known at this address (most recent)
  count: number; // how many saved customers share this address
}

/** Autocomplete delivery addresses from saved customers (substring match, ≥2 chars). */
export function searchByAddress(input: string, limit = 5): AddressSuggestion[] {
  const q = input.trim().toLowerCase();
  if (q.length < 2) return [];
  const seen = new Map<string, AddressSuggestion & { lastOrderAt: number }>();
  for (const c of Object.values(loadCustomers())) {
    const addr = c.address?.trim();
    if (!addr || !addr.toLowerCase().includes(q)) continue;
    const key = addr.toLowerCase();
    const existing = seen.get(key);
    if (existing) {
      existing.count += 1;
      if (c.lastOrderAt > existing.lastOrderAt) {
        existing.name = c.name;
        existing.lastOrderAt = c.lastOrderAt;
      }
    } else {
      seen.set(key, { address: addr, name: c.name, count: 1, lastOrderAt: c.lastOrderAt });
    }
  }
  return [...seen.values()]
    .sort((a, b) => b.count - a.count || b.lastOrderAt - a.lastOrderAt)
    .slice(0, limit)
    .map(({ address, name, count }) => ({ address, name, count }));
}

/** Persist (upsert) a customer from a sent order, prepending it to their history. */
export function recordOrder(opts: { phone: string; name?: string; address?: string; lines: CartLine[]; total: number }): void {
  const d = digits(opts.phone);
  if (!d) return;
  const map = loadCustomers();
  const existing = map[d];
  const entry: PastOrder = {
    id: `p_${Date.now()}`,
    date: 'היום',
    total: opts.total,
    summary: opts.lines.map((l) => `${l.qty}× ${l.name}`).join(', '),
    lines: opts.lines,
  };
  const updated: StoredCustomer = {
    phone: d,
    name: opts.name || existing?.name,
    address: opts.address || existing?.address,
    orderCount: (existing?.orderCount ?? 0) + 1,
    lastOrderAt: Date.now(),
    past: [entry, ...(existing?.past ?? [])].slice(0, 6),
  };
  map[d] = updated;
  save(map);
  if (supabase) {
    void supabase
      .from('customers')
      .upsert({
        phone: updated.phone,
        name: updated.name ?? null,
        address: updated.address ?? null,
        order_count: updated.orderCount,
        last_order_at: new Date(updated.lastOrderAt).toISOString(),
        past: updated.past,
      })
      .then(({ error }) => {
        if (error) console.error('[vino] failed to save customer', error);
      });
  }
}
