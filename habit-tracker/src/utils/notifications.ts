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

export async function scheduleChallengeReminder(challengeName: string): Promise<string | null> {
  try {
    const Notifications = await import('expo-notifications');
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') return null;
    return await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Habi 💪',
        body: `Đừng quên ghi nhận "${challengeName}" hôm nay!`,
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

export async function scheduleAllHabitReminders(times: (string | null)[]): Promise<void> {
  const Notifications = await import('expo-notifications');
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return;
  await Notifications.cancelAllScheduledNotificationsAsync();
  for (const t of times) {
    if (!t) continue;
    const parsed = parseNotificationTime(t);
    if (!parsed) continue;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Habi 💪',
        body: 'Time to log your tasks!',
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: parsed.hours,
        minute: parsed.minutes,
      },
    });
  }
}
