-- ============================================================
-- Deal perks — free toppings
--
-- A deal can now grant a pool of free added-topping portions across its pizzas,
-- waived best-value-first (priciest first). This is the first "perk" beyond the
-- fixed-price product combo; the column defaults to 0 so every existing deal is
-- unchanged. The owner sets it per-deal from the /deals editor — no SQL needed.
-- ============================================================

alter table public.bundles
  add column if not exists free_toppings integer not null default 0
  check (free_toppings >= 0);
