jest.mock('expo-notifications', () => ({
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  scheduleNotificationAsync: jest.fn().mockResolvedValue('scheduled'),
  cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
  cancelAllScheduledNotificationsAsync: jest.fn().mockResolvedValue(undefined),
  SchedulableTriggerInputTypes: { DAILY: 'daily' },
}));

import { parseNotificationTime, scheduleChallengeReminder, scheduleAllHabitReminders } from '../src/utils/notifications';
import * as Notifications from 'expo-notifications';

test('valid time returns hours and minutes', () => {
  expect(parseNotificationTime('08:30')).toEqual({ hours: 8, minutes: 30 });
});

test('single-digit hour is valid', () => {
  expect(parseNotificationTime('9:05')).toEqual({ hours: 9, minutes: 5 });
});

test('invalid format returns null', () => {
  expect(parseNotificationTime('8am')).toBeNull();
});

test('out-of-range hours returns null', () => {
  expect(parseNotificationTime('25:00')).toBeNull();
});

test('out-of-range minutes returns null', () => {
  expect(parseNotificationTime('08:61')).toBeNull();
});

test('weekly challenges schedule a daily reminder', async () => {
  await scheduleChallengeReminder('Read', 'weekly', 'en');

  expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(expect.objectContaining({
    trigger: expect.objectContaining({ type: 'daily', hour: 20, minute: 0 }),
  }));
});

test('streak challenges schedule a daily reminder', async () => {
  await scheduleChallengeReminder('Read', 'streak', 'en');

  expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(expect.objectContaining({
    trigger: expect.objectContaining({ type: 'daily', hour: 20, minute: 0 }),
  }));
});

test('reminder body text matches the requested language, not a hardcoded one', async () => {
  await scheduleChallengeReminder('Đọc sách', 'streak', 'vi');
  expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(expect.objectContaining({
    content: expect.objectContaining({ body: expect.stringContaining('Đọc sách') }),
  }));

  jest.clearAllMocks();
  (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
  await scheduleChallengeReminder('Read', 'streak', 'en');
  expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(expect.objectContaining({
    content: expect.objectContaining({ body: expect.stringMatching(/^Don't forget/) }),
  }));
});

describe('scheduleAllHabitReminders', () => {
  beforeEach(() => jest.clearAllMocks());

  // Regression guard: habit reminders must never call
  // cancelAllScheduledNotificationsAsync, which would silently wipe an
  // unrelated Challenge reminder scheduled via scheduleChallengeReminder.
  test('cancels only its own stable per-slot identifiers, never all notifications', async () => {
    const ok = await scheduleAllHabitReminders(['08:00', null, null], 'en');

    expect(ok).toBe(true);
    expect(Notifications.cancelAllScheduledNotificationsAsync).not.toHaveBeenCalled();
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('habit-reminder-0');
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('habit-reminder-1');
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('habit-reminder-2');
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(expect.objectContaining({
      identifier: 'habit-reminder-0',
      trigger: expect.objectContaining({ hour: 8, minute: 0 }),
    }));
  });

  test('returns false and schedules nothing when permission is denied', async () => {
    (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValueOnce({ status: 'denied' });

    const ok = await scheduleAllHabitReminders(['08:00', null, null], 'en');

    expect(ok).toBe(false);
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });
});
