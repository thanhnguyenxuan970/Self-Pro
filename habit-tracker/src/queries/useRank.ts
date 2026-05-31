import { useQuery } from '@tanstack/react-query';
import { getDb } from '../db/client';
import { USER_ID } from '../constants';
import { getWeekStart } from '../logic/formatters';

type TierRow = {
  id: number;
  tier_order: number;
  rank_name: string;
  stars_required: number;
  reward_amount: number;
};
type WeekHistory = { week_start: string; weekly_stars: number; current_tier_id: number | null };

export function useRankData() {
  return useQuery({
    queryKey: ['rank', USER_ID],
    queryFn: async () => {
      const db = await getDb();
      const weekStart = getWeekStart();

      const weekly = await db.getFirstAsync<{ weekly_stars: number; current_tier_id: number | null }>(
        `SELECT weekly_stars, current_tier_id FROM weekly_summary WHERE user_id=? AND week_start=?`,
        [USER_ID, weekStart]
      );
      const tiers = await db.getAllAsync<TierRow>(
        `SELECT id, tier_order, rank_name, stars_required, reward_amount FROM tiers ORDER BY tier_order`
      );
      const history = await db.getAllAsync<WeekHistory>(
        `SELECT week_start, weekly_stars, current_tier_id FROM weekly_summary WHERE user_id=? ORDER BY week_start DESC LIMIT 8`,
        [USER_ID]
      );
      return {
        currentStars: weekly?.weekly_stars ?? 0,
        currentTierId: weekly?.current_tier_id ?? null,
        tiers,
        history,
      };
    },
  });
}
