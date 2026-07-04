import type { Bundle, Category, Product, Topping } from '../../types';
import type { StoredCustomer } from '../../lib/customers';

// Test fixture: the Vino Vino catalog as it was first seeded from the Wolt
// page (and pushed to the DB by supabase/seed.sql). The app itself carries no
// hardcoded catalog — production reads the database; tests run offline against
// this snapshot via seedCatalog() (./seed.ts). Pure data only in this file —
// scripts/gen-seed.ts imports it under node.

export const categories: Category[] = [
  { id: 'pizza', name: 'פיצות' },
  { id: 'build', name: 'הרכבה עצמית' },
  { id: 'pasta', name: 'פסטה' },
  { id: 'sides', name: 'תוספות' },
  { id: 'salads', name: 'סלטים' },
  { id: 'drinks', name: 'שתייה' },
];

export const products: Product[] = [
  // --- signature pizzas (family size, can be a half) ---
  { id: 'p_vino', categoryId: 'pizza', name: 'וינו וינו', description: 'פפרוני, ירקות, בולגרית', basePrice: 9500, isPizza: true, splitCapable: true, includedToppings: 3, art: ['t_pepperoni', 't_pepper', 't_bulgarit'] },
  { id: 'p_shchitut', categoryId: 'pizza', name: 'שחיתות', description: 'סלמי, פפרוני, אווז', basePrice: 9500, isPizza: true, splitCapable: true, includedToppings: 3, art: ['t_salami', 't_pepperoni', 't_goose'] },
  { id: 'p_monte', categoryId: 'pizza', name: 'מונטקרלו', description: 'אווז, פטריות, בצל', basePrice: 9500, isPizza: true, splitCapable: true, includedToppings: 3, art: ['t_goose', 't_mushroom', 't_onion'] },
  { id: 'p_asia', categoryId: 'pizza', name: 'אסיאתית', description: 'פפרוני, תירס, גמבה, אננס', basePrice: 9500, isPizza: true, splitCapable: true, includedToppings: 3, art: ['t_pepperoni', 't_corn', 't_pepper', 't_pineapple'] },
  { id: 'p_romana', categoryId: 'pizza', name: 'רומנה', description: 'פלפל, זיתים, סלמי', basePrice: 9000, isPizza: true, splitCapable: true, includedToppings: 3, art: ['t_pepper', 't_olives', 't_salami'] },
  { id: 'p_chicken', categoryId: 'pizza', name: 'צ׳יקן', description: 'נתחי עוף וירקות', basePrice: 10000, isPizza: true, splitCapable: true, includedToppings: 3, art: ['t_chicken', 't_pepper', 't_corn'] },
  { id: 'p_mex', categoryId: 'pizza', name: 'מקסיקנית', description: 'סלמי, חלפיניו, עגבניה, בולגרית', basePrice: 9500, isPizza: true, splitCapable: true, includedToppings: 3, art: ['t_salami', 't_jalapeno', 't_tomato', 't_bulgarit'] },
  { id: 'p_pesto', categoryId: 'pizza', name: 'פסטו', description: 'רוטב פסטו, בולגרית', basePrice: 9500, isPizza: true, splitCapable: true, includedToppings: 3, art: ['t_bulgarit', 't_tomato'] },
  { id: 'p_alfredo', categoryId: 'pizza', name: 'אלפרדו', description: 'רוטב אלפרדו, פטריות', basePrice: 9500, isPizza: true, splitCapable: true, includedToppings: 3, art: ['t_mushroom', 't_extra_cheese'] },
  { id: 'p_veg', categoryId: 'pizza', name: 'ירקות', description: 'פטריות, בצל, פלפל, זיתים', basePrice: 9000, isPizza: true, splitCapable: true, includedToppings: 3, art: ['t_mushroom', 't_onion', 't_pepper', 't_olives'] },
  { id: 'p_vegan', categoryId: 'pizza', name: '🌱 טבעונית', description: 'זיתים, פטריות, גמבה, בצל, תירס, עגבניות', basePrice: 7000, isPizza: true, splitCapable: true, includedToppings: 3, art: ['t_olives', 't_mushroom', 't_pepper', 't_onion', 't_corn', 't_tomato'] },

  // --- build-your-own (the half/half base) ---
  { id: 'b_personal', categoryId: 'build', name: 'אישית בהרכבה', description: 'רוטב, גבינה צהובה', basePrice: 3500, isPizza: true, splitCapable: true, includedToppings: 3, art: [] },
  { id: 'b_family', categoryId: 'build', name: 'משפחתית בהרכבה', description: 'רוטב, גבינה צהובה', basePrice: 6900, isPizza: true, splitCapable: true, includedToppings: 3, art: [] },

  // --- pasta ---
  { id: 'pa_penne', categoryId: 'pasta', name: 'פנה', basePrice: 7500 },
  { id: 'pa_ravioli_cheese', categoryId: 'pasta', name: 'רביולי גבינה', basePrice: 7500 },
  { id: 'pa_ravioli_potato', categoryId: 'pasta', name: 'רביולי בטטה', basePrice: 7500 },
  { id: 'pa_fettuccine', categoryId: 'pasta', name: 'פטוצ׳יני', basePrice: 7500 },
  { id: 'pa_spaghetti', categoryId: 'pasta', name: 'ספגטי', basePrice: 7500 },
  { id: 'pa_tortellini', categoryId: 'pasta', name: 'טורטליני פטריות', basePrice: 7500 },
  { id: 'pa_lasagna', categoryId: 'pasta', name: 'לזניה', basePrice: 8500 },

  // --- sides ---
  { id: 's_chips', categoryId: 'sides', name: 'צ׳יפס', basePrice: 2000, variants: [
    { id: 's_chips_s', label: 'קטן', price: 2000 },
    { id: 's_chips_l', label: 'גדול', price: 3000 },
  ] },
  { id: 's_chips_alfredo', categoryId: 'sides', name: 'צ׳יפס אלפרדו', basePrice: 5000 },
  { id: 's_garlic', categoryId: 'sides', name: 'לחם שום', basePrice: 1500, variants: [
    { id: 's_garlic_s', label: 'קטן', price: 1500 },
    { id: 's_garlic_l', label: 'גדול', price: 2500 },
  ] },
  { id: 's_garlic_plus', categoryId: 'sides', name: 'לחם שום משופר', description: 'צהובה ובולגרית', basePrice: 3500 },
  { id: 's_wings', categoryId: 'sides', name: 'כנפיים 10 יח׳', basePrice: 8000 },
  { id: 's_schnitzel', categoryId: 'sides', name: 'שניצלונים', basePrice: 8500 },
  { id: 's_scaloppine', categoryId: 'sides', name: 'סקלופיני עוף', basePrice: 9000 },

  // --- salads ---
  { id: 'sl_chicken', categoryId: 'salads', name: 'סלט עוף', basePrice: 7500 },
  { id: 'sl_greek', categoryId: 'salads', name: 'סלט יווני', basePrice: 5000 },
  { id: 'sl_italian', categoryId: 'salads', name: 'סלט איטלקי', basePrice: 5000 },
  { id: 'sl_tuna', categoryId: 'salads', name: 'סלט טונה', basePrice: 5000 },
  { id: 'sl_chopped', categoryId: 'salads', name: 'סלט ירקות קצוץ', basePrice: 4000 },

  // --- drinks ---
  { id: 'd_water', categoryId: 'drinks', name: 'מים מינרליים 0.5', basePrice: 800 },
  { id: 'd_coke', categoryId: 'drinks', name: 'קוקה קולה 0.33', basePrice: 1000 },
  { id: 'd_coke_zero', categoryId: 'drinks', name: 'קולה זירו 0.33', basePrice: 1000 },
  { id: 'd_sprite', categoryId: 'drinks', name: 'ספרייט 0.33', basePrice: 1000 },
  { id: 'd_fanta', categoryId: 'drinks', name: 'פאנטה 0.33', basePrice: 1000 },
  { id: 'd_coke_big', categoryId: 'drinks', name: 'קוקה קולה 1.5', basePrice: 1500 },
  { id: 'd_sprite_big', categoryId: 'drinks', name: 'ספרייט 1.5', basePrice: 1500 },
  { id: 'd_fanta_big', categoryId: 'drinks', name: 'פאנטה 1.5', basePrice: 1500 },
];

