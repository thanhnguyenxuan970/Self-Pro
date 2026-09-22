import type { SQLiteDatabase } from 'expo-sqlite';

(globalThis as { __DEV__?: boolean }).__DEV__ = true;

const mockGetDb = jest.fn();
const mockSyncCurrentUserToSupabase = jest.fn().mockResolvedValue(undefined);
const mockCancelTerminalChallengeReminders = jest.fn().mockResolvedValue(undefined);
const mockSyncActiveChallengeReminders = jest.fn().mockResolvedValue(undefined);
const mockLogActiveChallengeDay = jest.fn().mockResolvedValue({ status: 'logged', lifetimeCrossings: [] });
const mockApplyLifetimeStarsDelta = jest.fn().mockResolvedValue({ crossings: [] });
const mockEnqueuePendingLevelUps = jest.fn().mockResolvedValue(undefined);
const invalidateQueries = jest.fn();

jest.mock('../src/db/client', () => ({ getDb: mockGetDb }));
jest.mock('../src/api/syncService', () => ({ syncCurrentUserToSupabase: mockSyncCurrentUserToSupabase }));
jest.mock('../src/queries/useChallenge', () => ({
  cancelTerminalChallengeReminders: mockCancelTerminalChallengeReminders,
  logActiveChallengeDay: mockLogActiveChallengeDay,
  syncActiveChallengeReminders: mockSyncActiveChallengeReminders,
}));
jest.mock('../src/game/lifetimeRankWrites', () => ({ applyLifetimeStarsDelta: mockApplyLifetimeStarsDelta }));
jest.mock('../src/game/pendingLevelUpQueue', () => ({ enqueuePendingLevelUps: mockEnqueuePendingLevelUps }));
jest.mock('../src/lib/rankMascotBridge', () => ({ rankMascotBridge: { ref: { current: { playRankUp: jest.fn() } }, onRankUp: jest.fn() } }));
jest.mock('../src/hooks/useSettings', () => ({ useLanguage: jest.fn(() => ['en']) }));
jest.mock('../src/utils/formatters', () => ({
  getLocalDate: jest.fn(() => '2026-06-19'),
  getLocalDateFor: jest.fn((date: Date) => date.toISOString().slice(0, 10)),
  getWeekStart: jest.fn(() => '2026-06-15'),
  getWeekStartFor: jest.fn(() => '2026-06-15'),
}));
jest.mock('@tanstack/react-query', () => ({
  useMutation: jest.fn((options) => options),
  useQueryClient: jest.fn(() => ({ invalidateQueries })),
}));

import { runBackfillTx, useBackfillDay } from '../src/queries/useBackfill';

function createDb() {
  const getFirstAsync = jest.fn()
    .mockResolvedValueOnce({ best: 0 })
    .mockResolvedValueOnce({ n: 0 })
    .mockResolvedValueOnce({ n: 0 })
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce({ best: 1 });
  const getAllAsync = jest.fn().mockResolvedValue([{ local_date: '2026-06-17', total_points: 20 }]);
  const runAsync = jest.fn().mockResolvedValue({ changes: 1 });
  const withExclusiveTransactionAsync = jest.fn(async (cb: (db: SQLiteDatabase) => Promise<void>) => cb(db as unknown as SQLiteDatabase));
  const db = { getFirstAsync, getAllAsync, runAsync, withExclusiveTransactionAsync } as unknown as SQLiteDatabase;
  return db;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetDb.mockResolvedValue(createDb());
  mockCancelTerminalChallengeReminders.mockResolvedValue(undefined);
  mockSyncActiveChallengeReminders.mockResolvedValue(undefined);
  mockSyncCurrentUserToSupabase.mockResolvedValue(undefined);
});

