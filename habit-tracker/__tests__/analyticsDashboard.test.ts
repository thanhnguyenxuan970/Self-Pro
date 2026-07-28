import { buildAnalyticsDashboard } from '../src/analytics/dashboardModel';

describe('buildAnalyticsDashboard', () => {
  it('uses the fixed 25-point daily goal', () => {
    const result = buildAnalyticsDashboard(
      [{ local_date: '2026-07-27', total_points: 92 }, { local_date: '2026-07-28', total_points: 60 }],
      [],
      'W',
      new Date(2026, 6, 28),
    );

    expect(result.goal).toBe(25);
    expect(result.daysAtGoal).toBe(2);
  });

  it('keeps the daily goal when there is no activity', () => {
    const result = buildAnalyticsDashboard([], [], 'W', new Date(2026, 6, 28));

    expect(result.goal).toBe(25);
    expect(result.daysAtGoal).toBe(0);
  });

  it('uses January through the current month for the year range', () => {
    const result = buildAnalyticsDashboard([{ local_date: '2026-07-28', total_points: 92 }], [], 'Y', new Date(2026, 6, 28));

    expect(result.bars).toHaveLength(12);
    expect(result.possibleDays).toBe(209);
    expect(result.daysAtGoal).toBe(1);
    expect(result.bars.map(bar => bar.label)).toEqual(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']);
    expect(result.bars[6].current).toBe(92);
  });

  it('labels only weekly landmarks in the month chart', () => {
    const result = buildAnalyticsDashboard([], [], 'M', new Date(2026, 6, 28));

    expect(result.bars.map(bar => bar.label).filter(Boolean)).toEqual(['1', '8', '15', '22']);
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
});
