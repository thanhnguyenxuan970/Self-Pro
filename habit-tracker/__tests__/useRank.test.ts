jest.mock('../src/db/client', () => ({}));

import { visibleTierId, type TierRow } from '../src/queries/useRank';

const tiers: TierRow[] = [{ id: 1, tier_order: 1, rank_name: 'Delulu', stars_required: 5 }];

test('hides a stored tier until its star threshold is reached', () => {
  expect(visibleTierId(1, 4, tiers)).toBeNull();
  expect(visibleTierId(1, 5, tiers)).toBe(1);
});
