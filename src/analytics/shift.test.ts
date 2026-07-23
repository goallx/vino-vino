import { describe, it, expect } from 'vitest';
import { seedCatalog } from '../test/fixtures/seed';

// The catalog must be live before metric fixtures reference products.
seedCatalog();
import { shiftSummary, COURIER_FEE_SHARE } from './shift';
import { startOfDay } from './metrics';
import type { CartLine, KitchenOrder } from '../types';

function pizza(price: number, qty = 1): CartLine {
  const id = 'p_vino';
  return { id: Math.random().toString(36), productId: id, name: 'וינו וינו', qty, unitPrice: price, isSplit: false, parts: [{ target: 'whole', baseProductId: id, baseName: 'וינו וינו', toppings: [] }] };
}
function order(over: Partial<KitchenOrder>): KitchenOrder {
  return { id: Math.random().toString(36), number: 1, type: 'delivery', payment: 'paid', createdAt: Date.now(), status: 'ready', lines: [], ...over };
}

const at = (h: number) => { const d = new Date(); d.setHours(h, 0, 0, 0); return d.getTime(); };
const DAY = 24 * 60 * 60 * 1000;

describe('shiftSummary()', () => {
  const orders: KitchenOrder[] = [
    // delivery, ₪95 pizza + ₪15 delivery fee, paid
    order({ type: 'delivery', payment: 'paid', createdAt: at(12), deliveryFee: 1500, lines: [pizza(9500)] }),
    // delivery, ₪95 pizza + ₪20 delivery fee, unpaid
    order({ type: 'delivery', payment: 'unpaid', createdAt: at(19), deliveryFee: 2000, lines: [pizza(9500)] }),
    // pickup, ₪95 pizza, no delivery fee, paid
    order({ type: 'pickup', payment: 'paid', createdAt: at(13), lines: [pizza(9500)] }),
    // yesterday — excluded
    order({ type: 'delivery', createdAt: at(12) - DAY, deliveryFee: 1500, lines: [pizza(9500)] }),
    // cancelled today — excluded from income AND courier
    order({ type: 'delivery', status: 'cancelled', createdAt: at(14), deliveryFee: 1500, lines: [pizza(9500)] }),
  ];
  const s = shiftSummary(orders);

  it('counts only today\'s non-cancelled orders', () => {
    expect(s.orderCount).toBe(3);
  });

  it('sums income including delivery fees, excluding cancelled/other days', () => {
    // 9500+1500 + 9500+2000 + 9500 = 32000
    expect(s.income).toBe(9500 + 1500 + 9500 + 2000 + 9500);
  });

  it('owes the courier every collected delivery fee (100% share)', () => {
    expect(COURIER_FEE_SHARE).toBe(1);
    expect(s.deliveryFeeTotal).toBe(1500 + 2000); // pickup + cancelled contribute nothing
    expect(s.courierOwed).toBe(3500);
  });

  it('leaves the shop income minus the courier payout', () => {
    expect(s.netAfterCourier).toBe(s.income - s.courierOwed);
    expect(s.netAfterCourier).toBe(32000 - 3500);
  });

  it('splits delivery vs pickup and paid vs unpaid', () => {
    expect(s.deliveryCount).toBe(2);
    expect(s.pickupCount).toBe(1);
    expect(s.paidRevenue).toBe(9500 + 1500 + 9500); // two paid orders
    expect(s.unpaidRevenue).toBe(9500 + 2000);
    expect(s.paidCount).toBe(2);
    expect(s.unpaidCount).toBe(1);
  });

  it('reports the start-of-day it covers', () => {
    expect(s.date).toBe(startOfDay(Date.now()));
  });

  it('is empty and safe when there are no orders', () => {
    const empty = shiftSummary([]);
    expect(empty.income).toBe(0);
    expect(empty.courierOwed).toBe(0);
    expect(empty.netAfterCourier).toBe(0);
    expect(empty.orderCount).toBe(0);
  });
});
