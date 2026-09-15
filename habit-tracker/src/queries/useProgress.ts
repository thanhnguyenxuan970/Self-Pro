import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { SQLiteDatabase } from 'expo-sqlite';
import { getDb } from '../db/client';
import { useGoogleUser } from '../hooks/authContext';
import { getAccountActivityStartDate } from '../lib/accountActivityBoundary';
import { dailyBonusStarsForPoints } from '../config/constants';
import { getLocalDate, getMillisecondsUntilLocalMidnight, getWeekStart, getLocalDateOffset, getMonthOffset, getYearOffset } from '../utils/formatters';
import { AnalyticsDashboard, AnalyticsRange, AnalyticsDaily, AnalyticsLog, analyticsDemo, buildAnalyticsDashboard } from '../analytics/dashboardModel';
import type { LifetimeTierCrossing, LifetimeTierRow } from '../game/lifetimeRank';
import { applyLifetimeStarsDelta } from '../game/lifetimeRankWrites';
import { enqueuePendingLevelUps } from '../game/pendingLevelUpQueue';
import { enqueuePendingActivityDeletesForUser } from '../game/pendingActivityDeletes';
import { rankMascotBridge } from '../lib/rankMascotBridge';
import { syncCurrentUserToSupabase } from '../api/syncService';
import { ANALYTICS_STAR_SOURCE, readAnalyticsYearStars } from '../analytics/yearStars';
import { createActivityKey } from '../lib/activityIdentity';

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
  const googleUser = useGoogleUser();
  const activityStartDate = getAccountActivityStartDate(googleUser?.email);
  const queryStartDate = activityStartDate ?? '0000-01-01';
  const weekStart = getLocalDateOffset(-6);
  const today = getLocalDate();
  const month = getMonthOffset(0);
  const year = getYearOffset(0);

  return useQuery({
    enabled,
    queryKey: ['progress', 'points-chart', userId, range, weekStart, month, year, activityStartDate],
    queryFn: async (): Promise<PointChartBucket[]> => {
      const db = await getDb();
      const [bucket, where, params] = range === 'W'
        ? ['local_date', 'local_date >= ? AND local_date <= ?', [weekStart, today]]
        : range === 'M'
          ? ["printf('W%d', CAST((CAST(substr(local_date, 9, 2) AS INTEGER) - 1) / 7 AS INTEGER) + 1)", "substr(local_date, 1, 7) = ?", [month]]
          : ['substr(local_date, 1, 7)', "substr(local_date, 1, 4) = ?", [year]];
      return db.getAllAsync<PointChartBucket>(
        `SELECT ${bucket} AS bucket, SUM(total_points) AS points FROM daily_summary
         WHERE user_id = ? AND ${where} AND local_date >= ? AND total_points > 0
         GROUP BY bucket ORDER BY bucket`,
        [userId, ...params, queryStartDate],
      );
    },
  });
}

