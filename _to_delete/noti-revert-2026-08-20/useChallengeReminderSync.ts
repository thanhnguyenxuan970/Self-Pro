import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useActiveChallenges, useChallengeRollover } from '../queries/useChallenge';
import { challengeDate } from '../lib/challenge';
import { useLanguage } from './useSettings';
import { syncChallengeReminders } from '../utils/notifications';
import { ChallengeReminderState, isChallengeAtRisk } from '../lib/challengeNotificationPlan';

/**
 * Single owner of Challenge reminder scheduling.
 *
 * Two jobs, both of which used to have no home:
 *
 * 1. Run rollover on every foreground. Rollover is what turns a missed day
 *    into `status = 'failed'` and burns freezes, and it used to run only when
 *    ChallengeHubScreen mounted -- so a user who opened the app to the Today
 *    tab kept a challenge that was, in fact, already over, and kept getting
 *    reminded to log it.
 * 2. Re-derive the reminder plan whenever the observable state of the active
 *    challenges changes (logged today, at risk, failed, finished, created).
 *    The reminder set is a pure function of that state, so syncing on a
 *    state signature is both sufficient and idempotent.
 *
 * Deliberately NOT here: any attempt to notify about a failure that happened
 * while the app was closed. Rollover is client-side and lazy, so the device
 * simply does not know. That needs server-side push and is out of scope.
 */
export function useChallengeReminderSync(userId: number): void {
  const [lang] = useLanguage();
  const rollover = useChallengeRollover(userId);
  const { data: challenges } = useActiveChallenges(userId);

  const rolloverRef = useRef(rollover.mutate);
  rolloverRef.current = rollover.mutate;
  // Rollover only ever changes something across a day boundary, and it
  // invalidates half the query cache when it succeeds -- so foregrounding the
  // app twenty times in one afternoon must not trigger it twenty times.
  const lastRolloverDateRef = useRef<string | null>(null);

  useEffect(() => {
    const runIfNewDay = () => {
      const today = challengeDate();
      if (lastRolloverDateRef.current === today) return;
      lastRolloverDateRef.current = today;
      rolloverRef.current();
    };
    lastRolloverDateRef.current = null;
    runIfNewDay();
    const subscription = AppState.addEventListener('change', nextState => {
      if (nextState === 'active') runIfNewDay();
    });
    return () => subscription.remove();
  }, [userId]);

  const states: ChallengeReminderState[] = (challenges ?? []).map(challenge => ({
    challengeId: challenge.id,
    challengeName: challenge.name,
    mode: challenge.mode,
    status: challenge.status,
    notificationsEnabled: challenge.notificationsEnabled,
    loggedToday: challenge.loggedToday,
    atRisk: isChallengeAtRisk({
      mode: challenge.mode,
      freezesLeft: challenge.freezesLeft,
      weekPaceState: challenge.weekPaceState,
    }),
  }));

  // Everything the plan depends on, in one comparable value -- so an
  // unrelated refetch (progress, streak counters) does not churn the OS
  // notification queue.
  const signature = JSON.stringify(states);
  const statesRef = useRef(states);
  statesRef.current = states;

  useEffect(() => {
    if (challenges === undefined) return;
    void syncChallengeReminders(statesRef.current, lang);
  }, [signature, lang, challenges === undefined]);
}
