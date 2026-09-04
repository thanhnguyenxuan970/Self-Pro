import type { SQLiteDatabase } from 'expo-sqlite';

const mockGetDb = jest.fn();
const mockCancelChallengeReminders = jest.fn().mockResolvedValue(undefined);
const mockSyncChallengeReminders = jest.fn();
const mockSyncCurrentUser = jest.fn().mockResolvedValue(undefined);
const mockApplyLifetimeStarsDelta = jest.fn().mockResolvedValue({ crossings: [] });

jest.mock('../src/db/client', () => ({ getDb: mockGetDb }));
jest.mock('../src/utils/notifications', () => ({
  cancelChallengeReminders: mockCancelChallengeReminders,
  syncChallengeReminders: mockSyncChallengeReminders,
}));
jest.mock('../src/api/syncService', () => ({ syncCurrentUserToSupabase: mockSyncCurrentUser }));
jest.mock('../src/game/lifetimeRankWrites', () => ({ applyLifetimeStarsDelta: mockApplyLifetimeStarsDelta }));
jest.mock('../src/game/pendingLevelUpQueue', () => ({ enqueuePendingLevelUps: jest.fn() }));
jest.mock('../src/hooks/useSettings', () => ({ useLanguage: () => ['en', jest.fn()] }));
jest.mock('@tanstack/react-query', () => ({
  useQuery: jest.fn((options) => options),
  useMutation: jest.fn((options) => options),
  useQueryClient: jest.fn(() => ({ invalidateQueries: jest.fn() })),
}));

import {
  cancelTerminalChallengeReminders,
  syncActiveChallengeReminders,
  useActiveChallenges,
  useChallengeById,
  useChallengeHistory,
  useChallengeRollover,
  useCreateChallenge,
  useDeleteChallenge,
  useLogChallengeDay,
  useRetryChallengeReminder,
  useRestartChallenge,
  useUpdateChallengeName,
  logActiveChallengeDay,
  rolloverChallenge,
  updateChallengeNameById,
} from '../src/queries/useChallenge';

(globalThis as { __DEV__?: boolean }).__DEV__ = true;

function emptySyncResult() {
  return {
    granted: true,
    permissionError: false,
    scheduleError: false,
    scheduled: 0,
    cancelled: 0,
    failed: 0,
    failedChallengeIds: [],
    candidateCount: 0,
    omittedCount: 0,
    challengeTokens: new Map<number, string>(),
  };
}

function createDb(overrides: Partial<{
  getAllAsync: jest.Mock;
  getFirstAsync: jest.Mock;
  runAsync: jest.Mock;
  withExclusiveTransactionAsync: jest.Mock;
}> = {}) {
  const db = {
    getAllAsync: jest.fn().mockResolvedValue([]),
    getFirstAsync: jest.fn().mockResolvedValue(null),
    runAsync: jest.fn().mockResolvedValue({ changes: 1, lastInsertRowId: 41 }),
  };
  const withExclusiveTransactionAsync = jest.fn(async (callback: (txn: SQLiteDatabase) => Promise<void>) =>
    callback(db as unknown as SQLiteDatabase));
  Object.assign(db, { withExclusiveTransactionAsync }, overrides);
  return db as unknown as SQLiteDatabase;
}

function challengeRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 7,
    name: 'Read',
    task_type_id: null,
    target_days: 7,
    start_date: '2026-09-01',
    status: 'active',
    streak_current: 2,
    freezes_left: 1,
    before_photo: null,
    after_photo: null,
    mode: 'streak',
    weekly_target: null,
    total_weeks: null,
    min_duration: null,
    min_count: null,
    notifications_enabled: 0,
    notification_id: null,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSyncChallengeReminders.mockResolvedValue(emptySyncResult());
  mockGetDb.mockResolvedValue(createDb());
});

