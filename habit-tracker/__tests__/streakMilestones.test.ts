import { crossedStreakMilestone } from '../src/game/streakMilestones';

describe('crossedStreakMilestone', () => {
  it('returns each configured milestone with its flex-star reward and boost multiplier', () => {
    expect(crossedStreakMilestone(6, 7)).toEqual({ days: 7, stars: 1, multiplier: 2 });
    expect(crossedStreakMilestone(13, 14)).toEqual({ days: 14, stars: 2, multiplier: 2 });
    expect(crossedStreakMilestone(29, 30)).toEqual({ days: 30, stars: 3, multiplier: 2 });
    expect(crossedStreakMilestone(59, 60)).toEqual({ days: 60, stars: 5, multiplier: 3 });
    expect(crossedStreakMilestone(179, 180)).toEqual({ days: 180, stars: 8, multiplier: 3 });
    expect(crossedStreakMilestone(364, 365)).toEqual({ days: 365, stars: 10, multiplier: 3 });
  });

  it('skips retired milestones and returns only the highest crossed milestone', () => {
    expect(crossedStreakMilestone(89, 90)).toBeNull();
    expect(crossedStreakMilestone(6, 200)).toEqual({ days: 180, stars: 8, multiplier: 3 });
    expect(crossedStreakMilestone(365, 366)).toBeNull();
  });
});
