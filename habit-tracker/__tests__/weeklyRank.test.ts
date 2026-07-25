import { carryWeeklyProgress, resolveWeeklyRank } from '../src/game/weeklyRank';

const tiers = [
  { id: 1, tier_order: 1, stars_required: 5 },
  { id: 2, tier_order: 2, stars_required: 10 },
  { id: 3, tier_order: 3, stars_required: 25 },
];

test('only changes rank when the weekly reset resolves the previous week', () => {
  expect(resolveWeeklyRank(null, 5, tiers)).toEqual({ tierId: 1, promotedTierId: 1 });
  expect(resolveWeeklyRank(null, 4, tiers)).toEqual({ tierId: null, promotedTierId: null });
  expect(resolveWeeklyRank(1, 10, tiers)).toEqual({ tierId: 2, promotedTierId: 2 });
  expect(resolveWeeklyRank(2, 24, tiers)).toEqual({ tierId: 2, promotedTierId: null });
  expect(resolveWeeklyRank(2, 0, tiers)).toEqual({ tierId: 1, promotedTierId: null });
});

test('carries stars and peak into the next week', () => {
  expect(carryWeeklyProgress({ weeklyStars: 14, peakStars: 16, currentTierId: 1 }, tiers)).toMatchObject({
    weeklyStars: 14,
    peakStars: 16,
    currentTierId: 2,
  });
});

test('preserves progress below the first rank threshold', () => {
  expect(carryWeeklyProgress({ weeklyStars: 4, peakStars: 4, currentTierId: null }, tiers)).toMatchObject({
    weeklyStars: 4,
    peakStars: 4,
    currentTierId: null,
  });
});
