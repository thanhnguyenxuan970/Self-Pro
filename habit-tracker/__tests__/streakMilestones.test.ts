import { crossedStreakMilestone } from '../src/game/streakMilestones';

describe('crossedStreakMilestone', () => {
  it('returns each configured milestone with its flex-star reward', () => {
    expect(crossedStreakMilestone(6, 7)).toEqual({ days: 7, stars: 1 });
    expect(crossedStreakMilestone(13, 14)).toEqual({ days: 14, stars: 2 });
    expect(crossedStreakMilestone(29, 30)).toEqual({ days: 30, stars: 3 });
    expect(crossedStreakMilestone(89, 90)).toEqual({ days: 90, stars: 5 });
    expect(crossedStreakMilestone(179, 180)).toEqual({ days: 180, stars: 8 });
    expect(crossedStreakMilestone(364, 365)).toEqual({ days: 365, stars: 10 });
  });

  it('skips retired milestones and returns only the highest crossed milestone', () => {
    expect(crossedStreakMilestone(59, 60)).toBeNull();
    expect(crossedStreakMilestone(6, 200)).toEqual({ days: 180, stars: 8 });
    expect(crossedStreakMilestone(365, 366)).toBeNull();
  });
});
