import { useQuery } from '@tanstack/react-query';
import { getDb } from '../db/client';
import { getWeekStart } from '../utils/formatters';
import { carryWeeklyProgress } from '../game/weeklyRank';

export type TierRow = {
  id: number;
  tier_order: number;
  rank_name: string;
  stars_required: number;
};

export function visibleTierId(currentTierId: number | null, currentStars: number, tiers: TierRow[]): number | null {
  return tiers.some(item => item.id === currentTierId) ? currentTierId : null;
}

export function useRankData(userId: number) {
  const weekStart = getWeekStart();
  return useQuery({
    queryKey: ['rank', userId, weekStart],
    queryFn: async () => {
      const db = await getDb();

      let weekly = await db.getFirstAsync<{ weekly_stars: number; peak_stars: number; current_tier_id: number | null }>(
        `SELECT weekly_stars, peak_stars, current_tier_id FROM weekly_summary WHERE user_id=? AND week_start=?`,
        [userId, weekStart]
      );
      const tiers = await db.getAllAsync<TierRow>(
        `SELECT id, tier_order, rank_name, stars_required FROM tiers ORDER BY tier_order`
      );
      let promotion: { tier_order: number; rank_name: string } | null = null;
      if (!weekly && tiers.length > 0) {
        const previous = await db.getFirstAsync<{ weekly_stars: number; peak_stars: number; current_tier_id: number | null }>(
          `SELECT weekly_stars, peak_stars, current_tier_id FROM weekly_summary WHERE user_id = ? AND week_start < ? ORDER BY week_start DESC LIMIT 1`,
          [userId, weekStart],
        );
        const carry = carryWeeklyProgress(previous && {
          weeklyStars: previous.weekly_stars,
          peakStars: previous.peak_stars,
          currentTierId: previous.current_tier_id,
        }, tiers);
        await db.runAsync(
          `INSERT INTO weekly_summary (user_id, week_start, total_points, weekly_stars, peak_stars, current_tier_id) VALUES (?, ?, 0, ?, ?, ?)`,
          [userId, weekStart, carry.weeklyStars, carry.peakStars, carry.currentTierId],
        );
        weekly = { weekly_stars: carry.weeklyStars, peak_stars: carry.peakStars, current_tier_id: carry.currentTierId };
        const promoted = tiers.find(tier => tier.id === carry.promotedTierId);
        promotion = promoted ? { tier_order: promoted.tier_order, rank_name: promoted.rank_name } : null;
        if (promoted) {
          await db.runAsync(
            `INSERT OR IGNORE INTO reward_unlocks (user_id, tier_id, week_start, stars_at_unlock, reward_amount, claimed) VALUES (?, ?, ?, ?, 0, 0)`,
            [userId, promoted.id, weekStart, carry.weeklyStars],
          );
        }
      }
      const currentStars = weekly?.weekly_stars ?? 0;
      return {
        currentStars,
        currentTierId: visibleTierId(weekly?.current_tier_id ?? null, currentStars, tiers),
        tiers,
        promotion,
      };
    },
  });
}
