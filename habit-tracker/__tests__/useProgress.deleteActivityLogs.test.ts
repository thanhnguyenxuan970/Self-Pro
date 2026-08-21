import type { SQLiteDatabase } from 'expo-sqlite';
jest.mock('../src/db/client', () => ({ getDb: jest.fn() }));
jest.mock('@tanstack/react-query', () => ({
  useMutation: jest.fn((options) => options),
  useQuery: jest.fn(),
  useQueryClient: jest.fn(() => ({ invalidateQueries: jest.fn() })),
}));
jest.mock('../src/api/syncService', () => ({ syncCurrentUserToSupabase: jest.fn(() => Promise.resolve()) }));
jest.mock('../src/game/pendingActivityDeletes', () => ({ enqueuePendingActivityDeletes: jest.fn() }));
import { getDb } from '../src/db/client';
import { useDeleteActivityLogs } from '../src/queries/useProgress';
import { enqueuePendingActivityDeletes } from '../src/game/pendingActivityDeletes';

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
    expect(enqueuePendingActivityDeletes).toHaveBeenCalledWith(5, [301, 302]);
  });

  it('enqueues nothing when none of the requested ids still exist', async () => {
    const db = createDb([]);
    jest.mocked(getDb).mockResolvedValue(db);

    const mutation = useDeleteActivityLogs(5) as unknown as Mutation;
    await mutation.mutationFn([999]);

    expect(enqueuePendingActivityDeletes).toHaveBeenCalledWith(5, []);
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
});
