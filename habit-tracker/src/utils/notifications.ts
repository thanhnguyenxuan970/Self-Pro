import { getTranslations, type AppLanguage } from '../config/i18n';
import {
  challengeIdFromReminderIdentifier,
  challengeReminderPrefix,
  isChallengeReminderId,
  planAllChallengeReminders,
  REMINDER_ID_PREFIX,
  type ChallengeReminderState,
} from '../lib/challengeNotificationPlan';

// Challenge reconciliation and account cleanup share one OS notification
// queue. This closes the sign-out race where cleanup could finish between an
// in-flight scheduler's active-check and its next schedule call.
let challengeReminderOperationTail = Promise.resolve();
let challengeReminderGeneration = 0;
let challengeReminderSyncBlocked = false;

function enqueueChallengeReminderOperation<T>(operation: () => Promise<T>): Promise<T> {
  const previous = challengeReminderOperationTail;
  let release!: () => void;
  challengeReminderOperationTail = new Promise<void>(resolve => { release = resolve; });
  return previous.then(operation).finally(release);
}

/** Invalidate queued/in-flight account work before destructive auth cleanup. */
export function invalidateChallengeReminderSync(): void {
  challengeReminderGeneration += 1;
  challengeReminderSyncBlocked = true;
}

/** Re-enable account-scoped reconciliation after a new user is authenticated. */
export function activateChallengeReminderSync(): void {
  challengeReminderGeneration += 1;
  challengeReminderSyncBlocked = false;
}

export function parseNotificationTime(input: string): { hours: number; minutes: number } | null {
  const match = input.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  if (hours > 23) return null;
  if (minutes > 59) return null;
  return { hours, minutes };
}

async function cancelExactNotificationIds(
  Notifications: typeof import('expo-notifications'),
  identifiers: Iterable<string>,
): Promise<number> {
  const unique = [...new Set(identifiers)];
  await Promise.all(unique.map(async identifier => {
    try {
      await Notifications.cancelScheduledNotificationAsync(identifier);
    } catch {}
  }));
  return unique.length;
}

/**
 * Cancel a set of exact IDs and/or Challenge prefixes with one OS queue read.
 * This is intentionally the only prefix-scanning primitive; callers cancel a
 * batch after their DB transaction instead of scanning once per Challenge.
 */
async function cancelChallengeRemindersInternal(
  notificationIds: readonly (string | null | undefined)[],
): Promise<number> {
  const tokens = [...new Set(notificationIds.filter((id): id is string => !!id))];
  if (!tokens.length) return 0;

  try {
    const Notifications = await import('expo-notifications');
    const exactIds = tokens.filter(id => !isChallengeReminderId(id));
    const prefixes = tokens.filter(isChallengeReminderId);
    const queuedIds = new Set<string>();

    if (prefixes.length && typeof Notifications.getAllScheduledNotificationsAsync === 'function') {
      try {
        const requests = await Notifications.getAllScheduledNotificationsAsync();
        for (const request of requests) {
          if (prefixes.some(prefix => request.identifier.startsWith(prefix))) queuedIds.add(request.identifier);
        }
      } catch {}
    }

    return cancelExactNotificationIds(Notifications, [...exactIds, ...queuedIds]);
  } catch {
    return 0;
  }
}

export function cancelChallengeReminders(
  notificationIds: readonly (string | null | undefined)[],
): Promise<number> {
  return enqueueChallengeReminderOperation(() => cancelChallengeRemindersInternal(notificationIds));
}

export type ChallengeReminderSyncResult = {
  granted: boolean;
  permissionError: boolean;
  scheduleError: boolean;
  scheduled: number;
  cancelled: number;
  failed: number;
  failedChallengeIds: number[];
  candidateCount: number;
  omittedCount: number;
  challengeTokens: Map<number, string | null>;
};

function emptySyncResult(states: readonly ChallengeReminderState[], overrides: Partial<ChallengeReminderSyncResult> = {}): ChallengeReminderSyncResult {
  return {
    granted: false,
    permissionError: false,
    scheduleError: false,
    scheduled: 0,
    cancelled: 0,
    failed: 0,
    failedChallengeIds: [],
    candidateCount: 0,
    omittedCount: 0,
    challengeTokens: new Map(states.map(state => [state.challengeId, null])),
    ...overrides,
  };
}

/**
 * Reconcile all Challenge-owned OS slots in one pass. New slots are scheduled
 * before stale slots are cancelled, so an interrupted foreground sync keeps
 * the old reminder instead of creating a zero-reminder window.
 */
