-- ============================================================
-- Deal perks — free-topping eligibility whitelist
--
-- A deal's free-topping perk (free_toppings) previously waived the priciest
-- added toppings across the combo's pizzas, no matter what they were — so a
-- premium topping like chicken/goose could come off for free. This column lets
-- the owner pin *which* toppings the perk may waive (typically the vegetables),
-- leaving premium ones always charged.
--
-- NULL = every topping is eligible (the prior behaviour), so existing deals are
-- unchanged. The owner unchecks premium toppings per-deal from the /deals
-- editor — no SQL needed. Stored as jsonb to mirror `items`.
-- ============================================================

alter table public.bundles
  add column if not exists free_topping_ids jsonb;
