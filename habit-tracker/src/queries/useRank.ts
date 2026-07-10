import { useQuery } from '@tanstack/react-query';
import { getDb } from '../db/client';
import { getWeekStart } from '../utils/formatters';

type TierRow = {
  id: number;
  tier_order: number;
  rank_name: string;
  stars_required: number;
};
export function useRankData(userId: number) {
  const weekStart = getWeekStart();
  return useQuery({
    queryKey: ['rank', userId, weekStart],
    queryFn: async () => {
      const db = await getDb();

      const weekly = await db.getFirstAsync<{ weekly_stars: number; current_tier_id: number | null }>(
        `SELECT weekly_stars, current_tier_id FROM weekly_summary WHERE user_id=? AND week_start=?`,
        [userId, weekStart]
      );
      const tiers = await db.getAllAsync<TierRow>(
        `SELECT id, tier_order, rank_name, stars_required FROM tiers ORDER BY tier_order`
      );
      return {
        currentStars: weekly?.weekly_stars ?? 0,
        currentTierId: weekly?.current_tier_id ?? null,
        tiers,
      };
    },
  });
}
