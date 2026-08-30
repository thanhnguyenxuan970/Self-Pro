import { sumAnalyticsStars, type AnalyticsStarRow } from './yearStars';

export type AnalyticsRange = 'W' | 'M' | 'Y';

export type AnalyticsDaily = { local_date: string; total_points: number };
export type AnalyticsLog = AnalyticsStarRow & { logged_at: number; points_earned: number; task_name: string | null };
export type AnalyticsBar = { label: string; current: number; previous: number };
export type AnalyticsDashboard = {
  bars: AnalyticsBar[];
  goal: number;
  points: number; previousPoints: number; stars: number; previousStars: number;
  daysAtGoal: number; previousDaysAtGoal: number; possibleDays: number;
  consistency: { week: number; month: number; all: number };
  // dayOfWeek is JS's getDay() index (0 = Sunday .. 6 = Saturday) -- kept
  // alongside the display label so consumers can identify "which day is
  // Saturday" without string-matching a label that may become localized.
  weekday: { label: string; value: number; dayOfWeek: number }[];
  hours: { label: string; value: number }[];
  composition: { name: string; count: number; previous: number }[];
};

export function getAnalyticsChartLayout(range: AnalyticsRange, barCount: number) {
  const columnWidth = range === 'M' ? 36 : range === 'Y' ? 56 : 0;
  return { isScrollable: range !== 'W', columnWidth, contentWidth: columnWidth * barCount };
}

export function getMonthChartAnchor(barCount: number, todayIndex: number, viewportWidth: number) {
  const { columnWidth, contentWidth } = getAnalyticsChartLayout('M', barCount);
  // The Month range now spans the whole calendar month, including days after
  // today left at 0, and its last bar is a fixed month boundary rather than
  // always "today" -- so unlike the old rolling window, it no longer needs a
  // half-viewport of blank scroll space reserved to center that last bar.
  // Keep just enough trailing room that the final day isn't flush against
  // the edge; centering today can fall short of dead-center near month-end.
  const trailingInset = Math.min(viewportWidth / 2, columnWidth);
  const maxOffset = Math.max(0, contentWidth + trailingInset - viewportWidth);
  const centeredOffset = (todayIndex + 0.5) * columnWidth - viewportWidth / 2;
  return {
    trailingInset,
    scrollOffset: Math.min(maxOffset, Math.max(0, centeredOffset)),
  };
}

export function analyticsBarAccessibilityLabel(
  language: 'vi' | 'en',
  periodLabel: string,
  current: number,
  previous: number,
  goal: number,
  showPrevious: boolean,
): string {
  if (language === 'vi') {
    return `${periodLabel}: ${current} điểm${showPrevious ? `, trước đó ${previous} điểm` : ''}${goal > 0 ? `, mục tiêu ${goal} điểm` : ''}`;
  }
  return `${periodLabel}: ${current} points${showPrevious ? `, previous ${previous} points` : ''}${goal > 0 ? `, goal ${goal} points` : ''}`;
}

const ANALYTICS_DAILY_GOAL = 50;
const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const addDays = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
const sum = (items: number[]) => items.reduce((total, value) => total + value, 0);
const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();

function windowFor(range: AnalyticsRange, today: Date) {
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (range === 'W') {
    const mondayOffset = (end.getDay() + 6) % 7;
    const start = addDays(end, -mondayOffset);
    return { start, previousStart: addDays(start, -7), count: 7 };
  }
  if (range === 'M') {
    const start = new Date(end.getFullYear(), end.getMonth(), 1);
    const previousStart = new Date(end.getFullYear(), end.getMonth() - 1, 1);
    return { start, previousStart, count: daysInMonth(end.getFullYear(), end.getMonth()) };
  }
  const start = new Date(end.getFullYear(), 0, 1);
  return { start, previousStart: new Date(end.getFullYear() - 1, 0, 1), count: Math.round((end.getTime() - start.getTime()) / 86400000) + 1 };
}

