import type { ChallengeMode, ChallengeStatus } from './challenge';
import type { PaceState } from './challengeWeekly';

/**
 * Pure policy for Challenge notifications. The scheduler owns the OS queue;
 * this module only decides which state-aware, one-shot slots are useful.
 */
export type ReminderTone = 'normal' | 'outcome';

export type ReminderSlot = {
  identifier: string;
  challengeId: number;
  challengeName: string;
  mode: ChallengeMode;
  tone: ReminderTone;
  date: string;
  consequenceDate?: string;
  triggerAt: Date;
};

export type ChallengeReminderState = {
  challengeId: number;
  challengeName: string;
  mode: ChallengeMode;
  status: ChallengeStatus;
  notificationsEnabled: boolean;
  loggedToday: boolean;
  freezesLeft: number;
  weekPaceState: PaceState | null;
  weekEnd: string | null;
  today: string;
};

export type ChallengeReminderPlan = {
  slots: ReminderSlot[];
  candidateCount: number;
  omittedCount: number;
};

export const REMINDER_HOUR = 20;
export const REMINDER_MINUTE = 0;
export const OUTCOME_HOUR = 9;
export const OUTCOME_MINUTE = 0;
export const REMINDER_HORIZON_DAYS = 7;
export const REMINDER_ID_PREFIX = 'habi-ch-';

export function challengeReminderPrefix(challengeId: number): string {
  return `${REMINDER_ID_PREFIX}${challengeId}-`;
}

export function reminderIdentifier(challengeId: number, tone: ReminderTone, date: string): string {
  return `${challengeReminderPrefix(challengeId)}${tone}-${date}`;
}

export function isChallengeReminderId(identifier: string): boolean {
  return identifier.startsWith(REMINDER_ID_PREFIX);
}

export function challengeIdFromReminderIdentifier(identifier: string): number | null {
  const match = identifier.match(/^habi-ch-(\d+)-/);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isSafeInteger(id) ? id : null;
}

function dayNumber(value: string): number {
  const [year, month, day] = value.split('-').map(Number);
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

function dateFromDayNumber(value: number): string {
  return new Date(value * 86_400_000).toISOString().slice(0, 10);
}

export function addDays(date: string, offset: number): string {
  return dateFromDayNumber(dayNumber(date) + offset);
}

function dateAtLocalTime(date: string, hour: number, minute: number): Date {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

function normalSlots(state: ChallengeReminderState, now: Date): ReminderSlot[] {
  // Once a consequence is already knowable, do not leave stale future
  // encouragement alarms behind it. The next sync will either cancel them
  // after a log or retain only the truthful outcome slot.
  const hasPendingConsequence = (state.mode === 'streak'
    && state.freezesLeft <= 0
    && !state.loggedToday)
    || (state.mode === 'weekly' && state.weekPaceState === 'impossible');
  const horizon = state.mode === 'weekly' && state.weekPaceState === 'impossible'
    ? 0
    : hasPendingConsequence ? 1 : REMINDER_HORIZON_DAYS;
  const slots: ReminderSlot[] = [];
  for (let offset = 0; offset < horizon; offset += 1) {
    if (offset === 0 && state.loggedToday) continue;
    const date = addDays(state.today, offset);
    const triggerAt = dateAtLocalTime(date, REMINDER_HOUR, REMINDER_MINUTE);
    if (triggerAt.getTime() <= now.getTime()) continue;
    slots.push({
      identifier: reminderIdentifier(state.challengeId, 'normal', date),
      challengeId: state.challengeId,
      challengeName: state.challengeName,
      mode: state.mode,
      tone: 'normal',
      date,
      triggerAt,
    });
  }
  return slots;
}

function outcomeSlot(state: ChallengeReminderState, now: Date): ReminderSlot | null {
  let outcomeDate: string | null = null;
  let consequenceDate: string | undefined;

  // With no freeze left, an unlogged streak day is known to fail as soon as
  // that day closes. The next-morning notification is therefore a truthful
  // consequence notification, not a speculative future-day nudge.
  if (state.mode === 'streak' && state.freezesLeft <= 0 && !state.loggedToday) {
    outcomeDate = addDays(state.today, 1);
    consequenceDate = state.today;
  }

  // An impossible weekly pace cannot recover before the window ends. Notify
  // after that window, when the failure is an observable consequence.
  if (state.mode === 'weekly' && state.weekPaceState === 'impossible' && state.weekEnd != null) {
    outcomeDate = addDays(state.weekEnd, 1);
    consequenceDate = state.weekEnd;
  }

  if (outcomeDate == null) return null;
  const triggerAt = dateAtLocalTime(outcomeDate, OUTCOME_HOUR, OUTCOME_MINUTE);
  if (triggerAt.getTime() <= now.getTime()) return null;
  return {
    identifier: reminderIdentifier(state.challengeId, 'outcome', outcomeDate),
    challengeId: state.challengeId,
    challengeName: state.challengeName,
    mode: state.mode,
    tone: 'outcome',
    date: outcomeDate,
    consequenceDate,
    triggerAt,
  };
}

export function planChallengeReminders(
  state: ChallengeReminderState,
  options: { now: Date },
): ReminderSlot[] {
  if (state.status !== 'active' || !state.notificationsEnabled) return [];
  return [...normalSlots(state, options.now), outcomeSlot(state, options.now)].filter(
    (slot): slot is ReminderSlot => slot != null,
  );
}

/**
 * The plan deliberately has no hidden global slice. Encouragement is only
 * scheduled within an explicit seven-day horizon and consequence slots are at
 * most one per Challenge, so every omitted slot is a real scheduling failure
 * rather than a silent horizon reduction. `maxSlots` remains available for
 * callers that want an explicit platform budget; the omission count is
 * returned to the caller.
 */
export function planAllChallengeReminders(
  states: ChallengeReminderState[],
  options: { now: Date; maxSlots?: number },
): ChallengeReminderPlan {
  const all = states.flatMap(state => planChallengeReminders(state, options));
  all.sort((a, b) => {
    if (a.tone !== b.tone) return a.tone === 'outcome' ? -1 : 1;
    if (a.triggerAt.getTime() !== b.triggerAt.getTime()) {
      return a.triggerAt.getTime() - b.triggerAt.getTime();
    }
    return a.challengeId - b.challengeId;
  });
  const slots = options.maxSlots == null ? all : all.slice(0, Math.max(0, options.maxSlots));
  return { slots, candidateCount: all.length, omittedCount: all.length - slots.length };
}

/** State predicate retained for callers that need to explain why a Challenge
 * is near its edge. T1 escalation notifications are intentionally not emitted
 * until production audience evidence exists. */
export function isChallengeAtRisk(input: {
  mode: ChallengeMode;
  freezesLeft: number;
  weekPaceState: PaceState | null;
}): boolean {
  return input.mode === 'weekly'
    ? input.weekPaceState === 'behind'
    : input.freezesLeft <= 0;
}
