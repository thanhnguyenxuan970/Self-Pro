import type { SQLiteDatabase } from 'expo-sqlite';
jest.mock('../src/db/client', () => ({ getDb: jest.fn() }));
jest.mock('@tanstack/react-query', () => ({
  useMutation: jest.fn((options) => options),
  useQueryClient: jest.fn(() => ({ invalidateQueries: jest.fn() })),
}));
jest.mock('../src/game/pendingActivityDeletes', () => ({ enqueuePendingActivityDeletesForUser: jest.fn() }));
import { getDb } from '../src/db/client';
import { useArchiveTask } from '../src/queries/useTasks';
import { enqueuePendingActivityDeletesForUser } from '../src/game/pendingActivityDeletes';

type Mutation = { mutationFn: (taskIdOrIds: number | number[]) => Promise<{ lifetimeCrossings: unknown[] }> };

function createDb(loggedRows: { id: number; local_date: string; week_start: string; points_earned: number; stars_delta: number; kind: string }[]) {
  const getFirstAsync = jest.fn(async (sql: string) => {
    if (sql.includes('FROM challenges')) return null; // no linked active challenge
    if (sql.includes('SELECT lifetime_stars')) return { lifetime_stars: 5, current_tier_id: 4 };
    return null;
  });
  const getAllAsync = jest.fn(async (sql: string) => {
    if (sql.includes("source = 'TASK'")) return loggedRows;
    if (sql.includes('daily_summary')) return []; // no daily_summary row -> revertDailySummaries skips DAILY_BONUS work
    return [];
  });
  const runAsync = jest.fn(async () => ({ changes: 1 }));
  return { getFirstAsync, getAllAsync, runAsync, withTransactionAsync: jest.fn(async (cb: () => Promise<void>) => cb()) } as unknown as SQLiteDatabase;
}

describe('useArchiveTask', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('enqueues the archived task type\'s deleted activity_log rows for remote cleanup', async () => {
    const db = createDb([
      { id: 201, local_date: '2026-08-10', week_start: '2026-08-10', points_earned: 1, stars_delta: 1, kind: 'GOOD' },
      { id: 202, local_date: '2026-08-11', week_start: '2026-08-10', points_earned: 1, stars_delta: 1, kind: 'GOOD' },
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

    const mutation = useArchiveTask(5) as unknown as Mutation;
    await mutation.mutationFn(9);

    expect(db.runAsync).toHaveBeenCalledWith(
      `DELETE FROM activity_log WHERE user_id = ? AND task_type_id = ? AND source = 'TASK'`,
      [5, 9],
    );
    expect(db.runAsync).toHaveBeenCalledWith(
      'UPDATE users SET lifetime_stars = ?, current_tier_id = ? WHERE id = ?',
      [3, 4, 5],
    );
    expect(enqueuePendingActivityDeletesForUser).toHaveBeenCalledWith(db, 5, [201, 202]);
  });

  it('is a no-op enqueue when the archived task type has no activity history', async () => {
    const db = createDb([]);
    jest.mocked(getDb).mockResolvedValue(db);

    const mutation = useArchiveTask(5) as unknown as Mutation;
    await mutation.mutationFn(9);

    expect(enqueuePendingActivityDeletesForUser).toHaveBeenCalledWith(db, 5, []);
  });
});
