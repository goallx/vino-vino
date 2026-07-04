import { describe, it, expect } from 'vitest';
import { seedCatalog } from '../test/fixtures/seed';

// metric fixtures are built at module scope — the catalog must be live first
seedCatalog();
import { dailyMetrics, ordersForDay, orderRevenue, ordersInRange, computeMetrics, startOfDay } from './metrics';
import type { CartLine, KitchenOrder } from '../types';

function pizza(productId: string, name: string, price: number, qty = 1): CartLine {
  return { id: Math.random().toString(36), productId, name, qty, unitPrice: price, isSplit: false, parts: [{ target: 'whole', baseProductId: productId, baseName: name, toppings: [] }] };
}
function drink(qty = 1): CartLine {
  return { id: Math.random().toString(36), productId: 'd_coke', name: 'קוקה קולה 0.33', qty, unitPrice: 1000, isSplit: false, parts: [] };
}
function order(over: Partial<KitchenOrder>): KitchenOrder {
  return { id: Math.random().toString(36), number: 1, type: 'delivery', payment: 'paid', createdAt: Date.now(), status: 'ready', lines: [], ...over };
}

const at = (h: number) => { const d = new Date(); d.setHours(h, 0, 0, 0); return d.getTime(); };

describe('orderRevenue()', () => {
  it('sums line price × quantity', () => {
    const o = order({ lines: [pizza('p_vino', 'וינו וינו', 9500), drink(2)] });
    expect(orderRevenue(o)).toBe(9500 + 2000);
  });
});

describe('ordersForDay()', () => {
  it('keeps today and drops other days', () => {
    const yesterday = at(13) - 24 * 3600 * 1000;
    const list = [order({ createdAt: at(13) }), order({ createdAt: yesterday })];
    expect(ordersForDay(list)).toHaveLength(1);
  });
});

describe('ordersInRange() + computeMetrics()', () => {
  const DAY = 24 * 60 * 60 * 1000;
  const today = startOfDay(Date.now());
  const all = [
    order({ createdAt: today + 12 * 3600 * 1000, lines: [drink()] }),       // today
    order({ createdAt: today - 1 * DAY, lines: [drink(), drink()] }),         // yesterday
    order({ createdAt: today - 5 * DAY, lines: [drink()] }),                  // 5 days ago
  ];

  it('filters to a single day', () => {
    const yesterday = ordersInRange(all, today - DAY, today);
    expect(yesterday).toHaveLength(1);
    expect(computeMetrics(yesterday).itemCount).toBe(2);
  });

  it('filters to a 7-day window', () => {
    const week = ordersInRange(all, today - 6 * DAY, today + DAY);
    expect(week).toHaveLength(3);
    expect(computeMetrics(week).orderCount).toBe(3);
  });

  it('aggregates exactly the orders it is given, regardless of date', () => {
    expect(computeMetrics(all).orderCount).toBe(3);
  });
});

describe('dailyMetrics()', () => {
  const orders: KitchenOrder[] = [
    order({ type: 'delivery', payment: 'paid', createdAt: at(12), lines: [pizza('p_vino', 'וינו וינו', 9500), drink()] }),
    order({ type: 'pickup', payment: 'unpaid', createdAt: at(12), lines: [pizza('p_vino', 'וינו וינו', 9500)] }),
    order({ type: 'delivery', payment: 'paid', createdAt: at(19), lines: [pizza('p_shchitut', 'שחיתות', 9500), drink(2)] }),
    order({ createdAt: at(12) - 24 * 3600 * 1000, lines: [pizza('p_vino', 'וינו וינו', 9500)] }), // yesterday — excluded
  ];
  const m = dailyMetrics(orders);

  it('counts only today\'s orders', () => {
    expect(m.orderCount).toBe(3);
  });

  it('totals revenue and splits paid vs unpaid', () => {
    expect(m.revenue).toBe(9500 + 1000 + 9500 + 9500 + 2000);
    expect(m.paidRevenue).toBe(9500 + 1000 + 9500 + 2000);
    expect(m.unpaidRevenue).toBe(9500);
    expect(m.paidCount).toBe(2);
    expect(m.unpaidCount).toBe(1);
  });

  it('counts pizzas and items separately', () => {
    expect(m.pizzaCount).toBe(3); // three pizza lines, qty 1 each
    expect(m.itemCount).toBe(3 + 1 + 2); // pizzas + drinks
  });

  it('computes the average order value', () => {
    expect(m.avgOrder).toBe(Math.round(m.revenue / 3));
  });

  it('splits delivery vs pickup', () => {
    expect(m.deliveryCount).toBe(2);
    expect(m.pickupCount).toBe(1);
  });

  it('ranks best sellers by quantity', () => {
    const vino = m.topItems.find((t) => t.name === 'וינו וינו');
    expect(vino?.qty).toBe(2);
    // coke totals 3 across orders (1 + 2), so it outranks the pizzas
    expect(m.topItems[0].name).toBe('קוקה קולה 0.33');
    expect(m.topItems[0].qty).toBe(3);
  });

  it('excludes cancelled orders from revenue and counts', () => {
    const list = [
      order({ createdAt: at(12), lines: [pizza('p_vino', 'וינו וינו', 9500)] }),
      order({ status: 'cancelled', createdAt: at(12), lines: [pizza('p_vino', 'וינו וינו', 9500)] }),
    ];
    const cancelledExcluded = dailyMetrics(list);
    expect(cancelledExcluded.orderCount).toBe(1);
    expect(cancelledExcluded.revenue).toBe(9500);
  });

  it('buckets orders by hour', () => {
    const noon = m.byHour.find((h) => h.hour === 12);
    const evening = m.byHour.find((h) => h.hour === 19);
    expect(noon?.count).toBe(2);
    expect(evening?.count).toBe(1);
  });
});

describe('bundle discounts in metrics', () => {
  const deal = (amount: number) => [{ uid: 'd1', bundleId: 'b', label: 'מבצע', amount }];

  it('reports revenue net of the discount while tracking gross + saving', () => {
    const list = [
      order({ payment: 'paid', lines: [pizza('p_vino', 'וינו וינו', 9500, 2)], discounts: deal(3000) }),
    ];
    const m = computeMetrics(list);
    expect(m.grossRevenue).toBe(19000);
    expect(m.discountTotal).toBe(3000);
    expect(m.revenue).toBe(16000); // net
    expect(m.paidRevenue).toBe(16000); // paid bucket uses net
  });

  it('caps the discount at the order value so net never goes negative', () => {
    const list = [order({ lines: [drink()], discounts: deal(5000) })]; // ₪10 order, ₪50 "saving"
    const m = computeMetrics(list);
    expect(m.discountTotal).toBe(1000);
    expect(m.revenue).toBe(0);
  });

  it('leaves revenue equal to gross when there are no discounts', () => {
    const list = [order({ lines: [pizza('p_vino', 'וינו וינו', 9500)] })];
    const m = computeMetrics(list);
    expect(m.revenue).toBe(m.grossRevenue);
    expect(m.discountTotal).toBe(0);
  });
});
