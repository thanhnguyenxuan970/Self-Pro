const STREAK_MILESTONES = [7, 14, 30, 60, 180, 365] as const;

// Feature spec: 7–30 days → 2× boost · 60–365 days → 3× boost
function milestoneMultiplier(days: number): 2 | 3 {
  return days >= 60 ? 3 : 2;
}

const FLEX_STARS: Record<number, number> = { 7: 1, 14: 2, 30: 3, 60: 5, 180: 8, 365: 10 };

export type StreakMilestone = { days: number; stars: number; multiplier: 2 | 3 };

export function crossedStreakMilestone(previous: number, current: number): StreakMilestone | null {
  const days = [...STREAK_MILESTONES].reverse().find(day => day > previous && day <= current);
  if (days === undefined) return null;
  return { days, stars: FLEX_STARS[days], multiplier: milestoneMultiplier(days) };
}
