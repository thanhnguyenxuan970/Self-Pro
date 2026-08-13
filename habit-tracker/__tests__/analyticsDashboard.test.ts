import { analyticsBarAccessibilityLabel, buildAnalyticsDashboard } from '../src/analytics/dashboardModel';

describe('buildAnalyticsDashboard', () => {
  it('uses the fixed 50-point daily goal', () => {
    const result = buildAnalyticsDashboard(
      [{ local_date: '2026-07-27', total_points: 92 }, { local_date: '2026-07-28', total_points: 60 }],
      [],
      'W',
      new Date(2026, 6, 28),
    );

    expect(result.goal).toBe(50);
    expect(result.daysAtGoal).toBe(2);
    expect(result.bars.map(bar => bar.label)).toEqual(['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']);
  });

  it('keeps the daily goal when there is no activity', () => {
    const result = buildAnalyticsDashboard([], [], 'W', new Date(2026, 6, 28));

    expect(result.goal).toBe(50);
    expect(result.daysAtGoal).toBe(0);
  });

  it('counts activity days for volume and consistency even below the point goal', () => {
    const result = buildAnalyticsDashboard(
      [{ local_date: '2026-07-28', total_points: 10 }],
      [
        { local_date: '2026-07-28', logged_at: new Date(2026, 6, 28, 9).getTime(), points_earned: 10, stars_delta: 1, task_name: 'Read' },
        { local_date: '2026-07-27', logged_at: new Date(2026, 6, 27, 9).getTime(), points_earned: 5, stars_delta: 1, task_name: 'Walk' },
      ],
      'W',
      new Date(2026, 6, 28),
      ['2026-07-27', '2026-07-28'],
    );

    expect(result.daysAtGoal).toBe(2);
    expect(result.consistency.week).toBe(29);
  });

  it('uses January through the current month for the year range', () => {
    const result = buildAnalyticsDashboard([{ local_date: '2026-07-28', total_points: 92 }], [], 'Y', new Date(2026, 6, 28));

    expect(result.bars).toHaveLength(12);
    expect(result.possibleDays).toBe(209);
    expect(result.daysAtGoal).toBe(1);
    expect(result.bars.map(bar => bar.label)).toEqual(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']);
    expect(result.bars[6].current).toBe(92);
  });

  it('keeps a rolling 30-day month window and weekly labels', () => {
    const result = buildAnalyticsDashboard([], [], 'M', new Date(2026, 6, 28));

    expect(result.bars).toHaveLength(30);
    expect(result.bars.map(bar => bar.label).filter(Boolean)).toEqual(['29', '6', '13', '20', '27']);
  });

  it('pairs each rolling-month day with the preceding 30-day period', () => {
    const result = buildAnalyticsDashboard(
      [{ local_date: '2026-07-01', total_points: 99 }, { local_date: '2026-07-31', total_points: 40 }],
      [],
      'M',
      new Date(2026, 6, 31),
    );

    expect(result.previousPoints).toBe(99);
    expect(result.bars).toHaveLength(30);
  });

  it('compares goal-day KPI with the previous period', () => {
    const result = buildAnalyticsDashboard(
      [{ local_date: '2026-07-28', total_points: 50 }, { local_date: '2026-07-21', total_points: 50 }],
      [],
      'W',
      new Date(2026, 6, 28),
    );

    expect(result.daysAtGoal).toBe(1);
    expect(result.previousDaysAtGoal).toBe(1);
  });

  it('keeps large month totals and dense daily data intact', () => {
    const daily = Array.from({ length: 31 }, (_, index) => ({
      local_date: `2026-07-${String(index + 1).padStart(2, '0')}`,
      total_points: 1_000_000_000,
    }));
    const result = buildAnalyticsDashboard(daily, [], 'M', new Date(2026, 6, 31));

    expect(result.points).toBe(30_000_000_000);
    expect(result.daysAtGoal).toBe(30);
    expect(result.bars).toHaveLength(30);
  });

  it('pairs current and previous week data and aggregates dashboard totals', () => {
    const today = new Date(2026, 6, 28);
    const result = buildAnalyticsDashboard(
      [{ local_date: '2026-07-28', total_points: 60 }, { local_date: '2026-07-21', total_points: 40 }],
      [{ local_date: '2026-07-28', logged_at: new Date(2026, 6, 28, 20).getTime(), points_earned: 60, stars_delta: 3, task_name: 'Gym' }],
      'W', today,
    );
    expect(result.bars).toHaveLength(7);
    expect(result.points).toBe(60);
    expect(result.previousPoints).toBe(40);
    expect(result.stars).toBe(3);
    expect(result.composition).toEqual([{ name: 'Gym', count: 1, previous: 0 }]);
    expect(result.hours.find(hour => hour.label === '20')?.value).toBe(60);
  });

  it('sums points per weekday and per hour bucket across multiple logs on the same day', () => {
    const today = new Date(2026, 6, 28); // Tuesday
    const result = buildAnalyticsDashboard(
      [],
      [
        { local_date: '2026-07-28', logged_at: new Date(2026, 6, 28, 9).getTime(), points_earned: 10, stars_delta: 1, task_name: 'Read' },
        { local_date: '2026-07-28', logged_at: new Date(2026, 6, 28, 10).getTime(), points_earned: 20, stars_delta: 1, task_name: 'Gym' },
        { local_date: '2026-07-27', logged_at: new Date(2026, 6, 27, 9).getTime(), points_earned: 5, stars_delta: 1, task_name: 'Read' },
      ],
      'W', today,
    );
    expect(result.weekday.find(w => w.dayOfWeek === 2)?.value).toBe(30); // Tuesday = both 07-28 logs
    expect(result.weekday.find(w => w.dayOfWeek === 1)?.value).toBe(5); // Monday = the 07-27 log
    expect(result.weekday.map(day => day.dayOfWeek)).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(result.hours.find(hour => hour.label === '8')?.value).toBe(35); // 8-12 bucket = all three logs (9am, 10am, and the 07-27 9am log)
  });
});

describe('analyticsBarAccessibilityLabel', () => {
  it('announces live current, previous, and goal values in English', () => {
    expect(analyticsBarAccessibilityLabel('en', 'Monday', 60, 40, 50, true)).toBe(
      'Monday: 60 points, previous 40 points, goal 50 points',
    );
  });

  it('announces the localized current value without a hidden previous series', () => {
    expect(analyticsBarAccessibilityLabel('vi', 'T2', 42, 18, 50, false)).toBe(
      'T2: 42 điểm, mục tiêu 50 điểm',
    );
  });
});