/** One SQLite-backed view model for the reference Analytics dashboard. */
export function useAnalyticsDashboard(userId: number, range: AnalyticsRange) {
  const googleUser = useGoogleUser();
  const activityStartDate = getAccountActivityStartDate(googleUser?.email);
  const queryStartDate = activityStartDate ?? '0000-01-01';
  const today = getLocalDate();
  // buildAnalyticsDashboard only ever reads `logs` after filtering it down to
  // the current/previous comparison window (see dashboardModel.ts's inWindow
  // filter) — `daily` is the broadest array, but it still respects the
  // account-specific activity boundary for the all-time consistency stat.
  // Bounding the activity_log fetch to a
  // generous superset of that window avoids pulling a user's entire lifetime
  // of logs into JS just to filter almost all of them back out.
  const logsFromDate = range === 'W' ? getLocalDateOffset(-13)
    : range === 'M' ? getLocalDateOffset(-62)
    : getLocalDateOffset(-731);
  const boundedLogsFromDate = activityStartDate && activityStartDate > logsFromDate
    ? activityStartDate
    : logsFromDate;
  return useQuery({
    queryKey: ['progress', 'dashboard', userId, range, today, activityStartDate],
    queryFn: async (): Promise<AnalyticsDashboard> => {
      if (__DEV__ && process.env.EXPO_PUBLIC_ANALYTICS_DEMO === '1') return analyticsDemo;
      const db = await getDb();
      const [daily, logs, activeDays] = await Promise.all([
        db.getAllAsync<AnalyticsDaily>(`SELECT local_date, total_points FROM daily_summary WHERE user_id = ? AND local_date >= ?`, [userId, queryStartDate]),
        db.getAllAsync<AnalyticsLog>(`
          SELECT a.local_date, a.logged_at, a.points_earned, a.stars_delta, a.source, tt.name AS task_name
          FROM activity_log a LEFT JOIN task_types tt ON tt.id = a.task_type_id
          WHERE a.user_id = ? AND a.source = ? AND a.local_date >= ?`, [userId, ANALYTICS_STAR_SOURCE, boundedLogsFromDate]),
        db.getAllAsync<{ local_date: string }>(`
          SELECT DISTINCT local_date FROM activity_log
          WHERE user_id = ? AND local_date >= ? AND source IN ('TASK', 'CHALLENGE')`, [userId, queryStartDate]),
      ]);
      return buildAnalyticsDashboard(daily, logs, range, new Date(), activeDays.map(row => row.local_date));
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
  const googleUser = useGoogleUser();
  const activityStartDate = getAccountActivityStartDate(googleUser?.email);
  const queryStartDate = activityStartDate ?? '0000-01-01';
  const effectiveTo = toDate ?? getLocalDate();
  const effectiveFrom = fromDate ?? getLocalDateOffset(-6);
  return useQuery({
    queryKey: ['progress', 'actlog', userId, effectiveFrom, effectiveTo, limit, activityStartDate],
    queryFn: async (): Promise<ActivityLogEntry[]> => {
      const db = await getDb();
      const rows = await db.getAllAsync<ActivityLogEntry>(
        `SELECT a.id, tt.name AS task_name, tt.is_template, a.kind, a.stars_delta, a.local_date,
                a.logged_at, a.source
         FROM activity_log a
         LEFT JOIN task_types tt ON tt.id = a.task_type_id
         WHERE a.user_id = ?
           AND a.local_date BETWEEN ? AND ?
           AND a.local_date >= ?
         ORDER BY a.logged_at DESC
         LIMIT ?`,
        [userId, effectiveFrom, effectiveTo, queryStartDate, limit]
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
): Promise<{ bonusStarsRemoved: number; deletedActivityIds: number[] }> {
  let bonusStarsRemoved = 0;
  const deletedActivityIds: number[] = [];
  const dates = [...byDate.keys()];
  if (dates.length === 0) return { bonusStarsRemoved, deletedActivityIds };
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
      const staleRows = await db.getAllAsync<{ id: number }>(
        `SELECT id FROM activity_log WHERE user_id = ? AND local_date = ? AND source = 'DAILY_BONUS'`,
        [userId, date],
      );
      deletedActivityIds.push(...staleRows.map(row => row.id));
      await db.runAsync(`DELETE FROM activity_log WHERE user_id = ? AND local_date = ? AND source = 'DAILY_BONUS'`, [userId, date]);
      if (remainingBonusStars > 0) await db.runAsync(
        `INSERT INTO activity_log (user_id, task_type_id, kind, duration_min, points_earned, stars_delta, source, logged_at, local_date, week_start, activity_key)
         VALUES (?, NULL, 'DAILY_BONUS', NULL, 0, ?, 'DAILY_BONUS', ?, ?, ?, ?)`,
        [userId, remainingBonusStars, Date.now(), date, entry.weekStart, createActivityKey()],
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
  return { bonusStarsRemoved, deletedActivityIds };
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
      let deletedActivityIds: number[] = [];

      await db.withTransactionAsync(async () => {
        const rows = await db.getAllAsync<DeleteRow>(
          `SELECT id, local_date, week_start, points_earned, stars_delta, kind, source
           FROM activity_log WHERE user_id = ? AND id IN (${placeholders})`,
          [userId, ...ids]
        );
        if (rows.length === 0) return;

        const { byDate, goodStarsDelta, badPenaltyAmt } = groupDeleteRows(rows);
        const { bonusStarsRemoved, deletedActivityIds: bonusRowIds } = await revertDailySummariesForDelete(db, userId, byDate);
        await revertWeeklySummariesForDelete(db, userId, byDate);

        const deletedPositiveStars = rows.reduce(
          (total, row) => total + (row.source === 'DAILY_BONUS' ? 0 : Math.max(0, row.stars_delta)),
          0,
        ) + bonusStarsRemoved;
        if (deletedPositiveStars > 0) {
          const tiers = await db.getAllAsync<LifetimeTierRow>(
            'SELECT id, tier_order, rank_name, stars_required FROM tiers ORDER BY stars_required ASC',
          );
          lifetimeCrossings = (await applyLifetimeStarsDelta(db, userId, -deletedPositiveStars, tiers)).crossings;
        }

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
        deletedActivityIds = [...rows.map(row => row.id), ...bonusRowIds];
        await enqueuePendingActivityDeletesForUser(db, userId, deletedActivityIds);
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
        .finally(() => {
          qc.invalidateQueries({ queryKey: ['rank'] });
          qc.invalidateQueries({ queryKey: ['leaderboard'] });
        });
      if (data?.lifetimeCrossings?.length) {
        rankMascotBridge.ref?.current?.playRankUp();
        rankMascotBridge.onRankUp?.(data.lifetimeCrossings);
        enqueuePendingLevelUps(data.lifetimeCrossings).catch(() => {});
      }
    },
  });
}

export function useWeeklyConsistency(userId: number) {
  const googleUser = useGoogleUser();
  const activityStartDate = getAccountActivityStartDate(googleUser?.email);
  const queryStartDate = activityStartDate ?? '0000-01-01';
  const weekStart = getWeekStart();
  return useQuery({
    queryKey: ['progress', 'consistency', userId, weekStart, activityStartDate],
    queryFn: async () => {
      const db = await getDb();
      const row = await db.getFirstAsync<{ active_days: number }>(
        `SELECT COUNT(DISTINCT local_date) AS active_days
         FROM activity_log
         WHERE user_id = ? AND week_start = ? AND local_date >= ?`,
        [userId, weekStart, queryStartDate]
      );
      return row?.active_days ?? 0;
    },
  });
}

export function useTopActivities(userId: number, limit = 3) {
  const googleUser = useGoogleUser();
  const activityStartDate = getAccountActivityStartDate(googleUser?.email);
  const queryStartDate = activityStartDate ?? '0000-01-01';
  return useQuery({
    queryKey: ['progress', 'top-activities', userId, activityStartDate],
    queryFn: async () => {
      const db = await getDb();
      const rows = await db.getAllAsync<{ name: string; count: number }>(
        `SELECT tt.name, COUNT(*) AS count
         FROM activity_log a
         JOIN task_types tt ON tt.id = a.task_type_id
         WHERE a.user_id = ? AND a.source = 'TASK' AND a.local_date >= ?
         GROUP BY a.task_type_id
         ORDER BY count DESC
         LIMIT ?`,
        [userId, queryStartDate, limit]
      );
      return rows;
    },
  });
}

export function useAllTimeStats(userId: number) {
  const googleUser = useGoogleUser();
  const activityStartDate = getAccountActivityStartDate(googleUser?.email);
  const queryStartDate = activityStartDate ?? '0000-01-01';
  const analyticsToday = getLocalDate();
  return useQuery({
    // Keep the public hook name for caller compatibility, but make its star
    // KPI roll over with Analytics Year instead of retaining a lifetime cache.
    queryKey: ['progress', 'alltime', userId, activityStartDate, analyticsToday],
    refetchInterval: () => getMillisecondsUntilLocalMidnight(),
    queryFn: async () => {
      const db = await getDb();
      const [acts, yearStars, bestStreak, activeDays] = await Promise.all([
        db.getFirstAsync<{ total: number }>(
          `SELECT COUNT(*) AS total FROM activity_log WHERE user_id = ? AND local_date >= ? AND source = 'TASK'`,
          [userId, queryStartDate]
        ),
        readAnalyticsYearStars(db, userId, new Date(), activityStartDate),
        db.getFirstAsync<{ best: number }>(
          `SELECT COALESCE(MAX(streak_count), 0) AS best FROM daily_summary WHERE user_id = ? AND local_date >= ?`,
          [userId, queryStartDate]
        ),
        db.getFirstAsync<{ total: number }>(
          `SELECT COUNT(*) AS total FROM daily_summary WHERE user_id = ? AND local_date >= ?`,
          [userId, queryStartDate]
        ),
      ]);
      return {
        totalActivities: acts?.total ?? 0,
        // `totalStars` is a legacy caller-facing name. Its contract is now
        // exactly the Analytics Year TASK-star KPI used by Home and Rank.
        totalStars: yearStars,
        bestStreak: bestStreak?.best ?? 0,
        activeDays: activeDays?.total ?? 0,
      };
    },
  });
}
