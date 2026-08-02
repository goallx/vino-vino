import { describe, it, expect, beforeEach } from 'vitest';
import { publishOrder, loadOrders, setStatus, startPrep, setTimer, clearOrders, subscribe } from './orderBus';
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

  it('startPrep moves to preparing and stamps a countdown', () => {
    publishOrder(mk({ id: 'o1' }));
    startPrep('o1', 600);
    const o = loadOrders()[0];
    expect(o.status).toBe('preparing');
    expect(o.timerSeconds).toBe(600);
    expect(o.prepStartedAt).toBeGreaterThan(0);
  });

  it('startPrep with no seconds starts prep without a timer', () => {
    publishOrder(mk({ id: 'o1' }));
    startPrep('o1');
    const o = loadOrders()[0];
    expect(o.status).toBe('preparing');
    expect(o.timerSeconds).toBeUndefined();
    expect(o.prepStartedAt).toBeGreaterThan(0);
  });

  it('setTimer restarts, then clears, the countdown', () => {
    publishOrder(mk({ id: 'o1', status: 'preparing', prepStartedAt: 1, timerSeconds: 300 }));
    setTimer('o1', 900);
    expect(loadOrders()[0].timerSeconds).toBe(900);
    expect(loadOrders()[0].prepStartedAt).toBeGreaterThan(1); // restarted from now
    setTimer('o1', null);
    expect(loadOrders()[0].timerSeconds).toBeUndefined();
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
