import { useQuery } from '@tanstack/react-query';
import { getDb } from '../db/client';

export type TierRow = {
  id: number;
  tier_order: number;
  rank_name: string;
  stars_required: number;
};

export function visibleTierId(currentTierId: number | null, _currentStars: number, tiers: TierRow[]): number | null {
  // current_tier_id is a lifetime high-water mark. The server can reconcile
  // the star total downward after a correction, but Rank must not visually
  // demote a tier that was already reached.
  return tiers.some(item => item.id === currentTierId) ? currentTierId : null;
}

/** Lifetime rank state — reads users.lifetime_stars/current_tier_id, not the
 * (weekly, now rank-unrelated) weekly_summary table. */
export function useRankData(userId: number) {
  return useQuery({
    queryKey: ['rank', userId],
    queryFn: async () => {
      const db = await getDb();

      const user = await db.getFirstAsync<{ lifetime_stars: number; current_tier_id: number | null }>(
        `SELECT lifetime_stars, current_tier_id FROM users WHERE id = ?`,
        [userId]
      );
      const tiers = await db.getAllAsync<TierRow>(
        `SELECT id, tier_order, rank_name, stars_required FROM tiers ORDER BY tier_order`
      );
      const currentStars = user?.lifetime_stars ?? 0;
      return {
        currentStars,
        currentTierId: visibleTierId(user?.current_tier_id ?? null, currentStars, tiers),
        tiers,
      };
    },
  });
}
