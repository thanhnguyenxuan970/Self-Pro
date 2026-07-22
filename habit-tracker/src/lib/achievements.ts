import type { Achievement } from '../config/achievements';

export interface AchievementStats {
  totalActivities: number;
  bestStreak: number;
  challengeDaysDone: number;
  rankTierOrder: number;
  weeklyOverachieveWeeks: number;
  activeDays: number;
  morningLogs: number;
  nightLogs: number;
  totalStars: number;
  activityTypes: number;
}

export interface AchievementStatus {
  current: number;
  earned: boolean;
  progress: number; // 0-100
}

export function computeAchievementStatus(a: Achievement, stats: AchievementStats): AchievementStatus {
  const current: number = {
    streak: stats.bestStreak,
    challengeDays: stats.challengeDaysDone,
    rankTier: stats.rankTierOrder,
    firstLog: stats.totalActivities > 0 ? 1 : 0,
    weeklyOverachieve: stats.weeklyOverachieveWeeks,
    activeDays: stats.activeDays,
    morningLogs: stats.morningLogs,
    nightLogs: stats.nightLogs,
    totalStars: stats.totalStars,
    totalLogs: stats.totalActivities,
    activityTypes: stats.activityTypes,
  }[a.metric];

  return {
    current,
    earned: current >= a.goal,
    progress: Math.max(0, Math.min(100, Math.round((current / a.goal) * 100))),
  };
}
