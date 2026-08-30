import type { SQLiteDatabase } from 'expo-sqlite';
import { SOURCE_TASK } from '../config/constants';

export const ANALYTICS_STAR_SOURCE = SOURCE_TASK;

export type AnalyticsStarRow = {
  local_date: string;
  stars_delta: number;
  source?: string | null;
};

export type AnalyticsStarsDb = Pick<SQLiteDatabase, 'getFirstAsync'>;

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function getAnalyticsYearWindow(
  today: Date = new Date(),
  activityStartDate: string | null = null,
): { start: string; end: string } {
  const calendarStart = `${today.getFullYear()}-01-01`;
  return {
    start: activityStartDate && activityStartDate > calendarStart ? activityStartDate : calendarStart,
    end: dateKey(today),
  };
}

/** The single positive TASK-star rule shared by Analytics and Rank displays. */
export function sumAnalyticsStars(rows: readonly AnalyticsStarRow[]): number {
  const total = rows.reduce((sum, row) => {
    if (row.source !== ANALYTICS_STAR_SOURCE) return sum;
    const stars = Number(row.stars_delta);
    return sum + (Number.isFinite(stars) ? Math.max(0, stars) : 0);
  }, 0);
  return Math.floor(total);
}

/** Reads the exact current-calendar-year star KPI used by Analytics Year. */
export async function readAnalyticsYearStars(
  db: AnalyticsStarsDb,
  userId: number,
  today: Date = new Date(),
  activityStartDate: string | null = null,
): Promise<number> {
  const { start, end } = getAnalyticsYearWindow(today, activityStartDate);
  const row = await db.getFirstAsync<{ total: number | null }>(
    `SELECT COALESCE(SUM(CASE WHEN stars_delta > 0 THEN stars_delta ELSE 0 END), 0) AS total
       FROM activity_log
      WHERE user_id = ? AND source = ?
        AND local_date >= ? AND local_date <= ?`,
    [userId, ANALYTICS_STAR_SOURCE, start, end],
  );
  const total = Number(row?.total);
  return Number.isFinite(total) ? Math.floor(Math.max(0, total)) : 0;
}
