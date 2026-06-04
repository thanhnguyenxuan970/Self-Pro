import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getDb } from '../db/client';
import { getLocalDateFor } from '../utils/formatters';
import { canPurchaseFreeze } from '../game/streakFreeze';
import { STREAK_FREEZE_COST } from '../config/constants';

export function useStreakFreezeEligibility(userId: number) {
  const yesterday = getLocalDateFor(new Date(Date.now() - 86_400_000));
  const dayBefore  = getLocalDateFor(new Date(Date.now() - 2 * 86_400_000));

  return useQuery({
    queryKey: ['freeze', 'eligible', userId, yesterday],
    queryFn: async () => {
      const db = await getDb();

      const yDay = await db.getFirstAsync<{ id: number }>(
        `SELECT id FROM daily_summary WHERE user_id = ? AND local_date = ?`,
        [userId, yesterday]
      );
      const existingFreeze = await db.getFirstAsync<{ id: number }>(
        `SELECT id FROM streak_freezes WHERE user_id = ? AND local_date = ?`,
        [userId, yesterday]
      );
      const priorDay = await db.getFirstAsync<{ streak_count: number }>(
        `SELECT streak_count FROM daily_summary WHERE user_id = ? AND local_date = ?`,
        [userId, dayBefore]
      );
      const userRow = await db.getFirstAsync<{ treat_stars: number }>(
        `SELECT treat_stars FROM users WHERE id = ?`,
        [userId]
      );

      const check = canPurchaseFreeze({
        treatStars: userRow?.treat_stars ?? 0,
        existingFreeze: !!existingFreeze,
        existingActivity: !!yDay,
        currentStreak: priorDay?.streak_count ?? 0,
      }, STREAK_FREEZE_COST);

      return {
        eligible: check.allowed,
        yesterday,
        currentStreak: priorDay?.streak_count ?? 0,
      };
    },
  });
}

export function usePurchaseStreakFreeze(userId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { localDate: string; currentStreak: number }) => {
      const db = await getDb();
      await db.withTransactionAsync(async () => {
        const userRow = await db.getFirstAsync<{ treat_stars: number }>(
          `SELECT treat_stars FROM users WHERE id = ?`,
          [userId]
        );
        const yDay = await db.getFirstAsync<{ id: number }>(
          `SELECT id FROM daily_summary WHERE user_id = ? AND local_date = ?`,
          [userId, params.localDate]
        );
        const existingFreeze = await db.getFirstAsync<{ id: number }>(
          `SELECT id FROM streak_freezes WHERE user_id = ? AND local_date = ?`,
          [userId, params.localDate]
        );
        const check = canPurchaseFreeze({
          treatStars: userRow?.treat_stars ?? 0,
          existingFreeze: !!existingFreeze,
          existingActivity: !!yDay,
          currentStreak: params.currentStreak,
        }, STREAK_FREEZE_COST);
        if (!check.allowed) throw new Error(check.reason);

        await db.runAsync(
          `UPDATE users SET treat_stars = MAX(0, treat_stars - ?) WHERE id = ?`,
          [STREAK_FREEZE_COST, userId]
        );
        await db.runAsync(
          `INSERT INTO streak_freezes (user_id, local_date, purchased_at) VALUES (?, ?, ?)`,
          [userId, params.localDate, Date.now()]
        );
        await db.runAsync(
          `INSERT OR IGNORE INTO daily_summary
           (user_id, local_date, total_points, bonus_star_awarded, streak_count)
           VALUES (?, ?, 0, 0, ?)`,
          [userId, params.localDate, params.currentStreak]
        );
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['treats'] });
      qc.invalidateQueries({ queryKey: ['freeze'] });
      qc.invalidateQueries({ queryKey: ['today'] });
      qc.invalidateQueries({ queryKey: ['progress'] });
    },
  });
}
