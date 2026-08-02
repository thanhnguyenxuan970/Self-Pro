import type { SQLiteDatabase } from 'expo-sqlite';
import { computeLifetimeTierCrossings, type LifetimeTierCrossing, type LifetimeTierRow } from './lifetimeRank';

export type LifetimeDeltaResult = {
  crossings: LifetimeTierCrossing[];
};

type LifetimeWriteDb = Pick<SQLiteDatabase, 'getFirstAsync' | 'runAsync'>;

/**
 * Adds earned stars to the user's lifetime high-water mark and detects every
 * tier threshold newly crossed on the way up. Negative deltas belong to
 * spendable/weekly rollups and never reduce lifetime rank. Must run inside the
 * caller's existing transaction.
 */
export async function applyLifetimeStarsDelta(
  db: LifetimeWriteDb,
  userId: number,
  starsDelta: number,
  tiers: LifetimeTierRow[],
): Promise<LifetimeDeltaResult> {
  if (starsDelta <= 0) return { crossings: [] };

  const before = await db.getFirstAsync<{ lifetime_stars: number; current_tier_id: number | null }>(
    `SELECT lifetime_stars, current_tier_id FROM users WHERE id = ?`,
    [userId],
  );
  const oldStars = before?.lifetime_stars ?? 0;
  const currentTierId = before?.current_tier_id ?? null;
  const newStars = oldStars + starsDelta;

  const { crossings, finalTierId } = computeLifetimeTierCrossings(oldStars, newStars, currentTierId, tiers);

  await db.runAsync(
    `UPDATE users SET lifetime_stars = ?, current_tier_id = ? WHERE id = ?`,
    [newStars, finalTierId, userId],
  );

  return { crossings };
}