async function syncChallengeRemindersInternal(
  states: readonly ChallengeReminderState[],
  lang: AppLanguage,
  options: {
    now?: Date;
    requestPermission?: boolean;
    storedNotificationIds?: ReadonlyMap<number, string | null>;
    maxSlots?: number;
    /** Re-arm deterministic IDs that Expo still reports after Android clears its alarms. */
    forceReschedule?: boolean;
    /** Stop account-scoped work when the owning auth/lifecycle effect unmounts. */
    isActive?: () => boolean;
  } = {},
): Promise<ChallengeReminderSyncResult> {
  const generation = challengeReminderGeneration;
  const isActive = () => !challengeReminderSyncBlocked
    && generation === challengeReminderGeneration
    && (options.isActive?.() ?? true);
  if (!isActive()) return emptySyncResult(states);
  const now = options.now ?? new Date();
  const plan = planAllChallengeReminders([...states], { now, maxSlots: options.maxSlots });
  const fullPlan = options.maxSlots == null
    ? plan
    : planAllChallengeReminders([...states], { now });
  const stateById = new Map(states.map(state => [state.challengeId, state]));
  const storedIds = [...(options.storedNotificationIds?.entries() ?? [])]
    .filter((entry): entry is [number, string] => entry[1] != null);
  const allStoredIds = storedIds.map(([, id]) => id);

  const Notifications = await import('expo-notifications');
  let permissionStatus: { status: string };
  try {
    permissionStatus = options.requestPermission
      ? await Notifications.requestPermissionsAsync()
      : await Notifications.getPermissionsAsync();
  } catch {
    return emptySyncResult(states, { permissionError: true });
  }

  if (permissionStatus.status !== 'granted') {
    if (!isActive()) return emptySyncResult(states);
    const cancelled = await cancelChallengeRemindersInternal([REMINDER_ID_PREFIX, ...allStoredIds]);
    return emptySyncResult(states, { cancelled });
  }

  if (!isActive()) return emptySyncResult(states, { granted: true });
  if (typeof Notifications.getAllScheduledNotificationsAsync !== 'function') {
    return emptySyncResult(states, { granted: true, scheduleError: true });
  }

  let requests: Awaited<ReturnType<typeof Notifications.getAllScheduledNotificationsAsync>>;
  try {
    requests = await Notifications.getAllScheduledNotificationsAsync();
  } catch {
    return emptySyncResult(states, { granted: true, scheduleError: true });
  }

  // Android removes AlarmManager entries when the app is force-stopped, while
  // expo-notifications can still return the persisted request records from
  // getAllScheduledNotificationsAsync(). Treating those records as live would
  // leave the DB token intact but silently lose delivery after the next launch.
  // A cold-start/foreground rehydration therefore schedules every desired
  // deterministic slot again, even when its persisted identifier is present.
  // The persisted request must be cancelled first: Expo otherwise treats the
  // same explicit identifier as already scheduled and does not recreate the
  // AlarmManager entry.
  let rehydrationCancelled = 0;
  const existingRequests = new Map(
    requests
      .filter(request => isChallengeReminderId(request.identifier))
      .map(request => [request.identifier, request]),
  );
  const desiredIds = new Set(plan.slots.map(slot => slot.identifier));
  const omittedChallengeIds = new Set(fullPlan.slots
    .filter(slot => !desiredIds.has(slot.identifier))
    .map(slot => slot.challengeId));
  const failedChallengeIds = new Set(omittedChallengeIds);
  let scheduled = 0;

  for (const slot of plan.slots) {
    if (!isActive()) return emptySyncResult(states, { granted: true, scheduled });
    const previousRequest = existingRequests.get(slot.identifier);
    if (previousRequest && !options.forceReschedule) continue;
    if (previousRequest && options.forceReschedule) {
      rehydrationCancelled += await cancelExactNotificationIds(Notifications, [slot.identifier]);
    }
    const state = stateById.get(slot.challengeId);
    if (!state) continue;
    try {
      await Notifications.scheduleNotificationAsync({
        identifier: slot.identifier,
        content: {
          title: 'Habi 💪',
          body: slot.tone === 'outcome'
            ? getTranslations(lang).challengeOutcomeNotifBody(state.challengeName, state.mode, slot.consequenceDate ?? slot.date)
            : getTranslations(lang).challengeReminderNotifBody(state.challengeName),
          sound: true,
          data: { challengeId: state.challengeId, reminderTone: slot.tone },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: slot.triggerAt,
        },
      });
      scheduled += 1;
    } catch {
      // Force-reschedule cancels a persisted identifier so Android can rebuild
      // its AlarmManager entry. If the replacement fails, restore the old
      // request immediately so a transient scheduling error never creates a
      // zero-reminder window.
      if (previousRequest) {
        const previousTrigger = previousRequest.trigger;
        const previousDate = previousTrigger && typeof previousTrigger === 'object' && 'date' in previousTrigger
          ? previousTrigger.date
          : null;
        if (previousDate instanceof Date || typeof previousDate === 'number') {
          await Notifications.scheduleNotificationAsync({
            identifier: previousRequest.identifier,
            content: {
              title: previousRequest.content.title,
              body: previousRequest.content.body,
              data: previousRequest.content.data,
              sound: previousRequest.content.sound ?? undefined,
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.DATE,
              date: previousDate,
            },
          }).catch(() => {});
        }
      }
      failedChallengeIds.add(slot.challengeId);
    }
  }

  if (!isActive()) return emptySyncResult(states, { granted: true, scheduled });

  // A failed new schedule preserves that Challenge's old slots. Every other
  // stale slot, including orphaned slots for deleted/terminal Challenges, is
  // safe to remove after the schedule attempt.
  const staleIds = requests
    .map(request => request.identifier)
    .filter(identifier => {
      if (!isChallengeReminderId(identifier) || desiredIds.has(identifier)) return false;
      const challengeId = challengeIdFromReminderIdentifier(identifier);
      return challengeId == null || !failedChallengeIds.has(challengeId);
    });
  const legacyIds = storedIds
    .filter(([challengeId]) => !failedChallengeIds.has(challengeId))
    .map(([, id]) => id)
    .filter(id => !isChallengeReminderId(id));
  const cancelled = rehydrationCancelled + await cancelExactNotificationIds(Notifications, [...staleIds, ...legacyIds]);

  const challengeTokens = new Map<number, string | null>();
  for (const state of states) {
    const token = state.status === 'active'
      && state.notificationsEnabled
      && !failedChallengeIds.has(state.challengeId)
      ? challengeReminderPrefix(state.challengeId)
      : null;
    challengeTokens.set(state.challengeId, token);
  }

  return {
    granted: true,
    permissionError: false,
    scheduleError: false,
    scheduled,
    cancelled,
    failed: failedChallengeIds.size,
    failedChallengeIds: [...failedChallengeIds],
    candidateCount: plan.candidateCount,
    omittedCount: plan.omittedCount,
    challengeTokens,
  };
}

