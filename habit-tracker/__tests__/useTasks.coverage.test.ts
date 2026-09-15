import type { SQLiteDatabase } from 'expo-sqlite';

(globalThis as { __DEV__?: boolean }).__DEV__ = true;

const mockGetDb = jest.fn();
const mockSyncCurrentUserToSupabase = jest.fn().mockResolvedValue(undefined);
const mockApplyLifetimeStarsDelta = jest.fn().mockResolvedValue({ crossings: [] });
const mockEnqueuePendingLevelUps = jest.fn().mockResolvedValue(undefined);
const mockEnqueuePendingActivityDeletes = jest.fn().mockResolvedValue(undefined);
const invalidateQueries = jest.fn();

jest.mock('../src/db/client', () => ({ getDb: mockGetDb }));
jest.mock('../src/api/syncService', () => ({ syncCurrentUserToSupabase: mockSyncCurrentUserToSupabase }));
jest.mock('../src/game/lifetimeRankWrites', () => ({ applyLifetimeStarsDelta: mockApplyLifetimeStarsDelta }));
jest.mock('../src/game/pendingLevelUpQueue', () => ({ enqueuePendingLevelUps: mockEnqueuePendingLevelUps }));
jest.mock('../src/game/pendingActivityDeletes', () => ({ enqueuePendingActivityDeletesForUser: mockEnqueuePendingActivityDeletes }));
jest.mock('../src/lib/rankMascotBridge', () => ({ rankMascotBridge: {} }));
jest.mock('../src/config/constants', () => ({ dailyBonusStarsForPoints: jest.fn((points: number) => points >= 10 ? 1 : 0) }));
jest.mock('../src/utils/activityPicker', () => ({
  MAX_PINNED_ACTIVITIES: 3,
  normalizeActivityName: (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim(),
}));
jest.mock('@tanstack/react-query', () => ({
  useQuery: jest.fn((options) => options),
  useMutation: jest.fn((options) => options),
  useQueryClient: jest.fn(() => ({ invalidateQueries })),
}));

import {
  useActivityPickerTasks,
  useArchiveTask,
  useCreateTask,
  useRestoreTask,
  useSetTaskPinned,
  useUpdateTaskName,
} from '../src/queries/useTasks';
import { rankMascotBridge } from '../src/lib/rankMascotBridge';

function createDb() {
  const getAllAsync = jest.fn().mockResolvedValue([]);
  const getFirstAsync = jest.fn().mockResolvedValue(null);
  const runAsync = jest.fn().mockResolvedValue({ changes: 1 });
  const withTransactionAsync = jest.fn(async (cb: () => Promise<void>) => cb());
  return { getAllAsync, getFirstAsync, runAsync, withTransactionAsync } as unknown as SQLiteDatabase;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetDb.mockResolvedValue(createDb());
  mockSyncCurrentUserToSupabase.mockResolvedValue(undefined);
  mockApplyLifetimeStarsDelta.mockResolvedValue({ crossings: [] });
});

