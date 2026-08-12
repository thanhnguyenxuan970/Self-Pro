import type { SQLiteDatabase } from 'expo-sqlite';
jest.mock('expo-notifications', () => ({
  cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/db/client', () => ({ getDb: jest.fn() }));
jest.mock('@tanstack/react-query', () => ({
  useMutation: jest.fn((options) => options),
  useQueryClient: jest.fn(() => ({ invalidateQueries: jest.fn() })),
}));
jest.mock('../src/hooks/useSettings', () => ({ useLanguage: () => ['vi', jest.fn()] }));
import { getDb } from '../src/db/client';
import { useRestartChallenge } from '../src/queries/useChallenge';

type PreviousChallenge = {
  id: number; name: string; task_type_id: number | null; target_days: number;
  start_date: string; status: 'done' | 'failed'; streak_current: number;
  freezes_left: number; before_photo: string | null; after_photo: string | null;
  mode: 'streak' | 'weekly'; weekly_target: number | null; total_weeks: number | null;
  min_duration: number | null; min_count: number | null; notifications_enabled: number;
  notification_id: string | null;
};

function createRestartDb(config: { previous: PreviousChallenge | null; taskArchived?: number }) {
  const getFirstAsync = jest.fn(async (sql: string) => {
    if (sql.includes('FROM challenges WHERE id = ? AND user_id = ? AND status')) return config.previous;
    if (sql.includes('SELECT archived FROM task_types')) {
      return config.taskArchived == null ? null : { archived: config.taskArchived };
    }
    return null;
  });
  const runAsync = jest.fn(async () => ({ lastInsertRowId: 99, changes: 1 }));
  return { getFirstAsync, runAsync } as unknown as SQLiteDatabase;
}

function withExclusiveTransaction(txn: SQLiteDatabase) {
  return {
    withExclusiveTransactionAsync: jest.fn(async (callback: (value: SQLiteDatabase) => Promise<void>) => callback(txn)),
    runAsync: jest.fn(async () => ({ changes: 1 })),
  } as unknown as SQLiteDatabase;
}

describe('useRestartChallenge', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const basePrevious: PreviousChallenge = {
    id: 11, name: 'Đọc sách', task_type_id: 42, target_days: 7, start_date: '2026-08-01',
    status: 'failed', streak_current: 3, freezes_left: 0, before_photo: null, after_photo: null,
    mode: 'streak', weekly_target: null, total_weeks: null, min_duration: null, min_count: null,
    notifications_enabled: 0, notification_id: null,
  };

  it('refuses to restart a challenge whose linked task has since been archived', async () => {
    const txn = createRestartDb({ previous: basePrevious, taskArchived: 1 });
    jest.mocked(getDb).mockResolvedValue(withExclusiveTransaction(txn));

    const mutation = useRestartChallenge(5) as unknown as { mutationFn: (challengeId: number) => Promise<unknown> };

    await expect(mutation.mutationFn(11)).rejects.toThrow('LINKED_TASK_ARCHIVED');
    expect(txn.runAsync).not.toHaveBeenCalled();
  });

  it('refuses to restart when the linked task no longer exists at all', async () => {
    const txn = createRestartDb({ previous: basePrevious, taskArchived: undefined });
    jest.mocked(getDb).mockResolvedValue(withExclusiveTransaction(txn));

    const mutation = useRestartChallenge(5) as unknown as { mutationFn: (challengeId: number) => Promise<unknown> };

    await expect(mutation.mutationFn(11)).rejects.toThrow('LINKED_TASK_ARCHIVED');
  });

  it('restarts normally when the linked task is still active', async () => {
    const txn = createRestartDb({ previous: basePrevious, taskArchived: 0 });
    jest.mocked(getDb).mockResolvedValue(withExclusiveTransaction(txn));

    const mutation = useRestartChallenge(5) as unknown as { mutationFn: (challengeId: number) => Promise<{ id: number }> };

    const result = await mutation.mutationFn(11);
    expect(result.id).toBe(99);
    expect(txn.runAsync).toHaveBeenCalled();
  });

  it('restarts a manual (unlinked) challenge without checking task_types', async () => {
    const manualPrevious = { ...basePrevious, task_type_id: null };
    const txn = createRestartDb({ previous: manualPrevious });
    jest.mocked(getDb).mockResolvedValue(withExclusiveTransaction(txn));

    const mutation = useRestartChallenge(5) as unknown as { mutationFn: (challengeId: number) => Promise<{ id: number }> };

    const result = await mutation.mutationFn(11);
    expect(result.id).toBe(99);
    expect(txn.getFirstAsync).not.toHaveBeenCalledWith(
      expect.stringContaining('SELECT archived FROM task_types'),
      expect.anything(),
    );
  });
});
