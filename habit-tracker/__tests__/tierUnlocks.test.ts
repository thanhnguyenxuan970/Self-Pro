import { computeTierUnlocks, TierRow } from '../src/logic/tierUnlocks';

const tiers: TierRow[] = [
  { id: 1, stars_required: 10,  reward_amount: 50000,  reward_currency: 'VND' },
  { id: 2, stars_required: 25,  reward_amount: 100000, reward_currency: 'VND' },
  { id: 3, stars_required: 50,  reward_amount: 150000, reward_currency: 'VND' },
];

const base = {
  userId: 1,
  weekStart: '2026-05-25',
  oldStars: 8,
  newStars: 9,
  tiers,
  alreadyUnlockedTierIds: [] as number[],
};

test('no tier crossed → empty array', () => {
  expect(computeTierUnlocks(base)).toHaveLength(0);
});

test('crosses tier 1 threshold exactly → one unlock', () => {
  const result = computeTierUnlocks({ ...base, newStars: 10 });
  expect(result).toHaveLength(1);
  expect(result[0].tier_id).toBe(1);
  expect(result[0].reward_amount).toBe(50000);
  expect(result[0].stars_at_unlock).toBe(10);
  expect(result[0].user_id).toBe(1);
  expect(result[0].week_start).toBe('2026-05-25');
});

test('skips two tiers in one jump → two unlocks in order', () => {
  const result = computeTierUnlocks({ ...base, oldStars: 8, newStars: 26 });
  expect(result).toHaveLength(2);
  expect(result.map(u => u.tier_id)).toEqual([1, 2]);
});

test('already unlocked tier is excluded', () => {
  const result = computeTierUnlocks({
    ...base,
    oldStars: 8,
    newStars: 26,
    alreadyUnlockedTierIds: [1],
  });
  expect(result).toHaveLength(1);
  expect(result[0].tier_id).toBe(2);
});

test('stars go negative (BAD task penalty) → no unlocks', () => {
  const result = computeTierUnlocks({ ...base, oldStars: 15, newStars: -35 });
  expect(result).toHaveLength(0);
});
