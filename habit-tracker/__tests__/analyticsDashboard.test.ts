import { buildAnalyticsDashboard } from '../src/analytics/dashboardModel';

describe('buildAnalyticsDashboard', () => {
  it('uses the highest available daily points as the goal', () => {
    const result = buildAnalyticsDashboard(
      [{ local_date: '2026-07-27', total_points: 92 }, { local_date: '2026-07-28', total_points: 60 }],
      [],
      'W',
      new Date(2026, 6, 28),
    );

    expect(result.goal).toBe(92);
    expect(result.daysAtGoal).toBe(1);
  });

  it('does not count empty days as being at a zero-point goal', () => {
    const result = buildAnalyticsDashboard([], [], 'W', new Date(2026, 6, 28));

    expect(result.goal).toBe(0);
    expect(result.daysAtGoal).toBe(0);
  });

  it('uses twelve monthly bars and 365 days for the year range', () => {
    const result = buildAnalyticsDashboard([{ local_date: '2026-07-28', total_points: 92 }], [], 'Y', new Date(2026, 6, 28));

    expect(result.bars).toHaveLength(12);
    expect(result.possibleDays).toBe(365);
    expect(result.daysAtGoal).toBe(1);
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
