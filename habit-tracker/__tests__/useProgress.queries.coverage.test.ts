import type { SQLiteDatabase } from 'expo-sqlite';

(globalThis as { __DEV__?: boolean }).__DEV__ = true;

const mockGetDb = jest.fn();
const mockUseGoogleUser = jest.fn() as jest.Mock;
const mockGetAccountActivityStartDate = jest.fn() as jest.Mock;
const mockReadAnalyticsYearStars = jest.fn().mockResolvedValue(7);

jest.mock('../src/db/client', () => ({ getDb: mockGetDb }));
jest.mock('../src/hooks/authContext', () => ({ useGoogleUser: mockUseGoogleUser }));
jest.mock('../src/lib/accountActivityBoundary', () => ({ getAccountActivityStartDate: mockGetAccountActivityStartDate }));
jest.mock('../src/analytics/yearStars', () => ({
  ANALYTICS_STAR_SOURCE: 'ANALYTICS_STAR',
  readAnalyticsYearStars: mockReadAnalyticsYearStars,
  sumAnalyticsStars: jest.fn(() => 1),
}));
jest.mock('../src/api/syncService', () => ({ syncCurrentUserToSupabase: jest.fn() }));
jest.mock('../src/game/lifetimeRankWrites', () => ({ applyLifetimeStarsDelta: jest.fn() }));
jest.mock('../src/game/pendingLevelUpQueue', () => ({ enqueuePendingLevelUps: jest.fn() }));
jest.mock('../src/game/pendingActivityDeletes', () => ({ enqueuePendingActivityDeletes: jest.fn() }));
jest.mock('../src/lib/rankMascotBridge', () => ({ rankMascotBridge: {} }));
jest.mock('../src/utils/formatters', () => ({
  getLocalDate: jest.fn(() => '2026-09-05'),
  getLocalDateOffset: jest.fn((days: number) => `offset-${days}`),
  getMonthOffset: jest.fn(() => '2026-09'),
  getYearOffset: jest.fn(() => '2026'),
  getWeekStart: jest.fn(() => '2026-09-01'),
  getMillisecondsUntilLocalMidnight: jest.fn(() => 1234),
}));
jest.mock('@tanstack/react-query', () => ({
  useQuery: jest.fn((options) => options),
  useMutation: jest.fn((options) => options),
  useQueryClient: jest.fn(() => ({ invalidateQueries: jest.fn() })),
}));

import {
  useAllTimeStats,
  useAnalyticsDashboard,
  useAnalyticsPointsData,
  useDeleteActivityLogs,
  useRecentActivityLogs,
  useStreakCount,
  useTopActivities,
  useWeeklyConsistency,
} from '../src/queries/useProgress';

function createDb() {
  const getAllAsync = jest.fn().mockResolvedValue([]);
  const getFirstAsync = jest.fn().mockResolvedValue(null);
  const runAsync = jest.fn().mockResolvedValue({ changes: 1 });
  return {
    getAllAsync,
    getFirstAsync,
    runAsync,
    withTransactionAsync: jest.fn(async (cb: () => Promise<void>) => cb()),
  } as unknown as SQLiteDatabase;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAccountActivityStartDate.mockReturnValue(undefined);
  mockUseGoogleUser.mockReturnValue(null);
  mockReadAnalyticsYearStars.mockResolvedValue(7);
});

