export type Tier = 'iron' | 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond';
export type Emblem =
  | 'sprout' | 'book' | 'flame' | 'flame2' | 'rankup' | 'crown' | 'trophy' | 'calcheck';

/** Metrics are derived live from existing app data — see src/lib/achievements.ts */
export type Metric = 'streak' | 'challengeDays' | 'rankTier' | 'firstLog' | 'weeklyOverachieve';

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
  { id: 'first', tier: 'iron', emblem: 'sprout', labelKey: 'achFirst', goal: 1, metric: 'firstLog' },
  { id: 'streak7', tier: 'bronze', emblem: 'flame', labelKey: 'achStreak7', goal: 7, metric: 'streak' },
  { id: 'challenge14', tier: 'bronze', emblem: 'book', labelKey: 'achChallenge14', goal: 14, metric: 'challengeDays' },
  { id: 'streak30', tier: 'silver', emblem: 'flame2', labelKey: 'achStreak30', goal: 30, metric: 'streak' },
  { id: 'challenge30', tier: 'silver', emblem: 'calcheck', labelKey: 'achChallenge30', goal: 30, metric: 'challengeDays' },
  { id: 'rizz', tier: 'gold', emblem: 'rankup', labelKey: 'achRizz', goal: 3, metric: 'rankTier' },
  { id: 'challenge66', tier: 'gold', emblem: 'calcheck', labelKey: 'achChallenge66', goal: 66, metric: 'challengeDays' },
  { id: 'streak100', tier: 'platinum', emblem: 'trophy', labelKey: 'achStreak100', goal: 100, metric: 'streak' },
  { id: 'auraFarmer', tier: 'diamond', emblem: 'crown', labelKey: 'achAuraFarmer', goal: 5, metric: 'rankTier' },
  { id: 'overachiever', tier: 'gold', emblem: 'calcheck', labelKey: 'achOverachiever', goal: 3, metric: 'weeklyOverachieve' },
];

export const FILTERS = ['all', 'streak', 'challenge', 'rank'] as const;
export type AchievementFilter = typeof FILTERS[number];

export function matchesFilter(a: Achievement, filter: AchievementFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'streak') return a.metric === 'streak';
  if (filter === 'challenge') return a.metric === 'challengeDays' || a.metric === 'weeklyOverachieve';
  return a.metric === 'rankTier';
}
