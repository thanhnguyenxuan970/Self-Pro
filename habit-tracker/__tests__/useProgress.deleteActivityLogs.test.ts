import type { SQLiteDatabase } from 'expo-sqlite';
(globalThis as { __DEV__?: boolean }).__DEV__ = true;
jest.mock('../src/db/client', () => ({ getDb: jest.fn() }));
jest.mock('@tanstack/react-query', () => ({
  useMutation: jest.fn((options) => options),
  useQuery: jest.fn(),
  useQueryClient: jest.fn(() => ({ invalidateQueries: jest.fn() })),
}));
jest.mock('../src/api/syncService', () => ({ syncCurrentUserToSupabase: jest.fn(() => Promise.resolve()) }));
jest.mock('../src/game/pendingActivityDeletes', () => ({ enqueuePendingActivityDeletesForUser: jest.fn(() => Promise.resolve()) }));
jest.mock('../src/lib/rankMascotBridge', () => ({ rankMascotBridge: { ref: { current: { playRankUp: jest.fn() } }, onRankUp: jest.fn() } }));
import { getDb } from '../src/db/client';
import { useDeleteActivityLogs } from '../src/queries/useProgress';
import { enqueuePendingActivityDeletesForUser } from '../src/game/pendingActivityDeletes';

type Mutation = { mutationFn: (ids: number[]) => Promise<{ lifetimeCrossings: unknown[] }> };

function createDb(
  rows: { id: number; local_date: string; week_start: string; points_earned: number; stars_delta: number; kind: string; source: string }[],
  dailyRows: { local_date: string; total_points: number; bonus_star_awarded: number }[] = [],
) {
  const getFirstAsync = jest.fn(async () => ({ lifetime_stars: 5, current_tier_id: 4 }));
  const getAllAsync = jest.fn(async (sql: string) => {
    if (sql.includes('FROM activity_log')) return rows;
    if (sql.includes('daily_summary')) return dailyRows;
    return []; // no daily_summary rows -> revertDailySummariesForDelete skips the DAILY_BONUS branch
  });
  const runAsync = jest.fn(async () => ({ changes: 1 }));
  return { getFirstAsync, getAllAsync, runAsync, withTransactionAsync: jest.fn(async (cb: () => Promise<void>) => cb()) } as unknown as SQLiteDatabase;
}

describe('useDeleteActivityLogs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('enqueues the deleted activity_log rows for remote cleanup', async () => {
    const db = createDb([
      { id: 301, local_date: '2026-08-10', week_start: '2026-08-10', points_earned: 5, stars_delta: 1, kind: 'GOOD', source: 'TASK' },
      { id: 302, local_date: '2026-08-11', week_start: '2026-08-10', points_earned: 5, stars_delta: 1, kind: 'GOOD', source: 'TASK' },
    ]);
    jest.mocked(getDb).mockResolvedValue(db);
    let transactionOpen = false;
    jest.mocked(db.withTransactionAsync).mockImplementation(async callback => {
      transactionOpen = true;
      try {
        await callback();
      } finally {
        transactionOpen = false;
      }
    });
    jest.mocked(enqueuePendingActivityDeletesForUser).mockImplementationOnce(async () => {
      expect(transactionOpen).toBe(true);
    });

    const mutation = useDeleteActivityLogs(5) as unknown as Mutation;
    await mutation.mutationFn([301, 302]);

    expect(db.runAsync).toHaveBeenCalledWith(
      `DELETE FROM activity_log WHERE user_id = ? AND id IN (${['?', '?'].join(',')})`,
      [5, 301, 302],
    );
    expect(db.runAsync).toHaveBeenCalledWith(
      'UPDATE users SET lifetime_stars = ?, current_tier_id = ? WHERE id = ?',
      [3, 4, 5],
    );
    expect(enqueuePendingActivityDeletesForUser).toHaveBeenCalledWith(db, 5, [301, 302]);
  });

  it('enqueues nothing when none of the requested ids still exist', async () => {
    const db = createDb([]);
    jest.mocked(getDb).mockResolvedValue(db);

    const mutation = useDeleteActivityLogs(5) as unknown as Mutation;
    await mutation.mutationFn([999]);

    expect(enqueuePendingActivityDeletesForUser).not.toHaveBeenCalled();
  });

  it('does not subtract a selected daily bonus that is recreated at the same value', async () => {
    const db = createDb([
      { id: 303, local_date: '2026-08-10', week_start: '2026-08-10', points_earned: 0, stars_delta: 2, kind: 'DAILY_BONUS', source: 'DAILY_BONUS' },
    ], [{ local_date: '2026-08-10', total_points: 50, bonus_star_awarded: 3 }]);
    jest.mocked(getDb).mockResolvedValue(db);

    const mutation = useDeleteActivityLogs(5) as unknown as Mutation;
    await mutation.mutationFn([303]);

    expect(db.runAsync).not.toHaveBeenCalledWith(
      'UPDATE users SET lifetime_stars = ?, current_tier_id = ? WHERE id = ?',
      expect.anything(),
    );
    expect(db.runAsync).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO activity_log"),
      expect.arrayContaining([3, 5, '2026-08-10', '2026-08-10']),
    );
  });

  it('reverses BAD penalties and runs both successful and failed post-delete sync paths', async () => {
    const db = createDb([
      { id: 304, local_date: '2026-08-10', week_start: '2026-08-10', points_earned: 0, stars_delta: -3, kind: 'BAD', source: 'TASK' },
    ]);
    jest.mocked(getDb).mockResolvedValue(db);
    const mutation = useDeleteActivityLogs(5) as unknown as {
      mutationFn: (ids: number[]) => Promise<{ lifetimeCrossings: unknown[] }>;
      onSuccess: (data: { lifetimeCrossings: unknown[] }) => void;
    };
    await mutation.mutationFn([304]);
    expect(db.runAsync).toHaveBeenCalledWith(
      'UPDATE users SET treat_stars = treat_stars + ? WHERE id = ? AND penalty_hits_treats = 1',
      [3, 5],
    );

    const sync = jest.requireMock('../src/api/syncService').syncCurrentUserToSupabase as jest.Mock;
    await mutation.onSuccess({ lifetimeCrossings: [] });
    sync.mockRejectedValueOnce(new Error('offline'));
    await mutation.onSuccess({ lifetimeCrossings: [{ tierId: 2 }] });
    await Promise.resolve();
  });
});
