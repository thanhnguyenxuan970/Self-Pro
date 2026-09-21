import { getCalendarToday } from '../src/utils/calendarToday';

describe('calendar current-date snapshot', () => {
  test('keeps the day, month, and week eligibility boundary on one date', () => {
    expect(getCalendarToday(new Date(2026, 8, 27, 23, 59))).toEqual({
      date: '2026-09-27',
      weekStart: '2026-09-21',
      yearMonth: '2026-09',
      day: 27,
    });
    expect(getCalendarToday(new Date(2026, 8, 28, 0, 0))).toEqual({
      date: '2026-09-28',
      weekStart: '2026-09-28',
      yearMonth: '2026-09',
      day: 28,
    });
  });
});
