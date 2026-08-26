import { useQuery } from '@tanstack/react-query';
import { getDb } from '../db/client';
import { useGoogleUser } from '../hooks/authContext';
import { getAccountActivityStartDate } from '../lib/accountActivityBoundary';

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
  const googleUser = useGoogleUser();
  const activityStartDate = getAccountActivityStartDate(googleUser?.email);
  return useQuery({
    queryKey: ['rank', userId, activityStartDate],
    queryFn: async () => {
      const db = await getDb();

      const user = await db.getFirstAsync<{ lifetime_stars: number; current_tier_id: number | null }>(
        `SELECT lifetime_stars, current_tier_id FROM users WHERE id = ?`,
        [userId]
      );
      const tiers = await db.getAllAsync<TierRow>(
        `SELECT id, tier_order, rank_name, stars_required FROM tiers ORDER BY tier_order`
      );
      const filteredActivity = activityStartDate
        ? await db.getFirstAsync<{ total: number | null }>(
          `SELECT COALESCE(SUM(CASE WHEN stars_delta > 0 THEN stars_delta ELSE 0 END), 0) AS total
             FROM activity_log
            WHERE user_id = ? AND local_date >= ?`,
          [userId, activityStartDate],
        )
        : null;
      const currentStars = activityStartDate
        ? Math.floor(Number(filteredActivity?.total) || 0)
        : user?.lifetime_stars ?? 0;
      const currentTierId = activityStartDate
        ? [...tiers].reverse().find(tier => tier.stars_required <= currentStars)?.id ?? null
        : visibleTierId(user?.current_tier_id ?? null, currentStars, tiers);
      return {
        currentStars,
        currentTierId,
        tiers,
      };
    },
  });
}
