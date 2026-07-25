import type { SQLiteDatabase } from 'expo-sqlite';
jest.mock('../src/db/client', () => ({ getDb: jest.fn() }));
import { deleteChallengeById } from '../src/queries/useChallenge';

function createDeleteDb(config: {
  challenge: { status: 'active' | 'done' | 'failed'; completed_at: string | null } | null;
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
