import { useQuery } from '@tanstack/react-query';
import { getDb } from '../db/client';
import { getWeekStart } from '../utils/formatters';
import { resolveTaskDisplayName } from '../utils/resolveTaskDisplayName';
import { useTranslations } from './useSettings';

// Tier order (1–7) → approximate 30-day cohort percentile
const TIER_PERCENTILE: Record<number, number> = {
  1: 50, 2: 65, 3: 75, 4: 82, 5: 90, 6: 95, 7: 99,
};

export function tierPercentile(tierOrder: number): number {
  return TIER_PERCENTILE[tierOrder] ?? 50;
}

export function useShareCardData(userId: number) {
  const t = useTranslations();
  return useQuery({
    queryKey: ['shareCardData', userId],
    queryFn: async () => {
      const db = await getDb();

      const daysDoneRow = await db.getFirstAsync<{ count: number }>(
        `SELECT COUNT(DISTINCT local_date) AS count
         FROM daily_summary WHERE user_id = ? AND total_points > 0`,
        [userId],
      );

      const weekStart = getWeekStart();
      const topHabitRow = await db.getFirstAsync<{ name: string }>(
        `SELECT tt.name
         FROM activity_log al
         JOIN task_types tt ON al.task_type_id = tt.id
         WHERE al.user_id = ? AND al.week_start = ? AND al.source = 'TASK' AND al.kind = 'GOOD'
         GROUP BY al.task_type_id
         ORDER BY SUM(COALESCE(al.duration_min, al.points_earned)) DESC
         LIMIT 1`,
        [userId, weekStart],
      );

      return {
        daysDone: daysDoneRow?.count ?? 0,
        topHabitName: topHabitRow ? resolveTaskDisplayName(topHabitRow.name, t) : '',
      };
    },
    staleTime: 60_000,
  });
}
