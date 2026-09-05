const invalidateQueries = jest.fn();
const mockGetDb = jest.fn();
const mockGetStoredGoogleUser = jest.fn().mockResolvedValue(null);
const mockSyncCurrentUserToSupabase = jest.fn().mockResolvedValue(undefined);
const mockSyncUserStreak = jest.fn().mockResolvedValue(undefined);
const mockCancelTerminalChallengeReminders = jest.fn().mockResolvedValue(undefined);
const mockLogActiveChallengeDay = jest.fn().mockResolvedValue({ status: 'logged', lifetimeCrossings: [] });
const mockReconcileUnloggedLinkedChallenges = jest.fn().mockResolvedValue({
  lifetimeCrossings: [], reactivatedChallenges: [], deletedActivityIds: [],
});
const mockRestoreReactivatedChallengeReminders = jest.fn().mockResolvedValue(undefined);
const mockSyncActiveChallengeReminders = jest.fn().mockResolvedValue(undefined);
const mockUseLanguage = jest.fn(() => ['en']);
const mockComputeLogTaskRows = jest.fn();
const mockGetLocalDate = jest.fn(() => '2026-08-17');
const mockGetLocalDateFor = jest.fn(() => '2026-08-16');
const mockGetWeekStart = jest.fn(() => '2026-08-17');
const mockDailyBonusStarsForPoints = jest.fn((points: number) => points >= 10 ? 1 : 0);
const mockCrossedStreakMilestone = jest.fn().mockReturnValue(null);
const mockBoostEndOfDayMs = jest.fn((now: number) => now + 60_000);
const mockIsBoostActiveAt = jest.fn().mockReturnValue(false);
const mockSummarizeBoostLogs = jest.fn().mockReturnValue({
  boostStars: 2, boostLogs: 1, baseStars: 1, bonusStars: 1, totalStars: 3,
});
const mockApplyLifetimeStarsDelta = jest.fn().mockResolvedValue({ crossings: [] });
const mockEnqueuePendingLevelUps = jest.fn().mockResolvedValue(undefined);
const mockEnqueuePendingActivityDeletes = jest.fn().mockResolvedValue(undefined);
const mockMarkSurveyD0Pending = jest.fn().mockResolvedValue(undefined);
const mockNotifyFirstEverLog = jest.fn();
const mockRecordFirstUse = jest.fn().mockResolvedValue(undefined);
const mockScheduleStoreReviewPrompt = jest.fn();

