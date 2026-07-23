-- ============================================================
-- Shifts (end-of-shift log)
--
-- Closing a shift ("סגירת משמרת") snapshots the day's cash figures into one
-- immutable row and starts a fresh shift: order numbering restarts from #01 for
-- orders created after `closed_at`. The snapshot is computed client-side at
-- close time (same pattern as orders storing their line/total snapshot), so the
-- record stays true even if an order is later edited or rolls off the window.
--
-- Money columns are in agorot, matching orders.total / order_lines.line_total.
-- ============================================================

create table public.shifts (
  id                 uuid primary key default gen_random_uuid(),
  opened_at          timestamptz not null,
  closed_at          timestamptz not null default now(),
  closed_by          text,
  order_count        int  not null default 0,
  income             int  not null default 0,  -- collected, delivery fees included
  delivery_fee_total int  not null default 0,
  courier_owed       int  not null default 0,
  net_after_courier  int  not null default 0,
  delivery_count     int  not null default 0,
  pickup_count       int  not null default 0,
  paid_revenue       int  not null default 0,
  unpaid_revenue     int  not null default 0,
  paid_count         int  not null default 0,
  unpaid_count       int  not null default 0,
  created_at         timestamptz not null default now()
);

create index shifts_closed_at_idx on public.shifts (closed_at desc);

-- row level security — staff (any authenticated user) only; mirrors every other table
alter table public.shifts enable row level security;
create policy staff_all on public.shifts for all to authenticated using (true) with check (true);
