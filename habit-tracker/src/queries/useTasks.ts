import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getDb } from '../db/client';

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
      await db.runAsync(
        `UPDATE task_types SET archived = 1 WHERE id = ? AND user_id = ?`,
        [taskId, userId]
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['today', 'tasks'] }),
  });
}