describe('task query and mutation contracts', () => {
  test('loads picker tasks and handles create/restore/update paths', async () => {
    const db = createDb();
    const all = db.getAllAsync as unknown as jest.Mock;
    const first = db.getFirstAsync as unknown as jest.Mock;
    all.mockResolvedValueOnce([{ id: 1, name: 'Read', kind: 'GOOD' }]);
    first.mockResolvedValueOnce({ id: 9 });
    mockGetDb.mockResolvedValue(db);

    const picker = useActivityPickerTasks(5) as unknown as { queryFn: () => Promise<unknown> };
    await expect(picker.queryFn()).resolves.toEqual([{ id: 1, name: 'Read', kind: 'GOOD' }]);

    const create = useCreateTask(5) as unknown as { mutationFn: (params: { name: string; kind: 'GOOD'; isTimeBased: boolean; basePoints: number; starPenalty: number; icon?: string; categoryId?: number; isTemplate?: boolean }) => Promise<number>; onSuccess: () => Promise<void> };
    await expect(create.mutationFn({ name: 'Write', kind: 'GOOD', isTimeBased: false, basePoints: 5, starPenalty: 0 })).resolves.toBe(9);
    first.mockResolvedValueOnce({ id: 9 });
    await expect(create.mutationFn({ name: 'Timed', kind: 'GOOD', isTimeBased: true, basePoints: 2, starPenalty: 0, icon: '⏱️', categoryId: 3, isTemplate: true })).resolves.toBe(9);
    await create.onSuccess();

    first.mockResolvedValueOnce(null);
    await expect(create.mutationFn({ name: 'Missing', kind: 'GOOD', isTimeBased: false, basePoints: 5, starPenalty: 0 })).rejects.toThrow('task not found');

    const restore = useRestoreTask(5) as unknown as { mutationFn: (id: number) => Promise<void>; onSuccess: () => Promise<void> };
    await restore.mutationFn(9);
    await restore.onSuccess();
    const update = useUpdateTaskName(5) as unknown as { mutationFn: (params: { taskId: number; name: string; isTimeBased?: boolean }) => Promise<void>; onSuccess: () => Promise<void> };
    await update.mutationFn({ taskId: 9, name: 'Written', isTimeBased: true });
    await update.onSuccess();
    expect(invalidateQueries).toHaveBeenCalled();
  });

  test('rejects normalized duplicate names and tolerates best-effort sync failures', async () => {
    const db = createDb();
    (db.getAllAsync as unknown as jest.Mock).mockResolvedValueOnce([{ id: 1, name: 'Read' }]);
    mockGetDb.mockResolvedValue(db);
    const create = useCreateTask(5) as unknown as { mutationFn: (params: { name: string; kind: 'GOOD'; isTimeBased: boolean; basePoints: number; starPenalty: number }) => Promise<number>; onSuccess: () => Promise<void> };
    await expect(create.mutationFn({ name: 'read', kind: 'GOOD', isTimeBased: false, basePoints: 5, starPenalty: 0 })).rejects.toThrow('DUPLICATE_ACTIVITY_NAME');
    mockSyncCurrentUserToSupabase.mockRejectedValueOnce(new Error('offline'));
    await expect(create.onSuccess()).resolves.toBeUndefined();
  });

  test('pins and unpins tasks, enforcing the pinned limit', async () => {
    const db = createDb();
    const first = db.getFirstAsync as unknown as jest.Mock;
    first.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 3 });
    mockGetDb.mockResolvedValue(db);
    const pin = useSetTaskPinned(5) as unknown as { mutationFn: (input: { taskId: number; pinned: boolean }) => Promise<void>; onSuccess: () => Promise<void> };
    await pin.mutationFn({ taskId: 7, pinned: true });
    await pin.mutationFn({ taskId: 7, pinned: false });
    await pin.onSuccess();
    await expect(pin.mutationFn({ taskId: 8, pinned: true })).rejects.toThrow('PIN_LIMIT');
    expect(db.runAsync).toHaveBeenCalledWith('UPDATE task_types SET is_pinned = ? WHERE id = ? AND user_id = ?', [1, 7, 5]);
  });

  test('allows pinning when the count query has no row', async () => {
    const db = createDb();
    mockGetDb.mockResolvedValue(db);
    const pin = useSetTaskPinned(5) as unknown as { mutationFn: (input: { taskId: number; pinned: boolean }) => Promise<void> };
    await expect(pin.mutationFn({ taskId: 7, pinned: true })).resolves.toBeUndefined();
    expect(db.runAsync).toHaveBeenCalledWith('UPDATE task_types SET is_pinned = ? WHERE id = ? AND user_id = ?', [1, 7, 5]);
  });

  test('rejects archiving a linked challenge and fully reverses archived activity', async () => {
    const db = createDb();
    const all = db.getAllAsync as unknown as jest.Mock;
    const first = db.getFirstAsync as unknown as jest.Mock;
    first.mockResolvedValueOnce({ id: 99 });
    mockGetDb.mockResolvedValue(db);
    const archive = useArchiveTask(5) as unknown as { mutationFn: (id: number | number[]) => Promise<{ lifetimeCrossings: unknown[] }> };
    await expect(archive.mutationFn(7)).rejects.toThrow('TASK_TYPE_LINKED_TO_ACTIVE_CHALLENGE');

    first.mockResolvedValue(null);
    all.mockImplementation(async (sql: string) => {
      if (sql.includes("source = 'TASK'")) return [{ id: 11, local_date: '2026-09-01', week_start: '2026-09-01', points_earned: 20, stars_delta: 2, kind: 'GOOD' }];
      if (sql.includes('daily_summary')) return [{ local_date: '2026-09-01', total_points: 20, bonus_star_awarded: 2 }];
      if (sql.includes("source = 'DAILY_BONUS'")) return [{ id: 12 }];
      if (sql.includes('SELECT id, local_date')) return [{ id: 4, local_date: '2026-09-01' }];
      return [];
    });
    mockApplyLifetimeStarsDelta.mockResolvedValueOnce({ crossings: [{ tierId: 2 }] });
    const result = await archive.mutationFn([7]);
    expect(result.lifetimeCrossings).toEqual([{ tierId: 2 }]);
    expect(mockEnqueuePendingActivityDeletes).toHaveBeenCalledWith(db, 5, [11, 12]);
    expect(db.runAsync).toHaveBeenCalledWith('UPDATE task_types SET archived = 1 WHERE id = ? AND user_id = ?', [7, 5]);
  });

  test('archives an empty task and exercises multi-day summary reversal branches', async () => {
    const emptyDb = createDb();
    mockGetDb.mockResolvedValue(emptyDb);
    const archive = useArchiveTask(5) as unknown as { mutationFn: (id: number | number[]) => Promise<{ lifetimeCrossings: unknown[] }>; onSuccess: (data: { lifetimeCrossings: unknown[] }) => Promise<void> };
    await expect(archive.mutationFn([])).resolves.toEqual({ lifetimeCrossings: [] });

    const db = createDb();
    const first = db.getFirstAsync as unknown as jest.Mock;
    const all = db.getAllAsync as unknown as jest.Mock;
    first.mockResolvedValue(null);
    all.mockImplementation(async (sql: string) => {
      if (sql.includes("source = 'TASK'")) return [
        { id: 11, local_date: '2026-09-01', week_start: '2026-08-31', points_earned: 5, stars_delta: 2, kind: 'GOOD' },
        { id: 12, local_date: '2026-09-02', week_start: '2026-08-31', points_earned: 5, stars_delta: 2, kind: 'GOOD' },
      ];
      if (sql.includes('daily_summary') && sql.includes('total_points')) return [
        { local_date: '2026-09-01', total_points: 15, bonus_star_awarded: 2 },
        { local_date: '2026-09-02', total_points: 20, bonus_star_awarded: 2 },
      ];
      if (sql.includes("source = 'DAILY_BONUS'")) return [{ id: 20 }];
      if (sql.includes('SELECT id, local_date FROM daily_summary')) return [
        { id: 1, local_date: '2026-09-01' },
        { id: 2, local_date: '2026-09-02' },
      ];
      if (sql.includes('FROM tiers')) return [{ id: 1, tier_order: 0, rank_name: 'Delulu', stars_required: 5 }];
      return [];
    });
    mockGetDb.mockResolvedValue(db);
    mockApplyLifetimeStarsDelta.mockResolvedValueOnce({ crossings: [] });
    const result = await archive.mutationFn([7]);
    expect(result).toEqual({ lifetimeCrossings: [] });
    await expect(archive.onSuccess({ lifetimeCrossings: [] })).resolves.toBeUndefined();
    expect(db.runAsync).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO activity_log'), expect.any(Array));
  });

  test('archives a task with no logs and restores optional update-name values', async () => {
    const db = createDb();
    const all = db.getAllAsync as unknown as jest.Mock;
    const first = db.getFirstAsync as unknown as jest.Mock;
    first.mockResolvedValue(null);
    all.mockResolvedValue([]);
    mockGetDb.mockResolvedValue(db);
    const archive = useArchiveTask(5) as unknown as {
      mutationFn: (id: number) => Promise<{ lifetimeCrossings: unknown[] }>;
      onSuccess: (data: { lifetimeCrossings?: unknown[] }) => Promise<void>;
    };
    await expect(archive.mutationFn(8)).resolves.toEqual({ lifetimeCrossings: [] });
    await expect(archive.onSuccess({})).resolves.toBeUndefined();

    const update = useUpdateTaskName(5) as unknown as {
      mutationFn: (params: { taskId: number; name: string; isTimeBased?: boolean }) => Promise<void>;
    };
    await update.mutationFn({ taskId: 8, name: 'Optional' });
    await update.mutationFn({ taskId: 8, name: 'Untimed', isTimeBased: false });
    expect(db.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('COALESCE'),
      ['Untimed', 0, 8, 5],
    );
  });

  test('reverses a BAD archive across a non-consecutive day', async () => {
    const db = createDb();
    const all = db.getAllAsync as unknown as jest.Mock;
    const first = db.getFirstAsync as unknown as jest.Mock;
    first.mockResolvedValue(null);
    all.mockImplementation(async (sql: string) => {
      if (sql.includes("source = 'TASK'")) return [
        { id: 21, local_date: '2026-09-01', week_start: '2026-08-31', points_earned: 1, stars_delta: -2, kind: 'BAD' },
        { id: 22, local_date: '2026-09-03', week_start: '2026-08-31', points_earned: 1, stars_delta: -1, kind: 'BAD' },
      ];
      if (sql.includes('daily_summary') && sql.includes('total_points')) return [
        { local_date: '2026-09-01', total_points: 1, bonus_star_awarded: 0 },
        { local_date: '2026-09-03', total_points: 1, bonus_star_awarded: 0 },
      ];
      if (sql.includes('SELECT id, local_date FROM daily_summary')) return [
        { id: 1, local_date: '2026-09-01' },
        { id: 2, local_date: '2026-09-03' },
      ];
      return [];
    });
    mockGetDb.mockResolvedValue(db);
    const archive = useArchiveTask(5) as unknown as { mutationFn: (id: number) => Promise<unknown> };
    await archive.mutationFn(8);
    expect(db.runAsync).toHaveBeenCalledWith(
      'UPDATE users SET treat_stars = treat_stars + ? WHERE id = ? AND penalty_hits_treats = 1',
      [3, 5],
    );
  });

  test('runs the archive rank-up callback when crossings are present', async () => {
    const playRankUp = jest.fn();
    const onRankUp = jest.fn();
    (rankMascotBridge as unknown as { ref: unknown; onRankUp: unknown }).ref = { current: { playRankUp } };
    (rankMascotBridge as unknown as { ref: unknown; onRankUp: unknown }).onRankUp = onRankUp;
    const archive = useArchiveTask(5) as unknown as { onSuccess: (data: { lifetimeCrossings: unknown[] }) => Promise<void> };
    await archive.onSuccess({ lifetimeCrossings: [{ tierId: 9 }] });
    await Promise.resolve();
    expect(playRankUp).toHaveBeenCalled();
    expect(onRankUp).toHaveBeenCalledWith([{ tierId: 9 }]);
  });
});
