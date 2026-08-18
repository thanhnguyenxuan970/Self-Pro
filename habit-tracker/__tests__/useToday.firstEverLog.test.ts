const invalidateQueries = jest.fn();

jest.mock('@tanstack/react-query', () => ({
  useMutation: jest.fn((options) => options),
  useQuery: jest.fn(),
  useQueryClient: jest.fn(() => ({ invalidateQueries })),
}));
jest.mock('../src/db/client', () => ({ getDb: jest.fn() }));
jest.mock('../src/hooks/useAuth', () => ({ getStoredGoogleUser: jest.fn(() => Promise.resolve(null)) }));
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
jest.mock('../src/config/constants', () => ({ dailyBonusStarsForPoints: jest.fn(), SOURCE_TASK: 'TASK' }));
jest.mock('../src/game/streakMilestones', () => ({ crossedStreakMilestone: jest.fn() }));
jest.mock('../src/game/boost', () => ({ boostEndOfDayMs: jest.fn(), isBoostActiveAt: jest.fn(), summarizeBoostLogs: jest.fn() }));
jest.mock('../src/game/lifetimeRankWrites', () => ({ applyLifetimeStarsDelta: jest.fn() }));
jest.mock('../src/game/pendingLevelUpQueue', () => ({ enqueuePendingLevelUps: jest.fn() }));
jest.mock('../src/game/pendingSurveyD0', () => ({ markSurveyD0Pending: jest.fn(() => Promise.resolve()) }));
jest.mock('../src/hooks/useSurveyD0Intent', () => ({ notifyFirstEverLog: jest.fn() }));
jest.mock('../src/lib/rankMascotBridge', () => ({ rankMascotBridge: {} }));

import { useLogTask } from '../src/queries/useToday';
import { markSurveyD0Pending } from '../src/game/pendingSurveyD0';
import { notifyFirstEverLog } from '../src/hooks/useSurveyD0Intent';

describe('useLogTask onSuccess — D0 survey trigger', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('marks the survey pending and notifies subscribers when this was the first-ever log', async () => {
    const mutation = useLogTask(5) as unknown as {
      onSuccess: (data: { lifetimeCrossings: []; isFirstEverLog: boolean; newStreak: number }) => void;
    };

    mutation.onSuccess({ lifetimeCrossings: [], isFirstEverLog: true, newStreak: 1 });
    await Promise.resolve(); // flush the .then() chain

    expect(markSurveyD0Pending).toHaveBeenCalledTimes(1);
    expect(notifyFirstEverLog).toHaveBeenCalledTimes(1);
  });

  it('does nothing survey-related on an ordinary (non-first) log', async () => {
    const mutation = useLogTask(5) as unknown as {
      onSuccess: (data: { lifetimeCrossings: []; isFirstEverLog: boolean; newStreak: number }) => void;
    };

    mutation.onSuccess({ lifetimeCrossings: [], isFirstEverLog: false, newStreak: 4 });
    await Promise.resolve();

    expect(markSurveyD0Pending).not.toHaveBeenCalled();
    expect(notifyFirstEverLog).not.toHaveBeenCalled();
  });
});