export const toppings: Topping[] = [
  { id: 't_mushroom', name: 'פטריות', price: 500 },
  { id: 't_onion', name: 'בצל', price: 500 },
  { id: 't_olives', name: 'זיתים', price: 500 },
  { id: 't_corn', name: 'תירס', price: 500 },
  { id: 't_pepper', name: 'גמבה', price: 500 },
  { id: 't_jalapeno', name: 'חלפיניו', price: 500 },
  { id: 't_pineapple', name: 'אננס', price: 500 },
  { id: 't_tomato', name: 'עגבניות', price: 500 },
  { id: 't_bulgarit', name: 'בולגרית', price: 700 },
  { id: 't_pepperoni', name: 'פפרוני', price: 700 },
  { id: 't_salami', name: 'סלמי', price: 700 },
  { id: 't_goose', name: 'אווז', price: 700 },
  { id: 't_tuna', name: 'טונה', price: 700 },
  { id: 't_chicken', name: 'נתחי עוף', price: 900 },
  { id: 't_extra_cheese', name: 'גבינה נוספת', price: 700 },
];

export const productsById = Object.fromEntries(products.map((p) => [p.id, p]));

export const bundles: Bundle[] = [
  { id: 'bnd_two_family', name: 'זוג משפחתיות', items: [{ productId: 'p_vino', qty: 2 }], price: 16000, active: true },
  { id: 'bnd_pizza_chips', name: 'משפחתית + צ׳יפס גדול', items: [{ productId: 'p_veg', qty: 1 }, { productId: 's_chips', qty: 1 }], price: 10000, active: true },
];

