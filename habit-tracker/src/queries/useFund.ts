import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getDb } from '../db/client';
import { getLocalDateFor } from '../logic/formatters';
import { canPurchaseFreeze } from '../logic/streakFreeze';
import { STREAK_FREEZE_COST } from '../constants';

export function useFundBalance(userId: number) {
  return useQuery({
    queryKey: ['fund', 'balance', userId],
    queryFn: async () => {
      const db = await getDb();
      const row = await db.getFirstAsync<{ balance: number }>(
        `SELECT COALESCE(
           SUM(CASE WHEN type = 'DEPOSIT' THEN amount ELSE -amount END),
           0
         ) AS balance
         FROM fund_transactions WHERE user_id = ?`,
        [userId]
      );
      return row?.balance ?? 0;
    },
  });
}

export interface LedgerRow {
  id: number;
  type: 'DEPOSIT' | 'WITHDRAWAL';
  amount: number;
  currency: string;
  note: string | null;
  occurred_at: number;
}

export function useFundLedger(userId: number) {
  return useQuery({
    queryKey: ['fund', 'ledger', userId],
    queryFn: async () => {
      const db = await getDb();
      return db.getAllAsync<LedgerRow>(
        `SELECT id, type, amount, currency, note, occurred_at
         FROM fund_transactions WHERE user_id = ?
         ORDER BY occurred_at DESC LIMIT 50`,
        [userId]
      );
    },
  });
}

export function useDepositFund(userId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ amount, note }: { amount: number; note?: string }) => {
      const db = await getDb();
      await db.runAsync(
        `INSERT INTO fund_transactions (user_id, type, amount, currency, note, occurred_at)
         VALUES (?, 'DEPOSIT', ?, 'VND', ?, ?)`,
        [userId, amount, note ?? null, Date.now()]
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fund'] });
    },
  });
}

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
      const balance = await db.getFirstAsync<{ balance: number }>(
        `SELECT COALESCE(SUM(CASE WHEN type='DEPOSIT' THEN amount ELSE -amount END),0) AS balance
         FROM fund_transactions WHERE user_id = ?`,
        [userId]
      );

      const check = canPurchaseFreeze({
        balance: balance?.balance ?? 0,
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
        const bal = await db.getFirstAsync<{ balance: number }>(
          `SELECT COALESCE(SUM(CASE WHEN type='DEPOSIT' THEN amount ELSE -amount END),0) AS balance
           FROM fund_transactions WHERE user_id = ?`,
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
          balance: bal?.balance ?? 0,
          existingFreeze: !!existingFreeze,
          existingActivity: !!yDay,
          currentStreak: params.currentStreak,
        }, STREAK_FREEZE_COST);
        if (!check.allowed) throw new Error(check.reason);

        await db.runAsync(
          `INSERT INTO fund_transactions (user_id, type, amount, currency, note, occurred_at)
           VALUES (?, 'WITHDRAWAL', ?, 'VND', 'Streak Freeze', ?)`,
          [userId, STREAK_FREEZE_COST, Date.now()]
        );
        await db.runAsync(
          `INSERT INTO streak_freezes (user_id, local_date, purchased_at) VALUES (?, ?, ?)`,
          [userId, params.localDate, Date.now()]
        );
        // Synthetic daily_summary row — preserves streak without logging activity
        await db.runAsync(
          `INSERT OR IGNORE INTO daily_summary
           (user_id, local_date, total_points, bonus_star_awarded, streak_count)
           VALUES (?, ?, 0, 0, ?)`,
          [userId, params.localDate, params.currentStreak]
        );
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fund'] });
      qc.invalidateQueries({ queryKey: ['freeze'] });
      qc.invalidateQueries({ queryKey: ['today'] });
      qc.invalidateQueries({ queryKey: ['progress'] });
    },
  });
}

export function useSpendFund(userId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { amount: number; note?: string }) => {
      const db = await getDb();
      await db.withTransactionAsync(async () => {
        const bal = await db.getFirstAsync<{ balance: number }>(
          `SELECT COALESCE(SUM(CASE WHEN type='DEPOSIT' THEN amount ELSE -amount END),0) AS balance
           FROM fund_transactions WHERE user_id = ?`,
          [userId]
        );
        if ((bal?.balance ?? 0) < params.amount) throw new Error('INSUFFICIENT_FUNDS');
        await db.runAsync(
          `INSERT INTO fund_transactions (user_id, type, amount, currency, note, occurred_at)
           VALUES (?, 'WITHDRAWAL', ?, 'VND', ?, ?)`,
          [userId, params.amount, params.note ?? null, Date.now()]
        );
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fund'] }),
  });
}
