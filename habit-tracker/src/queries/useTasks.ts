import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getDb } from '../db/client';
import { DAILY_BONUS_THRESHOLD, DAILY_BONUS_STARS } from '../config/constants';

interface TaskFormParams {
  name: string;
  kind: 'GOOD' | 'BAD';
  isTimeBased: boolean;
  basePoints: number;
  starPenalty: number;
  icon?: string;
  categoryId?: number | null;
}

export function useCreateTask(userId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: TaskFormParams): Promise<number> => {
      const db = await getDb();
      await db.runAsync(
        `INSERT INTO task_types
         (user_id, name, kind, is_time_based, base_points, star_penalty, icon, category_id, archived)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
         ON CONFLICT(user_id, name) DO UPDATE SET archived = 0, is_time_based = excluded.is_time_based`,
        [userId, params.name, params.kind, params.isTimeBased ? 1 : 0,
         params.basePoints, params.starPenalty, params.icon ?? null,
         params.categoryId ?? null]
      );
      const row = await db.getFirstAsync<{ id: number }>(
        'SELECT id FROM task_types WHERE user_id = ? AND name = ? AND archived = 0',
        [userId, params.name]
      );
      return row!.id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['today', 'tasks'] }),
  });
}

export function useArchiveTask(userId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (taskId: number) => {
      const db = await getDb();

      await db.withTransactionAsync(async () => {
        // Deep undo: reverse ALL historical logs for this task across all dates/weeks
        const allLogs = await db.getAllAsync<{
          id: number; local_date: string; week_start: string;
          points_earned: number; stars_delta: number; kind: string;
        }>(
          `SELECT id, local_date, week_start, points_earned, stars_delta, kind
           FROM activity_log WHERE user_id = ? AND task_type_id = ? AND source = 'TASK'`,
          [userId, taskId]
        );

        if (allLogs.length > 0) {
          const kind = allLogs[0].kind; // all rows share same task kind

          // Group by date
          const byDate = new Map<string, { points: number; stars: number; weekStart: string }>();
          for (const row of allLogs) {
            const cur = byDate.get(row.local_date) ?? { points: 0, stars: 0, weekStart: row.week_start };
            byDate.set(row.local_date, {
              points: cur.points + row.points_earned,
              stars: cur.stars + row.stars_delta,
              weekStart: row.week_start,
            });
          }

          // Group by week (bonus reversals will be added in per-date loop)
          const byWeek = new Map<string, { points: number; stars: number }>();
          for (const row of allLogs) {
            const cur = byWeek.get(row.week_start) ?? { points: 0, stars: 0 };
            byWeek.set(row.week_start, {
              points: cur.points + row.points_earned,
              stars: cur.stars + row.stars_delta,
            });
          }

          let totalTreatDelta = 0;

          // Per-date: revert daily_summary and delete bonus rows if needed
          for (const [date, { points: taskPoints, stars: taskStars, weekStart }] of byDate) {
            const daily = await db.getFirstAsync<{ total_points: number; bonus_star_awarded: number }>(
              `SELECT total_points, bonus_star_awarded FROM daily_summary WHERE user_id = ? AND local_date = ?`,
              [userId, date]
            );
            if (!daily) continue;

            const remainingPoints = daily.total_points - taskPoints;
            let bonusStars = 0;

            if (daily.bonus_star_awarded && remainingPoints < DAILY_BONUS_THRESHOLD) {
              bonusStars = DAILY_BONUS_STARS;
              await db.runAsync(
                `DELETE FROM activity_log WHERE user_id = ? AND local_date = ? AND source = 'DAILY_BONUS'`,
                [userId, date]
              );
              const wk = byWeek.get(weekStart) ?? { points: 0, stars: 0 };
              byWeek.set(weekStart, { ...wk, stars: wk.stars + bonusStars });
            }

            if (kind === 'GOOD') totalTreatDelta += taskStars + bonusStars;

            if (remainingPoints <= 0) {
              await db.runAsync(
                `DELETE FROM daily_summary WHERE user_id = ? AND local_date = ?`,
                [userId, date]
              );
            } else {
              await db.runAsync(
                `UPDATE daily_summary SET
                   total_points = MAX(0, total_points - ?),
                   bonus_star_awarded = CASE WHEN ? THEN 0 ELSE bonus_star_awarded END
                 WHERE user_id = ? AND local_date = ?`,
                [taskPoints, bonusStars > 0 ? 1 : 0, userId, date]
              );
            }
          }

          // Delete all TASK log rows for this activity
          await db.runAsync(
            `DELETE FROM activity_log WHERE user_id = ? AND task_type_id = ? AND source = 'TASK'`,
            [userId, taskId]
          );

          // Per-week: update weekly_summary and revoke unclaimed tier unlocks
          for (const [weekStart, { points, stars }] of byWeek) {
            const weeklyRow = await db.getFirstAsync<{ weekly_stars: number }>(
              `SELECT weekly_stars FROM weekly_summary WHERE user_id = ? AND week_start = ?`,
              [userId, weekStart]
            );
            const newWeeklyStars = Math.max(0, (weeklyRow?.weekly_stars ?? 0) - stars);

            await db.runAsync(
              `UPDATE weekly_summary SET
                 total_points = MAX(0, total_points - ?),
                 weekly_stars = MAX(0, weekly_stars - ?)
               WHERE user_id = ? AND week_start = ?`,
              [points, stars, userId, weekStart]
            );

            await db.runAsync(
              `DELETE FROM reward_unlocks
               WHERE user_id = ? AND week_start = ? AND claimed = 0
                 AND tier_id IN (SELECT id FROM tiers WHERE stars_required > ?)`,
              [userId, weekStart, newWeeklyStars]
            );
          }

          // Update treat_stars
          if (kind === 'GOOD') {
            await db.runAsync(
              `UPDATE users SET treat_stars = MAX(0, treat_stars - ?) WHERE id = ?`,
              [Math.max(0, totalTreatDelta), userId]
            );
          } else {
            const totalBadPenalty = allLogs.reduce((s, r) => s + Math.abs(r.stars_delta), 0);
            await db.runAsync(
              `UPDATE users SET treat_stars = treat_stars + ? WHERE id = ? AND penalty_hits_treats = 1`,
              [totalBadPenalty, userId]
            );
          }

          // Recompute streak_count for all remaining daily_summary rows (chain may have gaps now)
          const remainingDays = await db.getAllAsync<{ id: number; local_date: string }>(
            `SELECT id, local_date FROM daily_summary WHERE user_id = ? ORDER BY local_date ASC`,
            [userId]
          );
          let prevDate: string | null = null;
          let streak = 0;
          for (const day of remainingDays) {
            if (prevDate !== null) {
              const diffDays = Math.round(
                (new Date(day.local_date).getTime() - new Date(prevDate).getTime()) / 86400000
              );
              streak = diffDays === 1 ? streak + 1 : 1;
            } else {
              streak = 1;
            }
            await db.runAsync(
              `UPDATE daily_summary SET streak_count = ? WHERE id = ?`,
              [streak, day.id]
            );
            prevDate = day.local_date;
          }
        }

        await db.runAsync(
          `UPDATE task_types SET archived = 1 WHERE id = ? AND user_id = ?`,
          [taskId, userId]
        );
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['today'] });
      qc.invalidateQueries({ queryKey: ['week'] });
      qc.invalidateQueries({ queryKey: ['progress'] });
      qc.invalidateQueries({ queryKey: ['rank'] });
    },
  });
}

