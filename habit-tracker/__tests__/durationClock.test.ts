import { clockFromMinutes, clockMinutes } from '../src/utils/durationClock';

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
});
