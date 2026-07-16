import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { SQLiteDatabase } from 'expo-sqlite';
import { getDb } from '../db/client';
import { dailyBonusStarsForPoints } from '../config/constants';
import { getLocalDate, getWeekStart, getLocalDateOffset, getWeekStartOffset, getMonthOffset, getYearOffset } from '../utils/formatters';

export type ActivityLogEntry = {
  id: number;
  task_name: string | null;
  is_template: number | null;
  kind: string;
  stars_delta: number;
  local_date: string;
  logged_at: number;
  source: string;
};

type ChartBucket = { bucket: string; goodStars: number; badStars: number };

/** Returns bucketed chart data for D/W/M/Y range, with optional period offset (0=current, -1=previous, etc.) */
export function useProgressData(userId: number, range: 'D' | 'W' | 'M' | 'Y', offset: number = 0) {
  const effectiveDate = offset === 0 ? getLocalDate() : getLocalDateOffset(offset);
  const effectiveWeekStart = getWeekStartOffset(offset);
  const effectiveMonth = getMonthOffset(offset);
  const effectiveYear = getYearOffset(offset);

  return useQuery({
    queryKey: ['progress', 'chart', userId, range, offset],
    queryFn: async (): Promise<ChartBucket[]> => {
      const db = await getDb();

      let sql: string;
      let params: (string | number)[];

      if (range === 'D') {
        sql = `
          SELECT
            strftime('%H', datetime(logged_at/1000, 'unixepoch', 'localtime')) AS bucket,
            COALESCE(SUM(CASE WHEN stars_delta > 0 THEN stars_delta ELSE 0 END), 0) AS goodStars,
            COALESCE(SUM(CASE WHEN stars_delta < 0 THEN ABS(stars_delta) ELSE 0 END), 0) AS badStars
          FROM activity_log
          WHERE user_id = ? AND local_date = ?
          GROUP BY bucket ORDER BY bucket`;
        params = [userId, effectiveDate];
      } else if (range === 'W') {
        sql = `
          SELECT
            local_date AS bucket,
            COALESCE(SUM(CASE WHEN stars_delta > 0 THEN stars_delta ELSE 0 END), 0) AS goodStars,
            COALESCE(SUM(CASE WHEN stars_delta < 0 THEN ABS(stars_delta) ELSE 0 END), 0) AS badStars
          FROM activity_log
          WHERE user_id = ? AND week_start = ?
          GROUP BY local_date ORDER BY local_date`;
        params = [userId, effectiveWeekStart];
      } else if (range === 'M') {
        sql = `
          SELECT
            local_date AS bucket,
            COALESCE(SUM(CASE WHEN stars_delta > 0 THEN stars_delta ELSE 0 END), 0) AS goodStars,
            COALESCE(SUM(CASE WHEN stars_delta < 0 THEN ABS(stars_delta) ELSE 0 END), 0) AS badStars
          FROM activity_log
          WHERE user_id = ? AND substr(local_date, 1, 7) = ?
          GROUP BY local_date ORDER BY local_date`;
        params = [userId, effectiveMonth];
      } else {
        sql = `
          SELECT
            substr(local_date, 1, 4) AS bucket,
            COALESCE(SUM(CASE WHEN stars_delta > 0 THEN stars_delta ELSE 0 END), 0) AS goodStars,
            COALESCE(SUM(CASE WHEN stars_delta < 0 THEN ABS(stars_delta) ELSE 0 END), 0) AS badStars
          FROM activity_log
          WHERE user_id = ?
          GROUP BY bucket ORDER BY bucket`;
        params = [userId];
      }

      const rows = await db.getAllAsync<ChartBucket>(sql, params);
      return padBuckets(rows, range, { effectiveWeekStart, effectiveMonth, effectiveYear, offset });
    },
  });
}

export type PointChartBucket = { bucket: string; points: number };

