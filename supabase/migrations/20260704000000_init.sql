-- Vino Vino — initial schema, single-tenant (this Supabase project serves Vino Vino only).
-- Security model: public sign-up is OFF, staff accounts are created in the dashboard,
-- so RLS is simply "authenticated users have full access; anon has none".
-- Money is integer agorot (₪ × 100) everywhere.

create extension if not exists pgcrypto;

-- ============================================================
-- catalog  (ids are the app's text ids: 'pizza', 'p_vino', 'c_…')
-- ============================================================

create table public.categories (
  id   text primary key,
  name text not null,
  sort int  not null default 0
);

create table public.products (
  id                text primary key,
  category_id       text not null references public.categories (id),
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
  updated_at        timestamptz not null default now()
);

create table public.toppings (
  id    text primary key,
  name  text not null,
  price integer not null check (price >= 0)
);

-- fixed-price combo deals; items = BundleItem[] ({productId, qty})
create table public.bundles (
  id         text primary key,
  name       text not null,
  items      jsonb not null default '[]',
  price      integer not null check (price >= 0),
  active     boolean not null default true,
  updated_at timestamptz not null default now()
);

-- ============================================================
-- customer memory (phone autocomplete + reorder panel)
-- ============================================================

create table public.customers (
  phone         text primary key,      -- normalized digits
  name          text,
  address       text,
  order_count   integer not null default 0,
  last_order_at timestamptz,
  past          jsonb not null default '[]'    -- PastOrder[] (recent snapshots)
);

-- ============================================================
-- orders
-- ============================================================

create table public.orders (
  id             uuid primary key default gen_random_uuid(),
  order_day      date not null,          -- set by trigger, local (Asia/Jerusalem) date
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

-- the kitchen chit number: resets each local day
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
   where order_day = new.order_day;
  return new;
end;
$$;

create trigger orders_daily_number
  before insert on public.orders
  for each row execute function public.set_daily_number();

create unique index orders_daily_number_uq
  on public.orders (order_day, daily_number);
create index orders_board_ix
  on public.orders (order_day, status);

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
-- row level security — staff (any authenticated user) only;
-- the anon key alone can read/write nothing
-- ============================================================

alter table public.categories         enable row level security;
alter table public.products           enable row level security;
alter table public.toppings           enable row level security;
alter table public.bundles            enable row level security;
alter table public.customers          enable row level security;
alter table public.orders             enable row level security;
alter table public.order_lines        enable row level security;
alter table public.order_line_parts   enable row level security;
alter table public.order_line_options enable row level security;

create policy staff_all on public.categories         for all to authenticated using (true) with check (true);
create policy staff_all on public.products           for all to authenticated using (true) with check (true);
create policy staff_all on public.toppings           for all to authenticated using (true) with check (true);
create policy staff_all on public.bundles            for all to authenticated using (true) with check (true);
create policy staff_all on public.customers          for all to authenticated using (true) with check (true);
create policy staff_all on public.orders             for all to authenticated using (true) with check (true);
create policy staff_all on public.order_lines        for all to authenticated using (true) with check (true);
create policy staff_all on public.order_line_parts   for all to authenticated using (true) with check (true);
create policy staff_all on public.order_line_options for all to authenticated using (true) with check (true);

-- ============================================================
-- realtime — the kitchen board subscribes to order changes
-- ============================================================

alter publication supabase_realtime add table public.orders;
