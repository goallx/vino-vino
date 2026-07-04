import type { KitchenOrder } from '../types';
import { publishOrder, loadOrders } from '../lib/orderBus';

const minsAgo = (m: number) => Date.now() - m * 60000;

/** Seed a few representative orders so the board is demoable (?demo). */
export function seedKitchenDemo() {
  if (loadOrders().length) return;

  const orders: KitchenOrder[] = [
    {
      id: 'demo_7',
      number: 7,
      type: 'delivery',
      payment: 'unpaid',
      customerName: 'דנה כהן',
      phone: '0501234567',
      address: 'הרצל 5, חיפה',
      createdAt: minsAgo(2),
      status: 'new',
      lines: [
        {
          id: 'd7a', productId: 'b_family', name: 'משפחתית בהרכבה', qty: 1, unitPrice: 6900, isSplit: true,
          parts: [
            { target: 'half_1', baseProductId: 'p_vino', baseName: 'וינו וינו', toppings: [{ toppingId: 't_mushroom', name: 'פטריות', action: 'add', price: 500 }] },
            { target: 'half_2', baseProductId: 'p_shchitut', baseName: 'שחיתות', toppings: [{ toppingId: 't_onion', name: 'בצל', action: 'remove', price: 0 }] },
          ],
        },
        { id: 'd7b', productId: 'd_coke', name: 'קוקה קולה 0.33', qty: 2, unitPrice: 1000, isSplit: false, parts: [] },
      ],
    },
    {
      id: 'demo_8',
      number: 8,
      type: 'pickup',
      payment: 'paid',
      customerName: 'יוסי לוי',
      phone: '0527778888',
      createdAt: minsAgo(12),
      status: 'preparing',
      lines: [
        {
          id: 'd8a', productId: 'b_personal', name: 'אישית בהרכבה', qty: 1, unitPrice: 4000, isSplit: false,
          parts: [{ target: 'whole', baseProductId: 'b_personal', baseName: 'אישית בהרכבה', toppings: [
            { toppingId: 't_mushroom', name: 'פטריות', action: 'add', price: 500 },
            { toppingId: 't_corn', name: 'תירס', action: 'add', price: 500 },
            { toppingId: 't_olives', name: 'זיתים', action: 'add', price: 500 },
            { toppingId: 't_jalapeno', name: 'חלפיניו', action: 'add', price: 500 },
          ] }],
        },
        { id: 'd8b', productId: 's_garlic', name: 'לחם שום', qty: 1, unitPrice: 2500, isSplit: false, variantLabel: 'גדול', parts: [] },
      ],
    },
    {
      id: 'demo_9',
      number: 9,
      type: 'delivery',
      payment: 'unpaid',
      customerName: 'משה דוד',
      phone: '0543334444',
      address: 'ביאליק 12, חיפה',
      createdAt: minsAgo(22),
      status: 'new',
      note: 'לדפוק בדלת, פעמון מקולקל',
      lines: [
        { id: 'd9a', productId: 's_schnitzel', name: 'שניצלונים', qty: 1, unitPrice: 8500, isSplit: false, parts: [], note: 'בלי לימון' },
        { id: 'd9b', productId: 'sl_greek', name: 'סלט יווני', qty: 1, unitPrice: 5000, isSplit: false, parts: [] },
      ],
    },
  ];

  orders.forEach(publishOrder);
}
