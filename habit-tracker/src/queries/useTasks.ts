import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getDb } from '../db/client';
import { getLocalDate, getWeekStart } from '../utils/formatters';
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
      const today = getLocalDate();
      const weekStart = getWeekStart();

      await db.withTransactionAsync(async () => {
        // Reverse any stars earned from today's logs for this task before archiving
        const taskRows = await db.getAllAsync<{
          id: number; points_earned: number; stars_delta: number; kind: string;
        }>(
          `SELECT id, points_earned, stars_delta, kind FROM activity_log
           WHERE user_id = ? AND local_date = ? AND task_type_id = ? AND source = 'TASK'`,
          [userId, today, taskId]
        );

        if (taskRows.length > 0) {
          const taskPoints = taskRows.reduce((s, r) => s + r.points_earned, 0);
          const taskStars = taskRows.reduce((s, r) => s + r.stars_delta, 0);
          const taskKind = taskRows[0].kind;

          const daily = await db.getFirstAsync<{ total_points: number; bonus_star_awarded: number }>(
            `SELECT total_points, bonus_star_awarded FROM daily_summary WHERE user_id = ? AND local_date = ?`,
            [userId, today]
          );
          const weeklyRow = await db.getFirstAsync<{ weekly_stars: number }>(
            `SELECT weekly_stars FROM weekly_summary WHERE user_id = ? AND week_start = ?`,
            [userId, weekStart]
          );

          let bonusStars = 0;
          const remainingPoints = (daily?.total_points ?? 0) - taskPoints;
          if (daily?.bonus_star_awarded && remainingPoints < DAILY_BONUS_THRESHOLD) {
            bonusStars = DAILY_BONUS_STARS;
            await db.runAsync(
              `DELETE FROM activity_log WHERE user_id = ? AND local_date = ? AND source = 'DAILY_BONUS'`,
              [userId, today]
            );
          }

          const totalStarsDelta = taskStars + bonusStars;
          const newWeeklyStars = Math.max(0, (weeklyRow?.weekly_stars ?? 0) - totalStarsDelta);

          for (const row of taskRows) {
            await db.runAsync(`DELETE FROM activity_log WHERE id = ?`, [row.id]);
          }

          if (remainingPoints <= 0) {
            await db.runAsync(
              `DELETE FROM daily_summary WHERE user_id = ? AND local_date = ?`,
              [userId, today]
            );
          } else {
            await db.runAsync(
              `UPDATE daily_summary SET
                 total_points = MAX(0, total_points - ?),
                 bonus_star_awarded = CASE WHEN ? THEN 0 ELSE bonus_star_awarded END
               WHERE user_id = ? AND local_date = ?`,
              [taskPoints, bonusStars > 0 ? 1 : 0, userId, today]
            );
          }

          await db.runAsync(
            `UPDATE weekly_summary SET
               total_points = MAX(0, total_points - ?),
               weekly_stars = MAX(0, weekly_stars - ?)
             WHERE user_id = ? AND week_start = ?`,
            [taskPoints, totalStarsDelta, userId, weekStart]
          );

          await db.runAsync(
            `DELETE FROM reward_unlocks
             WHERE user_id = ? AND week_start = ? AND claimed = 0
               AND tier_id IN (SELECT id FROM tiers WHERE stars_required > ?)`,
            [userId, weekStart, newWeeklyStars]
          );

          if (taskKind === 'GOOD') {
            await db.runAsync(
              `UPDATE users SET treat_stars = MAX(0, treat_stars - ?) WHERE id = ?`,
              [Math.max(0, totalStarsDelta), userId]
            );
          } else {
            await db.runAsync(
              `UPDATE users SET treat_stars = treat_stars + ? WHERE id = ? AND penalty_hits_treats = 1`,
              [Math.abs(taskStars), userId]
            );
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

