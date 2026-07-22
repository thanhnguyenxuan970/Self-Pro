export const STREAK_MILESTONES = [7, 14, 30, 90, 180, 365] as const;

const FLEX_STARS: Record<number, number> = { 7: 1, 14: 2, 30: 3, 90: 5, 180: 8, 365: 10 };

export type StreakMilestone = { days: number; stars: number };

export function crossedStreakMilestone(previous: number, current: number): StreakMilestone | null {
  const days = [...STREAK_MILESTONES].reverse().find(day => day > previous && day <= current);
  return days === undefined ? null : { days, stars: FLEX_STARS[days] };
}
