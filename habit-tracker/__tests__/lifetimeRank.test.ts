import { computeLifetimeTierCrossings, type LifetimeTierRow } from '../src/game/lifetimeRank';

const tiers: LifetimeTierRow[] = [
  { id: 1, tier_order: 1, rank_name: 'Delulu', stars_required: 5 },
  { id: 2, tier_order: 2, rank_name: 'Mewing', stars_required: 10 },
  { id: 3, tier_order: 3, rank_name: 'Rizz', stars_required: 20 },
  { id: 4, tier_order: 4, rank_name: 'Gigachad', stars_required: 40 },
];

test('no tier crossed → empty crossings, tier unchanged', () => {
  const result = computeLifetimeTierCrossings(2, 4, null, tiers);
  expect(result.crossings).toHaveLength(0);
  expect(result.finalTierId).toBeNull();
});

test('crosses tier 1 threshold exactly → one crossing', () => {
  const result = computeLifetimeTierCrossings(3, 5, null, tiers);
  expect(result.crossings).toHaveLength(1);
  expect(result.crossings[0].tierId).toBe(1);
  expect(result.crossings[0].starsAtCrossing).toBe(5);
  expect(result.finalTierId).toBe(1);
});

test('one large gain crosses 3 tiers at once → 3 crossings, uncapped (no 1-per-action limit)', () => {
  const result = computeLifetimeTierCrossings(0, 25, null, tiers);
  expect(result.crossings).toHaveLength(3);
  expect(result.crossings.map(c => c.tierId)).toEqual([1, 2, 3]);
  expect(result.finalTierId).toBe(3);
});

test('each crossing shows its own tier threshold, not the final running total', () => {
  const result = computeLifetimeTierCrossings(0, 25, null, tiers);
  expect(result.crossings.map(c => c.starsAtCrossing)).toEqual([5, 10, 20]);
});

test('already at a tier — only tiers above the current one can be crossed', () => {
  const result = computeLifetimeTierCrossings(8, 25, 1, tiers);
  expect(result.crossings.map(c => c.tierId)).toEqual([2, 3]);
  expect(result.finalTierId).toBe(3);
});

test('high-water-mark: a decrease never produces a crossing or changes finalTierId', () => {
  const result = computeLifetimeTierCrossings(30, 15, 3, tiers);
  expect(result.crossings).toHaveLength(0);
  expect(result.finalTierId).toBe(3);
});

test('no change (equal old/new stars) → no crossing', () => {
  const result = computeLifetimeTierCrossings(10, 10, 2, tiers);
  expect(result.crossings).toHaveLength(0);
  expect(result.finalTierId).toBe(2);
});

test('oldStars already past a threshold → that threshold does not re-fire on a later small gain', () => {
  const result = computeLifetimeTierCrossings(25, 26, null, tiers);
  expect(result.crossings).toHaveLength(0);
});