describe('backfill mutation guards and transaction seam', () => {
  test('fails fast for future dates and empty sessions', async () => {
    const mutation = useBackfillDay(5) as unknown as { mutationFn: (params: { date: string; entries: unknown[] }) => Promise<unknown> };
    await expect(mutation.mutationFn({ date: '2026-06-21', entries: [{ taskTypeId: 1 }] })).rejects.toThrow('FUTURE');
    await expect(mutation.mutationFn({ date: '2026-06-17', entries: [] })).rejects.toThrow('EMPTY_SESSION');
    await expect(mutation.mutationFn({ date: '2026-06-19', entries: [{ taskTypeId: 1 }] })).rejects.toThrow('TODAY');
    const formatter = jest.requireMock('../src/utils/formatters') as { getWeekStartFor: jest.Mock };
    formatter.getWeekStartFor.mockReturnValue('2026-05-25');
    try {
      await expect(mutation.mutationFn({ date: '2026-06-01', entries: [{ taskTypeId: 1 }] })).rejects.toThrow('NOT_CURRENT_WEEK');
    } finally {
      formatter.getWeekStartFor.mockImplementation(() => '2026-06-15');
    }
  });

  test('commits one session and treats post-commit notification failures as non-fatal', async () => {
    const db = createDb();
    mockGetDb.mockResolvedValue(db);
    mockCancelTerminalChallengeReminders.mockRejectedValueOnce(new Error('cancel failed'));
    mockSyncActiveChallengeReminders.mockRejectedValueOnce(new Error('sync failed'));
    const mutation = useBackfillDay(5) as unknown as {
      mutationFn: (params: { date: string; entries: Array<{ taskTypeId: number; kind: 'GOOD'; isTimeBased: boolean; basePoints: number; starPenalty: number }> }) => Promise<unknown>;
      onSuccess: (data: { lifetimeCrossings: unknown[] }) => void;
    };
    const result = await mutation.mutationFn({
      date: '2026-06-17',
      entries: [{ taskTypeId: 42, kind: 'GOOD', isTimeBased: false, basePoints: 20, starPenalty: 0 }],
    });
    expect(result).toEqual(expect.objectContaining({ newStreak: expect.any(Number) }));
    expect(db.withExclusiveTransactionAsync).toHaveBeenCalledTimes(1);
    expect(mockLogActiveChallengeDay).toHaveBeenCalledWith(db, { userId: 5, localDate: '2026-06-17', taskTypeId: 42 });

    mockSyncCurrentUserToSupabase.mockRejectedValueOnce(new Error('cloud unavailable'));
    mutation.onSuccess({ lifetimeCrossings: [{ tierId: 3 }] });
    await Promise.resolve();
    expect(mockEnqueuePendingLevelUps).toHaveBeenCalledWith([{ tierId: 3 }]);
  });

  test('runs a fresh ranked session through missing-row and partial-streak branches', async () => {
    const getFirstAsync = jest.fn().mockResolvedValue(null);
    const getAllAsync = jest.fn(async (sql: string) => {
      if (sql.includes('FROM tiers')) return [{ id: 1, tier_order: 0, rank_name: 'Delulu', stars_required: 5 }];
      return [{ local_date: '2026-06-17', total_points: 20 }];
    });
    const runAsync = jest.fn().mockResolvedValue({ changes: 1 });
    const db = { getFirstAsync, getAllAsync, runAsync } as unknown as SQLiteDatabase;
    mockApplyLifetimeStarsDelta.mockResolvedValueOnce({ crossings: [{ tierId: 1 }] });
    mockLogActiveChallengeDay.mockResolvedValueOnce({ lifetimeCrossings: [{ tierId: 2 }] });

    const result = await runBackfillTx(
      db,
      [{ taskTypeId: 7, kind: 'GOOD', isTimeBased: true, durationMin: 600, basePoints: 20, starPenalty: 0, countTowardRank: true }],
      5,
      '2026-06-17',
      '2026-06-15',
      '2026-06-15',
      '2026-06-19',
    );

    expect(result.milestone).toBeNull();
    expect(result.lifetimeCrossings).toEqual([{ tierId: 1 }, { tierId: 2 }]);
    expect(mockApplyLifetimeStarsDelta).toHaveBeenCalled();
    expect(mockLogActiveChallengeDay).toHaveBeenCalledWith(db, { userId: 5, localDate: '2026-06-17', taskTypeId: 7 });
    expect(runAsync).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO weekly_summary'), expect.any(Array));
  });

  test('handles an existing daily row, prior streak, and a newly crossed milestone', async () => {
    const getFirstAsync = jest.fn()
      .mockResolvedValueOnce({ best: 2 })
      .mockResolvedValueOnce({ n: 0 })
      .mockResolvedValueOnce({ n: 0 })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ total_points: 5, bonus_star_awarded: 1 })
      .mockResolvedValueOnce({ streak_count: 3 })
      .mockResolvedValueOnce({ best: 8 });
    const db = {
      getFirstAsync,
      getAllAsync: jest.fn().mockResolvedValue([{ local_date: '2026-06-17', total_points: 5 }]),
      runAsync: jest.fn().mockResolvedValue({ changes: 1 }),
    } as unknown as SQLiteDatabase;
    const result = await runBackfillTx(
      db,
      [{ taskTypeId: 7, kind: 'GOOD', isTimeBased: false, basePoints: 20, starPenalty: 0, countTowardRank: false }],
      5, '2026-06-17', '2026-06-15', '2026-06-15', '2026-06-19',
    );
    expect(result.milestone).not.toBeNull();
    expect(db.runAsync).toHaveBeenCalledWith(expect.stringContaining('INSERT OR IGNORE INTO boost_events'), expect.any(Array));
  });

  test('writes a daily-bonus row and keeps notification failures non-fatal in release mode', async () => {
    const db = {
      getFirstAsync: jest.fn().mockResolvedValue(null),
      getAllAsync: jest.fn().mockResolvedValue([{ local_date: '2026-06-17', total_points: 0 }]),
      runAsync: jest.fn().mockResolvedValue({ changes: 1 }),
    } as unknown as SQLiteDatabase;
    await runBackfillTx(
      db,
      [{ taskTypeId: 7, kind: 'GOOD', isTimeBased: true, durationMin: 1500, basePoints: 20, starPenalty: 0 }],
      5, '2026-06-17', '2026-06-15', '2026-06-15', '2026-06-19',
    );
    expect((db.runAsync as jest.Mock).mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO activity_log'))).toHaveLength(2);

    const previousDev = (globalThis as { __DEV__?: boolean }).__DEV__;
    (globalThis as { __DEV__?: boolean }).__DEV__ = false;
    mockCancelTerminalChallengeReminders.mockRejectedValueOnce(new Error('cleanup unavailable'));
    mockSyncActiveChallengeReminders.mockRejectedValueOnce(new Error('schedule unavailable'));
    try {
      const mutation = useBackfillDay(5) as unknown as {
        mutationFn: (params: { date: string; entries: Array<{ taskTypeId: number; kind: 'GOOD'; isTimeBased: boolean; basePoints: number; starPenalty: number }> }) => Promise<unknown>;
      };
      await expect(mutation.mutationFn({
        date: '2026-06-17',
        entries: [{ taskTypeId: 7, kind: 'GOOD', isTimeBased: false, basePoints: 5, starPenalty: 0 }],
      })).resolves.toEqual(expect.objectContaining({ newStreak: expect.any(Number) }));
    } finally {
      (globalThis as { __DEV__?: boolean }).__DEV__ = previousDev;
    }
  });

  test('rechecks quota and existing-day denial inside the transaction', async () => {
    const mutation = useBackfillDay(5) as unknown as { mutationFn: (params: { date: string; entries: unknown[] }) => Promise<unknown> };
    const db = {
      getFirstAsync: jest.fn()
        .mockResolvedValueOnce({ best: 0 })
        .mockResolvedValueOnce({ n: 3 })
        .mockResolvedValueOnce({ n: 0 })
        .mockResolvedValueOnce(null),
      getAllAsync: jest.fn().mockResolvedValue([]),
      runAsync: jest.fn(),
      withExclusiveTransactionAsync: jest.fn(async (cb: (value: SQLiteDatabase) => Promise<void>) => cb(db as unknown as SQLiteDatabase)),
    } as unknown as SQLiteDatabase;
    mockGetDb.mockResolvedValue(db);
    await expect(mutation.mutationFn({ date: '2026-06-17', entries: [{ taskTypeId: 1 }] })).rejects.toThrow('QUOTA_EXCEEDED');
  });
});
