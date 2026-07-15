import { formatDayDetailDate } from '../src/utils/formatters';

test('formats long VI and EN day-detail dates', () => {
  expect(formatDayDetailDate('2026-07-15', 'en-US')).toBe('Wednesday, July 15, 2026');
  expect(formatDayDetailDate('2026-07-15', 'vi-VN')).toContain('15 tháng 7, 2026');
});
