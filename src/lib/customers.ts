import type { CartLine, PastOrder } from '../types';
import { sampleCustomers } from '../data/sampleHistory';

export interface StoredCustomer {
  phone: string; // normalized digits
  name?: string;
  address?: string;
  orderCount: number;
  lastOrderAt: number;
  past: PastOrder[];
}

const KEY = 'vino:customers';
const digits = (s: string) => s.replace(/\D/g, '');

/** First-run seed from the bundled sample customers so reorder/autocomplete have data. */
function seed(): Record<string, StoredCustomer> {
  const map: Record<string, StoredCustomer> = {};
  for (const [phone, rec] of Object.entries(sampleCustomers)) {
    map[phone] = {
      phone,
      name: rec.customer.name,
      address: rec.customer.address,
      orderCount: rec.past.length,
      lastOrderAt: Date.now(),
      past: rec.past,
    };
  }
  return map;
}

export function loadCustomers(): Record<string, StoredCustomer> {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Record<string, StoredCustomer>;
  } catch {
    /* fall through to seed */
  }
  const seeded = seed();
  try {
    localStorage.setItem(KEY, JSON.stringify(seeded));
  } catch {
    /* ignore */
  }
  return seeded;
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
  map[d] = {
    phone: d,
    name: opts.name || existing?.name,
    address: opts.address || existing?.address,
    orderCount: (existing?.orderCount ?? 0) + 1,
    lastOrderAt: Date.now(),
    past: [entry, ...(existing?.past ?? [])].slice(0, 6),
  };
  save(map);
}
