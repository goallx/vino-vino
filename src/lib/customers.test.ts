import { describe, it, expect, beforeEach } from 'vitest';
import { getByPhone, searchByPhonePrefix, searchByAddress, recordOrder } from './customers';
import type { CartLine } from '../types';

const line: CartLine = { id: 'l', productId: 'p_vino', name: 'וינו וינו', qty: 1, unitPrice: 9500, isSplit: false, parts: [] };

beforeEach(() => localStorage.clear());

describe('customer store', () => {
  it('seeds known customers and finds them by exact phone', () => {
    expect(getByPhone('0501234567')?.name).toBe('דנה כהן');
    expect(getByPhone('050-123-4567')?.name).toBe('דנה כהן'); // normalizes
  });

  it('autocompletes by phone prefix (≥3 digits)', () => {
    const hits = searchByPhonePrefix('050');
    expect(hits.some((c) => c.name === 'דנה כהן')).toBe(true);
    expect(searchByPhonePrefix('05')).toHaveLength(0); // too short
  });

  it('records a new customer from an order and increments on repeat', () => {
    recordOrder({ phone: '0539998877', name: 'אבי', address: 'יפו 1', lines: [line], total: 9500 });
    const c = getByPhone('0539998877');
    expect(c?.name).toBe('אבי');
    expect(c?.orderCount).toBe(1);
    expect(c?.past[0].lines).toHaveLength(1);

    recordOrder({ phone: '0539998877', lines: [line, line], total: 19000 });
    const c2 = getByPhone('0539998877');
    expect(c2?.orderCount).toBe(2);
    expect(c2?.past).toHaveLength(2);
    expect(c2?.name).toBe('אבי'); // retained from first order
  });

  it('surfaces a freshly recorded customer in autocomplete', () => {
    recordOrder({ phone: '0541112233', name: 'נועה', lines: [line], total: 9500 });
    expect(searchByPhonePrefix('054').some((c) => c.name === 'נועה')).toBe(true);
  });

  it('autocompletes addresses by substring (≥2 chars) and dedupes shared addresses', () => {
    recordOrder({ phone: '0540000001', name: 'אבי', address: 'הרצל 10, חיפה', lines: [line], total: 9500 });
    recordOrder({ phone: '0540000002', name: 'נועה', address: 'הרצל 10, חיפה', lines: [line], total: 9500 });
    recordOrder({ phone: '0540000003', name: 'דן', address: 'יפו 5, חיפה', lines: [line], total: 9500 });

    const hits = searchByAddress('הרצל');
    const herzl = hits.find((h) => h.address === 'הרצל 10, חיפה');
    expect(herzl).toBeDefined();
    expect(herzl?.count).toBe(2); // two customers share it, returned once
    expect(searchByAddress('ה')).toHaveLength(0); // too short

    // substring match anywhere in the address, not just the prefix
    expect(searchByAddress('חיפה').length).toBeGreaterThanOrEqual(2);
  });
});
