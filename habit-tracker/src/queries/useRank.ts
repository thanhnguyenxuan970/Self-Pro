import { useQuery } from '@tanstack/react-query';
import { getDb } from '../db/client';
import { useGoogleUser } from '../hooks/authContext';
import { getAccountActivityStartDate } from '../lib/accountActivityBoundary';
import { readAnalyticsYearStars } from '../analytics/yearStars';
import { getLocalDate, getMillisecondsUntilLocalMidnight } from '../utils/formatters';

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

/** Rank state uses the Analytics Year star KPI as its displayed star total.
 * `current_tier_id` remains a lifetime high-water marker so a correction or a
 * new calendar year cannot silently demote an already reached tier. */
export function useRankData(userId: number) {
  const googleUser = useGoogleUser();
  const activityStartDate = getAccountActivityStartDate(googleUser?.email);
  const today = getLocalDate();
  return useQuery({
    queryKey: ['rank', userId, today, activityStartDate],
    refetchInterval: () => getMillisecondsUntilLocalMidnight(),
    queryFn: async () => {
      const db = await getDb();

      const user = await db.getFirstAsync<{ current_tier_id: number | null }>(
        `SELECT current_tier_id FROM users WHERE id = ?`,
        [userId]
      );
      const tiers = await db.getAllAsync<TierRow>(
        `SELECT id, tier_order, rank_name, stars_required FROM tiers ORDER BY tier_order`
      );
      const currentStars = await readAnalyticsYearStars(db, userId, new Date(), activityStartDate);
      const currentTierId = visibleTierId(user?.current_tier_id ?? null, currentStars, tiers);
      return {
        currentStars,
        currentTierId,
        tiers,
      };
    },
  });
}
