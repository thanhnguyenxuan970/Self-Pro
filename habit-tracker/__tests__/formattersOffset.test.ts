/**
 * Tests for formatter offset utilities added in feature/paywall-screen:
 *   getWeekStartOffset, getLocalDateOffset, getMonthOffset, getYearOffset, getLocalDateFor
 */
import {
  getWeekStartOffset,
  getLocalDateOffset,
  getMonthOffset,
  getYearOffset,
  getLocalDateFor,
  getMillisecondsUntilLocalMidnight,
} from '../src/utils/formatters';

// ── getLocalDateFor ─────────────────────────────────────────────────────────

describe('getLocalDateFor', () => {
  test('formats a known date as YYYY-MM-DD', () => {
    expect(getLocalDateFor(new Date('2026-06-25T12:00:00'))).toBe('2026-06-25');
  });

  test('formats first of year', () => {
    expect(getLocalDateFor(new Date('2026-01-01T00:00:00'))).toBe('2026-01-01');
  });

  test('formats last of year', () => {
    expect(getLocalDateFor(new Date('2026-12-31T23:59:59'))).toBe('2026-12-31');
  });

  test('pads single-digit month and day with zero', () => {
    const result = getLocalDateFor(new Date('2026-03-05T12:00:00'));
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result).toBe('2026-03-05');
  });
});

describe('getMillisecondsUntilLocalMidnight', () => {
  test('schedules the refresh just after the next local midnight', () => {
    const justBeforeMidnight = new Date(2026, 7, 30, 23, 59, 59, 0);
    expect(getMillisecondsUntilLocalMidnight(justBeforeMidnight)).toBe(2_000);
  });
});

// ── getWeekStartOffset ───────────────────────────────────────────────────────

describe('getWeekStartOffset', () => {
  test('offset=0 returns the same Monday as current week', () => {
    // The result must be a valid YYYY-MM-DD
    const result = getWeekStartOffset(0);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Must be a Monday: parse and check getDay()
    const d = new Date(result + 'T12:00:00');
    expect(d.getDay()).toBe(1); // 1 = Monday
  });

  test('offset=1 returns Monday of next week', () => {
    const curr = getWeekStartOffset(0);
    const next = getWeekStartOffset(1);
    const diffMs = new Date(next + 'T12:00:00').getTime() - new Date(curr + 'T12:00:00').getTime();
    expect(diffMs).toBe(7 * 24 * 60 * 60 * 1000);
  });

  test('offset=-1 returns Monday of previous week', () => {
    const curr = getWeekStartOffset(0);
    const prev = getWeekStartOffset(-1);
    const diffMs = new Date(curr + 'T12:00:00').getTime() - new Date(prev + 'T12:00:00').getTime();
    expect(diffMs).toBe(7 * 24 * 60 * 60 * 1000);
  });

  test('offset=-4 returns Monday 4 weeks ago', () => {
    const curr = getWeekStartOffset(0);
    const past = getWeekStartOffset(-4);
    const diffDays =
      (new Date(curr + 'T12:00:00').getTime() - new Date(past + 'T12:00:00').getTime()) /
      (24 * 60 * 60 * 1000);
    expect(diffDays).toBe(28);
  });
});

// ── getLocalDateOffset ───────────────────────────────────────────────────────

describe('getLocalDateOffset', () => {
  test('offset=0 returns today as YYYY-MM-DD', () => {
    const result = getLocalDateOffset(0);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('offset=1 returns tomorrow (1 day ahead of today)', () => {
    const today = getLocalDateOffset(0);
    const tomorrow = getLocalDateOffset(1);
    const diffMs =
      new Date(tomorrow + 'T12:00:00').getTime() - new Date(today + 'T12:00:00').getTime();
    expect(diffMs).toBe(24 * 60 * 60 * 1000);
  });

  test('offset=-1 returns yesterday (1 day behind today)', () => {
    const today = getLocalDateOffset(0);
    const yesterday = getLocalDateOffset(-1);
    const diffMs =
      new Date(today + 'T12:00:00').getTime() - new Date(yesterday + 'T12:00:00').getTime();
    expect(diffMs).toBe(24 * 60 * 60 * 1000);
  });

  test('offset=-7 returns 7 days ago', () => {
    const today = getLocalDateOffset(0);
    const weekAgo = getLocalDateOffset(-7);
    const diffDays =
      (new Date(today + 'T12:00:00').getTime() - new Date(weekAgo + 'T12:00:00').getTime()) /
      (24 * 60 * 60 * 1000);
    expect(diffDays).toBe(7);
  });
});

// ── getMonthOffset ───────────────────────────────────────────────────────────

describe('getMonthOffset', () => {
  test('returns YYYY-MM format', () => {
    expect(getMonthOffset(0)).toMatch(/^\d{4}-\d{2}$/);
  });

  test('offset=0 returns current month', () => {
    const now = new Date();
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    expect(getMonthOffset(0)).toBe(expected);
  });

  test('offset=1 advances by one month', () => {
    const curr = getMonthOffset(0);
    const next = getMonthOffset(1);
    const [cy, cm] = curr.split('-').map(Number);
    const [ny, nm] = next.split('-').map(Number);
    // next month = same year next month, or Jan of next year
    if (cm === 12) {
      expect(ny).toBe(cy + 1);
      expect(nm).toBe(1);
    } else {
      expect(ny).toBe(cy);
      expect(nm).toBe(cm + 1);
    }
  });

  test('offset=-1 goes back one month', () => {
    const curr = getMonthOffset(0);
    const prev = getMonthOffset(-1);
    const [cy, cm] = curr.split('-').map(Number);
    const [py, pm] = prev.split('-').map(Number);
    if (cm === 1) {
      expect(py).toBe(cy - 1);
      expect(pm).toBe(12);
    } else {
      expect(py).toBe(cy);
      expect(pm).toBe(cm - 1);
    }
  });

  test('large negative offset does not overflow (Jan 31 → Dec wrap safety)', () => {
    // Just verifying output is valid YYYY-MM regardless of current day
    const result = getMonthOffset(-13);
    expect(result).toMatch(/^\d{4}-\d{2}$/);
    const [, m] = result.split('-').map(Number);
    expect(m).toBeGreaterThanOrEqual(1);
    expect(m).toBeLessThanOrEqual(12);
  });
});

// ── getYearOffset ────────────────────────────────────────────────────────────

describe('getYearOffset', () => {
  test('offset=0 returns current year as 4-digit string', () => {
    expect(getYearOffset(0)).toBe(String(new Date().getFullYear()));
  });

  test('offset=1 returns next year', () => {
    expect(getYearOffset(1)).toBe(String(new Date().getFullYear() + 1));
  });

  test('offset=-1 returns last year', () => {
    expect(getYearOffset(-1)).toBe(String(new Date().getFullYear() - 1));
  });

  test('returns a string (not number)', () => {
    expect(typeof getYearOffset(0)).toBe('string');
  });
});
