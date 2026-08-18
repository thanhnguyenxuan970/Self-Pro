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
jest.mock('../src/lib/rankMascotBridge', () => ({ rankMascotBridge: {} }));

import { useUnlogTask } from '../src/queries/useToday';

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
});
