jest.mock('../src/db/client', () => ({}));

import { visibleTierId, type TierRow } from '../src/queries/useRank';

const tiers: TierRow[] = [
  { id: 1, tier_order: 1, rank_name: 'Delulu', stars_required: 5 },
  { id: 2, tier_order: 2, rank_name: 'Mewing', stars_required: 10 },
];

test('keeps the stored weekly rank visible while stars are accumulated', () => {
  expect(visibleTierId(1, 0, tiers)).toBe(1);
  expect(visibleTierId(1, 999, tiers)).toBe(1);
});

test('keeps only valid stored tiers visible', () => {
  expect(visibleTierId(null, 99, tiers)).toBeNull();
  expect(visibleTierId(999, 99, tiers)).toBeNull();
  expect(visibleTierId(2, 9, tiers)).toBe(2);
  expect(visibleTierId(2, 10, tiers)).toBe(2);
  expect(visibleTierId(2, 999, tiers)).toBe(2);
});
