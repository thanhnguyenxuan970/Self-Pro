import type { SQLiteDatabase } from 'expo-sqlite';

jest.mock('../src/db/client', () => ({ getDb: jest.fn() }));

import { logActiveChallengeDay } from '../src/queries/useChallenge';

function createLogDayDb(config: {
  challenge: { id: number; task_type_id: number | null; target_days: number } | null;
  alreadyLogged?: boolean;
  doneCount?: number;
  streakCount?: number;
}) {
  const getFirstAsync = jest.fn(async (sql: string) => {
    if (sql.includes('FROM challenges') && sql.includes("status = 'active'")) return config.challenge;
    if (sql.includes('FROM challenge_log WHERE challenge_id = ? AND local_date = ?')) {
      return config.alreadyLogged ? { id: 99 } : null;
    }
    if (sql.includes("COUNT(*) AS n FROM challenge_log") && sql.includes("state = 'done'")) {
      return { n: config.doneCount ?? 1 };
    }
    if (sql.includes("COUNT(*) AS n FROM challenge_log") && sql.includes("state != 'reset'")) {
      return { n: config.streakCount ?? config.doneCount ?? 1 };
    }
    return null;
  });
  const getAllAsync = jest.fn(async (sql: string) => {
    if (sql.includes('FROM tiers ORDER BY stars_required ASC')) return [];
    if (sql.includes('FROM reward_unlocks WHERE user_id = ? AND week_start = ?')) return [];
    return [];
  });
  const runAsync = jest.fn(async () => ({ changes: 1 }));
  return { getFirstAsync, getAllAsync, runAsync } as unknown as SQLiteDatabase;
}

describe('logActiveChallengeDay', () => {
  it('logs the matched active challenge once when a task check-in syncs to challenge', async () => {
    const db = createLogDayDb({
      challenge: { id: 7, task_type_id: 42, target_days: 30 },
      doneCount: 3,
      streakCount: 3,
    });

    const result = await logActiveChallengeDay(db, {
      userId: 5,
      localDate: '2026-07-06',
      taskTypeId: 42,
    });

    expect(result).toBe('logged');
    expect(db.runAsync).toHaveBeenCalledWith(
      `INSERT INTO challenge_log (challenge_id, local_date, state) VALUES (?, ?, 'done')`,
      [7, '2026-07-06'],
    );
    expect(db.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO challenge_days'),
      [7, '2026-07-06', expect.any(Number)],
    );
    expect(db.runAsync).toHaveBeenCalledWith(
      `UPDATE challenges SET streak_current = ? WHERE id = ?`,
      [3, 7],
    );
  });

  it('skips duplicate sync when the challenge already has today logged', async () => {
    const db = createLogDayDb({
      challenge: { id: 8, task_type_id: 42, target_days: 30 },
      alreadyLogged: true,
    });

    const result = await logActiveChallengeDay(db, {
      userId: 5,
      localDate: '2026-07-06',
      taskTypeId: 42,
    });

    expect(result).toBe('already_logged');
    expect(db.runAsync).not.toHaveBeenCalledWith(
      `INSERT INTO challenge_log (challenge_id, local_date, state) VALUES (?, ?, 'done')`,
      expect.anything(),
    );
  });

  it('does nothing when the active challenge is linked to a different task', async () => {
    const db = createLogDayDb({ challenge: null });

    const result = await logActiveChallengeDay(db, {
      userId: 5,
      localDate: '2026-07-06',
      taskTypeId: 42,
    });

    expect(result).toBe('no_active_challenge');
    expect(db.runAsync).not.toHaveBeenCalled();
  });
});
