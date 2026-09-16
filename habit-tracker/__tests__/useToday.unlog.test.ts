const invalidateQueries = jest.fn();

jest.mock('@tanstack/react-query', () => ({
  useMutation: jest.fn((options) => options),
  useQuery: jest.fn(),
  useQueryClient: jest.fn(() => ({ invalidateQueries })),
}));
jest.mock('../src/db/client', () => ({ getDb: jest.fn() }));
jest.mock('../src/hooks/useAuth', () => ({ getStoredGoogleUser: jest.fn() }));
jest.mock('../src/api/syncService', () => ({
  syncCurrentUserToSupabase: jest.fn(() => Promise.resolve()),
  syncUserStreak: jest.fn(),
}));
jest.mock('../src/queries/useChallenge', () => ({
  cancelTerminalChallengeReminders: jest.fn(),
  logActiveChallengeDay: jest.fn(),
  reconcileUnloggedLinkedChallenges: jest.fn(),
  restoreReactivatedChallengeReminders: jest.fn(),
  syncActiveChallengeReminders: jest.fn(),
}));
jest.mock('../src/hooks/useSettings', () => ({ useLanguage: jest.fn(() => ['en']) }));
jest.mock('../src/game/logTask', () => ({ computeLogTaskRows: jest.fn() }));
jest.mock('../src/utils/formatters', () => ({
  getLocalDate: jest.fn(() => '2026-08-17'),
  getLocalDateFor: jest.fn(() => '2026-08-16'),
  getWeekStart: jest.fn(() => '2026-08-17'),
}));
jest.mock('../src/config/constants', () => ({ dailyBonusStarsForPoints: jest.fn() }));
jest.mock('../src/game/streakMilestones', () => ({ crossedStreakMilestone: jest.fn() }));
jest.mock('../src/game/boost', () => ({ boostEndOfDayMs: jest.fn(), isBoostActiveAt: jest.fn(), summarizeBoostLogs: jest.fn() }));
jest.mock('../src/game/lifetimeRankWrites', () => ({ applyLifetimeStarsDelta: jest.fn() }));
jest.mock('../src/game/pendingLevelUpQueue', () => ({ enqueuePendingLevelUps: jest.fn() }));
jest.mock('../src/game/pendingActivityDeletes', () => ({ enqueuePendingActivityDeletesForUser: jest.fn() }));
jest.mock('../src/lib/rankMascotBridge', () => ({ rankMascotBridge: {} }));

import { useUnlogTask } from '../src/queries/useToday';
import { getDb } from '../src/db/client';
import { reconcileUnloggedLinkedChallenges } from '../src/queries/useChallenge';
import { applyLifetimeStarsDelta } from '../src/game/lifetimeRankWrites';
import { enqueuePendingActivityDeletesForUser } from '../src/game/pendingActivityDeletes';
import { dailyBonusStarsForPoints } from '../src/config/constants';

describe('useUnlogTask', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('refreshes linked Challenge state after a Daily activity is unchecked', () => {
    const mutation = useUnlogTask(5) as unknown as {
      onSuccess: (data: { lifetimeCrossings: [] }) => void;
    };

    mutation.onSuccess({ lifetimeCrossings: [] });

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['challenge'] });
  });

  it('records the deleted activity_log row so an already-synced Supabase copy is cleaned up next sync', async () => {
    jest.mocked(dailyBonusStarsForPoints).mockReturnValue(0);
    jest.mocked(applyLifetimeStarsDelta).mockResolvedValue({ crossings: [] });
    jest.mocked(reconcileUnloggedLinkedChallenges).mockResolvedValue({
      lifetimeCrossings: [], reactivatedChallenges: [], deletedActivityIds: [],
    });

    const runAsync = jest.fn(async () => ({ changes: 1 }));
    let transactionOpen = false;
    const db = {
      getAllAsync: jest.fn(async (sql: string) => {
        if (sql.includes('FROM tiers')) return [];
        if (sql.includes("source = 'TASK'")) return [{ id: 42, points_earned: 1, stars_delta: 1 }];
        if (sql.includes("source = 'DAILY_BONUS'")) return [];
        return [];
      }),
      getFirstAsync: jest.fn(async (sql: string) => (
        sql.includes('daily_summary') ? { total_points: 1, bonus_star_awarded: 0 } : null
      )),
      runAsync,
      withTransactionAsync: jest.fn(async (callback: () => Promise<void>) => {
        transactionOpen = true;
        try {
          await callback();
        } finally {
          transactionOpen = false;
        }
      }),
    };
    jest.mocked(getDb).mockResolvedValue(db as never);
    jest.mocked(enqueuePendingActivityDeletesForUser).mockImplementationOnce(async () => {
      expect(transactionOpen).toBe(true);
    });

    const mutation = useUnlogTask(5) as unknown as {
      mutationFn: (params: { taskTypeId: number; kind: 'GOOD' | 'BAD' }) => Promise<{ lifetimeCrossings: unknown[] }>;
    };
    await mutation.mutationFn({ taskTypeId: 7, kind: 'GOOD' });

    expect(runAsync).toHaveBeenCalledWith('DELETE FROM activity_log WHERE id IN (?)', [42]);
    expect(enqueuePendingActivityDeletesForUser).toHaveBeenCalledWith(db, 5, [42]);
  });
});
