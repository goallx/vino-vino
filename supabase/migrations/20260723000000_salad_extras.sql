-- ============================================================
-- Salad extras
--
-- Salads get a dedicated editor (base removals + seasoning + extras) instead of
-- the pizza builder. The editor reads each salad's own toppings from `art` and
-- offers them as paid add-ons, each at the personal/half topping price
-- (e.g. olives ₪5). The base — lettuce / tomato / cucumber — and the
-- "with seasoning" toggle are kitchen-only and never priced, so they are not
-- stored here.
-- ============================================================

update public.products set art = '["t_onion","t_bulgarit","t_zaatar"]'::jsonb              where id = 'sl_greek';
update public.products set art = '["t_onion","t_pepper","t_chicken"]'::jsonb               where id = 'sl_chicken';
update public.products set art = '["t_tuna","t_anchovy","t_mushroom"]'::jsonb              where id = 'sl_italian';
update public.products set art = '["t_tuna","t_corn","t_olives"]'::jsonb                    where id = 'sl_tuna';
update public.products set art = '["t_onion"]'::jsonb                                       where id = 'sl_chopped';
update public.products set art = '["t_bulgarit","t_tuna","t_anchovy","t_corn","t_olives","t_mushroom","t_onion"]'::jsonb where id = 'sl_selfmade';
