import { getTimeUntilWeeklyReset, shouldShowWeekResetToast } from '../src/utils/weekReset';

test('shows toast when no last_seen (first open ever)', () => {
  expect(shouldShowWeekResetToast('2026-05-25', null)).toBe(true);
});

test('shows toast when week changed', () => {
  expect(shouldShowWeekResetToast('2026-05-25', '2026-05-18')).toBe(true);
});

test('no toast when same week', () => {
  expect(shouldShowWeekResetToast('2026-05-25', '2026-05-25')).toBe(false);
});

test('counts down to next Monday at midnight', () => {
  expect(getTimeUntilWeeklyReset(new Date(2026, 6, 12, 16, 41))).toEqual({ days: 0, hours: 7, minutes: 19 });
});