export function syncChallengeReminders(
  states: readonly ChallengeReminderState[],
  lang: AppLanguage,
  options: Parameters<typeof syncChallengeRemindersInternal>[2] = {},
): Promise<ChallengeReminderSyncResult> {
  return enqueueChallengeReminderOperation(() => syncChallengeRemindersInternal(states, lang, options));
}

// Stable, predictable identifiers so cancelling/rescheduling habit reminders
// only ever touches habit-reminder slots -- never a Challenge reminder.
const HABIT_REMINDER_IDS = ['habit-reminder-0', 'habit-reminder-1', 'habit-reminder-2'];

export async function scheduleAllHabitReminders(
  times: (string | null)[],
  lang: AppLanguage,
  options: { requestPermission?: boolean; isActive?: () => boolean } = {},
): Promise<boolean> {
  try {
    const isActive = options.isActive ?? (() => true);
    if (!isActive()) return false;
    const Notifications = await import('expo-notifications');
    const { status } = options.requestPermission === false
      ? await Notifications.getPermissionsAsync()
      : await Notifications.requestPermissionsAsync();
    if (!isActive()) return false;
    await Promise.all(HABIT_REMINDER_IDS.map(id => Notifications.cancelScheduledNotificationAsync(id).catch(() => {})));
    if (status !== 'granted') return false;
    for (let i = 0; i < times.length; i += 1) {
      if (!isActive()) return false;
      const t = times[i];
      if (!t) continue;
      const parsed = parseNotificationTime(t);
      if (!parsed) continue;
      await Notifications.scheduleNotificationAsync({
        identifier: HABIT_REMINDER_IDS[i],
        content: {
          title: 'Habi 💪',
          body: getTranslations(lang).habitReminderNotifBody,
          sound: true,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: parsed.hours,
          minute: parsed.minutes,
        },
      });
    }
    return true;
  } catch {
    return false;
  }
}