describe('progress query contracts', () => {
  test.each(['W', 'M', 'Y'] as const)('builds the %s points query', async range => {
    const db = createDb();
    const rows = [{ bucket: range, points: 12 }];
    jest.mocked(db.getAllAsync).mockResolvedValue(rows);
    mockGetDb.mockResolvedValue(db);

    const query = useAnalyticsPointsData(5, range) as unknown as { queryFn: () => Promise<unknown> };
    await expect(query.queryFn()).resolves.toEqual(rows);
    expect(db.getAllAsync).toHaveBeenCalledWith(expect.stringContaining('GROUP BY bucket'), expect.arrayContaining([5, expect.any(String)]));
  });

  test('applies an account activity boundary and returns the live dashboard', async () => {
    mockUseGoogleUser.mockReturnValue({ email: 'a@example.com' });
    mockGetAccountActivityStartDate.mockReturnValue('2026-08-20');
    const db = createDb();
    jest.mocked(db.getAllAsync)
      .mockResolvedValueOnce([{ local_date: '2026-09-01', total_points: 10 }])
      .mockResolvedValueOnce([{ local_date: '2026-09-01', logged_at: 1, points_earned: 10, stars_delta: 1, source: 'ANALYTICS_STAR', task_name: 'Read' }])
      .mockResolvedValueOnce([{ local_date: '2026-09-01' }]);
    mockGetDb.mockResolvedValue(db);

    const query = useAnalyticsDashboard(5, 'M') as unknown as { queryFn: () => Promise<Record<string, unknown>> };
    const result = await query.queryFn();
    expect(result).toEqual(expect.objectContaining({}));
    expect(db.getAllAsync).toHaveBeenCalledTimes(3);
    expect(mockGetAccountActivityStartDate).toHaveBeenCalledWith('a@example.com');
  });

  test('uses the development analytics demo when enabled', async () => {
    const previous = process.env.EXPO_PUBLIC_ANALYTICS_DEMO;
    process.env.EXPO_PUBLIC_ANALYTICS_DEMO = '1';
    try {
      const query = useAnalyticsDashboard(5, 'W') as unknown as { queryFn: () => Promise<unknown> };
      await expect(query.queryFn()).resolves.toEqual(expect.objectContaining({}));
      expect(mockGetDb).not.toHaveBeenCalled();
    } finally {
      if (previous === undefined) delete process.env.EXPO_PUBLIC_ANALYTICS_DEMO;
      else process.env.EXPO_PUBLIC_ANALYTICS_DEMO = previous;
    }
  });

  test('loads scalar progress queries and preserves zero fallbacks', async () => {
    const db = createDb();
    const first = db.getFirstAsync as unknown as jest.Mock;
    first.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    mockGetDb.mockResolvedValue(db);

    const streak = useStreakCount(5) as unknown as { queryFn: () => Promise<number> };
    await expect(streak.queryFn()).resolves.toBe(0);
    const consistency = useWeeklyConsistency(5) as unknown as { queryFn: () => Promise<number> };
    await expect(consistency.queryFn()).resolves.toBe(0);
  });

  test('loads activity logs, top activities, and all-time stats', async () => {
    const db = createDb();
    const logs = [{ id: 1, task_name: 'Read', kind: 'GOOD', stars_delta: 1, local_date: '2026-09-05', logged_at: 10, source: 'TASK' }];
    jest.mocked(db.getAllAsync)
      .mockResolvedValueOnce(logs)
      .mockResolvedValueOnce([{ name: 'Read', count: 3 }]);
    jest.mocked(db.getFirstAsync)
      .mockResolvedValueOnce({ total: 4 })
      .mockResolvedValueOnce({ best: 5 })
      .mockResolvedValueOnce({ total: 3 });
    mockGetDb.mockResolvedValue(db);

    const recent = useRecentActivityLogs(5, 10, '2026-09-01', '2026-09-05') as unknown as { queryFn: () => Promise<unknown> };
    await expect(recent.queryFn()).resolves.toEqual(logs);
    const top = useTopActivities(5, 2) as unknown as { queryFn: () => Promise<unknown> };
    await expect(top.queryFn()).resolves.toEqual([{ name: 'Read', count: 3 }]);
    const stats = useAllTimeStats(5) as unknown as { queryFn: () => Promise<Record<string, number>> };
    await expect(stats.queryFn()).resolves.toEqual({ totalActivities: 4, totalStars: 7, bestStreak: 5, activeDays: 3 });
  });

  test('uses default activity-log dates and preserves non-zero scalar rows', async () => {
    const db = createDb();
    const rows = [{ id: 2, task_name: null, kind: 'BAD', stars_delta: -1, local_date: '2026-09-05', logged_at: 11, source: 'TASK' }];
    jest.mocked(db.getAllAsync).mockResolvedValue(rows);
    jest.mocked(db.getFirstAsync).mockResolvedValue({ streak_count: 4 });
    mockGetDb.mockResolvedValue(db);

    const recent = useRecentActivityLogs(5) as unknown as { queryFn: () => Promise<unknown> };
    await expect(recent.queryFn()).resolves.toEqual(rows);
    expect(db.getAllAsync).toHaveBeenCalledWith(expect.stringContaining('local_date BETWEEN ? AND ?'), [5, 'offset--6', '2026-09-05', '0000-01-01', 50]);

    const streak = useStreakCount(5) as unknown as { queryFn: () => Promise<number> };
    await expect(streak.queryFn()).resolves.toBe(4);
  });

  test('short-circuits deletion when there are no selected ids', async () => {
    const mutation = useDeleteActivityLogs(5) as unknown as { mutationFn: (ids: number[]) => Promise<unknown> };
    await expect(mutation.mutationFn([])).resolves.toEqual({ lifetimeCrossings: [] });
    expect(mockGetDb).not.toHaveBeenCalled();
  });

  test('covers year dashboard bounds, account-specific query bounds, and zero all-time fallbacks', async () => {
    mockUseGoogleUser.mockReturnValue({ email: 'a@example.com' });
    mockGetAccountActivityStartDate.mockReturnValue('2026-09-01');
    const db = createDb();
    mockGetDb.mockResolvedValue(db);

    const points = useAnalyticsPointsData(5, 'Y') as unknown as { queryFn: () => Promise<unknown> };
    await expect(points.queryFn()).resolves.toEqual([]);

    const dashboard = useAnalyticsDashboard(5, 'Y') as unknown as { queryFn: () => Promise<unknown> };
    await expect(dashboard.queryFn()).resolves.toEqual(expect.objectContaining({}));

    const consistency = useWeeklyConsistency(5) as unknown as { queryFn: () => Promise<number> };
    const top = useTopActivities(5, 1) as unknown as { queryFn: () => Promise<unknown> };
    await expect(consistency.queryFn()).resolves.toBe(0);
    await expect(top.queryFn()).resolves.toEqual([]);

    const stats = useAllTimeStats(5) as unknown as { queryFn: () => Promise<Record<string, number>> };
    await expect(stats.queryFn()).resolves.toEqual({ totalActivities: 0, totalStars: 7, bestStreak: 0, activeDays: 0 });
  });

  test('keeps the rolling dashboard bound when the account boundary is older', async () => {
    mockUseGoogleUser.mockReturnValue({ email: 'old@example.com' });
    mockGetAccountActivityStartDate.mockReturnValue('2020-01-01');
    const db = createDb();
    mockGetDb.mockResolvedValue(db);
    const query = useAnalyticsDashboard(5, 'W') as unknown as { queryFn: () => Promise<unknown> };
    await expect(query.queryFn()).resolves.toEqual(expect.objectContaining({}));
    expect(db.getAllAsync).toHaveBeenCalledWith(expect.stringContaining('activity_log'), expect.arrayContaining([5, 'ANALYTICS_STAR', 'offset--13']));
  });

  test('uses a newer account boundary for rolling dashboard logs and recent activity queries', async () => {
    mockUseGoogleUser.mockReturnValue({ email: 'new@example.com' });
    mockGetAccountActivityStartDate.mockReturnValue('2026-08-20');
    const formatters = jest.requireMock('../src/utils/formatters') as { getLocalDateOffset: jest.Mock };
    const originalOffset = formatters.getLocalDateOffset.getMockImplementation();
    formatters.getLocalDateOffset.mockImplementation((days: number) => days === -13 ? '2026-01-01' : `offset-${days}`);
    const db = createDb();
    mockGetDb.mockResolvedValue(db);
    try {
      const dashboard = useAnalyticsDashboard(5, 'W') as unknown as { queryFn: () => Promise<unknown> };
      await dashboard.queryFn();
      const recent = useRecentActivityLogs(5) as unknown as { queryFn: () => Promise<unknown> };
      await recent.queryFn();
      expect(db.getAllAsync).toHaveBeenCalledWith(expect.stringContaining('activity_log'), expect.arrayContaining([5, 'ANALYTICS_STAR', '2026-08-20']));
    } finally {
      formatters.getLocalDateOffset.mockImplementation(originalOffset);
    }
  });

  test('preserves a non-zero weekly consistency row', async () => {
    const db = createDb();
    (db.getFirstAsync as unknown as jest.Mock).mockResolvedValue({ active_days: 4 });
    mockGetDb.mockResolvedValue(db);
    const consistency = useWeeklyConsistency(5) as unknown as { queryFn: () => Promise<number> };
    await expect(consistency.queryFn()).resolves.toBe(4);
  });
});
