import type { SQLiteDatabase } from 'expo-sqlite';
jest.mock('expo-notifications', () => ({
  cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/db/client', () => ({ getDb: jest.fn() }));
import * as Notifications from 'expo-notifications';
import { deleteChallengeById, deleteChallengesById } from '../src/queries/useChallenge';

function createDeleteDb(config: {
  challenge: { status: 'active' | 'done' | 'failed'; completed_at: string | null; notification_id?: string | null } | null;
  rewardRow?: { id: number; week_start: string; stars_delta: number } | null;
  weeklyRow?: { weekly_stars: number } | null;
}) {
  const getFirstAsync = jest.fn(async (sql: string) => {
    if (sql.includes('FROM challenges WHERE id = ? AND user_id = ?')) return config.challenge;
    if (sql.includes("FROM activity_log") && sql.includes("source = 'CHALLENGE'")) return config.rewardRow ?? null;
    if (sql.includes('FROM weekly_summary WHERE user_id = ? AND week_start = ?')) return config.weeklyRow ?? null;
    return null;
  });
  const runAsync = jest.fn(async () => ({ changes: 1 }));
  return { getFirstAsync, runAsync } as unknown as SQLiteDatabase;
}

describe('deleteChallengeById', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('deletes an active challenge and returns its queued reminder for post-commit cleanup', async () => {
    const db = createDeleteDb({
      challenge: { status: 'active', completed_at: null, notification_id: 'challenge-reminder-active' },
    });

    await expect(deleteChallengeById(db, 5, 10)).resolves.toBe('challenge-reminder-active');

    expect(Notifications.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
    expect(db.runAsync).toHaveBeenCalledWith('DELETE FROM challenge_days WHERE challenge_id = ?', [10]);
    expect(db.runAsync).toHaveBeenCalledWith('DELETE FROM challenge_log WHERE challenge_id = ?', [10]);
    expect(db.runAsync).toHaveBeenCalledWith('DELETE FROM challenges WHERE id = ? AND user_id = ?', [10, 5]);
  });

  it('returns no reminder when an active challenge had none scheduled', async () => {
    const db = createDeleteDb({
      challenge: { status: 'active', completed_at: null, notification_id: null },
    });

    await expect(deleteChallengeById(db, 5, 13)).resolves.toBeNull();

    expect(Notifications.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
    expect(db.runAsync).toHaveBeenCalledWith('DELETE FROM challenges WHERE id = ? AND user_id = ?', [13, 5]);
  });

  it('rejects a stale or cross-user challenge id without deleting related rows', async () => {
    const db = createDeleteDb({ challenge: null });

    await expect(deleteChallengeById(db, 5, 999)).rejects.toThrow('CHALLENGE_NOT_FOUND');

    expect(Notifications.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
    expect(db.runAsync).not.toHaveBeenCalled();
  });

  it('cancels queued reminders only after the exclusive delete transaction commits', async () => {
    const txn = createDeleteDb({
      challenge: { status: 'active', completed_at: null, notification_id: 'committed-reminder' },
    });
    let committed = false;
    const db = {
      withExclusiveTransactionAsync: jest.fn(async (callback: (inner: SQLiteDatabase) => Promise<void>) => {
        await callback(txn);
        committed = true;
      }),
    } as unknown as SQLiteDatabase;
    jest.mocked(Notifications.cancelScheduledNotificationAsync).mockImplementationOnce(async () => {
      expect(committed).toBe(true);
    });

    await deleteChallengesById(db, 5, [10]);

    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('committed-reminder');
  });

  it('does not cancel a reminder when a later SQL failure rolls the transaction back', async () => {
    const txn = createDeleteDb({
      challenge: { status: 'active', completed_at: null, notification_id: 'rollback-reminder' },
    });
    jest.mocked(txn.runAsync).mockImplementationOnce(async () => {
      throw new Error('SQLITE_BUSY');
    });
    const db = {
      withExclusiveTransactionAsync: jest.fn(async (callback: (inner: SQLiteDatabase) => Promise<void>) => callback(txn)),
    } as unknown as SQLiteDatabase;

    await expect(deleteChallengesById(db, 5, [10])).rejects.toThrow('SQLITE_BUSY');

    expect(Notifications.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
  });

  it('still completes committed deletion when the OS reminder is already unavailable', async () => {
    jest.mocked(Notifications.cancelScheduledNotificationAsync).mockRejectedValueOnce(new Error('NOT_FOUND'));
    const txn = createDeleteDb({
      challenge: { status: 'active', completed_at: null, notification_id: 'stale-reminder' },
    });
    const db = {
      withExclusiveTransactionAsync: jest.fn(async (callback: (inner: SQLiteDatabase) => Promise<void>) => callback(txn)),
    } as unknown as SQLiteDatabase;

    await expect(deleteChallengesById(db, 5, [14])).resolves.toBeUndefined();

    expect(txn.runAsync).toHaveBeenCalledWith('DELETE FROM challenges WHERE id = ? AND user_id = ?', [14, 5]);
  });

  it('removes a completed challenge and rolls back its completion reward', async () => {
    const db = createDeleteDb({
      challenge: { status: 'done', completed_at: '2026-07-03' },
      rewardRow: { id: 77, week_start: '2026-06-29', stars_delta: 3 },
      weeklyRow: { weekly_stars: 10 },
    });

    await deleteChallengeById(db, 5, 11);

    expect(db.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE weekly_summary'),
      [3, 5, '2026-06-29'],
    );
    expect(db.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM reward_unlocks'),
      [5, '2026-06-29', 7],
    );
    expect(db.runAsync).toHaveBeenCalledWith(
      'UPDATE users SET treat_stars = MAX(0, treat_stars - ?) WHERE id = ?',
      [3, 5],
    );
    expect(db.runAsync).toHaveBeenCalledWith(
      'DELETE FROM activity_log WHERE id = ? AND user_id = ?',
      [77, 5],
    );
    expect(db.runAsync).toHaveBeenCalledWith(
      `DELETE FROM achievements WHERE user_id = ? AND source_type = 'challenge' AND source_id = ?`,
      [5, 11],
    );
    expect(db.runAsync).toHaveBeenCalledWith('DELETE FROM challenge_days WHERE challenge_id = ?', [11]);
    expect(db.runAsync).toHaveBeenCalledWith('DELETE FROM challenge_log WHERE challenge_id = ?', [11]);
    expect(db.runAsync).toHaveBeenCalledWith('DELETE FROM challenges WHERE id = ? AND user_id = ?', [11, 5]);
  });

  it('deletes a failed challenge without touching completion reward rows', async () => {
    const db = createDeleteDb({
      challenge: { status: 'failed', completed_at: null },
    });

    await deleteChallengeById(db, 5, 12);

    expect(db.runAsync).not.toHaveBeenCalledWith(expect.stringContaining('UPDATE weekly_summary'), expect.anything());
    expect(db.runAsync).not.toHaveBeenCalledWith(expect.stringContaining('DELETE FROM reward_unlocks'), expect.anything());
    expect(db.runAsync).not.toHaveBeenCalledWith(expect.stringContaining('UPDATE users SET treat_stars'), expect.anything());
    expect(db.runAsync).toHaveBeenCalledWith('DELETE FROM challenges WHERE id = ? AND user_id = ?', [12, 5]);
  });
});
