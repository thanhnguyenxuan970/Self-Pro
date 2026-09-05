import { clampThreshold, deriveLinkedDoneDates, type ActivityLogRow } from '../src/lib/challengeLinked';

describe('clampThreshold', () => {
  it('passes through a positive integer', () => {
    expect(clampThreshold(10)).toBe(10);
  });
  it('floors a fractional value', () => {
    expect(clampThreshold(10.7)).toBe(10);
  });
  it('rejects zero, negative, null, undefined, and non-finite values as "no threshold"', () => {
    expect(clampThreshold(0)).toBeNull();
    expect(clampThreshold(-5)).toBeNull();
    expect(clampThreshold(null)).toBeNull();
    expect(clampThreshold(undefined)).toBeNull();
    expect(clampThreshold(NaN)).toBeNull();
    expect(clampThreshold(Infinity)).toBeNull();
  });
});

describe('deriveLinkedDoneDates', () => {
  const row = (localDate: string, durationMin: number | null): ActivityLogRow => ({ localDate, durationMin });

  it('no threshold: any log on a date marks it done', () => {
    const rows = [row('2026-07-01', 1), row('2026-07-02', null)];
    expect(deriveLinkedDoneDates(rows, { minDuration: null, minCount: null }, '2026-07-01')).toEqual(['2026-07-01', '2026-07-02']);
  });

  it('min_duration: a log short of the threshold does not count', () => {
    const rows = [row('2026-07-01', 5), row('2026-07-02', 15)];
    expect(deriveLinkedDoneDates(rows, { minDuration: 10, minCount: null }, '2026-07-01')).toEqual(['2026-07-02']);
  });

  it('min_duration: a negative threshold is clamped to "no threshold", not "always pass negative check"', () => {
    const rows = [row('2026-07-01', 0)];
    // Without clamping, duration(0) >= -5 would be true and silently defeat the threshold.
    expect(deriveLinkedDoneDates(rows, { minDuration: -5, minCount: null }, '2026-07-01')).toEqual(['2026-07-01']);
  });

  it('min_count: fewer logs than required on a date does not count', () => {
    const rows = [row('2026-07-01', 1), row('2026-07-02', 1), row('2026-07-02', 1)];
    expect(deriveLinkedDoneDates(rows, { minDuration: null, minCount: 2 }, '2026-07-01')).toEqual(['2026-07-02']);
  });

  it('both thresholds: at least one log must independently meet min_duration, count must independently meet min_count', () => {
    const rows = [row('2026-07-01', 3), row('2026-07-01', 20)]; // 2 logs, one meets duration
    expect(deriveLinkedDoneDates(rows, { minDuration: 10, minCount: 2 }, '2026-07-01')).toEqual(['2026-07-01']);
  });

  it('excludes logs before start_date', () => {
    const rows = [row('2026-06-30', 100), row('2026-07-01', 100)];
    expect(deriveLinkedDoneDates(rows, { minDuration: null, minCount: null }, '2026-07-01')).toEqual(['2026-07-01']);
  });

  it('dedupes by local_date -- multiple logs on the same day yield one done-date', () => {
    const rows = [row('2026-07-01', 5), row('2026-07-01', 5), row('2026-07-01', 5)];
    expect(deriveLinkedDoneDates(rows, { minDuration: null, minCount: null }, '2026-07-01')).toEqual(['2026-07-01']);
  });

  it('empty input yields no done dates', () => {
    expect(deriveLinkedDoneDates([], { minDuration: null, minCount: null }, '2026-07-01')).toEqual([]);
  });

  it('warns in development when rows exist but none qualify', () => {
    (globalThis as { __DEV__?: boolean }).__DEV__ = true;
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(deriveLinkedDoneDates([row('2026-07-01', 1)], { minDuration: 10, minCount: null }, '2026-07-01')).toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('sorts output dates ascending regardless of input order', () => {
    const rows = [row('2026-07-03', 1), row('2026-07-01', 1), row('2026-07-02', 1)];
    expect(deriveLinkedDoneDates(rows, { minDuration: null, minCount: null }, '2026-07-01')).toEqual(['2026-07-01', '2026-07-02', '2026-07-03']);
  });
});
