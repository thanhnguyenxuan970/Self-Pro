import type { SQLiteDatabase } from 'expo-sqlite';

jest.mock('../src/db/client', () => ({ getDb: jest.fn() }));
jest.mock('../src/utils/notifications', () => ({
  cancelChallengeReminder: jest.fn(),
  scheduleChallengeReminder: jest.fn(async () => 'replacement-reminder'),
}));
jest.mock('../src/game/lifetimeRankWrites', () => ({
  applyLifetimeStarsDelta: jest.fn(async () => ({ crossings: [] })),
}));

import { reconcileUnloggedLinkedChallenges, restoreReactivatedChallengeReminders } from '../src/queries/useChallenge';
import { cancelChallengeReminder, scheduleChallengeReminder } from '../src/utils/notifications';

describe('reconcileUnloggedLinkedChallenges', () => {
  it('schedules a new reminder only for the Challenge reactivated by a Daily uncheck', async () => {
    const runAsync = jest.fn(async () => ({ changes: 1 }));
    const db = { runAsync } as unknown as SQLiteDatabase;

    await restoreReactivatedChallengeReminders(db, [
      { id: 17, name: 'Read', mode: 'streak', notificationsEnabled: true, reminderToken: 'reactivation:17:1', previousNotificationId: 'terminal-reminder' },
      { id: 18, name: 'Silent', mode: 'streak', notificationsEnabled: false, reminderToken: null, previousNotificationId: null },
    ], 'en');

    expect(scheduleChallengeReminder).toHaveBeenCalledWith('Read', 'streak', 'en');
    expect(cancelChallengeReminder).toHaveBeenCalledWith('terminal-reminder');
    expect(runAsync).toHaveBeenCalledWith(
      "UPDATE challenges SET notification_id = ? WHERE id = ? AND status = 'active' AND notification_id = ?",
      ['replacement-reminder', 17, 'reactivation:17:1'],
    );
    expect(runAsync).not.toHaveBeenCalledWith(
      "UPDATE challenges SET notification_id = ? WHERE id = ? AND status = 'active' AND notification_id = ?",
      [expect.anything(), 18],
    );
  });

  it('cancels the replacement reminder when the Challenge was re-completed before it could be saved', async () => {
    const runAsync = jest.fn(async () => ({ changes: 0 }));
    const db = { runAsync } as unknown as SQLiteDatabase;

    await restoreReactivatedChallengeReminders(db, [
      { id: 17, name: 'Read', mode: 'streak', notificationsEnabled: true, reminderToken: 'reactivation:17:1', previousNotificationId: null },
    ], 'en');

    expect(cancelChallengeReminder).toHaveBeenCalledWith('replacement-reminder');
  });

  it('does not reopen a completed weekly Challenge from a Daily uncheck', async () => {
    const getAllAsync = jest.fn(async (sql: string) => {
      if (sql.includes("status = 'done'") && sql.includes('task_type_id = ?')) {
        if (sql.includes("mode = 'streak'")) return [];
        return [{
          id: 18,
          task_type_id: 42,
          target_days: 7,
          mode: 'weekly',
          start_date: '2026-08-11',
          min_duration: null,
          min_count: null,
        }];
      }
      if (sql.includes('FROM activity_log') && sql.includes('source != \'CHALLENGE\'')) return [];
      return [];
    });
    const runAsync = jest.fn(async () => ({ changes: 1 }));
    const db = { getAllAsync, getFirstAsync: jest.fn(), runAsync } as unknown as SQLiteDatabase;

    await reconcileUnloggedLinkedChallenges(db, { userId: 5, taskTypeId: 42, localDate: '2026-08-17' });

    expect(runAsync).not.toHaveBeenCalled();
  });

  it('reopens a linked Challenge and reverses its completion reward when its final Daily activity is unchecked', async () => {
    const getAllAsync = jest.fn(async (sql: string) => {
      if (sql.includes("status = 'done'") && sql.includes('task_type_id = ?')) {
        return [{
          id: 17,
          task_type_id: 42,
          target_days: 3,
          start_date: '2026-08-15',
          min_duration: null,
          min_count: null,
        }];
      }
      if (sql.includes('FROM activity_log') && sql.includes('source != \'CHALLENGE\'')) return [];
      if (sql.includes('FROM tiers ORDER BY stars_required ASC')) return [];
      return [];
    });
    const getFirstAsync = jest.fn(async (sql: string) => {
      if (sql.includes("source = 'CHALLENGE'") && sql.includes('note = ?')) {
        return { id: 91, week_start: '2026-08-17', stars_delta: 3 };
      }
      return null;
    });
    const runAsync = jest.fn(async () => ({ changes: 1 }));
    const db = { getAllAsync, getFirstAsync, runAsync } as unknown as SQLiteDatabase;

    await reconcileUnloggedLinkedChallenges(db, { userId: 5, taskTypeId: 42, localDate: '2026-08-17' });

    expect(runAsync).toHaveBeenCalledWith(
      expect.stringContaining("SET status = 'active', completed_at = NULL, streak_current = ?"),
      expect.arrayContaining([0, 17, 5]),
    );
    expect(runAsync).toHaveBeenCalledWith(
      expect.stringContaining('weekly_stars = MAX(0, weekly_stars - ?)'),
      [3, 5, '2026-08-17'],
    );
    expect(runAsync).toHaveBeenCalledWith('DELETE FROM activity_log WHERE id = ? AND user_id = ?', [91, 5]);
    expect(runAsync).toHaveBeenCalledWith(
      expect.stringContaining('treat_stars_lifetime = MAX(0, treat_stars_lifetime - ?)'),
      [3, 3, 5],
    );
    expect(runAsync).toHaveBeenCalledWith(
      "DELETE FROM achievements WHERE user_id = ? AND source_type = 'challenge' AND source_id = ?",
      [5, 17],
    );
  });

  it('reverses a legacy completion reward without a challenge note', async () => {
    const getAllAsync = jest.fn(async (sql: string) => {
      if (sql.includes("status = 'done'") && sql.includes('task_type_id = ?')) {
        return [{ id: 19, name: 'Read', task_type_id: 42, target_days: 3, mode: 'streak', start_date: '2026-08-15', min_duration: null, min_count: null, notifications_enabled: 0 }];
      }
      if (sql.includes('FROM activity_log') && sql.includes('source != \'CHALLENGE\'')) return [];
      if (sql.includes('FROM tiers ORDER BY stars_required ASC')) return [];
      return [];
    });
    const getFirstAsync = jest.fn(async (sql: string) => (
      sql.includes('reward.note IS NULL') ? { id: 92, week_start: '2026-08-17', stars_delta: 3 } : null
    ));
    const runAsync = jest.fn(async () => ({ changes: 1 }));
    const db = { getAllAsync, getFirstAsync, runAsync } as unknown as SQLiteDatabase;

    await reconcileUnloggedLinkedChallenges(db, { userId: 5, taskTypeId: 42, localDate: '2026-08-17' });

    expect(runAsync).toHaveBeenCalledWith(
      expect.stringContaining('weekly_stars = MAX(0, weekly_stars - ?)'),
      [3, 5, '2026-08-17'],
    );
    expect(runAsync).toHaveBeenCalledWith('DELETE FROM activity_log WHERE id = ? AND user_id = ?', [92, 5]);
  });
});
