export function parseNotificationTime(input: string): { hours: number; minutes: number } | null {
  const match = input.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  if (hours > 23) return null;
  if (minutes > 59) return null;
  return { hours, minutes };
}

export async function scheduleHabitReminder(timeStr: string): Promise<void> {
  const parsed = parseNotificationTime(timeStr);
  if (!parsed) throw new Error(`Invalid time: ${timeStr}`);
  const Notifications = await import('expo-notifications');
  await Notifications.cancelAllScheduledNotificationsAsync();
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Habit Tracker 💪',
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

export async function cancelHabitReminder(): Promise<void> {
  const Notifications = await import('expo-notifications');
  await Notifications.cancelAllScheduledNotificationsAsync();
}

export async function scheduleAllHabitReminders(times: (string | null)[]): Promise<void> {
  const Notifications = await import('expo-notifications');
  await Notifications.cancelAllScheduledNotificationsAsync();
  for (const t of times) {
    if (!t) continue;
    const parsed = parseNotificationTime(t);
    if (!parsed) continue;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Habit Tracker 💪',
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
