# Going live: Supabase migration & backend wiring

This doc is the playbook for taking the app off its localStorage stand-ins and onto a real
Supabase backend. The schema itself lives in **`supabase/migrations/20260704000000_init.sql`**
(migrations are code — that file is the source of truth, not this doc). This covers the
setup, the seed strategy, and the exact client files that change.

This project is **single-tenant: it serves Vino Vino only.** One Supabase project, one
restaurant, staff-only access. (A multi-restaurant SaaS version was considered and
deliberately split off into a future separate project — no tenancy layers here.)

Design principles, in order:

1. **Match the code, don't redesign it.** Each localStorage store swaps for one table,
   and the swap touches only the store file — that was the point of the stand-in pattern.
2. **The kitchen must survive a network blip.** Orders keep a JSONB snapshot the kitchen
   can render directly, and the client keeps localStorage as a write-through cache.
3. **RLS stays on, but simple.** Public sign-up is off and staff accounts are created in
   the dashboard, so "authenticated = staff": every table gets one full-access policy for
   the `authenticated` role and nothing for `anon`. The anon key alone can touch no data.

Money stays **integer agorot** everywhere — all price columns are `integer`.

---

## 1. What swaps for what

| Today (localStorage) | Becomes | Client file to touch |
|---|---|---|
| `vino:menu` (menuStore.ts) | `products` table | `src/lib/menuStore.ts` |
| — (static in data/menu.ts) | `categories`, `toppings` tables | `src/data/menu.ts` stays the dev seed |
| `vino:bundles` (bundles.ts) | `bundles` table | `src/lib/bundles.ts` |
| `vino:customers` (customers.ts) | `customers` table | `src/lib/customers.ts` |
| `vino:kitchen-orders` (orderBus.ts) | `orders` + Supabase Realtime | `src/lib/orderBus.ts` |
| console.info stub (saveOrder.ts) | `orders` + `order_lines` + parts/options | `src/lib/saveOrder.ts` (mostly written) |
| `vino:auth` local fallback | Supabase Auth (already wired) | none — `.env.local` only |

`saveOrder.ts` already writes the normalized `orders / order_lines / order_line_parts /
order_line_options` shape when Supabase is configured — the migration matches it, plus one
addition the client still needs to send: the `lines`/`discounts` JSONB snapshot on `orders`
(what the kitchen and reports consume as `KitchenOrder`).

Notes on the schema choices (see the migration file for the SQL):

- **`lines` JSONB on `orders` is deliberate duplication.** The kitchen board, orders list,
  and reports all consume `KitchenOrder` (CartLine snapshots). Reading one row per order —
  and getting it pushed whole over realtime — keeps those screens exactly as they are.
  The normalized `order_lines*` tables are the analytical/canonical record.
- **`daily_number` (the kitchen chit number) is computed in a trigger** per local day
  (`Asia/Jerusalem`). The unique index makes a rare same-millisecond race fail loudly
  instead of duplicating a chit number; the client's insert can simply retry on conflict.
- Text ids (`p_vino`, `bnd_…`) are kept as primary keys — they're already in the codebase,
  in saved carts, and in the seed. New owner-created items already get collision-safe ids
  from the app.

---

## 2. Applying the migration

Either path:

- **Dashboard:** paste `supabase/migrations/20260704000000_init.sql` into the SQL Editor
  and run it.
- **CLI (preferred):** `supabase login` → `supabase link --project-ref <ref>` →
  `supabase db push`. Commit the `supabase/` folder.

Then create the staff user(s): Authentication → Add user, e.g. `admin@vinovino.app`
(the login screen takes a username and maps it to `<username>@vinovino.app`; public
sign-up stays **off**). No linking step needed — any authenticated user is staff.

Auth env setup is documented in `.env.example`: fill `VITE_SUPABASE_URL` +
`VITE_SUPABASE_ANON_KEY` in `.env.local` and restart the dev server; the app flips to
Supabase mode by itself (`isSupabaseEnabled` in `src/lib/supabase.ts`).

