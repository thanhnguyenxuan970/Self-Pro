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
    mutationFn: async (params: TaskFormParams) => {
      const db = await getDb();
      await db.runAsync(
        `INSERT OR IGNORE INTO task_types
         (user_id, name, kind, is_time_based, base_points, star_penalty, icon, category_id, archived)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        [userId, params.name, params.kind, params.isTimeBased ? 1 : 0,
         params.basePoints, params.starPenalty, params.icon ?? null,
         params.categoryId ?? null]
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['today', 'tasks'] }),
  });
}

export function useUpdateTask(userId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: TaskFormParams & { id: number }) => {
      const db = await getDb();
      await db.runAsync(
        `UPDATE task_types
         SET name = ?, kind = ?, is_time_based = ?, base_points = ?, star_penalty = ?, icon = ?, category_id = ?
         WHERE id = ? AND user_id = ?`,
        [params.name, params.kind, params.isTimeBased ? 1 : 0,
         params.basePoints, params.starPenalty, params.icon ?? null,
         params.categoryId ?? null, params.id, userId]
      );
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

export function useArchiveCategory(userId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (categoryId: number) => {
      const db = await getDb();
      await db.runAsync(
        `UPDATE categories SET archived = 1 WHERE id = ? AND user_id = ?`,
        [categoryId, userId],
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories', userId] });
      qc.invalidateQueries({ queryKey: ['today', 'tasks'] });
    },
  });
}
