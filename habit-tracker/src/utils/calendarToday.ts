import { getLocalDateFor, getWeekStartFor } from './formatters';

export type CalendarToday = {
  date: string;
  weekStart: string;
  yearMonth: string;
  day: number;
};

/** Keep every calendar eligibility decision tied to one captured device date. */
export function getCalendarToday(now: Date = new Date()): CalendarToday {
  const date = getLocalDateFor(now);
  return {
    date,
    weekStart: getWeekStartFor(now),
    yearMonth: date.slice(0, 7),
    day: now.getDate(),
  };
}
