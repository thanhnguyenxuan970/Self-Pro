import type { SQLiteDatabase } from 'expo-sqlite';
import { applyLifetimeStarsDelta } from '../src/game/lifetimeRankWrites';
import type { LifetimeTierRow } from '../src/game/lifetimeRank';

const tiers: LifetimeTierRow[] = [
  { id: 1, tier_order: 1, rank_name: 'Delulu', stars_required: 5 },
  { id: 2, tier_order: 2, rank_name: 'Mewing', stars_required: 10 },
  { id: 3, tier_order: 3, rank_name: 'Rizz', stars_required: 20 },
];

function createDb(userRow: { lifetime_stars: number; current_tier_id: number | null }) {
  const getFirstAsync = jest.fn(async () => userRow);
  const runAsync = jest.fn(async () => ({ changes: 1 }));
  return { getFirstAsync, runAsync } as unknown as SQLiteDatabase;
}

test('zero delta is a no-op — no read, no write', async () => {
  const db = createDb({ lifetime_stars: 3, current_tier_id: null });
  const result = await applyLifetimeStarsDelta(db, 1, 0, tiers);
  expect(result.crossings).toHaveLength(0);
  expect(db.getFirstAsync).not.toHaveBeenCalled();
  expect(db.runAsync).not.toHaveBeenCalled();
});

test('positive delta crossing one tier updates lifetime_stars and current_tier_id, returns the crossing', async () => {
  const db = createDb({ lifetime_stars: 3, current_tier_id: null });
  const result = await applyLifetimeStarsDelta(db, 1, 3, tiers);
  expect(result.crossings).toHaveLength(1);
  expect(result.crossings[0].tierId).toBe(1);
  expect(db.runAsync).toHaveBeenCalledWith(
    `UPDATE users SET lifetime_stars = ?, current_tier_id = ? WHERE id = ?`,
    [6, 1, 1],
  );
});

test('positive delta crossing multiple tiers in one call returns every crossing, final tier is the highest', async () => {
  const db = createDb({ lifetime_stars: 0, current_tier_id: null });
  const result = await applyLifetimeStarsDelta(db, 1, 25, tiers);
  expect(result.crossings.map(c => c.tierId)).toEqual([1, 2, 3]);
  expect(db.runAsync).toHaveBeenCalledWith(
    `UPDATE users SET lifetime_stars = ?, current_tier_id = ? WHERE id = ?`,
    [25, 3, 1],
  );
});

test('negative delta never decreases lifetime high-water mark, tier, or crossings', async () => {
  const db = createDb({ lifetime_stars: 15, current_tier_id: 2 });
  const result = await applyLifetimeStarsDelta(db, 1, -5, tiers);
  expect(result.crossings).toHaveLength(0);
  expect(db.runAsync).not.toHaveBeenCalled();
});

test('positive deltas remain the only way callers can advance lifetime rank', async () => {
  // e.g. unlogging a penalty task restores stars — handled as a normal
  // positive delta by the caller negating the removed (negative) stars_delta.
  const db = createDb({ lifetime_stars: 4, current_tier_id: null });
  const result = await applyLifetimeStarsDelta(db, 1, 2, tiers);
  expect(result.crossings).toHaveLength(1);
  expect(result.crossings[0].tierId).toBe(1);
});

test('no user row yet (fresh account) defaults to 0 stars, null tier', async () => {
  const getFirstAsync = jest.fn(async () => null);
  const runAsync = jest.fn(async () => ({ changes: 1 }));
  const db = { getFirstAsync, runAsync } as unknown as SQLiteDatabase;
  const result = await applyLifetimeStarsDelta(db, 1, 6, tiers);
  expect(result.crossings).toHaveLength(1);
  expect(db.runAsync).toHaveBeenCalledWith(
    `UPDATE users SET lifetime_stars = ?, current_tier_id = ? WHERE id = ?`,
    [6, 1, 1],
  );
});