describe('Challenge query helpers and hook contracts', () => {
  test('cancels both persisted and deterministic reminder IDs for terminal challenges', async () => {
    const db = createDb({
      getAllAsync: jest.fn().mockResolvedValue([
        { id: 7, notification_id: 'legacy-7' },
        { id: 8, notification_id: null },
      ]),
    });

    await cancelTerminalChallengeReminders(db, 5);

    expect(mockCancelChallengeReminders).toHaveBeenCalledWith([
      'legacy-7',
      null,
      'habi-ch-7-',
      'habi-ch-8-',
    ]);
  });

  test('returns a safe inactive result when a reminder sync is cancelled', async () => {
    const result = await syncActiveChallengeReminders(5, 'en', { isActive: () => false });
    expect(result).toMatchObject({ granted: false, scheduled: 0, omittedCount: 0 });
    expect(mockSyncChallengeReminders).not.toHaveBeenCalled();
  });

  test('syncs an empty active challenge set without writing notification tokens', async () => {
    const db = createDb();
    mockGetDb.mockResolvedValue(db);

    await expect(syncActiveChallengeReminders(5, 'en', { now: new Date('2026-09-04T12:00:00Z') })).resolves.toEqual(emptySyncResult());
    expect(mockSyncChallengeReminders).toHaveBeenCalledWith([], 'en', expect.objectContaining({
      requestPermission: undefined,
      storedNotificationIds: new Map(),
    }));
    expect(db.runAsync).not.toHaveBeenCalled();
  });

  test('executes the active, history, and disabled detail query wrappers', async () => {
    const db = createDb();
    mockGetDb.mockResolvedValue(db);

    const active = useActiveChallenges(5) as unknown as { queryKey: unknown[]; queryFn: () => Promise<unknown> };
    expect(active.queryKey).toEqual(['challenge', 'active', 5]);
    await expect(active.queryFn()).resolves.toEqual([]);

    const history = useChallengeHistory(5) as unknown as { queryKey: unknown[]; queryFn: () => Promise<unknown> };
    expect(history.queryKey).toEqual(['challenge', 'history', 5]);
    await expect(history.queryFn()).resolves.toEqual([]);

    const disabledDetail = useChallengeById(5, null) as unknown as { enabled: boolean; queryFn: () => Promise<unknown> };
    expect(disabledDetail.enabled).toBe(false);
    await expect(disabledDetail.queryFn()).resolves.toBeNull();

    const missingDetail = useChallengeById(5, 99) as unknown as { enabled: boolean; queryFn: () => Promise<unknown> };
    expect(missingDetail.enabled).toBe(true);
    await expect(missingDetail.queryFn()).resolves.toBeNull();
  });

  test('loads a manual streak challenge with its persisted done/reset log', async () => {
    const db = createDb({
      getAllAsync: jest.fn(async (sql: string) => {
        if (sql.includes('FROM challenges WHERE user_id = ? AND status =')) return [challengeRow()];
        if (sql.includes('FROM challenge_log WHERE challenge_id = ? ORDER BY local_date')) {
          return [
            { local_date: '2026-09-01', state: 'done' },
            { local_date: '2026-09-02', state: 'reset' },
          ];
        }
        return [];
      }),
    });
    mockGetDb.mockResolvedValue(db);

    const query = useActiveChallenges(5) as unknown as { queryFn: () => Promise<Array<Record<string, unknown>>> };
    const [loaded] = await query.queryFn();
    expect(loaded).toMatchObject({
      id: 7,
      daysDone: 1,
      loggedToday: false,
      weeklyTarget: null,
      overachieverThisWeek: false,
    });
    expect(loaded.log).toHaveLength(2);
  });

  test('derives a linked streak challenge from activity_log thresholds', async () => {
    const db = createDb({
      getAllAsync: jest.fn(async (sql: string) => {
        if (sql.includes('FROM challenges WHERE user_id = ? AND status =')) {
          return [challengeRow({ task_type_id: 42, min_duration: 30, notifications_enabled: 1 })];
        }
        if (sql.includes('FROM activity_log')) {
          return [
            { local_date: '2026-09-01', duration_min: 45 },
            { local_date: '2026-09-02', duration_min: 10 },
            { local_date: '2026-09-03', duration_min: 60 },
          ];
        }
        return [];
      }),
    });
    mockGetDb.mockResolvedValue(db);

    const query = useActiveChallenges(5) as unknown as { queryFn: () => Promise<Array<Record<string, unknown>>> };
    const [loaded] = await query.queryFn();
    expect(loaded).toMatchObject({
      taskTypeId: 42,
      daysDone: 2,
      streak: 2,
      notificationsEnabled: true,
    });
    expect((loaded.log as Array<{ date: string }>).map(entry => entry.date)).toEqual(['2026-09-01', '2026-09-03']);
  });

  test('computes weekly challenge pace and elapsed perfect weeks', async () => {
    const db = createDb({
      getAllAsync: jest.fn(async (sql: string) => {
        if (sql.includes('FROM challenges WHERE user_id = ? AND status =')) {
          return [challengeRow({ mode: 'weekly', target_days: 14, weekly_target: 3, total_weeks: 2 })];
        }
        if (sql.includes('FROM challenge_log WHERE challenge_id = ? ORDER BY local_date')) {
          return [
            { local_date: '2026-09-01', state: 'done' },
            { local_date: '2026-09-02', state: 'done' },
            { local_date: '2026-09-03', state: 'done' },
          ];
        }
        return [];
      }),
    });
    mockGetDb.mockResolvedValue(db);

    const query = useActiveChallenges(5) as unknown as { queryFn: () => Promise<Array<Record<string, unknown>>> };
    const [loaded] = await query.queryFn();
    expect(loaded).toMatchObject({
      mode: 'weekly',
      weeklyTarget: 3,
      totalWeeks: 2,
      weekIndex: 1,
      weekSessionsDone: 3,
      weekSessionsRequired: 3,
      perfectWeeks: 0,
    });
  });

  test('persists the scheduler token only after state-aware reconciliation', async () => {
    const db = createDb({
      getAllAsync: jest.fn(async (sql: string) => {
        if (sql.includes('FROM challenges WHERE user_id = ? AND status =')) return [challengeRow({ notification_id: 'old-token' })];
        if (sql.includes('FROM challenge_log WHERE challenge_id = ? ORDER BY local_date')) return [];
        return [];
      }),
    });
    mockGetDb.mockResolvedValue(db);
    mockSyncChallengeReminders.mockResolvedValueOnce({
      ...emptySyncResult(),
      omittedCount: 1,
      challengeTokens: new Map([[7, 'new-token']]),
    });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await syncActiveChallengeReminders(5, 'en', { isActive: () => true });

    expect(db.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE challenges SET notification_id = ?'),
      ['new-token', 7, 5],
    );
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('omitted 1 slot'));
    warn.mockRestore();
  });

  test('runs rollover and reminder mutation wrappers against an empty database', async () => {
    const rollover = useChallengeRollover(5) as unknown as { mutationFn: () => Promise<void> };
    await expect(rollover.mutationFn()).resolves.toBeUndefined();

    const log = useLogChallengeDay(5) as unknown as { mutationFn: (id: number) => Promise<unknown> };
    await expect(log.mutationFn(99)).rejects.toThrow('NO_ACTIVE_CHALLENGE');
  });

  test('creates a manual challenge without scheduling notifications', async () => {
    const db = createDb();
    mockGetDb.mockResolvedValue(db);
    const create = useCreateChallenge(5) as unknown as { mutationFn: (params: unknown) => Promise<unknown> };

    await expect(create.mutationFn({
      name: 'Read',
      taskTypeId: null,
      mode: 'streak',
      targetDays: 30,
      freezesLeft: 2,
      notificationsEnabled: false,
    })).resolves.toEqual({ notificationDenied: false });
    expect(db.runAsync).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO challenges'), expect.arrayContaining([
      5, 'Read', null, 'streak', 30,
    ]));
    expect(mockSyncChallengeReminders).not.toHaveBeenCalled();
  });

  test('reports a missing reminder target and handles retry success/failure', async () => {
    const db = createDb({
      getFirstAsync: jest.fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 42 }),
    });
    mockGetDb.mockResolvedValue(db);
    mockSyncChallengeReminders.mockResolvedValueOnce({ ...emptySyncResult(), granted: true });

    const retry = useRetryChallengeReminder(5) as unknown as { mutationFn: (id: number) => Promise<boolean> };
    await expect(retry.mutationFn(99)).resolves.toBe(false);
    await expect(retry.mutationFn(42)).resolves.toBe(true);
    expect(mockSyncChallengeReminders).toHaveBeenCalled();
  });

  test('trims challenge names and rejects empty names', async () => {
    const db = createDb();
    await expect(updateChallengeNameById(db, 5, 9, '  Morning walk  ')).resolves.toBeUndefined();
    expect(db.runAsync).toHaveBeenCalledWith(
      'UPDATE challenges SET name = ? WHERE id = ? AND user_id = ?',
      ['Morning walk', 9, 5],
    );
    await expect(updateChallengeNameById(db, 5, 9, '   ')).rejects.toThrow('CHALLENGE_NAME_REQUIRED');

    const update = useUpdateChallengeName(5) as unknown as { mutationFn: (value: { challengeId: number; name: string }) => Promise<void> };
    await expect(update.mutationFn({ challengeId: 9, name: 'Yoga' })).resolves.toBeUndefined();
  });

  test('returns no-active and already-logged results for explicit challenge selectors', async () => {
    const db = createDb({
      getAllAsync: jest.fn().mockResolvedValue([]),
    });
    await expect(logActiveChallengeDay(db, {
      userId: 5, localDate: '2026-09-04', challengeId: 99,
    })).resolves.toEqual({ status: 'no_active_challenge', lifetimeCrossings: [] });

    const alreadyDb = createDb({
      getAllAsync: jest.fn().mockResolvedValue([challengeRow()]),
      getFirstAsync: jest.fn().mockResolvedValue({ id: 1 }),
    });
    await expect(logActiveChallengeDay(alreadyDb, {
      userId: 5, localDate: '2026-09-04', challengeId: 7,
    })).resolves.toEqual({ status: 'already_logged', lifetimeCrossings: [] });
  });

  test('awards a completed manual challenge and surfaces tier crossings', async () => {
    mockApplyLifetimeStarsDelta.mockResolvedValueOnce({ crossings: [{ tierId: 2, tierOrder: 2 }] });
    const db = createDb({
      getAllAsync: jest.fn(async (sql: string) => {
        if (sql.includes('FROM challenges')) return [challengeRow({ target_days: 1 })];
        if (sql.includes('FROM tiers')) return [{ id: 1, tier_order: 1, stars_required: 1 }];
        return [];
      }),
      getFirstAsync: jest.fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ n: 1 })
        .mockResolvedValueOnce({ n: 1 }),
    });
    const result = await logActiveChallengeDay(db, {
      userId: 5, localDate: '2026-09-04', challengeId: 7,
    });
    expect(result.status).toBe('logged');
    expect(result.lifetimeCrossings).toEqual([{ tierId: 2, tierOrder: 2 }]);
    expect(db.runAsync).toHaveBeenCalledWith(expect.stringContaining("SET status = 'done'"), [1, '2026-09-04', 7]);
    expect(db.runAsync).toHaveBeenCalledWith(expect.stringContaining('INSERT OR IGNORE INTO achievements'), expect.any(Array));
  });

  test('rolls over weekly challenges through failure and completion paths', async () => {
    const failedRow = challengeRow({ id: 20, start_date: '2000-01-01', mode: 'weekly', target_days: 14, weekly_target: 3, total_weeks: 2 });
    const failedDb = createDb({
      getAllAsync: jest.fn(async (sql: string) => {
        if (sql.includes("status = 'active'")) return [failedRow];
        return [];
      }),
    });
    mockGetDb.mockResolvedValueOnce(failedDb);
    await expect(rolloverChallenge(5)).resolves.toBeUndefined();
    expect(failedDb.runAsync).toHaveBeenCalledWith("UPDATE challenges SET status = 'failed' WHERE id = ?", [20]);

    const completedRow = challengeRow({ id: 21, start_date: '2000-01-01', mode: 'weekly', target_days: 14, weekly_target: 3, total_weeks: 2 });
    const completedDb = createDb({
      getAllAsync: jest.fn(async (sql: string) => {
        if (sql.includes("status = 'active'")) return [completedRow];
        if (sql.includes('FROM challenge_log')) {
          return [
            { local_date: '2000-01-01', state: 'done' },
            { local_date: '2000-01-02', state: 'done' },
            { local_date: '2000-01-03', state: 'done' },
            { local_date: '2000-01-08', state: 'done' },
            { local_date: '2000-01-09', state: 'done' },
            { local_date: '2000-01-10', state: 'done' },
          ];
        }
        if (sql.includes('FROM tiers')) return [];
        return [];
      }),
    });
    mockApplyLifetimeStarsDelta.mockResolvedValueOnce({ crossings: [] });
    mockGetDb.mockResolvedValueOnce(completedDb);
    await expect(rolloverChallenge(5)).resolves.toBeUndefined();
    expect(completedDb.runAsync).toHaveBeenCalledWith(
      "UPDATE challenges SET status = 'done', completed_at = ? WHERE id = ?",
      [expect.any(String), 21],
    );
  });

  test('rolls over a manual challenge with a freeze and invokes success invalidations', async () => {
    const row = challengeRow({ id: 22, start_date: '2000-01-01', freezes_left: 1 });
    const db = createDb({
      getAllAsync: jest.fn(async (sql: string) => {
        if (sql.includes("status = 'active'")) return [row];
        if (sql.includes('FROM challenge_log')) return [{ local_date: '2000-01-01' }];
        return [];
      }),
      getFirstAsync: jest.fn().mockResolvedValue({ n: 1 }),
    });
    mockGetDb.mockResolvedValueOnce(db);
    await rolloverChallenge(5);
    expect(db.runAsync).toHaveBeenCalledWith(expect.stringContaining('freeze_used'), expect.any(Array));

    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockSyncCurrentUser.mockRejectedValueOnce(new Error('offline'));
    const mutation = useChallengeRollover(5) as unknown as { onSuccess: () => Promise<void> };
    await expect(mutation.onSuccess()).resolves.toBeUndefined();
    warn.mockRestore();
  });

  test('handles reminder permission failures and duplicate active challenges', async () => {
    const db = createDb();
    mockGetDb.mockResolvedValue(db);
    mockSyncChallengeReminders.mockResolvedValueOnce({
      ...emptySyncResult(), granted: false, permissionError: true,
    });
    const create = useCreateChallenge(5) as unknown as { mutationFn: (params: unknown) => Promise<{ notificationDenied: boolean }> };
    await expect(create.mutationFn({
      name: 'Read', taskTypeId: 42, mode: 'streak', targetDays: 7,
      freezesLeft: 1, notificationsEnabled: true, minDuration: 10, minCount: 2,
    })).resolves.toEqual({ notificationDenied: true });

    (db.runAsync as unknown as jest.Mock).mockRejectedValueOnce(new Error('UNIQUE constraint failed: challenges.user_id'));
    await expect(create.mutationFn({
      name: 'Read', taskTypeId: null, mode: 'streak', targetDays: 7,
      freezesLeft: 1, notificationsEnabled: false,
    })).rejects.toThrow('ACTIVE_EXISTS');
  });

  test('captures reminder scheduler exceptions and executes mutation success callbacks', async () => {
    const db = createDb();
    mockGetDb.mockResolvedValue(db);
    mockSyncChallengeReminders.mockRejectedValueOnce(new Error('scheduler unavailable'));
    const create = useCreateChallenge(5) as unknown as {
      mutationFn: (params: unknown) => Promise<{ notificationDenied: boolean }>;
      onSuccess: () => Promise<void>;
    };
    await expect(create.mutationFn({
      name: 'Read', taskTypeId: null, mode: 'streak', targetDays: 7,
      freezesLeft: 1, notificationsEnabled: true,
    })).resolves.toEqual({ notificationDenied: true });
    await expect(create.onSuccess()).resolves.toBeUndefined();

    const retry = useRetryChallengeReminder(5) as unknown as { mutationFn: (id: number) => Promise<boolean> };
    (db.getFirstAsync as unknown as jest.Mock).mockResolvedValue({ id: 7 });
    mockSyncChallengeReminders.mockResolvedValueOnce({
      ...emptySyncResult(), scheduleError: true, failedChallengeIds: [7],
    });
    await expect(retry.mutationFn(7)).resolves.toBe(false);
  });

  test('restarts a challenge with reminders and runs the log/delete success hooks', async () => {
    const previous = challengeRow({ id: 30, status: 'failed', notifications_enabled: 1 });
    const db = createDb({
      getFirstAsync: jest.fn().mockResolvedValue(previous),
    });
    mockGetDb.mockResolvedValue(db);
    mockSyncChallengeReminders.mockResolvedValueOnce({ ...emptySyncResult(), scheduleError: true });
    const restart = useRestartChallenge(5) as unknown as {
      mutationFn: (id: number) => Promise<{ notificationDenied: boolean }>;
      onSuccess: () => Promise<void>;
    };
    await expect(restart.mutationFn(30)).resolves.toEqual({ id: 41, notificationDenied: true });
    await expect(restart.onSuccess()).resolves.toBeUndefined();

    const del = useDeleteChallenge(5) as unknown as {
      mutationFn: (ids: number | number[]) => Promise<void>;
      onSuccess: () => Promise<void>;
    };
    await expect(del.mutationFn([])).resolves.toBeUndefined();
    await expect(del.onSuccess()).resolves.toBeUndefined();
  });
});