jest.mock('@tanstack/react-query', () => ({
  useMutation: jest.fn((options) => options),
  useQuery: jest.fn((options) => options),
  useQueryClient: jest.fn(() => ({ invalidateQueries })),
}));
jest.mock('../src/db/client', () => ({ getDb: mockGetDb }));
jest.mock('../src/hooks/useAuth', () => ({ getStoredGoogleUser: mockGetStoredGoogleUser }));
jest.mock('../src/api/syncService', () => ({
  syncCurrentUserToSupabase: mockSyncCurrentUserToSupabase,
  syncUserStreak: mockSyncUserStreak,
}));
jest.mock('../src/queries/useChallenge', () => ({
  cancelTerminalChallengeReminders: mockCancelTerminalChallengeReminders,
  logActiveChallengeDay: mockLogActiveChallengeDay,
  reconcileUnloggedLinkedChallenges: mockReconcileUnloggedLinkedChallenges,
  restoreReactivatedChallengeReminders: mockRestoreReactivatedChallengeReminders,
  syncActiveChallengeReminders: mockSyncActiveChallengeReminders,
}));
jest.mock('../src/hooks/useSettings', () => ({ useLanguage: mockUseLanguage }));
jest.mock('../src/game/logTask', () => ({ computeLogTaskRows: mockComputeLogTaskRows }));
jest.mock('../src/utils/formatters', () => ({
  getLocalDate: mockGetLocalDate,
  getLocalDateFor: mockGetLocalDateFor,
  getWeekStart: mockGetWeekStart,
}));
jest.mock('../src/config/constants', () => ({
  dailyBonusStarsForPoints: mockDailyBonusStarsForPoints,
  SOURCE_TASK: 'TASK',
}));
jest.mock('../src/game/streakMilestones', () => ({ crossedStreakMilestone: mockCrossedStreakMilestone }));
jest.mock('../src/game/boost', () => ({
  boostEndOfDayMs: mockBoostEndOfDayMs,
  isBoostActiveAt: mockIsBoostActiveAt,
  summarizeBoostLogs: mockSummarizeBoostLogs,
}));
jest.mock('../src/game/lifetimeRankWrites', () => ({ applyLifetimeStarsDelta: mockApplyLifetimeStarsDelta }));
jest.mock('../src/game/pendingLevelUpQueue', () => ({ enqueuePendingLevelUps: mockEnqueuePendingLevelUps }));
jest.mock('../src/game/pendingActivityDeletes', () => ({ enqueuePendingActivityDeletes: mockEnqueuePendingActivityDeletes }));
jest.mock('../src/game/pendingSurveyD0', () => ({ markSurveyD0Pending: mockMarkSurveyD0Pending }));
jest.mock('../src/hooks/useSurveyD0Intent', () => ({ notifyFirstEverLog: mockNotifyFirstEverLog }));
jest.mock('../src/lib/storeReview', () => ({
  recordFirstUse: mockRecordFirstUse,
  scheduleStoreReviewPrompt: mockScheduleStoreReviewPrompt,
}));
jest.mock('../src/lib/rankMascotBridge', () => ({ rankMascotBridge: {} }));

import {
  useActivateTodayBoost,
  useConsecutiveSuggestions,
  useDailySummary,
  useDismissTodayBoost,
  useLogTask,
  useTodayBoost,
  useTodayBoostSummary,
  useTodayBoostedTaskIds,
  useTodayLoggedTaskIds,
  useTodayTaskTotalDurations,
  useTodayTasks,
  useUnlogTask,
  useWeeklySummary,
} from '../src/queries/useToday';
import { rankMascotBridge } from '../src/lib/rankMascotBridge';

function createDb() {
  return {
    getAllAsync: jest.fn().mockResolvedValue([]),
    getFirstAsync: jest.fn().mockResolvedValue(null),
    runAsync: jest.fn().mockResolvedValue({ changes: 1, lastInsertRowId: 12 }),
    withTransactionAsync: jest.fn(async (callback: () => Promise<void>) => callback()),
  };
}

const event = {
  id: 3, local_date: '2026-08-17', multiplier: 2, claim_deadline: 1_000,
  claimed_at: 100, expires_at: 200, dismissed_at: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetDb.mockResolvedValue(createDb());
  mockSyncActiveChallengeReminders.mockResolvedValue(undefined);
  mockLogActiveChallengeDay.mockResolvedValue({ status: 'logged', lifetimeCrossings: [] });
  mockReconcileUnloggedLinkedChallenges.mockResolvedValue({
    lifetimeCrossings: [], reactivatedChallenges: [], deletedActivityIds: [],
  });
  mockIsBoostActiveAt.mockReturnValue(false);
  mockCrossedStreakMilestone.mockReturnValue(null);
  mockApplyLifetimeStarsDelta.mockResolvedValue({ crossings: [] });
  mockComputeLogTaskRows.mockReturnValue({
    activityRow: {
      user_id: 5, task_type_id: 9, kind: 'GOOD', duration_min: 20,
      points_earned: 12, stars_delta: 2, source: 'TASK', logged_at: 123,
      local_date: '2026-08-17', week_start: '2026-08-17',
    },
    bonusRow: null,
  });
});

