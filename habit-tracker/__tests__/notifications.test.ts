jest.mock('expo-notifications', () => ({
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  getAllScheduledNotificationsAsync: jest.fn().mockResolvedValue([]),
  scheduleNotificationAsync: jest.fn().mockResolvedValue('scheduled'),
  cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
  cancelAllScheduledNotificationsAsync: jest.fn().mockResolvedValue(undefined),
  SchedulableTriggerInputTypes: { DAILY: 'daily', DATE: 'date' },
}));

import {
  cancelChallengeReminders,
  activateChallengeReminderSync,
  invalidateChallengeReminderSync,
  parseNotificationTime,
  scheduleAllHabitReminders,
  syncChallengeReminders,
} from '../src/utils/notifications';
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

describe('scheduleAllHabitReminders', () => {
  beforeEach(() => jest.clearAllMocks());

  // Regression guard: habit reminders must never call
  // cancelAllScheduledNotificationsAsync, which would silently wipe an
  // unrelated Challenge reminder scheduled by the central state-aware sync.
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
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('habit-reminder-0');
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('habit-reminder-1');
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('habit-reminder-2');
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  test('passive rehydration reads granted permission without reopening the Android dialog', async () => {
    const ok = await scheduleAllHabitReminders(['08:00', null, null], 'en', { requestPermission: false });

    expect(ok).toBe(true);
    expect(Notifications.getPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  test('passive rehydration does not request again after permission is denied', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValueOnce({ status: 'denied' });

    const ok = await scheduleAllHabitReminders(['08:00', null, null], 'en', { requestPermission: false });

    expect(ok).toBe(false);
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });
});

describe('state-aware Challenge reminders', () => {
  const baseState = {
    challengeId: 7,
    challengeName: 'Read',
    mode: 'streak' as const,
    status: 'active' as const,
    notificationsEnabled: true,
    loggedToday: false,
    freezesLeft: 1,
    weekPaceState: null,
    weekEnd: null,
    today: '2026-08-21',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    activateChallengeReminderSync();
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([]);
    (Notifications.scheduleNotificationAsync as jest.Mock).mockResolvedValue('scheduled');
  });

  test('uses one-shot DATE slots and deterministic challenge identifiers', async () => {
    const result = await syncChallengeReminders([baseState], 'en', {
      now: new Date(2026, 7, 21, 8, 0, 0, 0),
      storedNotificationIds: new Map([[7, null]]),
    });

    expect(result.granted).toBe(true);
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(expect.objectContaining({
      identifier: 'habi-ch-7-normal-2026-08-21',
      trigger: expect.objectContaining({ type: 'date', date: new Date(2026, 7, 21, 20, 0, 0, 0) }),
    }));
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalledWith(expect.objectContaining({
      trigger: expect.objectContaining({ type: 'daily' }),
    }));
  });

  test('does not schedule account reminders after the owning lifecycle is invalidated', async () => {
    const result = await syncChallengeReminders([baseState], 'en', {
      now: new Date(2026, 7, 21, 8, 0, 0, 0),
      isActive: () => false,
    });

    expect(result.scheduled).toBe(0);
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  test('serializes sign-out cancellation behind an in-flight schedule', async () => {
    let releaseSchedule!: () => void;
    const scheduleStarted = new Promise<void>(resolve => {
      (Notifications.scheduleNotificationAsync as jest.Mock).mockImplementationOnce(() => {
        return new Promise<string>(resolveSchedule => {
          releaseSchedule = () => resolveSchedule('scheduled');
          resolve();
        });
      });
    });
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ identifier: 'habi-ch-7-normal-2026-08-21' }]);

    const syncing = syncChallengeReminders([baseState], 'en', {
      now: new Date(2026, 7, 21, 8, 0, 0, 0),
      forceReschedule: true,
    });
    await scheduleStarted;

    invalidateChallengeReminderSync();
    const cancelling = cancelChallengeReminders(['habi-ch-7-']);
    expect(Notifications.cancelScheduledNotificationAsync).not.toHaveBeenCalled();

    releaseSchedule();
    await syncing;
    await cancelling;

    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('habi-ch-7-normal-2026-08-21');
    expect((Notifications.cancelScheduledNotificationAsync as jest.Mock).mock.invocationCallOrder[0])
      .toBeGreaterThan((Notifications.scheduleNotificationAsync as jest.Mock).mock.invocationCallOrder[0]);
  });

  test('includes the logical consequence date in the localized outcome body', async () => {
    await syncChallengeReminders([{ ...baseState, freezesLeft: 0 }], 'en', {
      now: new Date(2026, 7, 21, 8, 0, 0, 0),
    });

    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(expect.objectContaining({
      identifier: 'habi-ch-7-outcome-2026-08-22',
      content: expect.objectContaining({
        body: 'Your "Read" streak stopped on 2026-08-21. Start again?',
      }),
    }));
  });

  test('logged state cancels the queued Challenge slot', async () => {
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([
      { identifier: 'habi-ch-7-normal-2026-08-21' },
    ]);

    await syncChallengeReminders([{ ...baseState, loggedToday: true }], 'en', {
      now: new Date(2026, 7, 21, 18, 0, 0, 0),
      storedNotificationIds: new Map([[7, 'habi-ch-7-']]),
    });

    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('habi-ch-7-normal-2026-08-21');
  });

  test('force reschedule re-arms persisted slots after Android clears its alarms', async () => {
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([
      { identifier: 'habi-ch-7-normal-2026-08-21' },
    ]);

    await syncChallengeReminders([baseState], 'en', {
      now: new Date(2026, 7, 21, 8, 0, 0, 0),
      forceReschedule: true,
    });

    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(expect.objectContaining({
      identifier: 'habi-ch-7-normal-2026-08-21',
    }));
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('habi-ch-7-normal-2026-08-21');
  });

  test('permission revocation clears the owned queue and reports denied', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([
      { identifier: 'habi-ch-7-normal-2026-08-21' },
    ]);

    const result = await syncChallengeReminders([baseState], 'en', {
      storedNotificationIds: new Map([[7, 'habi-ch-7-']]),
    });

    expect(result.granted).toBe(false);
    expect(result.challengeTokens.get(7)).toBeNull();
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('habi-ch-7-normal-2026-08-21');
  });

  test('prefix cancellation scans the OS queue once for a batch', async () => {
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([
      { identifier: 'habi-ch-1-normal-2026-08-21' },
      { identifier: 'habi-ch-2-outcome-2026-08-22' },
    ]);

    await cancelChallengeReminders(['habi-ch-1-', 'habi-ch-2-']);

    expect(Notifications.getAllScheduledNotificationsAsync).toHaveBeenCalledTimes(1);
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(2);
  });

  test('swallows Expo Notifications import failures while cancelling reminders', async () => {
    jest.resetModules();
    jest.doMock('expo-notifications', () => {
      throw new Error('native notification module unavailable');
    });

    try {
      const { cancelChallengeReminders: cancel } = await import('../src/utils/notifications');
      await expect(cancel(['legacy-reminder'])).resolves.toBe(0);
    } finally {
      jest.dontMock('expo-notifications');
      jest.resetModules();
    }
  });
});
