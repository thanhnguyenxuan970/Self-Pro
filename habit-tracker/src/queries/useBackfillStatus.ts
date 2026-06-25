import { useQuery } from '@tanstack/react-query';
import { getDb } from '../db/client';
import { getWeekStart } from '../utils/formatters';

export type BackfillStatus = {
  backfillsUsedThisWeek: number;
  freezeDates: Set<string>;
};

export function useBackfillStatus(userId: number) {
  const weekStart = getWeekStart();
  return useQuery({
    queryKey: ['backfill', 'status', userId, weekStart],
    queryFn: async (): Promise<BackfillStatus> => {
      const db = await getDb();
      const quotaRow = await db.getFirstAsync<{ n: number }>(
        `SELECT COUNT(DISTINCT local_date) AS n
         FROM activity_log
         WHERE user_id = ? AND week_start = ? AND is_backfill = 1`,
        [userId, weekStart],
      );
      const freezeRows = await db.getAllAsync<{ local_date: string }>(
        `SELECT local_date FROM streak_freezes WHERE user_id = ? AND local_date >= ?`,
        [userId, weekStart],
      );
      return {
        backfillsUsedThisWeek: quotaRow?.n ?? 0,
        freezeDates: new Set(freezeRows.map(r => r.local_date)),
      };
    },
  });
}