describe('today query and boost contracts', () => {
  test('executes today task, suggestion, summary, logged-id, and duration queries', async () => {
    const db = createDb();
    db.getAllAsync
      .mockResolvedValueOnce([{ id: 1, name: 'Read' }])
      .mockResolvedValueOnce([{ id: 2, name: 'Walk' }])
      .mockResolvedValueOnce([{ task_type_id: 9 }, { task_type_id: 10 }])
      .mockResolvedValueOnce([{ id: 9, task_type_id: 9, total_min: 20, total_stars: 2, total_points: 12 }]);
    db.getFirstAsync
      .mockResolvedValueOnce({ total_points: 12, bonus_star_awarded: 1, streak_count: 3 })
      .mockResolvedValueOnce({ weekly_stars: 4 });
    mockGetDb.mockResolvedValue(db);

    const tasks = useTodayTasks(5) as unknown as { queryFn: () => Promise<unknown> };
    await expect(tasks.queryFn()).resolves.toEqual([{ id: 1, name: 'Read' }]);
    const suggestions = useConsecutiveSuggestions(5) as unknown as { queryFn: () => Promise<unknown> };
    await expect(suggestions.queryFn()).resolves.toEqual([{ id: 2, name: 'Walk' }]);
    const daily = useDailySummary(5) as unknown as { queryFn: () => Promise<unknown> };
    await expect(daily.queryFn()).resolves.toMatchObject({ total_points: 12 });
    const weekly = useWeeklySummary(5) as unknown as { queryFn: () => Promise<unknown> };
    await expect(weekly.queryFn()).resolves.toEqual({ weekly_stars: 4 });
    const logged = useTodayLoggedTaskIds(5) as unknown as { queryFn: () => Promise<Set<number>> };
    await expect(logged.queryFn()).resolves.toEqual(new Set([9, 10]));
    const durations = useTodayTaskTotalDurations(5) as unknown as { queryFn: () => Promise<Map<number, unknown>> };
    await expect(durations.queryFn()).resolves.toEqual(new Map([[9, { duration: 20, stars: 2, points: 12 }]]));
    expect(db.getAllAsync).toHaveBeenCalledTimes(4);
    expect(db.getFirstAsync).toHaveBeenCalledTimes(2);
  });

  test('handles boost query states and activation/dismissal mutations', async () => {
    const db = createDb();
    db.getFirstAsync.mockResolvedValue(event);
    db.getAllAsync.mockResolvedValue([{ source: 'TASK', kind: 'GOOD', stars_delta: 2 }]);
    db.runAsync
      .mockResolvedValueOnce({ changes: 1 })
      .mockResolvedValueOnce({ changes: 0 });
    mockGetDb.mockResolvedValue(db);
    mockIsBoostActiveAt.mockReturnValue(true);

    const boost = useTodayBoost(5) as unknown as { queryFn: () => Promise<unknown> };
    await expect(boost.queryFn()).resolves.toEqual(event);
    const summary = useTodayBoostSummary(5, event) as unknown as { queryFn: () => Promise<unknown> };
    await expect(summary.queryFn()).resolves.toEqual({
      boostStars: 2, boostLogs: 1, baseStars: 1, bonusStars: 1, totalStars: 3,
    });
    const ids = useTodayBoostedTaskIds(5, event) as unknown as { queryFn: () => Promise<Set<number>> };
    db.getAllAsync.mockResolvedValueOnce([{ task_type_id: 9 }, { task_type_id: 9 }]);
    await expect(ids.queryFn()).resolves.toEqual(new Set([9]));

    const activate = useActivateTodayBoost(5) as unknown as { mutationFn: () => Promise<boolean> };
    await expect(activate.mutationFn()).resolves.toBe(true);
    const dismiss = useDismissTodayBoost(5) as unknown as { mutationFn: () => Promise<boolean> };
    await expect(dismiss.mutationFn()).resolves.toBe(false);
    const emptySummary = useTodayBoostSummary(5, null) as unknown as { queryFn: () => Promise<unknown> };
    await expect(emptySummary.queryFn()).resolves.toEqual({
      boostStars: 0, boostLogs: 0, baseStars: 0, bonusStars: 0, totalStars: 0,
    });
    const emptyIds = useTodayBoostedTaskIds(5, null) as unknown as { queryFn: () => Promise<Set<number>> };
    await expect(emptyIds.queryFn()).resolves.toEqual(new Set());
  });

  test('normalizes nullable duration aggregates and missing streak history', async () => {
    const db = createDb();
    db.getAllAsync.mockResolvedValueOnce([
      { task_type_id: 9, total_min: null, total_stars: null, total_points: null },
    ]);
    db.getFirstAsync.mockImplementation(async (sql: string) => {
      if (sql.includes('total_points, bonus_star_awarded, streak_count')) return null;
      if (sql.includes('MAX(streak_count)')) return null;
      if (sql.includes('FROM weekly_summary')) return null;
      if (sql.includes('FROM boost_events')) return null;
      if (sql.includes('COUNT(*) AS count')) return null;
      return null;
    });
    mockGetDb.mockResolvedValue(db);

    const durations = useTodayTaskTotalDurations(5) as unknown as { queryFn: () => Promise<Map<number, unknown>> };
    await expect(durations.queryFn()).resolves.toEqual(new Map([[9, { duration: 0, stars: 0, points: 0 }]]));
    const mutation = useLogTask(5) as unknown as { mutationFn: (params: unknown) => Promise<unknown> };
    await expect(mutation.mutationFn({ taskTypeId: 9, kind: 'GOOD', isTimeBased: false, basePoints: 1, starPenalty: 0 }))
      .resolves.toMatchObject({ prevStreak: 0, newStreak: 1, isFirstEverLog: false });
  });

  test('continues yesterday streaks and fires log rank callbacks', async () => {
    const db = createDb();
    db.getFirstAsync.mockImplementation(async (sql: string) => {
      if (sql.includes('total_points, bonus_star_awarded, streak_count')) return null;
      if (sql.includes('SELECT streak_count FROM daily_summary')) return { streak_count: 4 };
      if (sql.includes('MAX(streak_count)')) return { best: 4 };
      if (sql.includes('FROM weekly_summary')) return null;
      if (sql.includes('FROM boost_events')) return null;
      if (sql.includes('COUNT(*) AS count')) return { count: 1 };
      return null;
    });
    mockGetDb.mockResolvedValue(db);
    const mutation = useLogTask(5) as unknown as {
      mutationFn: (params: unknown) => Promise<{ newStreak: number; prevStreak: number }>;
      onSuccess: (data: { lifetimeCrossings: unknown[]; isFirstEverLog: boolean; newStreak: number }) => void;
    };
    await expect(mutation.mutationFn({ taskTypeId: 9, kind: 'GOOD', isTimeBased: false, basePoints: 1, starPenalty: 0 }))
      .resolves.toMatchObject({ prevStreak: 4, newStreak: 5 });
    const playRankUp = jest.fn();
    const onRankUp = jest.fn();
    (rankMascotBridge as unknown as { ref: unknown; onRankUp: unknown }).ref = { current: { playRankUp } };
    (rankMascotBridge as unknown as { ref: unknown; onRankUp: unknown }).onRankUp = onRankUp;
    mutation.onSuccess({ lifetimeCrossings: [{ tierId: 8 }], isFirstEverLog: false, newStreak: 5 });
    expect(playRankUp).toHaveBeenCalled();
    expect(onRankUp).toHaveBeenCalledWith([{ tierId: 8 }]);
  });
});

