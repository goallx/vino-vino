import type { CartLine, KitchenOrder, OrderType, PaymentStatus } from '../types';
import { productsById } from '../lib/menuStore';
import { clearOrders, publishOrder } from '../lib/orderBus';

let seq = 0;
const lid = () => `s${seq++}`;

/** Whole pizza line. */
function P(productId: string, qty = 1): CartLine {
  const p = productsById[productId];
  return {
    id: lid(), productId, name: p.name, qty, unitPrice: p.basePrice, isSplit: false,
    parts: [{ target: 'whole', baseProductId: productId, baseName: p.name, toppings: [] }],
  };
}

/** Non-pizza item line (optionally a size variant). */
function I(productId: string, qty = 1, variantLabel?: string): CartLine {
  const p = productsById[productId];
  const price = variantLabel ? p.variants?.find((v) => v.label === variantLabel)?.price ?? p.basePrice : p.basePrice;
  return { id: lid(), productId, name: p.name, qty, unitPrice: price, isSplit: false, variantLabel, parts: [] };
}

const DAY = 24 * 60 * 60 * 1000;

function at(hour: number, minute = 0, dayOffset = 0): number {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d.getTime() - dayOffset * DAY;
}

let n = 0;
function O(type: OrderType, payment: PaymentStatus, time: number, lines: CartLine[], discountSaving?: number): KitchenOrder {
  n += 1;
  return {
    id: `r_${n}`, number: n, type, payment, createdAt: time, status: 'ready', lines,
    discounts: discountSaving ? [{ uid: `r_${n}_d`, bundleId: 'bnd_demo', label: 'זוג משפחתיות', amount: discountSaving }] : undefined,
  };
}

/** Seed a believable lunch + dinner day so the dashboard has real numbers. */
export function seedReportsDemo() {
  clearOrders();
  seq = 0;
  n = 0;

  const half: CartLine = {
    id: lid(), productId: 'b_family', name: 'משפחתית בהרכבה', qty: 1, unitPrice: 6900, isSplit: true,
    parts: [
      { target: 'half_1', baseProductId: 'p_vino', baseName: 'וינו וינו', toppings: [{ toppingId: 't_mushroom', name: 'פטריות', action: 'add', price: 500 }] },
      { target: 'half_2', baseProductId: 'p_shchitut', baseName: 'שחיתות', toppings: [] },
    ],
  };

  const orders: KitchenOrder[] = [
    O('pickup', 'paid', at(12, 15), [P('p_vino'), I('d_coke')]),
    O('delivery', 'unpaid', at(12, 40), [P('b_personal'), I('s_garlic', 1, 'קטן')]),
    O('delivery', 'paid', at(13, 5), [P('p_shchitut'), P('p_vino'), I('sl_greek')]),
    O('pickup', 'paid', at(13, 30), [I('s_schnitzel'), I('s_chips', 1, 'גדול')]),
    O('delivery', 'unpaid', at(18, 10), [half, I('d_coke', 2)]),
    O('delivery', 'paid', at(18, 25), [P('p_asia'), P('p_veg')], 3000), // זוג משפחתיות deal

    O('pickup', 'paid', at(18, 50), [P('b_personal'), I('d_sprite')]),
    O('delivery', 'unpaid', at(19, 15), [P('p_vino'), P('p_mex'), I('sl_greek')], 3000), // זוג משפחתיות deal

    O('delivery', 'paid', at(19, 40), [P('p_chicken'), I('s_garlic', 1, 'גדול')]),
    O('pickup', 'paid', at(20, 5), [I('pa_lasagna'), I('sl_greek')]),
    O('delivery', 'unpaid', at(20, 30), [P('p_monte'), P('p_mex'), I('d_coke_big', 2)]),
    O('delivery', 'paid', at(21, 0), [P('p_vino'), I('s_schnitzel')]),

    // --- yesterday ---
    O('pickup', 'paid', at(13, 0, 1), [P('p_vino'), I('sl_greek')]),
    O('delivery', 'unpaid', at(19, 30, 1), [P('p_shchitut'), P('p_asia'), I('d_coke', 2)]),
    O('delivery', 'paid', at(20, 15, 1), [P('p_chicken'), I('s_garlic', 1, 'גדול')]),

    // --- two days ago ---
    O('delivery', 'paid', at(20, 0, 2), [P('p_vino'), P('p_mex'), I('s_schnitzel')]),
    O('pickup', 'unpaid', at(18, 30, 2), [I('pa_lasagna'), I('sl_greek')]),
  ];

  orders.forEach(publishOrder);
}
