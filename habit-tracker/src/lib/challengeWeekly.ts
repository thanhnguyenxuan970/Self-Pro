const DAY_MS = 86_400_000;

function dayNumber(value: string): number {
  const [year, month, day] = value.split('-').map(Number);
  return Date.UTC(year, month - 1, day) / DAY_MS;
}

function dateFromDayNumber(n: number): string {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

export type WeekWindow = { weekIndex: number; start: string; end: string };

/** Each window is seven days from the challenge start, never a calendar week. */
export function weekWindows(startDate: string, totalWeeks: number): WeekWindow[] {
  const windows: WeekWindow[] = [];
  const startDay = dayNumber(startDate);
  for (let weekIndex = 1; weekIndex <= totalWeeks; weekIndex++) {
    const start = dateFromDayNumber(startDay + (weekIndex - 1) * 7);
    windows.push({ weekIndex, start, end: dateFromDayNumber(startDay + weekIndex * 7 - 1) });
  }
  return windows;
}

export function currentWeekWindow(startDate: string, totalWeeks: number, today: string): WeekWindow | null {
  return weekWindows(startDate, totalWeeks).find(w => today >= w.start && today <= w.end) ?? null;
}

export function weekSessionsDone(doneDates: ReadonlySet<string>, window: Pick<WeekWindow, 'start' | 'end'>): number {
  let count = 0;
  for (const date of doneDates) if (date >= window.start && date <= window.end) count++;
  return count;
}

export function sessionsDoneThrough(doneDates: ReadonlySet<string>, startDate: string, endDate: string): number {
  return weekSessionsDone(doneDates, { start: startDate, end: endDate });
}

export type PaceState = 'on_pace' | 'behind' | 'impossible';

/** on_pace: slack remains (a rest day is still affordable). behind: every
 *  remaining day is now required, zero slack left. impossible: quota can no
 *  longer be reached this week even with zero further rest days. */
export function computePace(params: {
  weeklyTarget: number;
  sessionsDone: number;
  today: string;
  weekEnd: string;
}): { state: PaceState; sessionsRemaining: number; daysRemaining: number } {
  const sessionsRemaining = Math.max(0, params.weeklyTarget - params.sessionsDone);
  const daysRemaining = Math.max(0, dayNumber(params.weekEnd) - dayNumber(params.today) + 1);
  let state: PaceState = 'on_pace';
  if (sessionsRemaining > daysRemaining) state = 'impossible';
  else if (sessionsRemaining > 0 && sessionsRemaining === daysRemaining) state = 'behind';
  return { state, sessionsRemaining, daysRemaining };
}

export type WeekOutcome = { weekIndex: number; weekEnd: string; hit: boolean; sessionsDone: number; sessionsRequired: number };
/** A miss is recorded at the window end for history. */
export type WeeklyFillWeek = { weekEnd: string; state: 'reset' };

/** Finalizes elapsed creation-anchored windows. A missed cumulative target
 * fails immediately; completed windows are harmlessly re-derived on mount. */
export function computeWeeklyRollover(input: {
  startDate: string;
  totalWeeks: number;
  weeklyTarget: number;
  today: string;
  doneDates: ReadonlySet<string>;
}): {
  outcomes: WeekOutcome[];
  fillWeeks: WeeklyFillWeek[];
  failed: boolean;
  failedAtWeek?: number;
  done: boolean;
} {
  const windows = weekWindows(input.startDate, input.totalWeeks);
  const outcomes: WeekOutcome[] = [];
  const fillWeeks: WeeklyFillWeek[] = [];
  let failed = false;
  let failedAtWeek: number | undefined;

  for (const window of windows) {
    if (input.today <= window.end) break; // week not finished yet
    const sessionsDone = sessionsDoneThrough(input.doneDates, input.startDate, window.end);
    const sessionsRequired = input.weeklyTarget * window.weekIndex;
    const hit = sessionsDone >= sessionsRequired;
    outcomes.push({ weekIndex: window.weekIndex, weekEnd: window.end, hit, sessionsDone, sessionsRequired });
    if (hit) continue;
    failed = true;
    failedAtWeek = window.weekIndex;
    fillWeeks.push({ weekEnd: window.end, state: 'reset' });
    break;
  }

  const lastWindow = windows[windows.length - 1];
  const done = !failed && input.today > lastWindow.end;

  return { outcomes, fillWeeks, failed, failedAtWeek, done };
}

export function perfectWeekCount(outcomes: ReadonlyArray<Pick<WeekOutcome, 'hit'>>): number {
  return outcomes.filter(o => o.hit).length;
}

export function isOverachieverWeek(sessionsDone: number, weeklyTarget: number): boolean {
  return sessionsDone > weeklyTarget;
}
