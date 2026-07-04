import { computeAchievementStatus } from '../src/lib/achievements';
import type { Achievement } from '../src/config/achievements';

const streakAch: Achievement = { id: 'streak7', tier: 'bronze', emblem: 'flame', labelKey: 'achStreak7', goal: 7, metric: 'streak' };

describe('computeAchievementStatus', () => {
  it('is unearned with partial progress below goal', () => {
    const status = computeAchievementStatus(streakAch, { totalActivities: 0, bestStreak: 3, challengeDaysDone: 0, rankTierOrder: 0 });
    expect(status).toEqual({ current: 3, earned: false, progress: 43 });
  });

  it('is earned exactly at goal', () => {
    const status = computeAchievementStatus(streakAch, { totalActivities: 0, bestStreak: 7, challengeDaysDone: 0, rankTierOrder: 0 });
    expect(status).toEqual({ current: 7, earned: true, progress: 100 });
  });

  it('stays earned and caps progress at 100 beyond goal', () => {
    const status = computeAchievementStatus(streakAch, { totalActivities: 0, bestStreak: 200, challengeDaysDone: 0, rankTierOrder: 0 });
    expect(status).toEqual({ current: 200, earned: true, progress: 100 });
  });

  it('reads the firstLog metric as a 0/1 boolean derived from totalActivities', () => {
    const firstAch: Achievement = { id: 'first', tier: 'iron', emblem: 'sprout', labelKey: 'achFirst', goal: 1, metric: 'firstLog' };
    expect(computeAchievementStatus(firstAch, { totalActivities: 0, bestStreak: 0, challengeDaysDone: 0, rankTierOrder: 0 }).earned).toBe(false);
    expect(computeAchievementStatus(firstAch, { totalActivities: 5, bestStreak: 0, challengeDaysDone: 0, rankTierOrder: 0 }).earned).toBe(true);
  });
});
