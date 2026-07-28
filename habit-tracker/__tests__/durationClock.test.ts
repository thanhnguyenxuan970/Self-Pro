import { clampClockValue, clockFromMinutes, clockMinutes, wheelValueAtOffset } from '../src/utils/durationClock';

describe('clockMinutes', () => {
  it('uses hours and minutes', () => {
    expect(clockMinutes({ hours: 1, minutes: 1 })).toBe(61);
  });

  it('allows the maximum duration of 24:00:00', () => {
    expect(clockMinutes({ hours: 24, minutes: 0 })).toBe(1440);
  });

  it('turns an edited total into the matching wheel values', () => {
    expect(clockFromMinutes(75)).toEqual({ hours: 1, minutes: 15 });
  });

  it('clamps double-tap manual input to its wheel range', () => {
    expect(clampClockValue('25', 24)).toBe(24);
    expect(clampClockValue('-1', 59)).toBe(0);
    expect(clampClockValue('abc', 59)).toBe(0);
  });

  it('snaps a wheel release to its nearest valid row', () => {
    expect(wheelValueAtOffset(79, 40, 24)).toBe(2);
    expect(wheelValueAtOffset(9999, 40, 24)).toBe(24);
  });
});
