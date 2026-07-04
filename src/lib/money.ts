import type { Money } from '../types';

/** Format agorot as a shekel string, e.g. 6900 -> "₪69", 6550 -> "₪65.50". */
export function shekels(agorot: Money): string {
  const whole = agorot / 100;
  const text = Number.isInteger(whole) ? String(whole) : whole.toFixed(2);
  return `₪${text}`;
}
