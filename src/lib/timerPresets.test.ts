import { describe, it, expect, beforeEach } from 'vitest';
import { allTimerPresets, addTimerPreset, removeTimerPreset, loadTimerPresets, DEFAULT_PRESETS } from './timerPresets';

beforeEach(() => localStorage.clear());

describe('timerPresets', () => {
  it('shows the baseline defaults when nothing is saved', () => {
    expect(allTimerPresets()).toEqual(DEFAULT_PRESETS);
  });

  it('merges saved times with the defaults, sorted and de-duped', () => {
    addTimerPreset(8);
    addTimerPreset(20);
    expect(allTimerPresets()).toEqual([5, 8, 10, 15, 20]);
    expect(loadTimerPresets()).toEqual([8, 20]); // only the owner's extras are stored
  });

  it('ignores a duplicate of a default or a saved value', () => {
    addTimerPreset(10); // already a default
    addTimerPreset(8);
    addTimerPreset(8); // dup
    expect(loadTimerPresets()).toEqual([8]);
  });

  it('rejects non-positive / non-finite values', () => {
    addTimerPreset(0);
    addTimerPreset(-5);
    addTimerPreset(NaN);
    expect(loadTimerPresets()).toEqual([]);
  });

  it('removes a saved time but never a default', () => {
    addTimerPreset(8);
    removeTimerPreset(8);
    expect(loadTimerPresets()).toEqual([]);
    removeTimerPreset(10); // a default → no-op
    expect(allTimerPresets()).toEqual(DEFAULT_PRESETS);
  });
});
