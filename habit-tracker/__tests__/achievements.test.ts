import { ACHIEVEMENTS, type Achievement } from '../src/config/achievements';
import { computeAchievementStatus, type AchievementStats } from '../src/lib/achievements';

const stats: AchievementStats = {
  totalActivities: 100,
  bestStreak: 30,
  challengeDaysDone: 66,
  rankTierOrder: 7,
  weeklyOverachieveWeeks: 3,
  activeDays: 30,
  morningLogs: 1,
  nightLogs: 1,
  totalStars: 50,
  activityTypes: 5,
};

const streakAch: Achievement = { id: 'streak7', tier: 'bronze', emblem: 'flame', labelKey: 'achStreak7', goal: 7, metric: 'streak' };

describe('computeAchievementStatus', () => {
  it('is unearned with partial progress below goal', () => {
    expect(computeAchievementStatus(streakAch, { ...stats, bestStreak: 3 })).toEqual({ current: 3, earned: false, progress: 43 });
  });

  it('is earned exactly at goal', () => {
    expect(computeAchievementStatus(streakAch, { ...stats, bestStreak: 7 })).toEqual({ current: 7, earned: true, progress: 100 });
  });

  it('stays earned and caps progress at 100 beyond goal', () => {
    expect(computeAchievementStatus(streakAch, { ...stats, bestStreak: 200 })).toEqual({ current: 200, earned: true, progress: 100 });
  });

  it('reads the firstLog metric as a 0/1 boolean derived from totalActivities', () => {
    const firstAch: Achievement = { id: 'first', tier: 'silver', emblem: 'sprout', labelKey: 'achFirst', goal: 1, metric: 'firstLog' };
    expect(computeAchievementStatus(firstAch, { ...stats, totalActivities: 0 }).earned).toBe(false);
    expect(computeAchievementStatus(firstAch, { ...stats, totalActivities: 5 }).earned).toBe(true);
  });

  it('has twenty live trophy marks and locks new activity-derived trophies below their thresholds', () => {
    expect(ACHIEVEMENTS).toHaveLength(20);
    for (const achievement of ACHIEVEMENTS) expect(computeAchievementStatus(achievement, stats)).toMatchObject({ earned: true, progress: 100 });
    const collector = ACHIEVEMENTS.find(a => a.id === 'collector')!;
    expect(computeAchievementStatus(collector, { ...stats, activityTypes: 4 })).toMatchObject({ earned: false, progress: 80 });
  });
});
