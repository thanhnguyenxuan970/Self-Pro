import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getDb } from '../db/client';
import { canBackfill, computeStreakCounts } from '../game/backfill';
import { computeLogTaskRows } from '../game/logTask';
import { getLocalDate, getLocalDateFor, getWeekStart, getWeekStartFor } from '../utils/formatters';
import type { SQLiteDatabase } from 'expo-sqlite';

export type BackfillDayParams = {
  date: string;              // 'YYYY-MM-DD' — the missed day to backfill
  taskTypeId: number;
  kind: 'GOOD' | 'BAD';
  isTimeBased: boolean;
  basePoints: number;
  starPenalty: number;
  durationMin?: number;
  countTowardRank?: boolean; // default false — anti-gaming
};

/** Generate all YYYY-MM-DD dates from `from` to `to` inclusive. */
function dateRange(from: string, to: string): string[] {
  const dates: string[] = [];
  const cur = new Date(from + 'T12:00:00');
  const end = new Date(to + 'T12:00:00');
  while (cur <= end) {
    dates.push(getLocalDateFor(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

/** Subtract one day from a YYYY-MM-DD string. */
function prevDay(date: string): string {
  const d = new Date(date + 'T12:00:00');
  d.setDate(d.getDate() - 1);
  return getLocalDateFor(d);
}

async function recomputeStreakChain(
  db: SQLiteDatabase,
  userId: number,
  fromDate: string,
  toDate: string,
): Promise<number> {
  const prior = await db.getFirstAsync<{ streak_count: number }>(
    `SELECT streak_count FROM daily_summary WHERE user_id = ? AND local_date = ?`,
    [userId, prevDay(fromDate)],
  );
  const priorStreak = prior?.streak_count ?? 0;

  const range = dateRange(fromDate, toDate);

  const rows = await db.getAllAsync<{ local_date: string; total_points: number }>(
    `SELECT local_date, total_points FROM daily_summary
     WHERE user_id = ? AND local_date >= ? AND local_date <= ?`,
    [userId, fromDate, toDate],
  );
  const pointsByDate = new Map(rows.map(r => [r.local_date, r.total_points]));

  const daysActive = range.map(d => (pointsByDate.get(d) ?? 0) > 0);
  const streakCounts = computeStreakCounts(daysActive, priorStreak);

  for (let i = 0; i < range.length; i++) {
    const d = range[i];
    if (pointsByDate.has(d)) {
      await db.runAsync(
        `UPDATE daily_summary SET streak_count = ? WHERE user_id = ? AND local_date = ?`,
        [streakCounts[i], userId, d],
      );
    }
  }

  return streakCounts[streakCounts.length - 1] ?? 0;
}

export function useBackfillDay(userId: number) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (params: BackfillDayParams): Promise<{ newStreak: number }> => {
      const db = await getDb();
      const today = getLocalDate();
      const currentWeekStart = getWeekStart();
      const backfillDate = params.date;
      const backfillWeekStart = getWeekStartFor(new Date(backfillDate + 'T12:00:00'));

      const quotaRow = await db.getFirstAsync<{ n: number }>(
        `SELECT COUNT(DISTINCT local_date) AS n
         FROM activity_log
         WHERE user_id = ? AND week_start = ? AND is_backfill = 1`,
        [userId, currentWeekStart],
      );
      const backfillsUsedThisWeek = quotaRow?.n ?? 0;

      const existingRow = await db.getFirstAsync<{ n: number }>(
        `SELECT COUNT(*) AS n FROM daily_summary
         WHERE user_id = ? AND local_date = ? AND total_points > 0`,
        [userId, backfillDate],
      );
      const dayHasActivity = (existingRow?.n ?? 0) > 0;

      const freezeRow = await db.getFirstAsync<{ id: number }>(
        `SELECT id FROM streak_freezes WHERE user_id = ? AND local_date = ?`,
        [userId, backfillDate],
      );
      const hasStreakFreeze = !!freezeRow;

      const check = canBackfill({
        date: backfillDate,
        today,
        weekStartOfDate: backfillWeekStart,
        currentWeekStart,
        dayHasActivity,
        backfillsUsedThisWeek,
        hasStreakFreeze,
      });
      if (!check.allowed) {
        throw new Error(check.reason);
      }

      let newStreak = 0;

      await db.withTransactionAsync(async () => {
        const now = new Date();
        const nowMs = now.getTime();

        const existingDaily = await db.getFirstAsync<{ total_points: number; bonus_star_awarded: number }>(
          `SELECT total_points, bonus_star_awarded FROM daily_summary
           WHERE user_id = ? AND local_date = ?`,
          [userId, backfillDate],
        );

        const { activityRow, bonusRow } = computeLogTaskRows({
          userId,
          taskTypeId: params.taskTypeId,
          kind: params.kind,
          isTimeBased: params.isTimeBased,
          basePoints: params.basePoints,
          starPenalty: params.starPenalty,
          durationMin: params.durationMin,
          currentDayPoints: existingDaily?.total_points ?? 0,
          bonusAlreadyAwarded: !!existingDaily?.bonus_star_awarded,
          loggedAt: now,
          localDate: backfillDate,
          weekStart: backfillWeekStart,
        });

        const totalStarsDelta = activityRow.stars_delta + (bonusRow?.stars_delta ?? 0);

        const insertSql = `INSERT INTO activity_log
          (user_id, task_type_id, kind, duration_min, points_earned, stars_delta,
           source, logged_at, local_date, week_start, is_backfill)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`;
        await db.runAsync(insertSql, [
          activityRow.user_id, activityRow.task_type_id, activityRow.kind,
          activityRow.duration_min, activityRow.points_earned, activityRow.stars_delta,
          activityRow.source, nowMs, backfillDate, backfillWeekStart,
        ]);
        if (bonusRow) {
          await db.runAsync(insertSql, [
            bonusRow.user_id, bonusRow.task_type_id, bonusRow.kind,
            bonusRow.duration_min, bonusRow.points_earned, bonusRow.stars_delta,
            bonusRow.source, nowMs, backfillDate, backfillWeekStart,
          ]);
        }

        const newDayPoints = (existingDaily?.total_points ?? 0) + activityRow.points_earned;
        await db.runAsync(
          `INSERT INTO daily_summary (user_id, local_date, total_points, bonus_star_awarded, streak_count)
           VALUES (?, ?, ?, ?, 0)
           ON CONFLICT(user_id, local_date) DO UPDATE SET
             total_points = total_points + ?,
             bonus_star_awarded = CASE WHEN ? THEN 1 ELSE bonus_star_awarded END`,
          [userId, backfillDate, newDayPoints, bonusRow ? 1 : 0,
           activityRow.points_earned, bonusRow ? 1 : 0],
        );

        newStreak = await recomputeStreakChain(db, userId, backfillDate, today);

        if (params.countTowardRank === true) {
          await db.runAsync(
            `INSERT INTO weekly_summary (user_id, week_start, total_points, weekly_stars, peak_stars, current_tier_id)
             VALUES (?, ?, ?, ?, ?, (SELECT current_tier_id FROM weekly_summary WHERE user_id = ? AND week_start = ?))
             ON CONFLICT(user_id, week_start) DO UPDATE SET
               total_points = total_points + ?,
               weekly_stars = weekly_stars + ?,
               peak_stars = MAX(peak_stars, weekly_stars + ?)`,
            [userId, currentWeekStart, activityRow.points_earned, totalStarsDelta,
             Math.max(0, totalStarsDelta), userId, currentWeekStart,
             activityRow.points_earned, totalStarsDelta, totalStarsDelta],
          );
        }
      });

      return { newStreak };
    },

    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['today'] });
      qc.invalidateQueries({ queryKey: ['week'] });
      qc.invalidateQueries({ queryKey: ['progress'] });
      qc.invalidateQueries({ queryKey: ['calendar'] });
    },

    onError: (_err) => {
      // caller checks err.message for BackfillDenyReason (e.g. 'QUOTA_EXCEEDED')
    },
  });
}