---

## 3. Seeding the catalog

Run once with the **service role key** (bypasses RLS), locally — never ship that key:

1. Seed the catalog from the bundled data. Write `scripts/seed-catalog.mjs` that imports
   `categories`, `products`, `toppings` from `src/data/menu.ts` and the two seed bundles
   from `src/lib/bundles.ts`, and upserts them.
2. **Migrating live localStorage data:** if the tablet already has real edits (menu
   changes, bundles, customers), export them from the browser console
   (`copy(localStorage.getItem('vino:menu'))` etc.) and feed that JSON to the seed script
   instead of the bundled defaults. Same shapes — `Product[]`, `Bundle[]`,
   `Record<phone, StoredCustomer>`.

---

## 4. Client wiring — file by file

The app already runs both modes (`isSupabaseEnabled` in `src/lib/supabase.ts`); everything
below keeps the localStorage path as the fallback when env vars are absent, so dev and the
tests keep working untouched.

**`src/lib/saveOrder.ts`** — nearly done. Add to the `orders` insert: `lines` (the CartLine
snapshot, same JSON published to the bus today) and `discounts`. Keep writing the normalized
child rows. On unique-violation for the daily number, retry once. On network failure,
fall back to the local path (publish to the bus + queue for later sync) — the rush must not
stop because the router hiccuped.

**`src/lib/orderBus.ts`** — the realtime swap:
- `loadOrders()` → `select * from orders where order_day = today` mapped to `KitchenOrder`
  (`row.lines`/`row.discounts` come back as-is; `createdAt` from `created_at`).
- `subscribe(cb)` → `supabase.channel('orders').on('postgres_changes', { event: '*',
  schema: 'public', table: 'orders' }, refetch)`.
- `setStatus(id, status)` → `update orders set status = …`.
- Keep mirroring every fetched list into `localStorage['vino:kitchen-orders']` so the
  board still renders from cache while offline.

**`src/lib/menuStore.ts`** — `load()` fetches `products` (order by `sort`), falls back to
cache/seed offline; `saveProduct`/`removeProduct` upsert/delete then `refresh()` exactly as
now. Optionally subscribe to `postgres_changes` on `products` and drop the `storage`-event
listener (cross-device edits replace cross-tab ones).

**`src/lib/bundles.ts` / `src/lib/customers.ts`** — same pattern as menuStore: fetch-through
cache, write-through on save. `customers` upsert on order-send replaces the local
`rememberOrder` write.

**`src/analytics/Reports.tsx`** — today's report keeps working off the bus feed. The date
filter for past days should query `orders` by `order_day` range instead of localStorage
(this is where the backend starts giving you something the notepad never could).

**No changes:** auth (`AuthContext` already calls `signInWithPassword`), all screens, cart
math, tests.

---

## 5. Rollout order

1. Apply the migration to the project; create the staff user; run the seed script.
2. Fill `.env.local`, log in with a real staff user — auth flips to Supabase mode by itself.
3. Wire **saveOrder + orderBus** first (the realtime core), verify entry→kitchen on two
   devices over the network. This is the moment the two-tablet setup stops needing the
   same browser profile.
4. Wire menuStore, bundles, customers.
5. Run the full gate + `scripts/verify-shots.mjs` against a Supabase-backed dev server.
6. Parallel-run one evening service (staff uses it live; paper as backup), then cut over.

## 6. Ops notes

- **Backups:** enable PITR or at minimum daily backups before the first live service.
- **Keys:** the anon key ships in the client — RLS + dashboard-only account creation is
  the security boundary, which is why every table has RLS enabled with an
  `authenticated`-only policy. The service role key lives only in local seed scripts /
  CI secrets.
- **Realtime hygiene:** one channel per screen, unsubscribe on unmount; on `CHANNEL_ERROR`
  or reconnect, refetch the day's orders (don't trust missed events).