/** Returns non-zero daily point totals for the selected analytics range. */
export function useAnalyticsPointsData(userId: number, range: 'W' | 'M') {
  const weekStart = getLocalDateOffset(-6);
  const today = getLocalDate();
  const month = getMonthOffset(0);

  return useQuery({
    queryKey: ['progress', 'points-chart', userId, range, weekStart, month],
    queryFn: async (): Promise<PointChartBucket[]> => {
      const db = await getDb();
      const where = range === 'W'
        ? ['local_date >= ? AND local_date <= ?', [weekStart, today]]
        : ["substr(local_date, 1, 7) = ?", [month]];
      return db.getAllAsync<PointChartBucket>(
        `SELECT local_date AS bucket, total_points AS points FROM daily_summary
         WHERE user_id = ? AND ${where[0]} AND total_points > 0
         ORDER BY local_date`,
        [userId, ...where[1]],
      );
    },
  });
}

function fmtDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function padBuckets(
  rows: ChartBucket[],
  range: 'D' | 'W' | 'M' | 'Y',
  ctx: { effectiveWeekStart: string; effectiveMonth: string; effectiveYear: string; offset: number }
): ChartBucket[] {
  const empty = (bucket: string): ChartBucket => ({ bucket, goodStars: 0, badStars: 0 });

  if (range === 'W') {
    const map = new Map(rows.map(r => [r.bucket, r]));
    const [y, m, d] = ctx.effectiveWeekStart.split('-').map(Number);
    return Array.from({ length: 7 }, (_, i) => {
      const key = fmtDate(new Date(y, m - 1, d + i));
      return map.get(key) ?? empty(key);
    });
  }

  if (range === 'D') {
    const map = new Map(rows.map(r => [r.bucket, r]));
    const maxHour = ctx.offset === 0 ? new Date().getHours() : 23;
    return Array.from({ length: maxHour + 1 }, (_, h) => {
      const key = String(h).padStart(2, '0');
      return map.get(key) ?? empty(key);
    });
  }

  if (range === 'M') {
    const map = new Map(rows.map(r => [r.bucket, r]));
    const [y, mo] = ctx.effectiveMonth.split('-').map(Number);
    const daysInMonth = new Date(y, mo, 0).getDate();
    const maxDay = ctx.offset === 0 ? Math.min(new Date().getDate(), daysInMonth) : daysInMonth;
    return Array.from({ length: maxDay }, (_, i) => {
      const key = `${y}-${String(mo).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`;
      return map.get(key) ?? empty(key);
    });
  }

  // 'Y' — from app launch year (2026) to current year
  const map = new Map(rows.map(r => [r.bucket, r]));
  const currentYear = Number(ctx.effectiveYear);
  const fromYear = 2026;
  const numYears = Math.max(1, currentYear - fromYear + 1);
  return Array.from({ length: numYears }, (_, i) => {
    const key = String(fromYear + i);
    return map.get(key) ?? empty(key);
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

/** Recent activity log entries with task name, for display and bulk delete.
 *  fromDate/toDate: 'YYYY-MM-DD'. Defaults to past 7 days when omitted. */
export function useRecentActivityLogs(userId: number, limit = 50, fromDate?: string, toDate?: string) {
  const effectiveTo = toDate ?? getLocalDate();
  const effectiveFrom = fromDate ?? getLocalDateOffset(-6);
  return useQuery({
    queryKey: ['progress', 'actlog', userId, effectiveFrom, effectiveTo, limit],
    queryFn: async (): Promise<ActivityLogEntry[]> => {
      const db = await getDb();
      const rows = await db.getAllAsync<ActivityLogEntry>(
        `SELECT a.id, tt.name AS task_name, tt.is_template, a.kind, a.stars_delta, a.local_date,
                a.logged_at, a.source
         FROM activity_log a
         LEFT JOIN task_types tt ON tt.id = a.task_type_id
         WHERE a.user_id = ?
           AND a.local_date BETWEEN ? AND ?
         ORDER BY a.logged_at DESC
         LIMIT ?`,
        [userId, effectiveFrom, effectiveTo, limit]
      );
      return rows;
    },
  });
}

type DeleteRow = { id: number; local_date: string; week_start: string; points_earned: number; stars_delta: number; kind: string; source: string };
type DateEntry = { points: number; stars: number; selectedBonus: boolean; weekStart: string };

function groupDeleteRows(rows: DeleteRow[]): { byDate: Map<string, DateEntry>; goodStarsDelta: number; badPenaltyAmt: number } {
  const byDate = new Map<string, DateEntry>();
  let goodStarsDelta = 0;
  let badPenaltyAmt = 0;
  for (const row of rows) {
    const entry = byDate.get(row.local_date) ?? { points: 0, stars: 0, selectedBonus: false, weekStart: row.week_start };
    entry.points += row.points_earned;
    if (row.source !== 'DAILY_BONUS') entry.stars += row.stars_delta;
    else entry.selectedBonus = true;
    byDate.set(row.local_date, entry);
    if (row.kind === 'GOOD') goodStarsDelta += row.stars_delta;
    else if (row.kind === 'BAD') badPenaltyAmt += Math.abs(row.stars_delta);
  }
  return { byDate, goodStarsDelta, badPenaltyAmt };
}

async function revertDailySummariesForDelete(
  db: SQLiteDatabase, userId: number, byDate: Map<string, DateEntry>,
): Promise<number> {
  let bonusStarsRemoved = 0;
  for (const [date, entry] of byDate) {
    const daily = await db.getFirstAsync<{ total_points: number; bonus_star_awarded: number }>(
      `SELECT total_points, bonus_star_awarded FROM daily_summary WHERE user_id = ? AND local_date = ?`,
      [userId, date]
    );
    const remaining = (daily?.total_points ?? 0) - entry.points;
    const remainingBonusStars = dailyBonusStarsForPoints(remaining);
    const removed = Math.max(0, (daily?.bonus_star_awarded ?? 0) - remainingBonusStars);
    entry.stars += removed;
    bonusStarsRemoved += removed;
    if (removed > 0 || entry.selectedBonus) {
      await db.runAsync(`DELETE FROM activity_log WHERE user_id = ? AND local_date = ? AND source = 'DAILY_BONUS'`, [userId, date]);
      if (remainingBonusStars > 0) await db.runAsync(
        `INSERT INTO activity_log (user_id, task_type_id, kind, duration_min, points_earned, stars_delta, source, logged_at, local_date, week_start)
         VALUES (?, NULL, 'DAILY_BONUS', NULL, 0, ?, 'DAILY_BONUS', ?, ?, ?)`,
        [userId, remainingBonusStars, Date.now(), date, entry.weekStart],
      );
    }
    if (remaining <= 0) {
      await db.runAsync(`DELETE FROM daily_summary WHERE user_id = ? AND local_date = ?`, [userId, date]);
    } else {
      await db.runAsync(
        `UPDATE daily_summary SET
           total_points = MAX(0, total_points - ?),
           bonus_star_awarded = ?
         WHERE user_id = ? AND local_date = ?`,
        [entry.points, remainingBonusStars, userId, date]
      );
    }
  }
  return bonusStarsRemoved;
}

async function revertWeeklySummariesForDelete(
  db: SQLiteDatabase, userId: number, byDate: Map<string, DateEntry>,
): Promise<void> {
  const byWeek = new Map<string, { points: number; stars: number }>();
  for (const { points, stars, weekStart } of byDate.values()) {
    const entry = byWeek.get(weekStart) ?? { points: 0, stars: 0 };
    entry.points += points;
    entry.stars += stars;
    byWeek.set(weekStart, entry);
  }
  for (const [week, { points, stars }] of byWeek) {
    await db.runAsync(
      `UPDATE weekly_summary SET
         total_points = MAX(0, total_points - ?),
         weekly_stars = MAX(0, weekly_stars - ?)
       WHERE user_id = ? AND week_start = ?`,
      [points, stars, userId, week]
    );
    await db.runAsync(
      `DELETE FROM reward_unlocks
       WHERE user_id = ? AND week_start = ? AND claimed = 0
         AND tier_id IN (
           SELECT id FROM tiers WHERE stars_required > (
             SELECT MAX(0, weekly_stars) FROM weekly_summary WHERE user_id = ? AND week_start = ?
           )
         )`,
      [userId, week, userId, week]
    );
  }
}

/** Delete a set of activity_log entries by id, reversing all derived summaries */
export function useDeleteActivityLogs(userId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: number[]) => {
      if (ids.length === 0) return;
      const db = await getDb();
      const placeholders = ids.map(() => '?').join(',');

      await db.withTransactionAsync(async () => {
        const rows = await db.getAllAsync<DeleteRow>(
          `SELECT id, local_date, week_start, points_earned, stars_delta, kind, source
           FROM activity_log WHERE user_id = ? AND id IN (${placeholders})`,
          [userId, ...ids]
        );
        if (rows.length === 0) return;

        const { byDate, goodStarsDelta, badPenaltyAmt } = groupDeleteRows(rows);
        const bonusStarsRemoved = await revertDailySummariesForDelete(db, userId, byDate);
        await revertWeeklySummariesForDelete(db, userId, byDate);

        if (goodStarsDelta + bonusStarsRemoved > 0) {
          await db.runAsync(
            `UPDATE users SET treat_stars = MAX(0, treat_stars - ?) WHERE id = ?`,
            [goodStarsDelta + bonusStarsRemoved, userId]
          );
        }
        if (badPenaltyAmt > 0) {
          await db.runAsync(
            `UPDATE users SET treat_stars = treat_stars + ? WHERE id = ? AND penalty_hits_treats = 1`,
            [badPenaltyAmt, userId]
          );
        }

        await db.runAsync(
          `DELETE FROM activity_log WHERE user_id = ? AND id IN (${placeholders})`,
          [userId, ...ids]
        );
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['progress', 'actlog', userId] });
      qc.invalidateQueries({ queryKey: ['progress'] });
      qc.invalidateQueries({ queryKey: ['today'] });
      qc.invalidateQueries({ queryKey: ['week'] });
      qc.invalidateQueries({ queryKey: ['rank'] });
    },
  });
}

