import { ChallengeMode, ChallengeStatus, isAtRisk } from './challenge';
import { PaceState } from './challengeWeekly';

/** Pure scheduling policy for Challenge reminders. Deliberately free of any
 *  expo-notifications import so the whole policy is unit-testable and so the
 *  scheduler stays a dumb executor of whatever this returns. */

export type ReminderTone = 'normal' | 'urgent';

export type ReminderSlot = {
  identifier: string;
  challengeId: number;
  challengeName: string;
  mode: ChallengeMode;
  dayOffset: number;
  hour: number;
  minute: number;
  tone: ReminderTone;
};

export const REMINDER_HOUR = 20;
export const REMINDER_MINUTE = 0;
/** Escalation slot, only ever scheduled for today and only when the app has
 *  actually observed an at-risk state -- never speculatively for future days,
 *  because a future day's risk depends on whether today gets logged. */
export const URGENT_REMINDER_HOUR = 21;
export const URGENT_REMINDER_MINUTE = 30;

/** How far ahead one-shot slots are laid down. Refreshed every time the app
 *  reaches the foreground, so this is a "survive N days of not opening the
 *  app" budget, not a scheduling cadence. A streak challenge cannot survive
 *  7 unopened days anyway (one freeze covers a single miss). */
export const REMINDER_HORIZON_DAYS = 7;

/** iOS caps pending local notifications at 64 and silently drops the excess.
 *  Habit reminders take 3 of those, so leave real headroom. */
export const MAX_SCHEDULED_SLOTS = 50;

export const REMINDER_ID_PREFIX = 'habi-ch-';

export function reminderIdentifier(challengeId: number, dayOffset: number, tone: ReminderTone): string {
  return `${REMINDER_ID_PREFIX}${challengeId}-${dayOffset}-${tone}`;
}

export function isChallengeReminderId(identifier: string): boolean {
  return identifier.startsWith(REMINDER_ID_PREFIX);
}

export type ChallengeReminderState = {
  challengeId: number;
  challengeName: string;
  mode: ChallengeMode;
  status: ChallengeStatus;
  notificationsEnabled: boolean;
  loggedToday: boolean;
  /** Missing *today* has a concrete, still-avoidable cost. Computed by the
   *  caller via isChallengeAtRisk so this module stays a pure policy layer. */
  atRisk: boolean;
};

/** True when missing *today* has a concrete, still-avoidable cost.
 *  streak: the last freeze is gone, so a miss today ends the run.
 *  weekly: 'behind' means every remaining day of the window is now mandatory.
 *  'impossible' is excluded on purpose -- that window is already lost and
 *  nagging about it only burns goodwill. */
export function isChallengeAtRisk(input: {
  mode: ChallengeMode;
  freezesLeft: number;
  weekPaceState: PaceState | null;
}): boolean {
  if (input.mode === "weekly") return input.weekPaceState === "behind";
  return isAtRisk(input.mode, input.freezesLeft);
}

function isSlotInThePast(dayOffset: number, hour: number, minute: number, nowMinutes: number): boolean {
  return dayOffset === 0 && nowMinutes >= hour * 60 + minute;
}

export function planChallengeReminders(
  state: ChallengeReminderState,
  options: { nowMinutes: number; horizonDays?: number },
): ReminderSlot[] {
  if (state.status !== 'active') return [];
  if (!state.notificationsEnabled) return [];

  const horizonDays = options.horizonDays ?? REMINDER_HORIZON_DAYS;
  const slots: ReminderSlot[] = [];
  const base = { challengeId: state.challengeId, challengeName: state.challengeName, mode: state.mode };

  for (let dayOffset = 0; dayOffset < horizonDays; dayOffset += 1) {
    // Already logged today: the nudge has no job left to do. This is the fix
    // for reminders firing at 20:00 at people who finished hours earlier.
    if (dayOffset === 0 && state.loggedToday) continue;
    if (isSlotInThePast(dayOffset, REMINDER_HOUR, REMINDER_MINUTE, options.nowMinutes)) continue;
    slots.push({
      ...base,
      identifier: reminderIdentifier(state.challengeId, dayOffset, 'normal'),
      dayOffset,
      hour: REMINDER_HOUR,
      minute: REMINDER_MINUTE,
      tone: 'normal',
    });
  }

  if (!state.loggedToday
    && state.atRisk
    && !isSlotInThePast(0, URGENT_REMINDER_HOUR, URGENT_REMINDER_MINUTE, options.nowMinutes)) {
    slots.push({
      ...base,
      identifier: reminderIdentifier(state.challengeId, 0, 'urgent'),
      dayOffset: 0,
      hour: URGENT_REMINDER_HOUR,
      minute: URGENT_REMINDER_MINUTE,
      tone: 'urgent',
    });
  }

  return slots;
}

/** Merges every active challenge's plan under one global slot budget.
 *  Ordering is the priority order under truncation: urgent-today first, then
 *  nearest days across all challenges, so a user running several challenges
 *  never loses today's nudge to challenge #1 hogging the whole horizon. */
export function planAllChallengeReminders(
  states: ChallengeReminderState[],
  options: { nowMinutes: number; horizonDays?: number; maxSlots?: number },
): ReminderSlot[] {
  const maxSlots = options.maxSlots ?? MAX_SCHEDULED_SLOTS;
  const all = states.flatMap(state => planChallengeReminders(state, options));
  all.sort((a, b) => {
    if (a.tone !== b.tone) return a.tone === 'urgent' ? -1 : 1;
    if (a.dayOffset !== b.dayOffset) return a.dayOffset - b.dayOffset;
    return a.challengeId - b.challengeId;
  });
  return all.slice(0, maxSlots);
}
