-- Pizza editor: derive type from category + smarter free-topping model.
--
--   1. Add `free_topping_ids` — the whitelist of toppings a pizza may give free.
--   2. Merge the `chef` category into `pizza` (chef pizzas are just pizzas with a
--      preset recipe); order them after the regular pizzas, then drop `chef`.
--   3. Recalibrate `included_toppings`: it used to be consumed recipe-first, so
--      every pizza had `included == recipe size` (0 effective free adds). It now
--      means "additional free toppings beyond the recipe", so subtract the recipe
--      size — yielding 0 for every current pizza and preserving today's prices.
--
-- Safe to re-run.

begin;

-- 1. whitelist column (null = all toppings eligible to be free)
alter table public.products
  add column if not exists free_topping_ids jsonb;

-- 2. merge chef -> pizza, appended after the existing regular pizzas by sort
update public.products
   set category_id = 'pizza',
       sort = sort + coalesce((select max(sort) + 1
                                 from public.products
                                where category_id = 'pizza'), 0)
 where category_id = 'chef';

delete from public.categories where id = 'chef';

-- 3. recipe no longer consumes the free allowance -> subtract recipe size
update public.products
   set included_toppings = greatest(0,
         coalesce(included_toppings, 0) - coalesce(jsonb_array_length(art), 0))
 where art is not null
   and jsonb_typeof(art) = 'array'
   and jsonb_array_length(art) > 0;

commit;
