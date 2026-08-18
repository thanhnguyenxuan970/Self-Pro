import type { SQLiteDatabase } from 'expo-sqlite';
jest.mock('expo-notifications', () => ({
  cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/db/client', () => ({ getDb: jest.fn() }));
jest.mock('@tanstack/react-query', () => ({
  useMutation: jest.fn((options) => options),
  useQueryClient: jest.fn(() => ({ invalidateQueries: jest.fn() })),
}));
import * as Notifications from 'expo-notifications';
import { getDb } from '../src/db/client';
import { deleteChallengeById, useDeleteChallenge } from '../src/queries/useChallenge';

function createDeleteDb(config: {
  challenge: { status: 'active' | 'done' | 'failed'; completed_at: string | null; notification_id?: string | null } | null;
  rewardRow?: { id: number; week_start: string; stars_delta: number; candidate_count?: number } | null;
  failOnSql?: string;
}) {
  const getFirstAsync = jest.fn(async (sql: string) => {
    if (sql.includes('FROM challenges WHERE id = ? AND user_id = ?')) return config.challenge;
    if (sql.includes("FROM activity_log") && sql.includes("source = 'CHALLENGE'")) return config.rewardRow ?? null;
    return null;
  });
  const runAsync = jest.fn(async (sql: string) => {
    if (config.failOnSql && sql.includes(config.failOnSql)) throw new Error('SQL_DELETE_FAILED');
    return { changes: 1 };
  });
  return { getFirstAsync, runAsync } as unknown as SQLiteDatabase;
}

describe('deleteChallengeById', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('deletes an active challenge and returns its queued reminder for post-commit cancellation', async () => {
    const db = createDeleteDb({
      challenge: { status: 'active', completed_at: null, notification_id: 'challenge-reminder-active' },
    });

    await expect(deleteChallengeById(db, 5, 10)).resolves.toBe('challenge-reminder-active');

    expect(Notifications.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
    expect(db.runAsync).toHaveBeenCalledWith('DELETE FROM challenge_days WHERE challenge_id = ?', [10]);
    expect(db.runAsync).toHaveBeenCalledWith('DELETE FROM challenge_log WHERE challenge_id = ?', [10]);
    expect(db.runAsync).toHaveBeenCalledWith('DELETE FROM challenges WHERE id = ? AND user_id = ?', [10, 5]);
  });

  it('removes a completed challenge and rolls back its completion reward', async () => {
    const db = createDeleteDb({
      challenge: { status: 'done', completed_at: '2026-07-03' },
      rewardRow: { id: 77, week_start: '2026-06-29', stars_delta: 3 },
    });

    await deleteChallengeById(db, 5, 11);

    expect(db.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE weekly_summary'),
      [3, 5, '2026-06-29'],
    );
    expect(db.runAsync).not.toHaveBeenCalledWith(
      expect.stringContaining('reward_unlocks'),
      expect.anything(),
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

  it('does not cancel the queued reminder when database deletion fails', async () => {
    const db = createDeleteDb({
      challenge: { status: 'active', completed_at: null, notification_id: 'challenge-reminder-active' },
      failOnSql: 'DELETE FROM challenges',
    });

    await expect(deleteChallengeById(db, 5, 13)).rejects.toThrow('SQL_DELETE_FAILED');

    expect(Notifications.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
  });

  it('cancels queued reminders only after the SQLite transaction commits', async () => {
    const events: string[] = [];
    const txn = createDeleteDb({
      challenge: { status: 'active', completed_at: null, notification_id: 'challenge-reminder-active' },
    });
    const db = {
      withExclusiveTransactionAsync: jest.fn(async (callback: (value: SQLiteDatabase) => Promise<void>) => {
        events.push('transaction-start');
        await callback(txn);
        events.push('commit');
      }),
    } as unknown as SQLiteDatabase;
    jest.mocked(getDb).mockResolvedValue(db);
    jest.mocked(Notifications.cancelScheduledNotificationAsync).mockImplementation(async () => {
      events.push('cancel');
    });

    const mutation = useDeleteChallenge(5) as unknown as { mutationFn: (challengeId: number) => Promise<void> };
    await mutation.mutationFn(14);

    expect(events).toEqual(['transaction-start', 'commit', 'cancel']);
  });

  it('refuses to guess which legacy reward belongs to a challenge when candidates are ambiguous', async () => {
    const db = createDeleteDb({
      challenge: { status: 'done', completed_at: '2026-07-03' },
      rewardRow: { id: 88, week_start: '2026-06-29', stars_delta: 3, candidate_count: 2 },
    });

    await expect(deleteChallengeById(db, 5, 15)).rejects.toThrow('AMBIGUOUS_CHALLENGE_REWARD');

    expect(db.runAsync).not.toHaveBeenCalled();
  });
});
