import { describe, it, expect } from 'vitest';
import { shekels } from './money';

describe('shekels()', () => {
  it('renders whole shekel amounts with no decimals', () => {
    expect(shekels(6900)).toBe('₪69');
    expect(shekels(800)).toBe('₪8');
    expect(shekels(0)).toBe('₪0');
  });

  it('renders agorot with two decimals', () => {
    expect(shekels(6550)).toBe('₪65.50');
    expect(shekels(1099)).toBe('₪10.99');
  });
});
