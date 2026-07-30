import { useQuery } from '@tanstack/react-query';
import { getDb } from '../db/client';

export type CalendarDay = {
  local_date: string;
  stars: number;
  streak_count: number;
  is_backfill: boolean;
  is_best_day: boolean;
  is_milestone: boolean;
};

type HeatmapDay = { local_date: string; total_points: number; stars: number };

const MILESTONE_STREAKS = [3, 7, 14, 30, 100];

export function useCalendarData(userId: number, yearMonth: string) {
  return useQuery({
    queryKey: ['calendar', userId, yearMonth],
    queryFn: async (): Promise<CalendarDay[]> => {
      const db = await getDb();

      const rows = await db.getAllAsync<{
        local_date: string;
        stars: number;
        streak_count: number;
        is_backfill: number;
      }>(
        `SELECT
           a.local_date,
           COALESCE(SUM(CASE WHEN a.stars_delta > 0 THEN a.stars_delta ELSE 0 END), 0) AS stars,
           COALESCE(ds.streak_count, 0) AS streak_count,
           MAX(COALESCE(a.is_backfill, 0)) AS is_backfill
         FROM activity_log a
         LEFT JOIN daily_summary ds ON ds.user_id = a.user_id AND ds.local_date = a.local_date
         WHERE a.user_id = ? AND substr(a.local_date, 1, 7) = ?
         GROUP BY a.local_date
         ORDER BY a.local_date`,
        [userId, yearMonth]
      );

      if (rows.length === 0) return [];

      const maxStars = Math.max(...rows.map((r) => r.stars));

      return rows.map((r) => ({
        local_date: r.local_date,
        stars: r.stars,
        streak_count: r.streak_count,
        is_backfill: !!r.is_backfill,
        is_best_day: maxStars > 0 && r.stars === maxStars,
        is_milestone: MILESTONE_STREAKS.includes(r.streak_count),
      }));
    },
  });
}

export function useHeatmapData(userId: number) {
  return useQuery({
    queryKey: ['calendar', 'heatmap', userId],
    queryFn: async (): Promise<HeatmapDay[]> => {
      const db = await getDb();
      return db.getAllAsync<HeatmapDay>(
        `SELECT ds.local_date, ds.total_points, COALESCE(al.stars, 0) AS stars
         FROM daily_summary ds
         LEFT JOIN (
           SELECT local_date, SUM(CASE WHEN stars_delta > 0 THEN CAST(stars_delta AS INTEGER) ELSE 0 END) AS stars
           FROM activity_log
           WHERE user_id = ? AND local_date >= date('now', '-1 year')
           GROUP BY local_date
         ) al ON al.local_date = ds.local_date
         WHERE ds.user_id = ? AND ds.local_date >= date('now', '-1 year')
         ORDER BY ds.local_date`,
        [userId, userId],
      );
    },
  });
}
