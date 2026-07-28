import type { SQLiteDatabase } from 'expo-sqlite';
import { computeLifetimeTierCrossings, type LifetimeTierCrossing, type LifetimeTierRow } from './lifetimeRank';

export type LifetimeDeltaResult = {
  crossings: LifetimeTierCrossing[];
};

type LifetimeWriteDb = Pick<SQLiteDatabase, 'getFirstAsync' | 'runAsync'>;

/**
 * Applies a signed star delta (positive for a GOOD log/reward, negative for a
 * BAD/penalty log or an unlog/delete/edit-revert) to the user's lifetime
 * rollup, clamped at 0, and detects every tier threshold newly crossed on the
 * way up. Tier never demotes — high-water-mark — so a negative delta never
 * touches current_tier_id. Must run inside the caller's existing transaction.
 */
export async function applyLifetimeStarsDelta(
  db: LifetimeWriteDb,
  userId: number,
  starsDelta: number,
  tiers: LifetimeTierRow[],
): Promise<LifetimeDeltaResult> {
  if (starsDelta === 0) return { crossings: [] };

  const before = await db.getFirstAsync<{ lifetime_stars: number; current_tier_id: number | null }>(
    `SELECT lifetime_stars, current_tier_id FROM users WHERE id = ?`,
    [userId],
  );
  const oldStars = before?.lifetime_stars ?? 0;
  const currentTierId = before?.current_tier_id ?? null;
  const newStars = Math.max(0, oldStars + starsDelta);

  if (starsDelta < 0) {
    await db.runAsync(`UPDATE users SET lifetime_stars = ? WHERE id = ?`, [newStars, userId]);
    return { crossings: [] };
  }

  const { crossings, finalTierId } = computeLifetimeTierCrossings(oldStars, newStars, currentTierId, tiers);

  await db.runAsync(
    `UPDATE users SET lifetime_stars = ?, current_tier_id = ? WHERE id = ?`,
    [newStars, finalTierId, userId],
  );

  return { crossings };
}
