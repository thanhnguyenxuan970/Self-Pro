import type { SQLiteDatabase } from 'expo-sqlite';

jest.mock('../src/db/client', () => ({ getDb: jest.fn() }));

import { logActiveChallengeDay } from '../src/queries/useChallenge';

type LinkedChallengeConfig = {
  id: number; task_type_id: number; target_days: number; mode?: 'streak' | 'weekly';
  start_date?: string; min_duration?: number | null; min_count?: number | null;
};

function createLinkedLogDayDb(config: {
  challenge: LinkedChallengeConfig | null;
  activityRows?: { local_date: string; duration_min: number | null }[];
}) {
  const getFirstAsync = jest.fn(async (sql: string) => {
    if (sql.includes('FROM challenges') && sql.includes("status = 'active'")) return config.challenge;
    return null;
  });
  const getAllAsync = jest.fn(async (sql: string) => {
    if (sql.includes('FROM activity_log')) return config.activityRows ?? [];
    if (sql.includes('FROM tiers ORDER BY stars_required ASC')) return [];
    if (sql.includes('FROM reward_unlocks WHERE user_id = ? AND week_start = ?')) return [];
    return [];
  });
  const runAsync = jest.fn(async () => ({ changes: 1 }));
  return { getFirstAsync, getAllAsync, runAsync } as unknown as SQLiteDatabase;
}

function createManualLogDayDb(config: {
  challenge: { id: number; task_type_id: null; target_days: number; mode?: 'streak' } | null;
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

describe('logActiveChallengeDay -- linked challenges (task_type_id set)', () => {
  it('derives completion from activity_log query-time -- no challenge_log/challenge_days write', async () => {
    const db = createLinkedLogDayDb({
      challenge: { id: 7, task_type_id: 42, target_days: 30, mode: 'streak', start_date: '2026-06-01' },
      activityRows: [
        { local_date: '2026-07-04', duration_min: 20 },
        { local_date: '2026-07-05', duration_min: 20 },
        { local_date: '2026-07-06', duration_min: 20 },
      ],
    });

    const result = await logActiveChallengeDay(db, {
      userId: 5,
      localDate: '2026-07-06',
      taskTypeId: 42,
    });

    expect(result).toBe('logged');
    expect(db.runAsync).not.toHaveBeenCalledWith(
      `INSERT INTO challenge_log (challenge_id, local_date, state) VALUES (?, ?, 'done')`,
      expect.anything(),
    );
    expect(db.runAsync).not.toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO challenge_days'),
      expect.anything(),
    );
    expect(db.runAsync).toHaveBeenCalledWith(
      `UPDATE challenges SET streak_current = ? WHERE id = ?`,
      [3, 7],
    );
  });

  it('re-logging the same day is naturally idempotent -- no duplicate-day counting, no special-case guard needed', async () => {
    const db = createLinkedLogDayDb({
      challenge: { id: 8, task_type_id: 42, target_days: 30, mode: 'streak', start_date: '2026-07-06' },
      activityRows: [
        { local_date: '2026-07-06', duration_min: 5 },
        { local_date: '2026-07-06', duration_min: 5 }, // second log same day
      ],
    });

    const result = await logActiveChallengeDay(db, { userId: 5, localDate: '2026-07-06', taskTypeId: 42 });

    expect(result).toBe('logged');
    expect(db.runAsync).toHaveBeenCalledWith(
      `UPDATE challenges SET streak_current = ? WHERE id = ?`,
      [1, 8], // one done-date, not two
    );
  });

  it('a log short of min_duration does not count the day as done', async () => {
    const db = createLinkedLogDayDb({
      challenge: { id: 9, task_type_id: 42, target_days: 30, mode: 'streak', start_date: '2026-07-06', min_duration: 10 },
      activityRows: [{ local_date: '2026-07-06', duration_min: 2 }],
    });

    const result = await logActiveChallengeDay(db, { userId: 5, localDate: '2026-07-06', taskTypeId: 42 });

    expect(result).toBe('logged');
    expect(db.runAsync).toHaveBeenCalledWith(
      `UPDATE challenges SET streak_current = ? WHERE id = ?`,
      [0, 9],
    );
  });

  it('excludes clock-suspect rows from the activity_log query used for derivation', async () => {
    const db = createLinkedLogDayDb({
      challenge: { id: 11, task_type_id: 42, target_days: 30, mode: 'streak', start_date: '2026-07-06' },
      activityRows: [{ local_date: '2026-07-06', duration_min: 10 }],
    });

    await logActiveChallengeDay(db, { userId: 5, localDate: '2026-07-06', taskTypeId: 42 });

    expect(db.getAllAsync).toHaveBeenCalledWith(
      expect.stringContaining('is_clock_suspect = 0'),
      expect.anything(),
    );
  });

  it('weekly-mode linked challenges never complete inline -- completion is rollover-only', async () => {
    const db = createLinkedLogDayDb({
      challenge: { id: 10, task_type_id: 42, target_days: 28, mode: 'weekly', start_date: '2026-07-06' },
      activityRows: Array.from({ length: 28 }, (_, i) => ({ local_date: `2026-08-${String(i + 1).padStart(2, '0')}`, duration_min: 10 })),
    });

    await logActiveChallengeDay(db, { userId: 5, localDate: '2026-07-06', taskTypeId: 42 });

    expect(db.runAsync).not.toHaveBeenCalledWith(
      expect.stringContaining(`SET status = 'done'`),
      expect.anything(),
    );
  });
});

describe('logActiveChallengeDay -- manual challenges (task_type_id null)', () => {
  it('logs once and writes challenge_log/challenge_days as before', async () => {
    const db = createManualLogDayDb({
      challenge: { id: 7, task_type_id: null, target_days: 30 },
      doneCount: 3,
      streakCount: 3,
    });

    const result = await logActiveChallengeDay(db, { userId: 5, localDate: '2026-07-06' });

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
    const db = createManualLogDayDb({
      challenge: { id: 8, task_type_id: null, target_days: 30 },
      alreadyLogged: true,
    });

    const result = await logActiveChallengeDay(db, { userId: 5, localDate: '2026-07-06' });

    expect(result).toBe('already_logged');
    expect(db.runAsync).not.toHaveBeenCalledWith(
      `INSERT INTO challenge_log (challenge_id, local_date, state) VALUES (?, ?, 'done')`,
      expect.anything(),
    );
  });

  it('does nothing when there is no active challenge', async () => {
    const db = createManualLogDayDb({ challenge: null });

    const result = await logActiveChallengeDay(db, { userId: 5, localDate: '2026-07-06' });

    expect(result).toBe('no_active_challenge');
    expect(db.runAsync).not.toHaveBeenCalled();
  });
});
