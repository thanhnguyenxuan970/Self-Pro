const DAY_MS = 86_400_000;

function dayNumber(value: string): number {
  const [year, month, day] = value.split('-').map(Number);
  return Date.UTC(year, month - 1, day) / DAY_MS;
}

function dateFromDayNumber(n: number): string {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

/** Mon=1 .. Sun=7 (ISO weekday), computed from a plain YYYY-MM-DD string. */
function isoWeekday(dateStr: string): number {
  const jsDay = new Date(dateStr + 'T00:00:00Z').getUTCDay(); // Sun=0..Sat=6
  return jsDay === 0 ? 7 : jsDay;
}

function weekEndFor(dateStr: string): string {
  return dateFromDayNumber(dayNumber(dateStr) + (7 - isoWeekday(dateStr)));
}

export type WeekWindow = { weekIndex: number; start: string; end: string };

/** Week 1 is a partial calendar week (start_date -> the following Sunday);
 *  every week after that is a full Mon-Sun window. Weeks always align to the
 *  calendar grid, never to a challenge-relative 7-day offset. */
export function weekWindows(startDate: string, totalWeeks: number): WeekWindow[] {
  const windows: WeekWindow[] = [];
  const firstEnd = weekEndFor(startDate);
  windows.push({ weekIndex: 1, start: startDate, end: firstEnd });
  let cursor = dateFromDayNumber(dayNumber(firstEnd) + 1);
  for (let i = 2; i <= totalWeeks; i++) {
    const end = dateFromDayNumber(dayNumber(cursor) + 6);
    windows.push({ weekIndex: i, start: cursor, end });
    cursor = dateFromDayNumber(dayNumber(end) + 1);
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

export type WeekOutcome = { weekIndex: number; weekEnd: string; hit: boolean; sessionsDone: number };
/** A miss that needs a synthetic challenge_log row written (state 'freeze' or
 *  'reset', dated at weekEnd) so a future rollover call can tell "already
 *  processed" apart from "not yet elapsed" -- hit weeks need no marker since
 *  they're harmlessly re-derivable from doneDates every time. */
export type WeeklyFillWeek = { weekEnd: string; state: 'freeze' | 'reset' };

/** Weekly-mode rollover: finalizes every week window that has fully elapsed
 *  and isn't already marked. Mirrors computeRollover's freeze-then-fail shape,
 *  but at weekly (not daily) granularity -- a week's quota can only be judged
 *  "hụt" once the week has ended, never mid-week. Idempotent: safe to call on
 *  every mount since already-marked misses are skipped, and hit weeks never
 *  mutate freezesLeft/status so recomputing them is a no-op. */
export function computeWeeklyRollover(input: {
  startDate: string;
  totalWeeks: number;
  weeklyTarget: number;
  today: string;
  doneDates: ReadonlySet<string>;
  markedWeekEnds: ReadonlySet<string>;
  freezesLeft: number;
}): {
  outcomes: WeekOutcome[];
  fillWeeks: WeeklyFillWeek[];
  freezesLeft: number;
  failed: boolean;
  failedAtWeek?: number;
  done: boolean;
} {
  const windows = weekWindows(input.startDate, input.totalWeeks);
  const outcomes: WeekOutcome[] = [];
  const fillWeeks: WeeklyFillWeek[] = [];
  let freezesLeft = input.freezesLeft;
  let failed = false;
  let failedAtWeek: number | undefined;

  for (const window of windows) {
    if (input.today <= window.end) break; // week not finished yet
    const sessionsDone = weekSessionsDone(input.doneDates, window);
    const hit = sessionsDone >= input.weeklyTarget;
    outcomes.push({ weekIndex: window.weekIndex, weekEnd: window.end, hit, sessionsDone });
    if (hit) continue;
    if (input.markedWeekEnds.has(window.end)) continue; // already processed in a prior rollover
    if (freezesLeft > 0) {
      freezesLeft--;
      fillWeeks.push({ weekEnd: window.end, state: 'freeze' });
    } else {
      failed = true;
      failedAtWeek = window.weekIndex;
      fillWeeks.push({ weekEnd: window.end, state: 'reset' });
      break;
    }
  }

  const lastWindow = windows[windows.length - 1];
  const done = !failed && input.today > lastWindow.end;

  return { outcomes, fillWeeks, freezesLeft, failed, failedAtWeek, done };
}

export function perfectWeekCount(outcomes: ReadonlyArray<Pick<WeekOutcome, 'hit'>>): number {
  return outcomes.filter(o => o.hit).length;
}

export function isOverachieverWeek(sessionsDone: number, weeklyTarget: number): boolean {
  return sessionsDone > weeklyTarget;
}
