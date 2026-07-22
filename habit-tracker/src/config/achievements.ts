export type Tier = 'iron' | 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond';
export type Emblem =
  | 'sprout' | 'spark' | 'flame' | 'book' | 'calcheck' | 'mountain' | 'anchor' | 'ringcheck'
  | 'clock' | 'moon' | 'bolt' | 'target' | 'medal' | 'aura' | 'constellation' | 'crown' | 'chevrons';

/** Metrics are derived live from existing app data — see src/lib/achievements.ts */
export type Metric = 'streak' | 'challengeDays' | 'rankTier' | 'firstLog' | 'weeklyOverachieve' | 'activeDays' | 'morningLogs' | 'nightLogs' | 'totalStars' | 'totalLogs' | 'activityTypes';

export interface Achievement {
  id: string;
  tier: Tier;
  emblem: Emblem;
  labelKey: string; // i18n key for the badge title; `${labelKey}Desc` holds the description
  goal: number;
  metric: Metric;
}

/**
 * Goals are keyed to values the app already tracks: bestStreak (useAllTimeStats),
 * challenge days done across all challenges (useChallengeDaysTotal), and rank
 * tier_order (useRankData). Tier order 3 = "Rizz", 5 = "Aura Farmer" today.
 */
export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first', tier: 'silver', emblem: 'sprout', labelKey: 'achFirst', goal: 1, metric: 'firstLog' },
  { id: 'firstLog', tier: 'silver', emblem: 'spark', labelKey: 'achFirstLog', goal: 1, metric: 'firstLog' },
  { id: 'streak7', tier: 'bronze', emblem: 'flame', labelKey: 'achStreak7', goal: 7, metric: 'streak' },
  { id: 'challenge14', tier: 'bronze', emblem: 'book', labelKey: 'achChallenge14', goal: 14, metric: 'challengeDays' },
  { id: 'perfectWeek', tier: 'bronze', emblem: 'calcheck', labelKey: 'achPerfectWeek', goal: 7, metric: 'activeDays' },
  { id: 'streak30', tier: 'silver', emblem: 'mountain', labelKey: 'achStreak30', goal: 30, metric: 'streak' },
  { id: 'lockedIn', tier: 'silver', emblem: 'anchor', labelKey: 'achLockedIn', goal: 30, metric: 'activeDays' },
  { id: 'perfectLoop', tier: 'bronze', emblem: 'ringcheck', labelKey: 'achPerfectLoop', goal: 1, metric: 'weeklyOverachieve' },
  { id: 'earlyBird', tier: 'silver', emblem: 'clock', labelKey: 'achEarlyBird', goal: 1, metric: 'morningLogs' },
  { id: 'nightOwl', tier: 'silver', emblem: 'moon', labelKey: 'achNightOwl', goal: 1, metric: 'nightLogs' },
  { id: 'streakSaver', tier: 'silver', emblem: 'bolt', labelKey: 'achStreakSaver', goal: 14, metric: 'streak' },
  { id: 'challenge30', tier: 'silver', emblem: 'calcheck', labelKey: 'achChallenge30', goal: 30, metric: 'challengeDays' },
  { id: 'rizz', tier: 'bronze', emblem: 'target', labelKey: 'achRizz', goal: 50, metric: 'totalStars' },
  { id: 'challenge66', tier: 'gold', emblem: 'calcheck', labelKey: 'achChallenge66', goal: 66, metric: 'challengeDays' },
  { id: 'streak100', tier: 'bronze', emblem: 'medal', labelKey: 'achStreak100', goal: 100, metric: 'totalLogs' },
  { id: 'auraFarmer', tier: 'gold', emblem: 'aura', labelKey: 'achAuraFarmer', goal: 5, metric: 'rankTier' },
  { id: 'collector', tier: 'gold', emblem: 'constellation', labelKey: 'achCollector', goal: 5, metric: 'activityTypes' },
  { id: 'overachiever', tier: 'gold', emblem: 'chevrons', labelKey: 'achOverachiever', goal: 3, metric: 'weeklyOverachieve' },
  { id: 'mainCharacter', tier: 'gold', emblem: 'crown', labelKey: 'achMainCharacter', goal: 6, metric: 'rankTier' },
  { id: 'goated', tier: 'gold', emblem: 'chevrons', labelKey: 'achGoated', goal: 7, metric: 'rankTier' },
];

export const FILTERS = ['all', 'streak', 'challenge', 'rank'] as const;
export type AchievementFilter = typeof FILTERS[number];

export function matchesFilter(a: Achievement, filter: AchievementFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'streak') return a.metric === 'streak';
  if (filter === 'challenge') return a.metric === 'challengeDays' || a.metric === 'weeklyOverachieve';
  return a.metric === 'rankTier';
}