export function buildAnalyticsDashboard(
  daily: AnalyticsDaily[],
  logs: AnalyticsLog[],
  range: AnalyticsRange,
  today = new Date(),
  activeDates: string[] = [],
): AnalyticsDashboard {
  const goal = ANALYTICS_DAILY_GOAL;
  const { start, previousStart, count } = windowFor(range, today);
  const dayMap = new Map(daily.map(row => [row.local_date, row.total_points]));
  const currentDates = Array.from({ length: range === 'Y' ? 12 : count }, (_, index) => range === 'Y'
    ? new Date(start.getFullYear(), start.getMonth() + index, 1)
    : addDays(start, index));
  const previousMonthLength = daysInMonth(previousStart.getFullYear(), previousStart.getMonth());
  const previousDates = currentDates.map<Date | null>(date => {
    if (range === 'Y') return new Date(date.getFullYear() - 1, date.getMonth(), 1);
    // The calendar month can run longer than the prior one (e.g. a 31-day
    // month compared against a 28/30-day one) -- days past the prior month's
    // end have no comparison date rather than spilling into the month after.
    if (range === 'M') return date.getDate() <= previousMonthLength ? new Date(previousStart.getFullYear(), previousStart.getMonth(), date.getDate()) : null;
    return addDays(previousStart, Math.round((date.getTime() - start.getTime()) / 86400000));
  });
  const labels = currentDates.map((date) => range === 'W'
    ? ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'][date.getDay()]
    : range === 'M' ? String(date.getDate())
    : date.toLocaleString('en-US', { month: 'short' }));
  const monthTotal = (month: Date, from: Date, to: Date) => sum(daily.filter(row => {
    const date = new Date(`${row.local_date}T00:00:00`);
    return date >= from && date <= to && date.getFullYear() === month.getFullYear() && date.getMonth() === month.getMonth();
  }).map(row => row.total_points));
  const bars = currentDates.map((date, index) => ({ label: labels[index], current: range === 'Y' ? monthTotal(date, start, today) : dayMap.get(dateKey(date)) ?? 0, previous: range === 'Y' ? monthTotal(previousDates[index]!, previousStart, addDays(start, -1)) : previousDates[index] ? dayMap.get(dateKey(previousDates[index]!)) ?? 0 : 0 }));
  const inWindow = (date: string, from: Date, to: Date) => date >= dateKey(from) && date <= dateKey(to);
  const currentEnd = today;
  const previousEnd = range === 'Y'
    ? new Date(today.getFullYear() - 1, today.getMonth(), today.getDate())
    : range === 'M'
      ? new Date(previousStart.getFullYear(), previousStart.getMonth(), previousMonthLength)
      : addDays(previousStart, count - 1);
  const currentLogs = logs.filter(log => inWindow(log.local_date, start, currentEnd));
  const previousLogs = logs.filter(log => inWindow(log.local_date, previousStart, previousEnd));
  const points = sum(bars.map(bar => bar.current));
  const previousPoints = sum(bars.map(bar => bar.previous));
  const stars = sumAnalyticsStars(currentLogs);
  const previousStars = sumAnalyticsStars(previousLogs);
  // The volume/consistency contract is a day with at least one real activity,
  // not a day that happened to clear the 50-point reward threshold. Keep the
  // daily-summary fallback for older callers/tests; the SQLite query supplies
  // source-of-truth dates in production.
  const activeDateSet = new Set(activeDates.length > 0
    ? activeDates
    : daily.filter(row => row.total_points > 0).map(row => row.local_date));
  const countActiveDays = (from: Date, to: Date) => [...activeDateSet]
    .filter(date => inWindow(date, from, to)).length;
  const activePercent = (from: Date, to: Date) => Math.round(
    countActiveDays(from, to) / Math.max(1, Math.round((to.getTime() - from.getTime()) / 86400000) + 1) * 100,
  );
  // Single pass over currentLogs instead of 7 + 6 separate .filter() scans.
  const weekdayTotals = new Array(7).fill(0);
  const hourBucketTotals = new Array(6).fill(0);
  for (const log of currentLogs) {
    weekdayTotals[new Date(log.local_date + 'T00:00:00').getDay()] += log.points_earned;
    hourBucketTotals[Math.floor(new Date(log.logged_at).getHours() / 4)] += log.points_earned;
  }
  const weekday = [1, 2, 3, 4, 5, 6, 0].map(day => ({ label: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'][day], dayOfWeek: day, value: weekdayTotals[day] }));
  const hours = [0, 4, 8, 12, 16, 20].map((hour, index) => ({ label: String(hour), value: hourBucketTotals[index] }));
  const countByTask = (items: AnalyticsLog[]) => items.reduce((map, log) => { if (log.task_name) map.set(log.task_name, (map.get(log.task_name) ?? 0) + 1); return map; }, new Map<string, number>());
  const currentTasks = countByTask(currentLogs), previousTasks = countByTask(previousLogs);
  const composition = [...currentTasks.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([name, taskCount]) => ({ name, count: taskCount, previous: previousTasks.get(name) ?? 0 }));
  const daysAtGoal = countActiveDays(start, currentEnd);
  const previousDaysAtGoal = countActiveDays(previousStart, previousEnd);
  const allStart = [...activeDateSet].sort()[0];
  const allConsistency = allStart
    ? activePercent(new Date(`${allStart}T00:00:00`), currentEnd)
    : 0;
  return { bars, goal, points, previousPoints, stars, previousStars, daysAtGoal, previousDaysAtGoal, possibleDays: range === 'Y' ? count : bars.length, consistency: { week: activePercent(addDays(today, -6), currentEnd), month: activePercent(addDays(today, -29), currentEnd), all: allConsistency }, weekday, hours, composition };
}

export const analyticsDemo: AnalyticsDashboard = {
  bars: [['Mo', 60, 0], ['Tu', 45, 50], ['We', 78, 52], ['Th', 50, 39], ['Fr', 92, 61], ['Sa', 34, 42], ['Su', 0, 33]].map(([label, current, previous]) => ({ label: String(label), current: Number(current), previous: Number(previous) })),
  goal: 50, points: 412, previousPoints: 324, stars: 17, previousStars: 13, daysAtGoal: 4, previousDaysAtGoal: 3, possibleDays: 7,
  consistency: { week: 57, month: 64, all: 58 },
  weekday: [['Mo', 58], ['Tu', 44], ['We', 73], ['Th', 51], ['Fr', 78], ['Sa', 30], ['Su', 40]].map(([label, value]) => ({
    label: String(label),
    value: Number(value),
    dayOfWeek: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].indexOf(String(label)),
  })),
  hours: [['0', 4], ['4', 18], ['8', 36], ['12', 22], ['16', 30], ['20', 58]].map(([label, value]) => ({ label: String(label), value: Number(value) })),
  composition: [{ name: 'Cleaning', count: 12, previous: 9 }, { name: 'Gym', count: 9, previous: 8 }, { name: 'Chạy bộ', count: 7, previous: 9 }, { name: 'Reading', count: 5, previous: 5 }],
};
