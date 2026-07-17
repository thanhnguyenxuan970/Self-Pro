import { backfillRemaining, canBackfill } from './backfill';
import { getLocalDateFor, getWeekStartFor } from '../utils/formatters';

export type HomeBackfillNudge = {
  pendingDates: string[];
  remaining: number;
  reconnectable: boolean;
  state: 'PROMPT_FULL' | 'PROMPT_CAPPED' | 'HIDDEN';
};

type Input = {
  today: string;
  weekStart: string;
  activeDates: Iterable<string>;
  freezeDates: Set<string>;
  backfillsUsedThisWeek: number;
};

/** Derives the Home shortcut from the same guards used by the backfill mutation. */
export function getHomeBackfillNudge(input: Input): HomeBackfillNudge {
  const activeDates = new Set(input.activeDates);
  const pendingDates: string[] = [];
  const cursor = new Date(`${input.weekStart}T12:00:00`);
  const yesterday = new Date(`${input.today}T12:00:00`);
  yesterday.setDate(yesterday.getDate() - 1);

  while (cursor <= yesterday) {
    const date = getLocalDateFor(cursor);
    if (canBackfill({
      date,
      today: input.today,
      weekStartOfDate: getWeekStartFor(cursor),
      currentWeekStart: input.weekStart,
      dayHasActivity: activeDates.has(date),
      backfillsUsedThisWeek: input.backfillsUsedThisWeek,
      hasStreakFreeze: input.freezeDates.has(date),
    }).allowed) pendingDates.push(date);
    cursor.setDate(cursor.getDate() + 1);
  }

  const remaining = backfillRemaining(input.backfillsUsedThisWeek);
  const brokenRun: string[] = [];
  const brokenCursor = new Date(`${input.today}T12:00:00`);
  brokenCursor.setDate(brokenCursor.getDate() - 1);
  const weekStartDate = new Date(`${input.weekStart}T12:00:00`);
  while (!activeDates.has(getLocalDateFor(brokenCursor)) && brokenCursor >= weekStartDate) {
    brokenRun.push(getLocalDateFor(brokenCursor));
    brokenCursor.setDate(brokenCursor.getDate() - 1);
  }
  const reconnectable = brokenRun.length > 0
    && brokenRun.length <= remaining
    && activeDates.has(getLocalDateFor(brokenCursor))
    && brokenRun.every(date => pendingDates.includes(date));
  return {
    pendingDates,
    remaining,
    reconnectable,
    state: pendingDates.length === 0 || remaining === 0
      ? 'HIDDEN'
      : pendingDates.length <= remaining ? 'PROMPT_FULL' : 'PROMPT_CAPPED',
  };
}
