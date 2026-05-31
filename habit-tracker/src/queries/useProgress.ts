import { useQuery } from '@tanstack/react-query';
import { getDb } from '../db/client';
import { getLocalDate, getWeekStart } from '../logic/formatters';

export type ChartBucket = { bucket: string; goodStars: number; badStars: number };

/** Returns bucketed chart data for D/W/M/Y range */
export function useProgressData(userId: number, range: 'D' | 'W' | 'M' | 'Y') {
  const today = getLocalDate();
  const weekStart = getWeekStart();
  const monthPrefix = today.slice(0, 7);  // "YYYY-MM"
  const year = today.slice(0, 4);         // "YYYY"

  const rangeKey = range === 'D' ? today : range === 'W' ? weekStart : range === 'M' ? monthPrefix : year;

  return useQuery({
    queryKey: ['progress', 'chart', userId, range, rangeKey],
    queryFn: async (): Promise<ChartBucket[]> => {
      const db = await getDb();

      let sql: string;
      let params: (string | number)[];

      if (range === 'D') {
        // Group by hour (0–23) for today
        sql = `
          SELECT
            strftime('%H', datetime(logged_at/1000, 'unixepoch', 'localtime')) AS bucket,
            COALESCE(SUM(CASE WHEN stars_delta > 0 THEN stars_delta ELSE 0 END), 0) AS goodStars,
            COALESCE(SUM(CASE WHEN stars_delta < 0 THEN ABS(stars_delta) ELSE 0 END), 0) AS badStars
          FROM activity_log
          WHERE user_id = ? AND local_date = ?
          GROUP BY bucket ORDER BY bucket`;
        params = [userId, today];
      } else if (range === 'W') {
        // Group by day (Mon–Sun) for current week
        sql = `
          SELECT
            local_date AS bucket,
            COALESCE(SUM(CASE WHEN stars_delta > 0 THEN stars_delta ELSE 0 END), 0) AS goodStars,
            COALESCE(SUM(CASE WHEN stars_delta < 0 THEN ABS(stars_delta) ELSE 0 END), 0) AS badStars
          FROM activity_log
          WHERE user_id = ? AND week_start = ?
          GROUP BY local_date ORDER BY local_date`;
        params = [userId, weekStart];
      } else if (range === 'M') {
        // Group by day for current month
        sql = `
          SELECT
            local_date AS bucket,
            COALESCE(SUM(CASE WHEN stars_delta > 0 THEN stars_delta ELSE 0 END), 0) AS goodStars,
            COALESCE(SUM(CASE WHEN stars_delta < 0 THEN ABS(stars_delta) ELSE 0 END), 0) AS badStars
          FROM activity_log
          WHERE user_id = ? AND substr(local_date, 1, 7) = ?
          GROUP BY local_date ORDER BY local_date`;
        params = [userId, monthPrefix];
      } else {
        // Y: group by month for current year
        sql = `
          SELECT
            substr(local_date, 1, 7) AS bucket,
            COALESCE(SUM(CASE WHEN stars_delta > 0 THEN stars_delta ELSE 0 END), 0) AS goodStars,
            COALESCE(SUM(CASE WHEN stars_delta < 0 THEN ABS(stars_delta) ELSE 0 END), 0) AS badStars
          FROM activity_log
          WHERE user_id = ? AND substr(local_date, 1, 4) = ?
          GROUP BY bucket ORDER BY bucket`;
        params = [userId, year];
      }

      const rows = await db.getAllAsync<ChartBucket>(sql, params);
      return rows;
    },
  });
}

/** Today's streak count from daily_summary */
export function useStreakCount(userId: number) {
  const today = getLocalDate();
  return useQuery({
    queryKey: ['progress', 'streak', userId, today],
    queryFn: async () => {
      const db = await getDb();
      const row = await db.getFirstAsync<{ streak_count: number }>(
        `SELECT streak_count FROM daily_summary WHERE user_id = ? AND local_date = ?`,
        [userId, today]
      );
      return row?.streak_count ?? 0;
    },
  });
}

/** Stars needed to reach next tier */
export function useStarsToNextTier(userId: number) {
  const weekStart = getWeekStart();
  return useQuery({
    queryKey: ['progress', 'next-tier', userId, weekStart],
    queryFn: async () => {
      const db = await getDb();
      const weekly = await db.getFirstAsync<{ weekly_stars: number }>(
        `SELECT weekly_stars FROM weekly_summary WHERE user_id = ? AND week_start = ?`,
        [userId, weekStart]
      );
      const currentStars = weekly?.weekly_stars ?? 0;
      const nextTier = await db.getFirstAsync<{ stars_required: number; rank_name: string }>(
        `SELECT stars_required, rank_name FROM tiers
         WHERE stars_required > ? ORDER BY stars_required ASC LIMIT 1`,
        [currentStars]
      );
      return {
        currentStars,
        nextTierName: nextTier?.rank_name ?? null,
        starsNeeded: nextTier ? nextTier.stars_required - currentStars : 0,
      };
    },
  });
}

export function useAllTimeStats(userId: number) {
  return useQuery({
    queryKey: ['progress', 'alltime', userId],
    queryFn: async () => {
      const db = await getDb();
      const [acts, stars, bestStreak] = await Promise.all([
        db.getFirstAsync<{ total: number }>(
          `SELECT COUNT(*) AS total FROM activity_log WHERE user_id = ? AND source = 'TASK'`,
          [userId]
        ),
        db.getFirstAsync<{ total: number }>(
          `SELECT COALESCE(SUM(CASE WHEN stars_delta > 0 THEN stars_delta ELSE 0 END), 0) AS total
           FROM activity_log WHERE user_id = ?`,
          [userId]
        ),
        db.getFirstAsync<{ best: number }>(
          `SELECT COALESCE(MAX(streak_count), 0) AS best FROM daily_summary WHERE user_id = ?`,
          [userId]
        ),
      ]);
      return {
        totalActivities: acts?.total ?? 0,
        totalStars: Math.floor(stars?.total ?? 0),
        bestStreak: bestStreak?.best ?? 0,
      };
    },
  });
}
