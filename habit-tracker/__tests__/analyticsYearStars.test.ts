import {
  getAnalyticsYearWindow,
  normalizeAnalyticsYearStars,
  readAnalyticsYearStars,
  sumAnalyticsStars,
  type AnalyticsStarsDb,
} from '../src/analytics/yearStars';

describe('Analytics Year star anchor', () => {
  it('sums only positive TASK stars', () => {
    expect(sumAnalyticsStars([
      { local_date: '2026-01-01', stars_delta: 4, source: 'TASK' },
      { local_date: '2026-01-02', stars_delta: -2, source: 'TASK' },
      { local_date: '2026-01-03', stars_delta: 9, source: 'CHALLENGE' },
      { local_date: '2026-01-04', stars_delta: 7, source: 'DAILY_BONUS' },
      { local_date: '2026-01-05', stars_delta: 99 },
    ])).toBe(4);
  });

  it('normalizes annual star totals consistently across display consumers', () => {
    expect(normalizeAnalyticsYearStars(12.9)).toBe(12);
    expect(normalizeAnalyticsYearStars('7.9')).toBe(7);
    expect(normalizeAnalyticsYearStars(-3)).toBe(0);
    expect(normalizeAnalyticsYearStars(Number.NaN)).toBe(0);
  });

  it('uses the current calendar year and respects an account activity boundary', () => {
    expect(getAnalyticsYearWindow(new Date(2026, 6, 28), null)).toEqual({
      start: '2026-01-01',
      end: '2026-07-28',
    });
    expect(getAnalyticsYearWindow(new Date(2026, 6, 28), '2026-07-06')).toEqual({
      start: '2026-07-06',
      end: '2026-07-28',
    });
  });

  it('reads the same TASK-only Year total used by the Analytics KPI', async () => {
    const db: AnalyticsStarsDb = {
      getFirstAsync: jest.fn().mockResolvedValue({ total: 12.9 }),
    };

    await expect(readAnalyticsYearStars(db, 7, new Date(2026, 6, 28), null)).resolves.toBe(12);
    expect(db.getFirstAsync).toHaveBeenCalledWith(
      expect.stringContaining('source = ?'),
      [7, 'TASK', '2026-01-01', '2026-07-28'],
    );
  });
});
