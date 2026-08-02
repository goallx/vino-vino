-- ============================================================
-- Kitchen prep timers
--
-- A cook can start a countdown when an order goes into prep ("התחל הכנה"). The
-- timer is stored ON THE ORDER so the same countdown shows on every kitchen
-- screen and survives a reload:
--   • prep_started_at — when prep began (also handy analytics on its own)
--   • timer_seconds   — the chosen countdown length; NULL = started with no timer
-- Remaining time is derived client-side (timer_seconds − (now − prep_started_at)).
--
-- Owners keep a set of reusable durations. 5/10/15 min are baseline defaults in
-- the app; anything the owner adds is saved here and shared across devices.
--
-- Both additions default to nothing, so existing orders are unchanged, and the
-- app degrades gracefully (drop-and-retry) until this migration is applied.
-- ============================================================

alter table public.orders
  add column if not exists prep_started_at timestamptz,
  add column if not exists timer_seconds   integer
    check (timer_seconds is null or timer_seconds > 0);

create table if not exists public.timer_presets (
  minutes    integer primary key check (minutes > 0),
  created_at timestamptz not null default now()
);

-- staff (any authenticated user) only — mirrors every other table
alter table public.timer_presets enable row level security;
create policy staff_all on public.timer_presets for all to authenticated using (true) with check (true);

-- push preset changes to every kitchen device in realtime (the running timer
-- itself rides on `orders`, already published)
alter publication supabase_realtime add table public.timer_presets;