export function useWeeklyConsistency(userId: number) {
  const weekStart = getWeekStart();
  return useQuery({
    queryKey: ['progress', 'consistency', userId, weekStart],
    queryFn: async () => {
      const db = await getDb();
      const row = await db.getFirstAsync<{ active_days: number }>(
        `SELECT COUNT(DISTINCT local_date) AS active_days
         FROM activity_log
         WHERE user_id = ? AND week_start = ?`,
        [userId, weekStart]
      );
      return row?.active_days ?? 0;
    },
  });
}

export function useTopActivities(userId: number, limit = 3) {
  return useQuery({
    queryKey: ['progress', 'top-activities', userId],
    queryFn: async () => {
      const db = await getDb();
      const rows = await db.getAllAsync<{ name: string; count: number }>(
        `SELECT tt.name, COUNT(*) AS count
         FROM activity_log a
         JOIN task_types tt ON tt.id = a.task_type_id
         WHERE a.user_id = ? AND a.source = 'TASK'
         GROUP BY a.task_type_id
         ORDER BY count DESC
         LIMIT ?`,
        [userId, limit]
      );
      return rows;
    },
  });
}

export function useAllTimeStats(userId: number) {
  return useQuery({
    queryKey: ['progress', 'alltime', userId],
    queryFn: async () => {
      const db = await getDb();
      const [acts, stars, bestStreak, activeDays] = await Promise.all([
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
        db.getFirstAsync<{ total: number }>(
          `SELECT COUNT(*) AS total FROM daily_summary WHERE user_id = ?`,
          [userId]
        ),
      ]);
      return {
        totalActivities: acts?.total ?? 0,
        totalStars: Math.floor(stars?.total ?? 0),
        bestStreak: bestStreak?.best ?? 0,
        activeDays: activeDays?.total ?? 0,
      };
    },
  });
}
