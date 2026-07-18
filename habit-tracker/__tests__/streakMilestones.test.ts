import { crossedStreakMilestone } from '../src/game/streakMilestones';

describe('crossedStreakMilestone', () => {
  it('returns only the highest milestone when backfill crosses several', () => {
    expect(crossedStreakMilestone(6, 7)).toEqual({ days: 7, stars: 1 });
    expect(crossedStreakMilestone(6, 100)).toEqual({ days: 100, stars: 6 });
    expect(crossedStreakMilestone(100, 101)).toBeNull();
  });
});
