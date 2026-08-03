import { crossedStreakMilestone } from '../src/game/streakMilestones';

describe('crossedStreakMilestone', () => {
  it('returns each configured milestone with a boost but no star reward', () => {
    expect(crossedStreakMilestone(6, 7)).toEqual({ days: 7, multiplier: 2 });
    expect(crossedStreakMilestone(13, 14)).toEqual({ days: 14, multiplier: 2 });
    expect(crossedStreakMilestone(29, 30)).toEqual({ days: 30, multiplier: 2 });
    expect(crossedStreakMilestone(59, 60)).toEqual({ days: 60, multiplier: 3 });
    expect(crossedStreakMilestone(89, 90)).toEqual({ days: 90, multiplier: 3 });
    expect(crossedStreakMilestone(99, 100)).toEqual({ days: 100, multiplier: 3 });
    expect(crossedStreakMilestone(179, 180)).toEqual({ days: 180, multiplier: 3 });
    expect(crossedStreakMilestone(364, 365)).toEqual({ days: 365, multiplier: 3 });
  });

  it('returns only the highest crossed milestone', () => {
    expect(crossedStreakMilestone(6, 200)).toEqual({ days: 180, multiplier: 3 });
    expect(crossedStreakMilestone(365, 366)).toBeNull();
  });
});
