import type { Customer, PastOrder } from '../types';

// Stand-in for the `customers` + past `orders` tables until Supabase is wired,
// so the phone-search → reorder flow is demoable today.
interface CustomerRecord {
  customer: Customer;
  past: PastOrder[];
}

export const sampleCustomers: Record<string, CustomerRecord> = {
  '0501234567': {
    customer: { phone: '0501234567', name: 'דנה כהן', address: 'הרצל 5, חיפה' },
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
    customer: { phone: '0527778888', name: 'יוסי לוי', address: 'ביאליק 12, חיפה' },
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

export function lookupCustomer(phone: string): CustomerRecord | null {
  const digits = phone.replace(/\D/g, '');
  return sampleCustomers[digits] ?? null;
}
