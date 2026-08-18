const STREAK_MILESTONES = [7, 14, 30, 60, 90, 100, 180, 365] as const;
const TRIPLE_BOOST_START_DAYS = 60;

function milestoneMultiplier(days: number): 2 | 3 {
  return days >= TRIPLE_BOOST_START_DAYS ? 3 : 2;
}

export type StreakMilestone = { days: number; multiplier: 2 | 3 };

export function crossedStreakMilestone(previous: number, current: number): StreakMilestone | null {
  const days = [...STREAK_MILESTONES].reverse().find(day => day > previous && day <= current);
  if (days === undefined) return null;
  return { days, multiplier: milestoneMultiplier(days) };
}
