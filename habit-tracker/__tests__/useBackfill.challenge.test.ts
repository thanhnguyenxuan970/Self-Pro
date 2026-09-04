import type { SQLiteDatabase } from 'expo-sqlite';

jest.mock('../src/db/client', () => ({ getDb: jest.fn() }));
jest.mock('../src/api/syncService', () => ({ syncCurrentUserToSupabase: jest.fn() }));
jest.mock('../src/game/lifetimeRankWrites', () => ({
  applyLifetimeStarsDelta: jest.fn(async () => ({ crossings: [] })),
}));
jest.mock('../src/game/pendingLevelUpQueue', () => ({ enqueuePendingLevelUps: jest.fn() }));
jest.mock('../src/queries/useChallenge', () => ({
  logActiveChallengeDay: jest.fn(async () => ({ status: 'logged', lifetimeCrossings: [] })),
}));

import { logActiveChallengeDay } from '../src/queries/useChallenge';
import { runBackfillTx } from '../src/queries/useBackfill';

function createBackfillTxDb() {
  const getFirstAsync = jest.fn()
    .mockResolvedValueOnce({ best: 0 })
    .mockResolvedValueOnce({ n: 0 })
    .mockResolvedValueOnce({ n: 0 })
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce({ best: 1 });
  const getAllAsync = jest.fn(async () => [
    { local_date: '2026-06-17', total_points: 5 },
  ]);
  const runAsync = jest.fn(async (..._args: unknown[]) => ({ changes: 1 }));
  return { db: { getFirstAsync, getAllAsync, runAsync } as unknown as SQLiteDatabase, runAsync };
}

describe('runBackfillTx Challenge integration', () => {
  it('updates the linked Challenge from the backfilled task inside the same transaction', async () => {
    const { db } = createBackfillTxDb();

    await runBackfillTx(
      db,
      [{ taskTypeId: 42, kind: 'GOOD', isTimeBased: false, basePoints: 20, starPenalty: 0 }],
      5,
      '2026-06-17',
      '2026-06-15',
      '2026-06-15',
      '2026-06-19',
    );

    expect(logActiveChallengeDay).toHaveBeenCalledWith(db, {
      userId: 5,
      localDate: '2026-06-17',
      taskTypeId: 42,
    });
  });

  it('reconciles each task once for a multi-entry session and preserves Challenge tier crossings', async () => {
    const challengeSpy = jest.mocked(logActiveChallengeDay);
    const crossing = { tierId: 9, tierOrder: 9, rankName: 'Legend', starsAtCrossing: 999 };
    challengeSpy.mockReset().mockImplementation(async (_db, params) => ({
      status: 'logged',
      lifetimeCrossings: params.taskTypeId === 7 ? [crossing] : [],
    }));
    const { db, runAsync } = createBackfillTxDb();

    const result = await runBackfillTx(
      db,
      [
        { taskTypeId: 42, kind: 'GOOD', isTimeBased: false, basePoints: 20, starPenalty: 0 },
        { taskTypeId: 42, kind: 'GOOD', isTimeBased: false, basePoints: 20, starPenalty: 0 },
        { taskTypeId: 7, kind: 'BAD', isTimeBased: false, basePoints: 20, starPenalty: 1 },
      ],
      5,
      '2026-06-17',
      '2026-06-15',
      '2026-06-15',
      '2026-06-19',
    );

    expect(challengeSpy.mock.calls.map(([, params]) => params.taskTypeId)).toEqual([42, 7]);
    expect(result.lifetimeCrossings).toEqual([crossing]);
    expect(runAsync.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO activity_log'))).toHaveLength(3);
  });

  it('keeps the Challenge reconciliation bounded for a 500-entry stress session', async () => {
    const challengeSpy = jest.mocked(logActiveChallengeDay);
    challengeSpy.mockReset().mockResolvedValue({ status: 'logged', lifetimeCrossings: [] });
    const { db, runAsync } = createBackfillTxDb();
    const entries = Array.from({ length: 500 }, (_, index) => ({
      taskTypeId: (index % 25) + 1,
      kind: 'GOOD' as const,
      isTimeBased: false,
      basePoints: 20,
      starPenalty: 0,
    }));

    await runBackfillTx(
      db,
      entries,
      5,
      '2026-06-17',
      '2026-06-15',
      '2026-06-15',
      '2026-06-19',
    );

    // Two DAILY_BONUS rows are expected as the cumulative session crosses the
    // first two daily thresholds; all 500 task rows still reach the writer.
    expect(runAsync.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO activity_log'))).toHaveLength(502);
    expect(challengeSpy).toHaveBeenCalledTimes(25);
  });
});
