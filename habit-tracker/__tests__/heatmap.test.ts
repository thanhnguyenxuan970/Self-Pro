import { buildHeatmapWeeks, heatmapLevel } from '../src/utils/heatmap';

test('maps points to the five heatmap levels and pads Monday-based weeks', () => {
  expect([0, 49, 50, 75, 100].map(points => heatmapLevel(points, 50))).toEqual([0, 1, 2, 3, 4]);
  const weeks = buildHeatmapWeeks([{ local_date: '2026-07-10', total_points: 100 }], 50, new Date(2026, 6, 10));
  expect(weeks.every(week => week.length === 7)).toBe(true);
  expect(weeks.flat().find(cell => cell.date === '2026-07-10')?.level).toBe(4);
});
