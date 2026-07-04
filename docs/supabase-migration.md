# Going live: Supabase migration & backend wiring

This doc is the playbook for taking the app off its localStorage stand-ins and onto a real
Supabase backend. It contains the full table migration (SQL ready for `supabase/migrations/`),
the RLS/realtime setup, the seed strategy, and the exact client files that change.

Design principles, in order:

1. **Multi-tenant from day one.** Every table carries `restaurant_id` and RLS enforces it.
   Vino Vino is tenant #1; onboarding restaurant #2 is a data task, not a schema change.
2. **Match the code, don't redesign it.** Each localStorage store swaps for one table,
   and the swap touches only the store file — that was the point of the stand-in pattern.
3. **The kitchen must survive a network blip.** Orders keep a JSONB snapshot the kitchen
   can render directly, and the client keeps localStorage as a write-through cache.

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
order_line_options` shape when Supabase is configured — the migration below matches it,
plus two additions: a `lines`/`discounts` JSONB snapshot on `orders` (what the kitchen and
reports consume as `KitchenOrder`) and `restaurant_id` defaults so existing inserts don't
need to pass it.

Money stays **integer agorot** everywhere — all price columns are `integer`.

---

## 2. The migration

Save as `supabase/migrations/0001_init.sql` (see §6 for the CLI workflow).

```sql
create extension if not exists pgcrypto;

-- ============================================================
-- tenancy
-- ============================================================

create table public.restaurants (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,            -- 'vino-vino'
  name       text not null,                   -- 'וינו וינו'
  settings   jsonb not null default '{}',     -- hours, delivery fee, driver WhatsApp, theme…
  created_at timestamptz not null default now()
);

-- staff ↔ auth.users; a user belongs to exactly one restaurant
create table public.staff (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  role          text not null default 'staff' check (role in ('owner', 'staff')),
  created_at    timestamptz not null default now()
);

-- the caller's restaurant, derived from their JWT. SECURITY DEFINER so RLS on
-- staff doesn't block the lookup. Used by every policy and as a column default,
-- which is why client inserts never need to pass restaurant_id explicitly.
create function public.current_restaurant_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select restaurant_id from public.staff where user_id = auth.uid()
$$;