/** Known customers for the phone-autocomplete / reorder flows. */
export const customers: Record<string, StoredCustomer> = {
  '0501234567': {
    phone: '0501234567',
    name: 'דנה כהן',
    address: 'הרצל 5, חיפה',
    orderCount: 2,
    lastOrderAt: Date.now() - 86_400_000,
    past: [
      {
        id: 'h1',
        date: 'אתמול',
        total: 11500,
        summary: '1× שחיתות משפחתית, 2× קוקה קולה',
        lines: [
          { id: 'h1a', productId: 'p_shchitut', name: 'שחיתות', qty: 1, unitPrice: 9500, isSplit: false, parts: [{ target: 'whole', baseProductId: 'p_shchitut', baseName: 'שחיתות', toppings: [] }] },
          { id: 'h1b', productId: 'd_coke', name: 'קוקה קולה 0.33', qty: 2, unitPrice: 1000, isSplit: false, parts: [] },
        ],
      },
      {
        id: 'h2',
        date: '12/06',
        total: 6400,
        summary: '1× אישית +פטריות, לחם שום',
        lines: [
          { id: 'h2a', productId: 'b_personal', name: 'אישית בהרכבה', qty: 1, unitPrice: 3500, isSplit: false, parts: [{ target: 'whole', baseProductId: 'b_personal', baseName: 'אישית בהרכבה', toppings: [{ toppingId: 't_mushroom', name: 'פטריות', action: 'add', price: 0 }] }] },
          { id: 'h2b', productId: 's_garlic', name: 'לחם שום', qty: 1, unitPrice: 1500, isSplit: false, variantLabel: 'קטן', parts: [] },
        ],
      },
    ],
  },
  '0527778888': {
    phone: '0527778888',
    name: 'יוסי לוי',
    address: 'ביאליק 12, חיפה',
    orderCount: 1,
    lastOrderAt: Date.now() - 7 * 86_400_000,
    past: [
      {
        id: 'h3',
        date: 'שבוע שעבר',
        total: 14500,
        summary: 'חצי/חצי משפחתית, סלט יווני',
        lines: [
          {
            id: 'h3a', productId: 'b_family', name: 'משפחתית בהרכבה', qty: 1, unitPrice: 6900, isSplit: true,
            parts: [
              { target: 'half_1', baseProductId: 'p_vino', baseName: 'וינו וינו', toppings: [] },
              { target: 'half_2', baseProductId: 'p_shchitut', baseName: 'שחיתות', toppings: [] },
            ],
          },
          { id: 'h3b', productId: 'sl_greek', name: 'סלט יווני', qty: 1, unitPrice: 5000, isSplit: false, parts: [] },
        ],
      },
    ],
  },
};
