import { AppLanguage, getTranslations } from '../config/i18n';

export function parseNotificationTime(input: string): { hours: number; minutes: number } | null {
  const match = input.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  if (hours > 23) return null;
  if (minutes > 59) return null;
  return { hours, minutes };
}

const CHALLENGE_REMINDER_HOUR = 20;
const CHALLENGE_REMINDER_MINUTE = 0;

export async function scheduleChallengeReminder(challengeName: string, mode: 'streak' | 'weekly', lang: AppLanguage): Promise<string | null> {
  try {
    const Notifications = await import('expo-notifications');
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') return null;
    return await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Habi 💪',
        body: getTranslations(lang).challengeReminderNotifBody(challengeName),
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: CHALLENGE_REMINDER_HOUR,
        minute: CHALLENGE_REMINDER_MINUTE,
      },
    });
  } catch {
    return null;
  }
}

export async function cancelChallengeReminder(notificationId: string | null | undefined): Promise<void> {
  if (!notificationId) return;
  const Notifications = await import('expo-notifications');
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  } catch {}
}

// Stable, predictable identifiers so cancelling/rescheduling habit reminders
// only ever touches habit-reminder slots -- never a Challenge reminder
// scheduled separately via scheduleChallengeReminder (both share the same OS
// notification-scheduling namespace).
const HABIT_REMINDER_IDS = ['habit-reminder-0', 'habit-reminder-1', 'habit-reminder-2'];

export async function scheduleAllHabitReminders(times: (string | null)[], lang: AppLanguage): Promise<boolean> {
  const Notifications = await import('expo-notifications');
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return false;
  await Promise.all(HABIT_REMINDER_IDS.map(id => Notifications.cancelScheduledNotificationAsync(id).catch(() => {})));
  for (let i = 0; i < times.length; i += 1) {
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
}