-- ============================================================
-- catalog  (ids are the app's text ids: 'pizza', 'p_vino', 'c_…')
-- ============================================================

create table public.categories (
  restaurant_id uuid not null default public.current_restaurant_id()
                references public.restaurants (id) on delete cascade,
  id            text not null,
  name          text not null,
  sort          int  not null default 0,
  primary key (restaurant_id, id)
);

create table public.products (
  restaurant_id     uuid not null default public.current_restaurant_id()
                    references public.restaurants (id) on delete cascade,
  id                text not null,
  category_id       text not null,
  name              text not null,
  description       text,
  base_price        integer not null check (base_price >= 0),   -- agorot
  is_pizza          boolean not null default false,
  split_capable     boolean not null default false,
  included_toppings integer,
  variants          jsonb,             -- Variant[]  (size choices)
  art               jsonb,             -- string[]   (topping ids for PizzaArt)
  active            boolean not null default true,
  sort              int not null default 0,
  updated_at        timestamptz not null default now(),
  primary key (restaurant_id, id),
  foreign key (restaurant_id, category_id)
    references public.categories (restaurant_id, id)
);

create table public.toppings (
  restaurant_id uuid not null default public.current_restaurant_id()
                references public.restaurants (id) on delete cascade,
  id            text not null,
  name          text not null,
  price         integer not null check (price >= 0),
  primary key (restaurant_id, id)
);

-- fixed-price combo deals; items = BundleItem[] ({productId, qty})
create table public.bundles (
  restaurant_id uuid not null default public.current_restaurant_id()
                references public.restaurants (id) on delete cascade,
  id            text not null,
  name          text not null,
  items         jsonb not null default '[]',
  price         integer not null check (price >= 0),
  active        boolean not null default true,
  updated_at    timestamptz not null default now(),
  primary key (restaurant_id, id)
);

-- ============================================================
-- customer memory (phone autocomplete + reorder panel)
-- ============================================================

create table public.customers (
  restaurant_id uuid not null default public.current_restaurant_id()
                references public.restaurants (id) on delete cascade,
  phone         text not null,          -- normalized digits
  name          text,
  address       text,
  order_count   integer not null default 0,
  last_order_at timestamptz,
  past          jsonb not null default '[]',   -- PastOrder[] (recent snapshots)
  primary key (restaurant_id, phone)
);

-- ============================================================
-- orders
-- ============================================================

create table public.orders (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null default public.current_restaurant_id()
                 references public.restaurants (id) on delete cascade,
  order_day      date not null,          -- set by trigger, restaurant-local date
  daily_number   integer not null,       -- #1, #2… resets each day (set by trigger)
  type           text not null check (type in ('delivery', 'pickup')),
  status         text not null default 'new'
                 check (status in ('new', 'preparing', 'ready', 'cancelled')),
  channel        text not null default 'phone',
  customer_name  text,
  customer_phone text,
  address        text,
  note           text,
  payment_status text not null check (payment_status in ('paid', 'unpaid')),
  payment_method text,
  subtotal       integer not null default 0,
  discount       integer not null default 0,
  total          integer not null default 0,
  lines          jsonb not null default '[]',  -- CartLine[] snapshot (kitchen renders this)
  discounts      jsonb,                        -- AppliedBundle[] | null
  created_at     timestamptz not null default now()
);

-- the kitchen chit number: per restaurant, per local day
create function public.set_daily_number()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  new.order_day := (now() at time zone 'Asia/Jerusalem')::date;
  select coalesce(max(daily_number), 0) + 1
    into new.daily_number
    from public.orders
   where restaurant_id = new.restaurant_id
     and order_day = new.order_day;
  return new;
end;
$$;

create trigger orders_daily_number
  before insert on public.orders
  for each row execute function public.set_daily_number();

create unique index orders_daily_number_uq
  on public.orders (restaurant_id, order_day, daily_number);
create index orders_board_ix
  on public.orders (restaurant_id, order_day, status);

-- normalized line detail (already written by saveOrder.ts; feeds future analytics)
create table public.order_lines (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.orders (id) on delete cascade,
  product_id    text,
  name_snapshot text not null,
  qty           integer not null default 1,
  is_split      boolean not null default false,
  unit_price    integer not null default 0,
  line_total    integer not null default 0,
  note          text
);
create index order_lines_order_ix on public.order_lines (order_id);

create table public.order_line_parts (
  id                 uuid primary key default gen_random_uuid(),
  order_line_id      uuid not null references public.order_lines (id) on delete cascade,
  target             text not null check (target in ('whole', 'half_1', 'half_2')),
  base_product_id    text,
  base_name_snapshot text,
  base_price         integer not null default 0
);
create index order_line_parts_line_ix on public.order_line_parts (order_line_id);

create table public.order_line_options (
  id             uuid primary key default gen_random_uuid(),
  order_line_id  uuid not null references public.order_lines (id) on delete cascade,
  label_snapshot text not null,
  target         text not null,
  action         text not null check (action in ('add', 'remove')),
  price_delta    integer not null default 0
);
create index order_line_options_line_ix on public.order_line_options (order_line_id);

-- ============================================================
-- row level security — staff see only their own restaurant
-- ============================================================

alter table public.restaurants        enable row level security;
alter table public.staff              enable row level security;
alter table public.categories         enable row level security;
alter table public.products           enable row level security;
alter table public.toppings           enable row level security;
alter table public.bundles            enable row level security;
alter table public.customers          enable row level security;
alter table public.orders             enable row level security;
alter table public.order_lines        enable row level security;
alter table public.order_line_parts   enable row level security;
alter table public.order_line_options enable row level security;

create policy staff_read_own_restaurant on public.restaurants
  for select using (id = public.current_restaurant_id());

create policy staff_read_self on public.staff
  for select using (user_id = auth.uid());

-- one full-access policy per tenant-scoped table
create policy tenant_all on public.categories
  for all using (restaurant_id = public.current_restaurant_id())
  with check (restaurant_id = public.current_restaurant_id());
create policy tenant_all on public.products
  for all using (restaurant_id = public.current_restaurant_id())
  with check (restaurant_id = public.current_restaurant_id());
create policy tenant_all on public.toppings
  for all using (restaurant_id = public.current_restaurant_id())
  with check (restaurant_id = public.current_restaurant_id());
create policy tenant_all on public.bundles
  for all using (restaurant_id = public.current_restaurant_id())
  with check (restaurant_id = public.current_restaurant_id());
create policy tenant_all on public.customers
  for all using (restaurant_id = public.current_restaurant_id())
  with check (restaurant_id = public.current_restaurant_id());
create policy tenant_all on public.orders
  for all using (restaurant_id = public.current_restaurant_id())
  with check (restaurant_id = public.current_restaurant_id());

-- child tables inherit scope through their order
create policy tenant_all on public.order_lines
  for all using (exists (
    select 1 from public.orders o
    where o.id = order_id and o.restaurant_id = public.current_restaurant_id()))
  with check (exists (
    select 1 from public.orders o
    where o.id = order_id and o.restaurant_id = public.current_restaurant_id()));
create policy tenant_all on public.order_line_parts
  for all using (exists (
    select 1 from public.order_lines l join public.orders o on o.id = l.order_id
    where l.id = order_line_id and o.restaurant_id = public.current_restaurant_id()))
  with check (exists (
    select 1 from public.order_lines l join public.orders o on o.id = l.order_id
    where l.id = order_line_id and o.restaurant_id = public.current_restaurant_id()));
create policy tenant_all on public.order_line_options
  for all using (exists (
    select 1 from public.order_lines l join public.orders o on o.id = l.order_id
    where l.id = order_line_id and o.restaurant_id = public.current_restaurant_id()))
  with check (exists (
    select 1 from public.order_lines l join public.orders o on o.id = l.order_id
    where l.id = order_line_id and o.restaurant_id = public.current_restaurant_id()));

-- ============================================================
-- realtime — the kitchen board subscribes to order changes
-- ============================================================

alter publication supabase_realtime add table public.orders;
```

Notes on the choices:

- **`lines` JSONB on `orders` is deliberate duplication.** The kitchen board, orders list,
  and reports all consume `KitchenOrder` (CartLine snapshots). Reading one row per order —
  and getting it pushed whole over realtime — keeps those screens exactly as they are.
  The normalized `order_lines*` tables are the analytical/canonical record.
- **`default public.current_restaurant_id()`** on every `restaurant_id` means the existing
  client inserts don't change: the tenant comes from the JWT, and RLS's `with check`
  guarantees a client can't spoof another one.
- **`daily_number` is computed in a trigger** using the restaurant's local date
  (`Asia/Jerusalem`, later a `restaurants.settings` value). The unique index makes a rare
  same-millisecond race fail loudly instead of duplicating a chit number; the client's
  insert can simply retry on conflict.
- Text ids (`p_vino`, `bnd_…`) are kept — they're already in the codebase, in saved carts,
  and in the seed. New owner-created items already get collision-safe ids from the app.

---

## 3. Seeding Vino Vino (tenant #1)

Run once with the **service role key** (bypasses RLS), locally — never ship that key:

1. Insert the restaurant row: `insert into restaurants (slug, name) values ('vino-vino', 'וינו וינו');`
2. Create staff users in the dashboard (Authentication → Add user, e.g. `admin@vinovino.app`),
   then link each: `insert into staff (user_id, restaurant_id, role) values (…, …, 'owner');`
3. Seed the catalog from the bundled data. Write `scripts/seed-catalog.mjs` that imports
   `categories`, `products`, `toppings` from `src/data/menu.ts` and the two seed bundles from
   `src/lib/bundles.ts`, and upserts them with `restaurant_id` set explicitly. (This script is
   also the template for the future Wolt-import onboarding tool — restaurant #2's menu arrives
   the same way.)
4. **Migrating live localStorage data:** if the tablet already has real edits (menu changes,
   bundles, customers), export them from the browser console
   (`copy(localStorage.getItem('vino:menu'))` etc.) and feed that JSON to the seed script
   instead of the bundled defaults. Same shapes — `Product[]`, `Bundle[]`,
   `Record<phone, StoredCustomer>`.

Auth setup itself is already documented in `.env.example` (email provider on, public sign-up
**off**, username maps to `<username>@vinovino.app`).

---

## 4. Client wiring — file by file

The app already runs both modes (`isSupabaseEnabled` in `src/lib/supabase.ts`); everything
below keeps the localStorage path as the fallback when env vars are absent, so dev and the
97+ tests keep working untouched.

**`src/lib/saveOrder.ts`** — nearly done. Add to the `orders` insert: `lines` (the CartLine
snapshot, same JSON published to the bus today) and `discounts`. Keep writing the normalized
child rows. On unique-violation for the daily number, retry once. On network failure,
fall back to the local path (publish to the bus + queue for later sync) — the rush must not
stop because the router hiccuped.

**`src/lib/orderBus.ts`** — the realtime swap:
- `loadOrders()` → `select * from orders where order_day = today` mapped to `KitchenOrder`
  (`row.lines`/`row.discounts` come back as-is; `createdAt` from `created_at`).
- `subscribe(cb)` → `supabase.channel('orders').on('postgres_changes', { event: '*',
  schema: 'public', table: 'orders' }, refetch)` — RLS scopes it to the restaurant.
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

1. `supabase init` + apply the migration to a fresh project; run the seed script.
2. Fill `.env.local`, log in with a real staff user — auth flips to Supabase mode by itself.
3. Wire **saveOrder + orderBus** first (the realtime core), verify entry→kitchen on two
   devices over the network. This is the moment the two-tablet setup stops needing the
   same browser profile.
4. Wire menuStore, bundles, customers.
5. Run the full gate + `scripts/verify-shots.mjs` against a Supabase-backed dev server.
6. Parallel-run one evening service (staff uses it live; paper as backup), then cut over.

## 6. Ops notes

- **CLI workflow:** `supabase init` → `supabase migration new init` (paste §2) →
  `supabase db push` (or `supabase start` + `db reset` for a local stack). Commit the
  `supabase/` folder — migrations are code.
- **Backups:** enable PITR or at minimum daily backups before the first live service.
- **Keys:** the anon key ships in the client — RLS is the entire security boundary, which
  is why every table above has it enabled. The service role key lives only in local seed
  scripts / CI secrets.
- **Realtime hygiene:** one channel per screen, unsubscribe on unmount; on `CHANNEL_ERROR`
  or reconnect, refetch the day's orders (don't trust missed events).
- **When restaurant #2 signs:** new `restaurants` row, staff users, seed script with their
  menu — no schema or code changes. Per-restaurant login domains (today's hardcoded
  `@vinovino.app`) become `settings.authDomain` at that point.
