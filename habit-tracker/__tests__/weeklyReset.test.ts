import { computeWeeklyReset } from '../src/logic/weeklyReset';

test('no prior week → no reset', () => {
  const result = computeWeeklyReset({
    lastActiveWeekStart: null,
    currentWeekStart: '2026-05-25',
  });
  expect(result.needsReset).toBe(false);
  expect(result.weekToFinalize).toBeNull();
});

test('same week → no reset', () => {
  const result = computeWeeklyReset({
    lastActiveWeekStart: '2026-05-25',
    currentWeekStart: '2026-05-25',
  });
  expect(result.needsReset).toBe(false);
  expect(result.weekToFinalize).toBeNull();
});

test('old week still open → needs reset, returns old week_start', () => {
  const result = computeWeeklyReset({
    lastActiveWeekStart: '2026-05-18',
    currentWeekStart: '2026-05-25',
  });
  expect(result.needsReset).toBe(true);
  expect(result.weekToFinalize).toBe('2026-05-18');
});
