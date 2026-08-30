import { analyticsBarAccessibilityLabel, buildAnalyticsDashboard, getAnalyticsChartLayout, getMonthChartAnchor } from '../src/analytics/dashboardModel';

describe('buildAnalyticsDashboard', () => {
  it('gives each month and year point a fixed-width scroll track', () => {
    expect(getAnalyticsChartLayout('W', 7)).toEqual({ isScrollable: false, columnWidth: 0, contentWidth: 0 });
    expect(getAnalyticsChartLayout('M', 30)).toEqual({ isScrollable: true, columnWidth: 36, contentWidth: 1080 });
    expect(getAnalyticsChartLayout('Y', 12)).toEqual({ isScrollable: true, columnWidth: 56, contentWidth: 672 });
  });

  it('centers today when the month chart opens, mid-month', () => {
    // Day 18 (index 17) of a 31-bar month, 36px columns, 800px viewport:
    // trailingInset = min(400, 36) = 36; maxOffset = 1116 + 36 - 800 = 352.
    // centeredOffset = 17.5 * 36 - 400 = 230, under maxOffset so it centers exactly.
    expect(getMonthChartAnchor(31, 17, 800)).toEqual({ trailingInset: 36, scrollOffset: 230 });
  });

  it('stops at a small trailing margin near month-end, without a half-viewport of blank scroll', () => {
    // Day 30 (index 29) of a 31-bar month: centeredOffset = 29.5 * 36 - 400 = 662,
    // clamped to maxOffset = 352 -- the chart no longer reserves a huge blank
    // runway past the last real day just to dead-center a near-end "today".
    expect(getMonthChartAnchor(31, 29, 800)).toEqual({ trailingInset: 36, scrollOffset: 352 });
  });

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
        { local_date: '2026-07-28', logged_at: new Date(2026, 6, 28, 9).getTime(), points_earned: 10, stars_delta: 1, source: 'TASK', task_name: 'Read' },
        { local_date: '2026-07-27', logged_at: new Date(2026, 6, 27, 9).getTime(), points_earned: 5, stars_delta: 1, source: 'TASK', task_name: 'Walk' },
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

  it('shows every day of the current calendar month, including days after today', () => {
    const result = buildAnalyticsDashboard([], [], 'M', new Date(2026, 6, 28));

    // July has 31 days; the chart runs day 1 through 31 regardless of today.
    expect(result.bars).toHaveLength(31);
    expect(result.bars.map(bar => bar.label)).toEqual(Array.from({ length: 31 }, (_, i) => String(i + 1)));
    // Days after today (29-31) have no data yet, so they render at 0 rather than being omitted.
    expect(result.bars.slice(28).every(bar => bar.current === 0)).toBe(true);
  });

  it('pairs each calendar-month day with the same day in the previous month', () => {
    const result = buildAnalyticsDashboard(
      [{ local_date: '2026-06-01', total_points: 99 }, { local_date: '2026-07-31', total_points: 40 }],
      [],
      'M',
      new Date(2026, 6, 31),
    );

    expect(result.previousPoints).toBe(99);
    expect(result.points).toBe(40);
    expect(result.bars).toHaveLength(31);
  });

  it('leaves no previous-period match for a day past the shorter prior month', () => {
    // February 2026 has 28 days; day 30 of March has no comparable February date.
    const result = buildAnalyticsDashboard(
      [{ local_date: '2026-02-28', total_points: 77 }],
      [],
      'M',
      new Date(2026, 2, 30),
    );

    expect(result.bars[27].previous).toBe(77); // day 28 -> Feb 28
    expect(result.bars[29].previous).toBe(0); // day 30 -> no such day in February
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

    expect(result.points).toBe(31_000_000_000);
    expect(result.daysAtGoal).toBe(31);
    expect(result.bars).toHaveLength(31);
  });

  it('pairs current and previous week data and aggregates dashboard totals', () => {
    const today = new Date(2026, 6, 28);
    const result = buildAnalyticsDashboard(
      [{ local_date: '2026-07-28', total_points: 60 }, { local_date: '2026-07-21', total_points: 40 }],
      [{ local_date: '2026-07-28', logged_at: new Date(2026, 6, 28, 20).getTime(), points_earned: 60, stars_delta: 3, source: 'TASK', task_name: 'Gym' }],
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
        { local_date: '2026-07-28', logged_at: new Date(2026, 6, 28, 9).getTime(), points_earned: 10, stars_delta: 1, source: 'TASK', task_name: 'Read' },
        { local_date: '2026-07-28', logged_at: new Date(2026, 6, 28, 10).getTime(), points_earned: 20, stars_delta: 1, source: 'TASK', task_name: 'Gym' },
        { local_date: '2026-07-27', logged_at: new Date(2026, 6, 27, 9).getTime(), points_earned: 5, stars_delta: 1, source: 'TASK', task_name: 'Read' },
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
