import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getDb } from '../db/client';
import { TreatRow, DecoratedTreat, decorateTreat, canEnjoyTreat } from '../logic/treatLogic';
import { DEFAULT_VALUE_PER_STAR } from '../constants';

export type { TreatRow, DecoratedTreat };

export interface TreatHistoryRow {
  id: number;
  treat_id: number;
  name: string;
  stars_spent: number;
  amount: number;
  currency: string;
  enjoyed_at: string;
}

export function useTreatPool(userId: number) {
  return useQuery({
    queryKey: ['treats', 'pool', userId],
    queryFn: async () => {
      const db = await getDb();
      const row = await db.getFirstAsync<{
        treat_stars: number;
        treat_stars_lifetime: number;
        value_per_star: number;
      }>(
        `SELECT treat_stars, treat_stars_lifetime, value_per_star FROM users WHERE id = ?`,
        [userId]
      );
      return row ?? { treat_stars: 0, treat_stars_lifetime: 0, value_per_star: 1000 };
    },
  });
}

export function useTreats(userId: number) {
  return useQuery({
    queryKey: ['treats', 'list', userId],
    queryFn: async () => {
      const db = await getDb();
      const pool = await db.getFirstAsync<{ treat_stars: number }>(
        `SELECT treat_stars FROM users WHERE id = ?`,
        [userId]
      );
      const treatStars = pool?.treat_stars ?? 0;
      const rows = await db.getAllAsync<TreatRow>(
        `SELECT id, user_id, name, icon, target_stars, approx_amount, currency,
                status, sort_order, reached_at, enjoyed_at, created_at
         FROM treats WHERE user_id = ? AND status != 'ARCHIVED'
         ORDER BY status ASC, sort_order ASC, target_stars ASC`,
        [userId]
      );
      return rows.map(r => decorateTreat(r, treatStars));
    },
  });
}

export function useAddTreat(userId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      name: string;
      icon?: string;
      approxAmount: number;
      valuePerStar?: number;
    }) => {
      const db = await getDb();
      const vps = params.valuePerStar ?? DEFAULT_VALUE_PER_STAR;
      const targetStars = Math.max(1, Math.round(params.approxAmount / vps));
      await db.runAsync(
        `INSERT INTO treats (user_id, name, icon, target_stars, approx_amount, currency, sort_order)
         VALUES (?, ?, ?, ?, ?, 'VND',
           (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM treats WHERE user_id = ?))`,
        [userId, params.name, params.icon ?? 'gift', targetStars, params.approxAmount, userId]
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['treats'] }),
  });
}

export function useEnjoyTreat(userId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (treatId: number) => {
      const db = await getDb();
      await db.withTransactionAsync(async () => {
        const treat = await db.getFirstAsync<TreatRow>(
          `SELECT id, user_id, name, icon, target_stars, approx_amount, currency,
                  status, sort_order, reached_at, enjoyed_at, created_at
           FROM treats WHERE id = ? AND user_id = ?`,
          [treatId, userId]
        );
        if (!treat) throw new Error('TREAT_NOT_FOUND');

        const pool = await db.getFirstAsync<{ treat_stars: number }>(
          `SELECT treat_stars FROM users WHERE id = ?`,
          [userId]
        );
        const check = canEnjoyTreat(treat, pool?.treat_stars ?? 0);
        if (!check.allowed) throw new Error(check.reason);

        const nowIso = new Date().toISOString();
        await db.runAsync(
          `UPDATE users SET treat_stars = MAX(0, treat_stars - ?) WHERE id = ?`,
          [treat.target_stars, userId]
        );
        await db.runAsync(
          `UPDATE treats SET status = 'ENJOYED', enjoyed_at = ? WHERE id = ?`,
          [nowIso, treatId]
        );
        await db.runAsync(
          `INSERT INTO treat_history (user_id, treat_id, name, stars_spent, amount, currency, enjoyed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [userId, treatId, treat.name, treat.target_stars, treat.approx_amount, treat.currency, nowIso]
        );
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['treats'] });
      qc.invalidateQueries({ queryKey: ['freeze'] });
    },
  });
}

export function useTreatHistory(userId: number) {
  return useQuery({
    queryKey: ['treats', 'history', userId],
    queryFn: async () => {
      const db = await getDb();
      return db.getAllAsync<TreatHistoryRow>(
        `SELECT id, treat_id, name, stars_spent, amount, currency, enjoyed_at
         FROM treat_history WHERE user_id = ? ORDER BY enjoyed_at DESC LIMIT 50`,
        [userId]
      );
    },
  });
}
