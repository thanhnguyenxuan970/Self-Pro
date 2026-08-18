import AsyncStorage from '@react-native-async-storage/async-storage';

// habi_survey_d0_v1 is the permanent "already shown" latch — written exactly
// once, the moment the sheet actually becomes visible (not on submit, not on
// skip-vs-submit — those are indistinguishable here on purpose, see the
// survey doc's point 4: re-showing it on every subsequent first-ever-log-of-
// the-session would be exactly the kind of nag that costs an app its D7s).
export const SURVEY_D0_SHOWN_KEY = 'habi_survey_d0_v1';
// pending_survey_d0 is a short-lived intermediate flag: set the instant
// useLogTask detects the user's very first-ever log, read back on
// TodayScreen mount so the survey still surfaces even if the log happened
// while Today wasn't mounted (e.g. logged via the FAB from another tab).
const PENDING_KEY = 'pending_survey_d0';

/** Called from useLogTask's onSuccess when this was the user's first-ever log. */
export async function markSurveyD0Pending(): Promise<void> {
  const shown = await AsyncStorage.getItem(SURVEY_D0_SHOWN_KEY);
  if (shown !== null) return;
  await AsyncStorage.setItem(PENDING_KEY, 'true');
}

/** True when the survey is due and hasn't been shown yet. Safe to call anytime. */
export async function readSurveyD0Pending(): Promise<boolean> {
  const [pending, shown] = await Promise.all([
    AsyncStorage.getItem(PENDING_KEY),
    AsyncStorage.getItem(SURVEY_D0_SHOWN_KEY),
  ]);
  return pending === 'true' && shown === null;
}

/** Latches the shown-once flag and clears the intermediate pending flag.
 *  Call this the instant the sheet becomes visible, not when it's submitted. */
export async function markSurveyD0Shown(): Promise<void> {
  await AsyncStorage.setItem(SURVEY_D0_SHOWN_KEY, 'shown');
  await AsyncStorage.removeItem(PENDING_KEY);
}
