import { describe, it, expect, beforeEach } from 'vitest';
import { publishOrder, loadOrders, setStatus, clearOrders, subscribe } from './orderBus';
import type { KitchenOrder } from '../types';

function mk(over: Partial<KitchenOrder> = {}): KitchenOrder {
  return { id: 'o1', number: 1, type: 'delivery', payment: 'unpaid', createdAt: Date.now(), status: 'new', lines: [], ...over };
}

beforeEach(() => localStorage.clear());

describe('orderBus', () => {
  it('publishes an order and reads it back', () => {
    publishOrder(mk());
    expect(loadOrders()).toHaveLength(1);
  });

  it('replaces an order with the same id instead of duplicating', () => {
    publishOrder(mk({ id: 'o1' }));
    publishOrder(mk({ id: 'o1', number: 9 }));
    const list = loadOrders();
    expect(list).toHaveLength(1);
    expect(list[0].number).toBe(9);
  });

  it('updates status in place', () => {
    publishOrder(mk({ id: 'o1' }));
    setStatus('o1', 'preparing');
    expect(loadOrders()[0].status).toBe('preparing');
  });

  it('clears all orders', () => {
    publishOrder(mk());
    clearOrders();
    expect(loadOrders()).toHaveLength(0);
  });

  it('notifies subscribers on change', () => {
    let received: KitchenOrder[] = [];
    const unsub = subscribe((o) => (received = o));
    publishOrder(mk());
    expect(received).toHaveLength(1);
    setStatus('o1', 'ready');
    expect(received[0].status).toBe('ready');
    unsub();
  });
});
