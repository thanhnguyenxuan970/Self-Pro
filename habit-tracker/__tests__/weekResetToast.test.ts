import { shouldShowWeekResetToast } from '../src/logic/weekReset';

test('shows toast when no last_seen (first open ever)', () => {
  expect(shouldShowWeekResetToast('2026-05-25', null)).toBe(true);
});

test('shows toast when week changed', () => {
  expect(shouldShowWeekResetToast('2026-05-25', '2026-05-18')).toBe(true);
});

test('no toast when same week', () => {
  expect(shouldShowWeekResetToast('2026-05-25', '2026-05-25')).toBe(false);
});
