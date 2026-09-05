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
jest.mock('../src/game/pendingLevelUpQueue', () => ({ enqueuePendingLevelUps: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../src/hooks/useSettings', () => ({ useLanguage: () => ['en', jest.fn()] }));
jest.mock('@tanstack/react-query', () => ({
  useQuery: jest.fn((options) => options),
  useMutation: jest.fn((options) => options),
  useQueryClient: jest.fn(() => ({ invalidateQueries: jest.fn() })),
}));

import {
  cancelTerminalChallengeReminders,
  syncActiveChallengeReminders,
  restoreReactivatedChallengeReminders,
  reconcileUnloggedLinkedChallenges,
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
import { rankMascotBridge } from '../src/lib/rankMascotBridge';

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
    jest.useFakeTimers().setSystemTime(new Date('2026-09-03T05:00:00.000Z'));
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

    try {
      const query = useActiveChallenges(5) as unknown as { queryFn: () => Promise<Array<Record<string, unknown>>> };
      const [loaded] = await query.queryFn();
      expect(loaded).toMatchObject({
        taskTypeId: 42,
        daysDone: 2,
        streak: 2,
        notificationsEnabled: true,
      });
      expect((loaded.log as Array<{ date: string }>).map(entry => entry.date)).toEqual(['2026-09-01', '2026-09-03']);
    } finally {
      jest.useRealTimers();
    }
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

  test('abandons notification persistence when the scheduler loses the active account race', async () => {
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
      challengeTokens: new Map([[7, 'new-token']]),
    });
    (db.runAsync as jest.Mock).mockResolvedValueOnce({ changes: 0 });

    await syncActiveChallengeReminders(5, 'en');
    expect(mockCancelChallengeReminders).toHaveBeenCalledWith(['habi-ch-7-']);
  });

  test('does not write notification tokens after an inactive scheduler result', async () => {
    const db = createDb({
      getAllAsync: jest.fn(async (sql: string) => (
        sql.includes('FROM challenges WHERE user_id = ? AND status =') ? [challengeRow()] : []
      )),
    });
    mockGetDb.mockResolvedValue(db);
    let active = true;
    mockSyncChallengeReminders.mockImplementationOnce(async () => {
      active = false;
      return { ...emptySyncResult(), challengeTokens: new Map([[7, 'new-token']]) };
    });
    await syncActiveChallengeReminders(5, 'en', { isActive: () => active });
    expect(db.runAsync).not.toHaveBeenCalled();
  });

  test('keeps reactivation cleanup safe when cancellation of old reminders fails', async () => {
    mockCancelChallengeReminders.mockRejectedValueOnce(new Error('notification service offline'));
    const db = createDb();
    await expect(restoreReactivatedChallengeReminders(db, [
      { id: 7, name: 'Read', mode: 'streak', notificationsEnabled: true, reminderToken: 'reactivation:7', previousNotificationId: 'old' },
    ])).resolves.toBeUndefined();
    expect(db.runAsync).toHaveBeenCalledWith(expect.stringContaining('SET notification_id = NULL'), [7, 'reactivation:7']);
  });

  test('reopens a linked challenge without a reward when its final day disappears', async () => {
    const db = createDb({
      getAllAsync: jest.fn(async (sql: string) => {
        if (sql.includes("status = 'done'")) return [{
          id: 7, name: 'Read', task_type_id: 42, target_days: 3, mode: 'streak', start_date: '2026-09-01',
          min_duration: null, min_count: null, notifications_enabled: 1, notification_id: 'old',
        }];
        if (sql.includes('FROM activity_log')) return [];
        return [];
      }),
      getFirstAsync: jest.fn().mockResolvedValue(null),
    });
    const result = await reconcileUnloggedLinkedChallenges(db, { userId: 5, taskTypeId: 42, localDate: '2026-09-03' });
    expect(result.reactivatedChallenges[0]).toMatchObject({ id: 7, reminderToken: expect.stringContaining('reactivation:7:'), notificationsEnabled: true });
    expect(result.deletedActivityIds).toEqual([]);
  });

  test('fails closed on an ambiguous legacy challenge reward', async () => {
    const db = createDb({
      getAllAsync: jest.fn(async (sql: string) => {
        if (sql.includes("status = 'done'")) return [{
          id: 70, name: 'Read', task_type_id: 42, target_days: 2, mode: 'streak',
          start_date: '2026-09-01', min_duration: null, min_count: null,
          notifications_enabled: 0, notification_id: null,
        }];
        if (sql.includes('FROM activity_log')) return [];
        return [];
      }),
      getFirstAsync: jest.fn().mockResolvedValue({ id: 91, week_start: '2026-09-01', stars_delta: 1, is_exact: 0, candidate_count: 2 }),
    });
    await expect(reconcileUnloggedLinkedChallenges(db, { userId: 5, taskTypeId: 42, localDate: '2026-09-02' }))
      .rejects.toThrow('AMBIGUOUS_CHALLENGE_REWARD');
  });

  test('runs rollover and reminder mutation wrappers against an empty database', async () => {
    const rollover = useChallengeRollover(5) as unknown as { mutationFn: () => Promise<void> };
    await expect(rollover.mutationFn()).resolves.toBeUndefined();

    mockGetDb.mockResolvedValue(createDb());
    const log = useLogChallengeDay(5) as unknown as { mutationFn: (id: number) => Promise<unknown> };
    await expect(log.mutationFn(99)).rejects.toThrow('NO_ACTIVE_CHALLENGE');
  });

  test('loads linked weekly/detail data and rejects an already-logged challenge day', async () => {
    const db = createDb({
      getAllAsync: jest.fn(async (sql: string) => {
        if (sql.includes('FROM challenges')) {
          return [challengeRow({ task_type_id: 42, mode: 'weekly', weekly_target: 2, total_weeks: 2 })];
        }
        if (sql.includes('FROM activity_log')) return [{ local_date: '2026-09-01', duration_min: 30 }];
        return [];
      }),
      getFirstAsync: jest.fn(async (sql: string) => (
        sql.includes('FROM challenges') ? challengeRow({ id: 7 }) : { id: 7 }
      )),
    });
    mockGetDb.mockResolvedValue(db);
    const active = useActiveChallenges(5) as unknown as { queryFn: () => Promise<Array<Record<string, unknown>>> };
    await expect(active.queryFn()).resolves.toEqual([expect.objectContaining({ mode: 'weekly', weekSessionsDone: 1 })]);

    const detail = useChallengeById(5, 7) as unknown as { queryFn: () => Promise<Record<string, unknown> | null> };
    await expect(detail.queryFn()).resolves.toEqual(expect.objectContaining({ id: 7 }));

    const alreadyLogDb = createDb({
      getAllAsync: jest.fn().mockResolvedValue([challengeRow()]),
      getFirstAsync: jest.fn().mockResolvedValue({ id: 1 }),
    });
    mockGetDb.mockResolvedValue(alreadyLogDb);
    const log = useLogChallengeDay(5) as unknown as { mutationFn: (id: number) => Promise<unknown> };
    await expect(log.mutationFn(7)).rejects.toThrow('ALREADY_LOGGED_TODAY');
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

  test('creates weekly challenges and preserves a granted reminder result', async () => {
    const db = createDb();
    mockGetDb.mockResolvedValue(db);
    mockSyncChallengeReminders.mockResolvedValueOnce({ ...emptySyncResult(), granted: true });
    const create = useCreateChallenge(5) as unknown as { mutationFn: (params: unknown) => Promise<{ notificationDenied: boolean }> };
    await expect(create.mutationFn({
      name: 'Read weekly', taskTypeId: 42, mode: 'weekly', weeklyTarget: 3, totalWeeks: 2,
      freezesLeft: 1, notificationsEnabled: true, minDuration: 20, minCount: 2,
    })).resolves.toEqual({ notificationDenied: false });
    expect(db.runAsync).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO challenges'), expect.arrayContaining([14, 3, 2]));
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

  test('covers linked rollover failure and reminder-sync error recovery', async () => {
    const linked = challengeRow({ id: 44, task_type_id: 42, start_date: '2026-09-01', freezes_left: 0 });
    const db = createDb({
      getAllAsync: jest.fn(async (sql: string) => {
        if (sql.includes("status = 'active'")) return [linked];
        if (sql.includes('FROM activity_log')) return [];
        if (sql.includes('FROM challenge_log')) return [];
        return [];
      }),
    });
    mockGetDb.mockResolvedValue(db);
    await expect(rolloverChallenge(5)).resolves.toBeUndefined();
    expect(db.runAsync).toHaveBeenCalledWith("UPDATE challenges SET status = 'failed' WHERE id = ?", [44]);

    mockSyncChallengeReminders.mockRejectedValueOnce(new Error('notifications offline'));
    const rollover = useChallengeRollover(5) as unknown as { mutationFn: () => Promise<void> };
    await expect(rollover.mutationFn()).resolves.toBeUndefined();
  });

  test('loads a manual detail through the persisted challenge-log branch', async () => {
    const db = createDb({
      getFirstAsync: jest.fn().mockResolvedValue(challengeRow({ id: 77 })),
      getAllAsync: jest.fn().mockResolvedValue([
        { local_date: '2026-09-01', state: 'done' },
        { local_date: '2026-09-02', state: 'reset' },
      ]),
    });
    mockGetDb.mockResolvedValue(db);
    const detail = useChallengeById(5, 77) as unknown as { queryFn: () => Promise<Record<string, unknown>> };
    await expect(detail.queryFn()).resolves.toMatchObject({ id: 77, daysDone: 1, loggedToday: false });
  });

  test('completes a linked streak day and runs the log success celebration path', async () => {
    const db = createDb({
      getAllAsync: jest.fn(async (sql: string) => {
        if (sql.includes('FROM challenges')) return [challengeRow({ id: 78, task_type_id: 42, target_days: 1, min_duration: 10 })];
        if (sql.includes('FROM activity_log')) return [{ local_date: '2026-09-04', duration_min: 30 }];
        if (sql.includes('FROM tiers')) return [];
        return [];
      }),
    });
    mockGetDb.mockResolvedValue(db);
    mockApplyLifetimeStarsDelta.mockResolvedValueOnce({ crossings: [{ tierId: 6 }] });
    const playRankUp = jest.fn();
    const onRankUp = jest.fn();
    rankMascotBridge.ref = { current: { playRankUp } } as never;
    rankMascotBridge.onRankUp = onRankUp;
    const log = useLogChallengeDay(5) as unknown as {
      mutationFn: (id: number) => Promise<{ lifetimeCrossings: unknown[] }>;
      onSuccess: (data: { lifetimeCrossings: unknown[] }) => Promise<void>;
    };
    const result = await log.mutationFn(78);
    expect(result.lifetimeCrossings).toEqual([{ tierId: 6 }]);
    await log.onSuccess(result);
    expect(playRankUp).toHaveBeenCalled();
    expect(onRankUp).toHaveBeenCalledWith([{ tierId: 6 }]);
  });

  test('covers non-unique create errors, retry invalidation, rename sync, and restart reminder failure', async () => {
    const db = createDb();
    mockGetDb.mockResolvedValue(db);
    const create = useCreateChallenge(5) as unknown as { mutationFn: (params: unknown) => Promise<unknown> };
    (db.runAsync as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    await expect(create.mutationFn({
      name: 'Offline', taskTypeId: null, mode: 'streak', targetDays: 7,
      freezesLeft: 1, notificationsEnabled: false,
    })).rejects.toThrow('offline');

    const retry = useRetryChallengeReminder(5) as unknown as { mutationFn: (id: number) => Promise<boolean>; onSuccess: () => void };
    (db.getFirstAsync as jest.Mock).mockResolvedValueOnce({ id: 7 });
    mockSyncChallengeReminders.mockResolvedValueOnce(emptySyncResult());
    await expect(retry.mutationFn(7)).resolves.toBe(true);
    retry.onSuccess();

    const update = useUpdateChallengeName(5) as unknown as { onSuccess: () => Promise<void> };
    await update.onSuccess();

    const previous = challengeRow({ id: 79, status: 'failed', notifications_enabled: 1 });
    const restartDb = createDb({ getFirstAsync: jest.fn().mockResolvedValue(previous) });
    mockGetDb.mockResolvedValue(restartDb);
    mockSyncChallengeReminders.mockRejectedValueOnce(new Error('notification failure'));
    const restart = useRestartChallenge(5) as unknown as { mutationFn: (id: number) => Promise<{ notificationDenied: boolean }> };
    await expect(restart.mutationFn(79)).resolves.toMatchObject({ id: 41, notificationDenied: true });
  });

  test('recomputes a manual rollover without a persisted streak count', async () => {
    const row = challengeRow({ id: 80, start_date: '2000-01-01', freezes_left: 1 });
    const db = createDb({
      getAllAsync: jest.fn(async (sql: string) => {
        if (sql.includes("status = 'active'")) return [row];
        if (sql.includes('FROM challenge_log')) return [{ local_date: '2000-01-01' }];
        return [];
      }),
      getFirstAsync: jest.fn().mockResolvedValue(null),
    });
    mockGetDb.mockResolvedValue(db);
    await expect(rolloverChallenge(5)).resolves.toBeUndefined();
    expect(db.runAsync).toHaveBeenCalledWith(expect.stringContaining('streak_current'), expect.any(Array));
  });

  test('celebrates rollover crossings and leaves an in-progress weekly challenge unchanged', async () => {
    const playRankUp = jest.fn();
    const onRankUp = jest.fn();
    rankMascotBridge.ref = { current: { playRankUp } } as never;
    rankMascotBridge.onRankUp = onRankUp;
    const completed = challengeRow({ id: 81, start_date: '2000-01-01', mode: 'weekly', target_days: 14, weekly_target: 3, total_weeks: 2 });
    const completedDb = createDb({
      getAllAsync: jest.fn(async (sql: string) => {
        if (sql.includes("status = 'active'")) return [completed];
        if (sql.includes('FROM challenge_log')) return [
          { local_date: '2000-01-01', state: 'done' }, { local_date: '2000-01-02', state: 'done' }, { local_date: '2000-01-03', state: 'done' },
          { local_date: '2000-01-08', state: 'done' }, { local_date: '2000-01-09', state: 'done' }, { local_date: '2000-01-10', state: 'done' },
        ];
        if (sql.includes('FROM tiers')) return [];
        return [];
      }),
    });
    mockApplyLifetimeStarsDelta.mockResolvedValueOnce({ crossings: [{ tierId: 10 }] });
    mockGetDb.mockResolvedValueOnce(completedDb);
    await rolloverChallenge(5);
    expect(playRankUp).toHaveBeenCalled();
    expect(onRankUp).toHaveBeenCalledWith([{ tierId: 10 }]);

    const inProgress = challengeRow({ id: 82, start_date: '2026-09-04', mode: 'weekly', target_days: 14, weekly_target: 3, total_weeks: 2 });
    const inProgressDb = createDb({
      getAllAsync: jest.fn(async (sql: string) => sql.includes("status = 'active'") ? [inProgress] : []),
    });
    mockGetDb.mockResolvedValueOnce(inProgressDb);
    await expect(rolloverChallenge(5)).resolves.toBeUndefined();
  });

  test('uses rare and legendary achievement tiers for long streak challenges', async () => {
    for (const targetDays of [30, 66]) {
      const db = createDb({
        getAllAsync: jest.fn(async (sql: string) => sql.includes('FROM challenges')
          ? [challengeRow({ id: targetDays, target_days: targetDays })]
          : []),
        getFirstAsync: jest.fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ n: targetDays })
          .mockResolvedValueOnce({ n: targetDays }),
      });
      const result = await logActiveChallengeDay(db, { userId: 5, localDate: '2026-09-05', challengeId: targetDays });
      expect(result.status).toBe('logged');
      expect(db.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR IGNORE INTO achievements'),
        expect.arrayContaining([targetDays >= 66 ? 'legendary' : 'rare']),
      );
    }
  });

  test('skips reactivation when a linked challenge is already complete', async () => {
    const db = createDb({
      getAllAsync: jest.fn(async (sql: string) => {
        if (sql.includes("status = 'done'")) return [{
          id: 90, name: 'Read', task_type_id: 42, target_days: 1, mode: 'streak',
          start_date: '2026-09-01', min_duration: null, min_count: null,
          notifications_enabled: 0, notification_id: null,
        }];
        if (sql.includes('FROM activity_log')) return [{ local_date: '2026-09-02', duration_min: 30 }];
        return [];
      }),
    });
    await expect(reconcileUnloggedLinkedChallenges(db, { userId: 5, taskTypeId: 42, localDate: '2026-09-03' }))
      .resolves.toEqual({ reactivatedChallenges: [], deletedActivityIds: [], lifetimeCrossings: [] });
  });

  test('rejects restarting a missing challenge and supports weekly restart defaults', async () => {
    const missingDb = createDb({ getFirstAsync: jest.fn().mockResolvedValue(null) });
    mockGetDb.mockResolvedValueOnce(missingDb);
    const restart = useRestartChallenge(5) as unknown as { mutationFn: (id: number) => Promise<unknown> };
    await expect(restart.mutationFn(999)).rejects.toThrow('CHALLENGE_NOT_RESTARTABLE');

    const weeklyDb = createDb({
      getFirstAsync: jest.fn().mockResolvedValue(challengeRow({ id: 91, status: 'failed', mode: 'weekly', notifications_enabled: 0 })),
    });
    mockGetDb.mockResolvedValueOnce(weeklyDb);
    const weeklyRestart = useRestartChallenge(5) as unknown as { mutationFn: (id: number) => Promise<{ notificationDenied: boolean }> };
    await expect(weeklyRestart.mutationFn(91)).resolves.toEqual({ id: 41, notificationDenied: false });
    expect(weeklyDb.runAsync).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO challenges'), expect.arrayContaining([0]));
  });

  test('uses zero fallbacks when persisted manual challenge counters are absent', async () => {
    for (const counters of [[null, null, { n: 1 }], [null, { n: 1 }, null]]) {
      const db = createDb({
        getAllAsync: jest.fn().mockResolvedValue([challengeRow({ target_days: 7 })]),
        getFirstAsync: jest.fn()
          .mockResolvedValueOnce(counters[0])
          .mockResolvedValueOnce(counters[1])
          .mockResolvedValueOnce(counters[2]),
      });
      await expect(logActiveChallengeDay(db, { userId: 5, localDate: '2026-09-05', challengeId: 7 }))
        .resolves.toMatchObject({ status: 'logged', lifetimeCrossings: [] });
    }
  });

  test('leaves a manual rollover alone when there are no elapsed days to fill', async () => {
    const db = createDb({
      getAllAsync: jest.fn(async (sql: string) => sql.includes("status = 'active'") ? [challengeRow({ start_date: '2026-09-05' })] : []),
    });
    mockGetDb.mockResolvedValue(db);
    await expect(rolloverChallenge(5)).resolves.toBeUndefined();
  });

  test('swallows reminder sync failure after logging a challenge day', async () => {
    const db = createDb({
      getAllAsync: jest.fn(async (sql: string) => sql.includes('FROM challenges')
        ? [challengeRow({ task_type_id: 42, target_days: 7 })]
        : []),
    });
    mockGetDb.mockResolvedValue(db);
    mockSyncChallengeReminders.mockRejectedValueOnce(new Error('reminders unavailable'));
    const log = useLogChallengeDay(5) as unknown as { mutationFn: (id: number) => Promise<unknown> };
    await expect(log.mutationFn(7)).resolves.toEqual({ lifetimeCrossings: [] });
  });

  test('derives a linked weekly rollover before applying failure rules', async () => {
    const db = createDb({
      getAllAsync: jest.fn(async (sql: string) => {
        if (sql.includes("status = 'active'")) return [challengeRow({ mode: 'weekly', task_type_id: 42, start_date: '2000-01-01', weekly_target: 3, total_weeks: 2 })];
        if (sql.includes('FROM activity_log')) return [];
        return [];
      }),
    });
    mockGetDb.mockResolvedValue(db);
    await expect(rolloverChallenge(5)).resolves.toBeUndefined();
    expect(db.runAsync).toHaveBeenCalledWith("UPDATE challenges SET status = 'failed' WHERE id = ?", [7]);
  });
});
