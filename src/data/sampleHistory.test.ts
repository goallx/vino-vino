import { describe, it, expect } from 'vitest';
import { lookupCustomer } from './sampleHistory';

describe('lookupCustomer()', () => {
  it('finds a known customer by phone', () => {
    const rec = lookupCustomer('0501234567');
    expect(rec?.customer.name).toBe('דנה כהן');
    expect(rec?.past).toHaveLength(2);
  });

  it('normalizes formatting before matching', () => {
    expect(lookupCustomer('050-123-4567')?.customer.name).toBe('דנה כהן');
  });

  it('returns null for an unknown number', () => {
    expect(lookupCustomer('0000000000')).toBeNull();
  });
});
