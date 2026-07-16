-- Vino Vino — full menu rebuild from the owner's real printed menu (2026-07-16).
-- Money is integer agorot (₪ × 100). Idempotent: upserts by id.
--
-- Sections: categories · regular pizzas (family/personal) · chef pizzas ·
-- build-your-own (kept) · pasta · meat meals · sides · salads · drinks ·
-- desserts · toppings (two-tier, per-size).
--
-- Topping rule: no more "3 free". A pizza includes exactly its recipe (art);
-- every ADDED topping is charged. So included_toppings = recipe length for
-- presets, and = 1 for build-your-own (1 per half on a half/half).
--
-- NOT here yet (need code first — see PR notes): bundles/deals (the printed
-- deals reference "any family pizza", which the fixed-product bundle model
-- can't express yet). The family/personal size step in the pizza builder and
-- the per-size topping pricing in cart.ts are separate code changes; this file
-- only lays down the data + schema they build on.

begin;

-- ============================================================
-- 0. SCHEMA — toppings gain per-size prices (family / personal)
--    `price` stays as the legacy/fallback (= personal tier).
-- ============================================================

alter table public.toppings add column if not exists price_personal integer;
alter table public.toppings add column if not exists price_family   integer;
-- "opening price": the first such topping on a pizza bills at the personal rate
-- even on a family tray (olives / corn share one ₪5 slot).
alter table public.toppings add column if not exists starter boolean not null default false;

-- ============================================================
-- 1. CATEGORIES  (full set + display order)
-- ============================================================

insert into public.categories (id, name, sort) values
  ('pizza',    'פיצות',          0),
  ('chef',     'פיצות השף',      1),
  ('pasta',    'פסטות',          2),
  ('meat',     'ארוחות בשריות',  3),
  ('sides',    'תוספות',         4),
  ('salads',   'סלטים',          5),
  ('drinks',   'שתייה',          6),
  ('desserts', 'קינוחים',        7)
on conflict (id) do update set name = excluded.name, sort = excluded.sort;

-- ============================================================
-- 2. REGULAR PIZZAS  (category 'pizza')  — family / personal
--    Each pizza carries the two sizes as variants (with a `size` marker the
--    builder uses to pick the right per-size topping price). base_price =
--    personal (the cheaper "from" price shown on the card).
--    included_toppings = recipe length → its listed toppings are included,
--    any further topping is charged.
-- ============================================================

insert into public.products
  (id, category_id, name, description, base_price, is_pizza, split_capable,
   included_toppings, variants, art, sort) values
  ('r_plain',      'pizza', 'פיצה רגילה',      'רוטב פיצה, גבינה צהובה', 2500, true, true, 0,
     '[{"id":"r_plain_f","label":"משפחתית","price":6000,"size":"family"},{"id":"r_plain_p","label":"אישית","price":2500,"size":"personal"}]'::jsonb, '[]'::jsonb, 0),
  ('r_margarita',  'pizza', 'פיצה מרגריטה',    'זיתים',                        3000, true, true, 1,
     '[{"id":"r_margarita_f","label":"משפחתית","price":6500,"size":"family"},{"id":"r_margarita_p","label":"אישית","price":3000,"size":"personal"}]'::jsonb, '["t_olives"]'::jsonb, 1),
  ('r_napolitana', 'pizza', 'פיצה נפוליטנה',   'אנשובי',                       4000, true, true, 1,
     '[{"id":"r_napolitana_f","label":"משפחתית","price":7500,"size":"family"},{"id":"r_napolitana_p","label":"אישית","price":4000,"size":"personal"}]'::jsonb, '["t_anchovy"]'::jsonb, 2),
  ('r_funghi',     'pizza', 'פיצה פונגי',      'פטריות טריות',                 3000, true, true, 1,
     '[{"id":"r_funghi_f","label":"משפחתית","price":7000,"size":"family"},{"id":"r_funghi_p","label":"אישית","price":3000,"size":"personal"}]'::jsonb, '["t_mushroom"]'::jsonb, 3),
  ('r_corn',       'pizza', 'פיצה תירס',       'תירס',                         3000, true, true, 1,
     '[{"id":"r_corn_f","label":"משפחתית","price":6500,"size":"family"},{"id":"r_corn_p","label":"אישית","price":3000,"size":"personal"}]'::jsonb, '["t_corn"]'::jsonb, 4),
  ('r_salami',     'pizza', 'פיצה סלמי',       'סלמי',                         4000, true, true, 1,
     '[{"id":"r_salami_f","label":"משפחתית","price":7500,"size":"family"},{"id":"r_salami_p","label":"אישית","price":4000,"size":"personal"}]'::jsonb, '["t_salami"]'::jsonb, 5),
  ('r_siciliana',  'pizza', 'פיצה סיציליאנה',  'טונה',                         4000, true, true, 1,
     '[{"id":"r_siciliana_f","label":"משפחתית","price":7500,"size":"family"},{"id":"r_siciliana_p","label":"אישית","price":4000,"size":"personal"}]'::jsonb, '["t_tuna"]'::jsonb, 6),
  ('r_hawai',      'pizza', 'פיצה הוואי',      'אווז, אננס',                   4000, true, true, 2,
     '[{"id":"r_hawai_f","label":"משפחתית","price":8500,"size":"family"},{"id":"r_hawai_p","label":"אישית","price":4000,"size":"personal"}]'::jsonb, '["t_goose","t_pineapple"]'::jsonb, 7),
  ('r_prosciutto', 'pizza', 'פיצה פרושוטו',    'אווז',                         3500, true, true, 1,
     '[{"id":"r_prosciutto_f","label":"משפחתית","price":7500,"size":"family"},{"id":"r_prosciutto_p","label":"אישית","price":3500,"size":"personal"}]'::jsonb, '["t_goose"]'::jsonb, 8),
  ('r_cipola',     'pizza', 'פיצה צ׳יפולה',    'בצל',                          3000, true, true, 1,
     '[{"id":"r_cipola_f","label":"משפחתית","price":6500,"size":"family"},{"id":"r_cipola_p","label":"אישית","price":3000,"size":"personal"}]'::jsonb, '["t_onion"]'::jsonb, 9),
  ('r_pepper',     'pizza', 'פיצה פלפל',       'גמבה, פלפל, זיתים',            3500, true, true, 2,
     '[{"id":"r_pepper_f","label":"משפחתית","price":7000,"size":"family"},{"id":"r_pepper_p","label":"אישית","price":3500,"size":"personal"}]'::jsonb, '["t_pepper","t_olives"]'::jsonb, 10),
  ('r_peperrone',  'pizza', 'פיצה פפרוני',     'סלמי חריף',                    3500, true, true, 1,
     '[{"id":"r_peperrone_f","label":"משפחתית","price":7500,"size":"family"},{"id":"r_peperrone_p","label":"אישית","price":3500,"size":"personal"}]'::jsonb, '["t_pepperoni"]'::jsonb, 11),
  ('r_mediterran', 'pizza', 'פיצה ים תיכונית', 'בולגרית, חצילים, עגבניות',     4000, true, true, 3,
     '[{"id":"r_mediterran_f","label":"משפחתית","price":8500,"size":"family"},{"id":"r_mediterran_p","label":"אישית","price":4000,"size":"personal"}]'::jsonb, '["t_bulgarit","t_eggplant","t_tomato"]'::jsonb, 12),
  ('r_capri',      'pizza', 'פיצה קפרי',       'בולגרית, עגבניות, זעתר, זיתים שחורים', 4000, true, true, 4,
     '[{"id":"r_capri_f","label":"משפחתית","price":8000,"size":"family"},{"id":"r_capri_p","label":"אישית","price":4000,"size":"personal"}]'::jsonb, '["t_bulgarit","t_tomato","t_zaatar","t_black_olives"]'::jsonb, 13)
on conflict (id) do update set
  category_id = excluded.category_id, name = excluded.name, description = excluded.description,
  base_price = excluded.base_price, is_pizza = excluded.is_pizza, split_capable = excluded.split_capable,
  included_toppings = excluded.included_toppings, variants = excluded.variants, art = excluded.art,
  sort = excluded.sort, updated_at = now();

-- ============================================================
-- 3. CHEF PIZZAS  (category 'chef')  — single price
-- ============================================================

insert into public.products
  (id, category_id, name, description, base_price, is_pizza, split_capable,
   included_toppings, variants, art, sort) values
  ('p_vino',     'chef', 'פיצה וינו וינו 🌶', 'פפרוני, ירקות, בולגרית',        9500,  true, true, 3, null, '["t_pepperoni","t_pepper","t_bulgarit"]'::jsonb, 0),
  ('p_shchitut', 'chef', 'פיצה שחיתות 🌶',    'סלמי, פפרוני, אווז',            9500,  true, true, 3, null, '["t_salami","t_pepperoni","t_goose"]'::jsonb, 1),
  ('p_asia',     'chef', 'פיצה אסיאתית',      'פפרוני, תירס, גמבה, אננס',      9500,  true, true, 4, null, '["t_pepperoni","t_corn","t_pepper","t_pineapple"]'::jsonb, 2),
  ('p_monte',    'chef', 'פיצה מונטקרלו',     'אווז, פטריות, בצל',             9500,  true, true, 3, null, '["t_goose","t_mushroom","t_onion"]'::jsonb, 3),
  ('p_romana',   'chef', 'פיצה רומנה',        'פלפל, זיתים, סלמי',             9000,  true, true, 3, null, '["t_pepper","t_olives","t_salami"]'::jsonb, 4),
  ('p_mex',      'chef', 'פיצה מקסיקנית 🌶',  'סלמי, חלפיניו, עגבניה, בולגרית', 9500,  true, true, 4, null, '["t_salami","t_jalapeno","t_tomato","t_bulgarit"]'::jsonb, 5),
  ('p_chicken',  'chef', 'פיצה צ׳יקן 🌶',     'נתחי עוף וירקות',              10000,  true, true, 3, null, '["t_chicken","t_pepper","t_corn"]'::jsonb, 6),
  ('p_pesto',    'chef', 'פיצה פסטו',         'רוטב פסטו, בולגרית',            9500,  true, true, 1, null, '["t_bulgarit"]'::jsonb, 7),
  ('p_alfredo',  'chef', 'פיצה אלפרדו',       'רוטב אלפרדו, פטריות',           9500,  true, true, 1, null, '["t_mushroom"]'::jsonb, 8),
  ('p_veg',      'chef', 'פיצה ירקות',        'פטריות, בצל, פלפל, זיתים',      9000,  true, true, 4, null, '["t_mushroom","t_onion","t_pepper","t_olives"]'::jsonb, 9),
  ('p_bolognese','chef', 'פיצה בולונז',       'רוטב עגבניות עם בשר, גבינה צהובה', 9500, true, true, 0, null, '[]'::jsonb, 10),
  ('p_vegan',    'chef', 'פיצה טבעונית 🌱',   'זיתים, פטריות, גמבה, בצל, תירס, עגבניות', 8000, true, true, 6, null, '["t_olives","t_mushroom","t_pepper","t_onion","t_corn","t_tomato"]'::jsonb, 11)
on conflict (id) do update set
  category_id = excluded.category_id, name = excluded.name, description = excluded.description,
  base_price = excluded.base_price, is_pizza = excluded.is_pizza, split_capable = excluded.split_capable,
  included_toppings = excluded.included_toppings, variants = excluded.variants, art = excluded.art,
  sort = excluded.sort, updated_at = now();

-- ============================================================
-- 4. BUILD-YOUR-OWN — retired. Plain regular pizza (r_plain) now carries the
--    1-free-topping build-your-own behaviour, so the dedicated products and
--    the 'build' category are removed (products first — FK is on category_id).
-- ============================================================

delete from public.products  where id in ('b_personal', 'b_family');
delete from public.categories where id = 'build';

-- ============================================================
-- 5. PASTA  (category 'pasta')  — by-sauce
-- ============================================================

delete from public.products
 where category_id = 'pasta'
   and id in ('pa_penne','pa_ravioli_cheese','pa_ravioli_potato','pa_fettuccine',
              'pa_spaghetti','pa_tortellini','pa_lasagna');

insert into public.products
  (id, category_id, name, description, base_price, sort) values
  ('pa_pumarola',  'pasta', 'פסטה פומרולה',   'רוטב עגבניות',                  6500, 0),
  ('pa_funghi',    'pasta', 'פסטה פונגי',     'רוטב שמנת, פטריות',             6500, 1),
  ('pa_bolognese', 'pasta', 'פסטה בולונז',    'רוטב עגבניות, בשר',             6500, 2),
  ('pa_milano',    'pasta', 'פסטה מילאנו',    'רוטב שמנת ועגבניות',            6500, 3),
  ('pa_salmon',    'pasta', 'פסטה סלמון',     'רוטב שמנת עם נתחי סלמון מעושן', 6500, 4),
  ('pa_carbonara', 'pasta', 'פסטה קרבונרה',   'רוטב שמנת, אווז',               6500, 5),
  ('pa_parma',     'pasta', 'פסטה א-לה פרמה', 'רוטב שמנת ואגוז מוסקט',         6500, 6),
  ('pa_pesto',     'pasta', 'פסטה פסטו',      'רוטב שמנת, פסטו',               6500, 7),
  ('pa_capri',     'pasta', 'פסטה קפרי',      'שמן זית ובולגרית',              6500, 8),
  ('pa_chicken',   'pasta', 'פסטה עוף',       'רוטב שמנת, פטריות, נתחי עוף',   7500, 9)
on conflict (id) do update set
  category_id = excluded.category_id, name = excluded.name, description = excluded.description,
  base_price = excluded.base_price, sort = excluded.sort, updated_at = now();

-- ============================================================
-- 6. MEAT MEALS  (category 'meat')  — all include chips/mash + salad
-- ============================================================

-- the old single sides became full meals — retire them
delete from public.products where id in ('s_wings', 's_schnitzel', 's_scaloppine');

insert into public.products
  (id, category_id, name, description, base_price, sort) values
  ('m_wings',           'meat', 'כנפיים',                '10 יח׳ כנפיים מטוגנות, פירורי לחם · עם צ׳יפס/פירה + סלט', 7500, 0),
  ('m_schnitzel',       'meat', 'שניצלונים',             'עם צ׳יפס/פירה + סלט',                                     7500, 1),
  ('m_wings_chili',     'meat', 'כנפיים מוקפצים',        'צ׳ילי מתוק וירקות · עם צ׳יפס/פירה + סלט',                  8500, 2),
  ('m_schnitzel_chili', 'meat', 'שניצלונים מוקפצים',     'צ׳ילי מתוק וירקות · עם צ׳יפס/פירה + סלט',                  8500, 3),
  ('m_escalope_grill',  'meat', 'סקלופיני עוף על האש',   'פילה עוף על האש עם ירקות · עם צ׳יפס/פירה + סלט',           8500, 4),
  ('m_escalope_funghi', 'meat', 'סקלופיני עוף פונג׳י',   'ברוטב שמנת ופטריות · עם צ׳יפס/פירה + סלט',                 8500, 5),
  ('m_escalope_pesto',  'meat', 'סקלופיני עוף פסטו',     'ברוטב שמנת פסטו · עם צ׳יפס/פירה + סלט',                    8500, 6),
  ('m_escalope_garlic', 'meat', 'סקלופיני עוף שום',      'בתנור ברוטב שום · עם צ׳יפס/פירה + סלט',                    8500, 7),
  ('m_escalope_chili',  'meat', 'סקלופיני עוף צ׳ילי',    'בתנור עם פלפלים ברוטב צ׳ילי · עם צ׳יפס/פירה + סלט',        8500, 8)
on conflict (id) do update set
  category_id = excluded.category_id, name = excluded.name, description = excluded.description,
  base_price = excluded.base_price, sort = excluded.sort, updated_at = now();

-- ============================================================
-- 7. SIDES  (category 'sides')  — fries + garlic bread (large / small)
-- ============================================================

insert into public.products
  (id, category_id, name, description, base_price, variants, sort) values
  ('s_chips',        'sides', 'צ׳יפס',            null, 2000,
     '[{"id":"s_chips_s","label":"קטן","price":2000},{"id":"s_chips_l","label":"גדול","price":3500}]'::jsonb, 0),
  ('s_garlic',       'sides', 'לחם שום',          null, 1500,
     '[{"id":"s_garlic_s","label":"קטן","price":1500},{"id":"s_garlic_l","label":"גדול","price":4000}]'::jsonb, 1),
  ('s_garlic_plus',  'sides', 'לחם שום משופר',    'צהובה ובולגרית', 4000,
     '[{"id":"s_garlic_plus_s","label":"קטן","price":4000},{"id":"s_garlic_plus_l","label":"גדול","price":8000}]'::jsonb, 2),
  ('s_chips_alfredo','sides', 'צ׳יפס אלפרדו',     null, 5000, null, 3)
on conflict (id) do update set
  category_id = excluded.category_id, name = excluded.name, description = excluded.description,
  base_price = excluded.base_price, variants = excluded.variants, sort = excluded.sort, updated_at = now();

-- ============================================================
-- 8. SALADS  (category 'salads')  — served with dressing + garlic bread
-- ============================================================

insert into public.products
  (id, category_id, name, description, base_price, sort) values
  ('sl_greek',    'salads', 'סלט יווני',        'חסה, עגבניה, מלפפון, בצל, בולגרית, זעתר, שמן זית', 5000, 0),
  ('sl_chicken',  'salads', 'סלט עוף',          'חסה, עגבניה, מלפפון, בצל, גמבה, נתחי עוף',        7500, 1),
  ('sl_italian',  'salads', 'סלט איטלקי',       'חסה, עגבניה, מלפפון, טונה, אנשובי, פטריות',       5000, 2),
  ('sl_tuna',     'salads', 'סלט טונה',         'חסה, עגבניה, מלפפון, טונה, תירס, זיתים',          5000, 3),
  ('sl_chopped',  'salads', 'סלט ירקות קצוץ 🌱', 'עגבניה, מלפפון, בצל, שמן זית ולימון',            4000, 4),
  ('sl_selfmade', 'salads', 'סלט בהרכבה עצמית',  'חסה, ירקות, גבינה בולגרית, טונה, אנשובי ועוד',    4500, 5)
on conflict (id) do update set
  category_id = excluded.category_id, name = excluded.name, description = excluded.description,
  base_price = excluded.base_price, sort = excluded.sort, updated_at = now();

-- ============================================================
-- 9. DRINKS  (category 'drinks')
-- ============================================================

insert into public.products
  (id, category_id, name, base_price, sort) values
  ('d_water',                'drinks', 'מים מינרליים 0.5', 800,  0),
  ('d_coke',                 'drinks', 'קוקה קולה 0.33',   1000, 1),
  ('d_coke_zero',            'drinks', 'קולה זירו 0.33',   1000, 2),
  ('d_sprite',               'drinks', 'ספרייט 0.33',      1000, 3),
  ('d_fanta',                'drinks', 'פאנטה 0.33',       1000, 4),
  ('d_coke_big',             'drinks', 'קוקה קולה 1.5',    1500, 5),
  ('d_coke_zero_big',        'drinks', 'קולה זירו 1.5',    1500, 6),
  ('d_sprite_big',           'drinks', 'ספרייט 1.5',       1500, 7),
  ('d_fanta_big',            'drinks', 'פאנטה 1.5',        1500, 8),
  ('d_grape_big',            'drinks', 'ענבים 1.5',        1500, 9),
  ('d_strawberry_banana_big','drinks', 'תות בננה 1.5',     1500, 10)
on conflict (id) do update set
  category_id = excluded.category_id, name = excluded.name,
  base_price = excluded.base_price, sort = excluded.sort, updated_at = now();

-- ============================================================
-- 10. DESSERTS  (category 'desserts')
-- ============================================================

insert into public.products
  (id, category_id, name, base_price, sort) values
  ('des_bavaria', 'desserts', 'באווריה', 5000, 0)
on conflict (id) do update set
  category_id = excluded.category_id, name = excluded.name,
  base_price = excluded.base_price, sort = excluded.sort, updated_at = now();

-- ============================================================
-- 11. TOPPINGS  (two-tier, per-size family / personal)
--     basic   = ₪10 / 5   (1000 / 500)
--     premium = ₪15 / 10  (1500 / 1000)
--     chicken = ₪20 / 15  (2000 / 1500)
--     `price` (legacy) kept = personal tier.
-- ============================================================

insert into public.toppings (id, name, price, price_personal, price_family) values
  -- basic
  ('t_mushroom',     'פטריות',       500,  500,  1000),
  ('t_onion',        'בצל',          500,  500,  1000),
  ('t_olives',       'זיתים',        500,  500,  1000),
  ('t_corn',         'תירס',         500,  500,  1000),
  ('t_pepper',       'גמבה',         500,  500,  1000),
  ('t_jalapeno',     'חלפיניו',      500,  500,  1000),
  ('t_pineapple',    'אננס',         500,  500,  1000),
  ('t_tomato',       'עגבניות',      500,  500,  1000),
  ('t_eggplant',     'חצילים',       500,  500,  1000),
  ('t_zaatar',       'זעתר',         500,  500,  1000),
  ('t_black_olives', 'זיתים שחורים', 500,  500,  1000),
  -- premium
  ('t_bulgarit',     'בולגרית',      1000, 1000, 1500),
  ('t_pepperoni',    'פפרוני',       1000, 1000, 1500),
  ('t_salami',       'סלמי',         1000, 1000, 1500),
  ('t_goose',        'אווז',         1000, 1000, 1500),
  ('t_tuna',         'טונה',         1000, 1000, 1500),
  ('t_extra_cheese', 'גבינה נוספת',  1000, 1000, 1500),
  ('t_anchovy',      'אנשובי',       1000, 1000, 1500),
  -- chicken
  ('t_chicken',      'נתחי עוף',     1500, 1500, 2000)
on conflict (id) do update set
  name = excluded.name, price = excluded.price,
  price_personal = excluded.price_personal, price_family = excluded.price_family;

-- olives + corn get the "opening price" (first one bills at the personal rate).
update public.toppings set starter = (id in ('t_olives', 't_corn'));

-- ============================================================
-- 12. DEALS / BUNDLES  (fixed-price combos, added from the מבצעים pill)
--     Pizzas default to plain family (r_plain, משפחתית) so staff can swap in
--     any pizza and the combo keeps its fixed price. items carry variantLabel
--     for sized products (משפחתית / גדול).
-- ============================================================

delete from public.bundles where id in ('bnd_two_family', 'bnd_pizza_chips');

insert into public.bundles (id, name, items, price, active) values
  ('bnd_2fam',            'זוג משפחתיות',
     '[{"productId":"r_plain","qty":2,"variantLabel":"משפחתית"}]'::jsonb, 11000, true),
  ('bnd_3fam',            'שלישיית משפחתיות',
     '[{"productId":"r_plain","qty":3,"variantLabel":"משפחתית"}]'::jsonb, 14000, true),
  ('bnd_2fam_greek',      '2 פיצות + סלט יווני',
     '[{"productId":"r_plain","qty":2,"variantLabel":"משפחתית"},{"productId":"sl_greek","qty":1},{"productId":"s_garlic","qty":1,"variantLabel":"גדול"}]'::jsonb, 15000, true),
  ('bnd_2schnitzel',      '2 ארוחות שניצלונים',
     '[{"productId":"m_schnitzel","qty":2},{"productId":"s_garlic","qty":1,"variantLabel":"גדול"}]'::jsonb, 14000, true),
  ('bnd_fam_deal',        'מבצע משפחתי',
     '[{"productId":"r_plain","qty":1,"variantLabel":"משפחתית"},{"productId":"sl_greek","qty":1},{"productId":"s_garlic","qty":1,"variantLabel":"גדול"},{"productId":"d_coke_big","qty":1}]'::jsonb, 12000, true),
  ('bnd_pizza_schnitzel', 'פיצה + שניצלונים',
     '[{"productId":"r_plain","qty":1,"variantLabel":"משפחתית"},{"productId":"m_schnitzel","qty":1},{"productId":"s_garlic","qty":1,"variantLabel":"גדול"},{"productId":"d_coke_big","qty":1}]'::jsonb, 15000, true)
on conflict (id) do update set
  name = excluded.name, items = excluded.items, price = excluded.price, active = excluded.active;

commit;