describe('today log mutation contracts', () => {
  test('logs a good activity with a boost, bonus, challenge reward, and first-log effects', async () => {
    const db = createDb();
    db.getAllAsync.mockResolvedValue([{ id: 1, tier_order: 1, rank_name: 'A', stars_required: 1 }]);
    db.getFirstAsync.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM daily_summary')) return null;
      if (sql.includes('MAX(streak_count)')) return { best: 0 };
      if (sql.includes('FROM weekly_summary')) return { weekly_stars: 2 };
      if (sql.includes('FROM boost_events')) return { multiplier: 2, claim_deadline: 2_000, claimed_at: 100, expires_at: 2_000, dismissed_at: null };
      if (sql.includes('COUNT(*) AS count')) return { count: 1 };
      return null;
    });
    mockIsBoostActiveAt.mockReturnValue(true);
    mockLogActiveChallengeDay.mockResolvedValue({ status: 'logged', lifetimeCrossings: [{ tierId: 2, tierOrder: 2 }] });
    mockApplyLifetimeStarsDelta.mockResolvedValue({ crossings: [{ tierId: 1, tierOrder: 1 }] });
    mockGetDb.mockResolvedValue(db);

    const mutation = useLogTask(5) as unknown as {
      mutationFn: (params: { taskTypeId: number; kind: 'GOOD'; isTimeBased: boolean; basePoints: number; starPenalty: number; durationMin: number }) => Promise<unknown>;
      onSuccess: (data: { lifetimeCrossings: unknown[]; isFirstEverLog: boolean; newStreak: number }) => void;
    };
    const result = await mutation.mutationFn({ taskTypeId: 9, kind: 'GOOD', isTimeBased: true, basePoints: 10, starPenalty: 1, durationMin: 20 });
    expect(result).toMatchObject({ newStreak: 1, prevStreak: 0, isFirstEverLog: true });
    expect(db.runAsync).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO activity_log'), expect.any(Array));
    expect(db.runAsync).toHaveBeenCalledWith(expect.stringContaining('UPDATE users SET treat_stars = treat_stars +'), expect.any(Array));
    expect(mockLogActiveChallengeDay).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ taskTypeId: 9 }));

    mutation.onSuccess({ lifetimeCrossings: [{ tierId: 1 }], isFirstEverLog: true, newStreak: 1 });
    await Promise.resolve();
    expect(mockMarkSurveyD0Pending).toHaveBeenCalled();
    expect(mockRecordFirstUse).toHaveBeenCalled();
    expect(mockScheduleStoreReviewPrompt).toHaveBeenCalled();
    expect(mockEnqueuePendingLevelUps).toHaveBeenCalled();
  });

  test('handles milestone boost creation and an activity without a daily row', async () => {
    const db = createDb();
    db.getAllAsync.mockResolvedValue([]);
    db.getFirstAsync.mockImplementation(async (sql: string) => {
      if (sql.includes('total_points, bonus_star_awarded, streak_count')) return { total_points: 3, bonus_star_awarded: 0, streak_count: 6 };
      if (sql.includes('MAX(streak_count)')) return { best: 6 };
      if (sql.includes('FROM weekly_summary')) return null;
      if (sql.includes('FROM boost_events')) return null;
      if (sql.includes('COUNT(*) AS count')) return { count: 2 };
      return null;
    });
    mockCrossedStreakMilestone.mockReturnValue({ days: 7, multiplier: 2 });
    mockGetDb.mockResolvedValue(db);
    const mutation = useLogTask(5) as unknown as { mutationFn: (params: unknown) => Promise<unknown> };
    await expect(mutation.mutationFn({ taskTypeId: 9, kind: 'BAD', isTimeBased: false, basePoints: 1, starPenalty: 2 })).resolves.toMatchObject({
      prevStreak: 6, newStreak: 6,
    });
    expect(db.runAsync).toHaveBeenCalledWith(expect.stringContaining('INSERT OR IGNORE INTO boost_events'), expect.any(Array));
    expect(db.runAsync).toHaveBeenCalledWith(expect.stringContaining('UPDATE users SET treat_stars = MAX(0'), expect.any(Array));
  });

  test('unlogs the empty path and the bonus/bad-penalty path', async () => {
    const emptyDb = createDb();
    mockGetDb.mockResolvedValue(emptyDb);
    const mutation = useUnlogTask(5) as unknown as { mutationFn: (params: unknown) => Promise<unknown> };
    await expect(mutation.mutationFn({ taskTypeId: 9, kind: 'GOOD' })).resolves.toEqual({ lifetimeCrossings: [] });
    expect(mockEnqueuePendingActivityDeletes).toHaveBeenCalledWith(5, []);

    const db = createDb();
    db.getAllAsync
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 11, points_earned: 12, stars_delta: -2 }])
      .mockResolvedValueOnce([{ id: 22 }]);
    db.getFirstAsync.mockResolvedValue({ total_points: 20, bonus_star_awarded: 1 });
    mockDailyBonusStarsForPoints.mockReturnValue(0);
    mockGetDb.mockResolvedValue(db);
    await expect(mutation.mutationFn({ taskTypeId: 9, kind: 'BAD' })).resolves.toEqual({ lifetimeCrossings: [] });
    expect(db.runAsync).toHaveBeenCalledWith(expect.stringContaining('UPDATE users SET treat_stars = treat_stars +'), expect.any(Array));
    expect(mockRestoreReactivatedChallengeReminders).toHaveBeenCalled();
    expect(mockEnqueuePendingActivityDeletes).toHaveBeenCalledWith(5, [22, 11]);
  });

  test('logs a bonus row for an existing day and tolerates reminder sync failure', async () => {
    const db = createDb();
    db.getAllAsync.mockResolvedValue([{ id: 1, tier_order: 1, rank_name: 'A', stars_required: 1 }]);
    db.getFirstAsync.mockImplementation(async (sql: string) => {
      if (sql.includes('total_points, bonus_star_awarded, streak_count')) return { total_points: 9, bonus_star_awarded: 0, streak_count: 4 };
      if (sql.includes('MAX(streak_count)')) return { best: 4 };
      if (sql.includes('FROM weekly_summary')) return { weekly_stars: 5 };
      if (sql.includes('FROM boost_events')) return null;
      if (sql.includes('COUNT(*) AS count')) return { count: 2 };
      return null;
    });
    mockComputeLogTaskRows.mockReturnValueOnce({
      activityRow: {
        user_id: 5, task_type_id: 9, kind: 'GOOD', duration_min: null,
        points_earned: 10, stars_delta: 1, source: 'TASK', logged_at: 123,
        local_date: '2026-08-17', week_start: '2026-08-17',
      },
      bonusRow: {
        user_id: 5, task_type_id: null, kind: 'DAILY_BONUS', duration_min: null,
        points_earned: 0, stars_delta: 1, source: 'DAILY_BONUS', logged_at: 123,
        local_date: '2026-08-17', week_start: '2026-08-17',
      },
    });
    mockLogActiveChallengeDay.mockResolvedValueOnce({ status: 'logged', lifetimeCrossings: [{ tierId: 3 }] });
    mockApplyLifetimeStarsDelta.mockResolvedValueOnce({ crossings: [{ tierId: 2 }] });
    mockGetStoredGoogleUser.mockResolvedValueOnce({ email: 'a@example.com', sub: 'sub', name: 'A', photo: null });
    mockSyncActiveChallengeReminders.mockRejectedValueOnce(new Error('notifications unavailable'));
    mockGetDb.mockResolvedValue(db);

    const mutation = useLogTask(5) as unknown as {
      mutationFn: (params: { taskTypeId: number; kind: 'GOOD'; isTimeBased: boolean; basePoints: number; starPenalty: number }) => Promise<any>;
      onSuccess: (data: { lifetimeCrossings: unknown[]; isFirstEverLog: boolean; newStreak: number }) => void;
    };
    const result = await mutation.mutationFn({ taskTypeId: 9, kind: 'GOOD', isTimeBased: false, basePoints: 10, starPenalty: 0 });
    expect(result).toMatchObject({ newStreak: 4, prevStreak: 4, isFirstEverLog: false });
    expect(db.runAsync).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO activity_log'), expect.any(Array));
    expect(mockCancelTerminalChallengeReminders).toHaveBeenCalledWith(db, 5);
    mutation.onSuccess(result);
    await Promise.resolve();
    expect(mockSyncUserStreak).toHaveBeenCalledWith('a@example.com', 4, 'sub');
  });

  test('unlogs a good task, removes the stale bonus, and restores linked reminders', async () => {
    const db = createDb();
    db.getAllAsync
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 11, points_earned: 12, stars_delta: 2 }])
      .mockResolvedValueOnce([{ id: 22 }]);
    db.getFirstAsync.mockResolvedValue({ total_points: 20, bonus_star_awarded: 1 });
    mockDailyBonusStarsForPoints.mockReturnValue(0);
    mockApplyLifetimeStarsDelta.mockResolvedValueOnce({ crossings: [{ tierId: 4 }] });
    mockReconcileUnloggedLinkedChallenges.mockResolvedValueOnce({
      lifetimeCrossings: [{ tierId: 5 }],
      reactivatedChallenges: [{ id: 1 }],
      deletedActivityIds: [33],
    });
    mockSyncActiveChallengeReminders.mockRejectedValueOnce(new Error('notifications unavailable'));
    mockGetDb.mockResolvedValue(db);

    const mutation = useUnlogTask(5) as unknown as {
      mutationFn: (params: { taskTypeId: number; kind: 'GOOD' }) => Promise<{ lifetimeCrossings: unknown[] }>;
      onSuccess: (data: { lifetimeCrossings: unknown[] }) => void;
    };
    const result = await mutation.mutationFn({ taskTypeId: 9, kind: 'GOOD' });
    expect(result).toEqual({ lifetimeCrossings: [{ tierId: 4 }, { tierId: 5 }] });
    expect(mockRestoreReactivatedChallengeReminders).toHaveBeenCalledWith(db, [{ id: 1 }]);
    expect(mockEnqueuePendingActivityDeletes).toHaveBeenCalledWith(5, [22, 11, 33]);
    mutation.onSuccess(result);
    await Promise.resolve();
    expect(mockSyncCurrentUserToSupabase).toHaveBeenCalled();
  });

  test('replaces a stale daily bonus row when unlogging leaves bonus stars to retain', async () => {
    const db = createDb();
    db.getAllAsync
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 11, points_earned: 5, stars_delta: 1 }])
      .mockResolvedValueOnce([{ id: 22 }]);
    db.getFirstAsync.mockResolvedValue({ total_points: 20, bonus_star_awarded: 2 });
    mockDailyBonusStarsForPoints.mockReturnValue(1);
    mockGetDb.mockResolvedValue(db);

    const mutation = useUnlogTask(5) as unknown as { mutationFn: (params: unknown) => Promise<unknown> };
    await mutation.mutationFn({ taskTypeId: 9, kind: 'GOOD' });
    expect(db.runAsync).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO activity_log"), expect.any(Array));
  });

  test('executes rank celebration callbacks when an unlog crosses a tier', async () => {
    const playRankUp = jest.fn();
    const onRankUp = jest.fn();
    (rankMascotBridge as unknown as { ref: unknown; onRankUp: unknown }).ref = { current: { playRankUp } };
    (rankMascotBridge as unknown as { ref: unknown; onRankUp: unknown }).onRankUp = onRankUp;
    const mutation = useUnlogTask(5) as unknown as { onSuccess: (data: { lifetimeCrossings: unknown[] }) => void };
    mutation.onSuccess({ lifetimeCrossings: [{ tierId: 4 }] });
    await Promise.resolve();
    expect(playRankUp).toHaveBeenCalled();
    expect(onRankUp).toHaveBeenCalledWith([{ tierId: 4 }]);
  });

  test('unlogs safely when the daily summary row is absent', async () => {
    const db = createDb();
    db.getAllAsync
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 12, points_earned: 2, stars_delta: 1 }]);
    db.getFirstAsync.mockResolvedValue(null);
    mockGetDb.mockResolvedValue(db);
    const mutation = useUnlogTask(5) as unknown as { mutationFn: (params: unknown) => Promise<unknown> };
    await expect(mutation.mutationFn({ taskTypeId: 9, kind: 'GOOD' })).resolves.toEqual({ lifetimeCrossings: [] });
  });
});
