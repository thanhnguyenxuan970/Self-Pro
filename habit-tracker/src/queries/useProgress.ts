import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { SQLiteDatabase } from 'expo-sqlite';
import { getDb } from '../db/client';
import { dailyBonusStarsForPoints } from '../config/constants';
import { getLocalDate, getWeekStart, getLocalDateOffset, getMonthOffset, getYearOffset } from '../utils/formatters';
import { AnalyticsDashboard, AnalyticsRange, AnalyticsDaily, AnalyticsLog, analyticsDemo, buildAnalyticsDashboard } from '../analytics/dashboardModel';
import { applyLifetimeStarsDelta } from '../game/lifetimeRankWrites';
import type { LifetimeTierCrossing, LifetimeTierRow } from '../game/lifetimeRank';
import { enqueuePendingLevelUps } from '../game/pendingLevelUpQueue';
import { rankMascotBridge } from '../lib/rankMascotBridge';
import { syncCurrentUserToSupabase } from '../api/syncService';

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

type PointChartBucket = { bucket: string; points: number };

/** Returns non-zero daily point totals for the selected analytics range. */
export function useAnalyticsPointsData(userId: number, range: 'W' | 'M' | 'Y', enabled = true) {
  const weekStart = getLocalDateOffset(-6);
  const today = getLocalDate();
  const month = getMonthOffset(0);
  const year = getYearOffset(0);

  return useQuery({
    enabled,
    queryKey: ['progress', 'points-chart', userId, range, weekStart, month, year],
    queryFn: async (): Promise<PointChartBucket[]> => {
      const db = await getDb();
      const [bucket, where, params] = range === 'W'
        ? ['local_date', 'local_date >= ? AND local_date <= ?', [weekStart, today]]
        : range === 'M'
          ? ["printf('W%d', CAST((CAST(substr(local_date, 9, 2) AS INTEGER) - 1) / 7 AS INTEGER) + 1)", "substr(local_date, 1, 7) = ?", [month]]
          : ['substr(local_date, 1, 7)', "substr(local_date, 1, 4) = ?", [year]];
      return db.getAllAsync<PointChartBucket>(
        `SELECT ${bucket} AS bucket, SUM(total_points) AS points FROM daily_summary
         WHERE user_id = ? AND ${where} AND total_points > 0
         GROUP BY bucket ORDER BY bucket`,
        [userId, ...params],
      );
    },
  });
}

/** One SQLite-backed view model for the reference Analytics dashboard. */
export function useAnalyticsDashboard(userId: number, range: AnalyticsRange) {
  const today = getLocalDate();
  // buildAnalyticsDashboard only ever reads `logs` after filtering it down to
  // the current/previous comparison window (see dashboardModel.ts's inWindow
  // filter) — `daily` is the one array that legitimately needs full history,
  // for the all-time consistency stat. Bounding the activity_log fetch to a
  // generous superset of that window avoids pulling a user's entire lifetime
  // of logs into JS just to filter almost all of them back out.
  const logsFromDate = range === 'W' ? getLocalDateOffset(-13)
    : range === 'M' ? getLocalDateOffset(-62)
    : getLocalDateOffset(-731);
  return useQuery({
    queryKey: ['progress', 'dashboard', userId, range, today],
    queryFn: async (): Promise<AnalyticsDashboard> => {
      if (__DEV__ && process.env.EXPO_PUBLIC_ANALYTICS_DEMO === '1') return analyticsDemo;
      const db = await getDb();
      const [daily, logs] = await Promise.all([
        db.getAllAsync<AnalyticsDaily>(`SELECT local_date, total_points FROM daily_summary WHERE user_id = ?`, [userId]),
        db.getAllAsync<AnalyticsLog>(`
          SELECT a.local_date, a.logged_at, a.points_earned, a.stars_delta, tt.name AS task_name
          FROM activity_log a LEFT JOIN task_types tt ON tt.id = a.task_type_id
          WHERE a.user_id = ? AND a.source = 'TASK' AND a.local_date >= ?`, [userId, logsFromDate]),
      ]);
      return buildAnalyticsDashboard(daily, logs, range);
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
  const dates = [...byDate.keys()];
  if (dates.length === 0) return bonusStarsRemoved;
  // Batched into one query instead of one round-trip per date.
  const datePlaceholders = dates.map(() => '?').join(',');
  const dailyRows = await db.getAllAsync<{ local_date: string; total_points: number; bonus_star_awarded: number }>(
    `SELECT local_date, total_points, bonus_star_awarded FROM daily_summary WHERE user_id = ? AND local_date IN (${datePlaceholders})`,
    [userId, ...dates],
  );
  const dailyByDate = new Map(dailyRows.map(r => [r.local_date, r]));

  for (const [date, entry] of byDate) {
    const daily = dailyByDate.get(date);
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
    mutationFn: async (ids: number[]): Promise<{ lifetimeCrossings: LifetimeTierCrossing[] }> => {
      if (ids.length === 0) return { lifetimeCrossings: [] };
      const db = await getDb();
      const placeholders = ids.map(() => '?').join(',');
      let lifetimeCrossings: LifetimeTierCrossing[] = [];

      const tiers = await db.getAllAsync<LifetimeTierRow>(
        `SELECT id, tier_order, rank_name, stars_required FROM tiers ORDER BY stars_required ASC`
      );

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

        // Lifetime rank is a high-water mark: removing earned rows never lowers
        // it. Removing a BAD/penalty row is a net gain and can cross upward.
        lifetimeCrossings = (await applyLifetimeStarsDelta(db, userId, badPenaltyAmt - goodStarsDelta, tiers)).crossings;

        await db.runAsync(
          `DELETE FROM activity_log WHERE user_id = ? AND id IN (${placeholders})`,
          [userId, ...ids]
        );
      });

      return { lifetimeCrossings };
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['progress', 'actlog', userId] });
      qc.invalidateQueries({ queryKey: ['progress'] });
      qc.invalidateQueries({ queryKey: ['today'] });
      qc.invalidateQueries({ queryKey: ['week'] });
      qc.invalidateQueries({ queryKey: ['rank'] });
      void syncCurrentUserToSupabase()
        .catch(error => { if (__DEV__) console.warn('[sync] activity delete sync failed:', error); })
        .finally(() => { qc.invalidateQueries({ queryKey: ['leaderboard'] }); });
      if (data?.lifetimeCrossings?.length) {
        rankMascotBridge.ref?.current?.playRankUp();
        rankMascotBridge.onRankUp?.(data.lifetimeCrossings);
        enqueuePendingLevelUps(data.lifetimeCrossings).catch(() => {});
      }
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
