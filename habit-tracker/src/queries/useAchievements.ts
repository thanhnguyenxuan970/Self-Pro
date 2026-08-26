import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getDb } from '../db/client';
import { useGoogleUser } from '../hooks/authContext';
import { getAccountActivityStartDate } from '../lib/accountActivityBoundary';
import { getLocalDate } from '../utils/formatters';
import { challengeDate } from '../lib/challenge';
import { weekWindows, weekSessionsDone } from '../lib/challengeWeekly';

/** Total days completed across all challenges (active + past), all-time. */
export function useChallengeDaysTotal(userId: number) {
  return useQuery({
    queryKey: ['achievements', 'challenge-days', userId],
    queryFn: async () => {
      const db = await getDb();
      const row = await db.getFirstAsync<{ n: number }>(
        `SELECT COUNT(*) AS n FROM challenge_log cl
         JOIN challenges c ON c.id = cl.challenge_id
         WHERE c.user_id = ? AND cl.state = 'done'`,
        [userId]
      );
      return row?.n ?? 0;
    },
  });
}

/** Count of weekly-mode weeks (across all of a user's weekly challenges, any
 *  status) where sessions done exceeded weekly_target -- "Cày vượt chỉ tiêu". */
export function useWeeklyOverachieverCount(userId: number) {
  return useQuery({
    queryKey: ['achievements', 'weekly-overachiever', userId],
    queryFn: async () => {
      const db = await getDb();
      const today = challengeDate();
      const challenges = await db.getAllAsync<{ id: number; start_date: string; weekly_target: number; total_weeks: number }>(
        `SELECT id, start_date, weekly_target, total_weeks FROM challenges WHERE user_id = ? AND mode = 'weekly'`,
        [userId],
      );
      if (challenges.length === 0) return 0;
      // Batched into one query instead of one round-trip per challenge.
      const placeholders = challenges.map(() => '?').join(',');
      const logRows = await db.getAllAsync<{ challenge_id: number; local_date: string }>(
        `SELECT challenge_id, local_date FROM challenge_log WHERE challenge_id IN (${placeholders}) AND state = 'done'`,
        challenges.map(c => c.id),
      );
      const doneDatesByChallenge = new Map<number, Set<string>>();
      for (const row of logRows) {
        if (!doneDatesByChallenge.has(row.challenge_id)) doneDatesByChallenge.set(row.challenge_id, new Set());
        doneDatesByChallenge.get(row.challenge_id)!.add(row.local_date);
      }
      let count = 0;
      for (const c of challenges) {
        const doneDates = doneDatesByChallenge.get(c.id) ?? new Set<string>();
        for (const window of weekWindows(c.start_date, c.total_weeks)) {
          if (window.start > today) break;
          if (weekSessionsDone(doneDates, window) > c.weekly_target) count++;
        }
      }
      return count;
    },
  });
}

/** Extra Trophy Shelf metrics derived directly from the append-only activity log. */
export function useAchievementActivityMetrics(userId: number) {
  const googleUser = useGoogleUser();
  const activityStartDate = getAccountActivityStartDate(googleUser?.email);
  const queryStartDate = activityStartDate ?? '0000-01-01';
  return useQuery({
    queryKey: ['achievements', 'activity-metrics', userId, activityStartDate],
    queryFn: async () => {
      const db = await getDb();
      const row = await db.getFirstAsync<{ morningLogs: number; nightLogs: number; activityTypes: number }>(
        `SELECT
           COALESCE(SUM(CASE WHEN CAST(strftime('%H', datetime(logged_at / 1000, 'unixepoch', 'localtime')) AS INTEGER) < 9 THEN 1 ELSE 0 END), 0) AS morningLogs,
           COALESCE(SUM(CASE WHEN CAST(strftime('%H', datetime(logged_at / 1000, 'unixepoch', 'localtime')) AS INTEGER) >= 22 THEN 1 ELSE 0 END), 0) AS nightLogs,
           COUNT(DISTINCT task_type_id) AS activityTypes
         FROM activity_log WHERE user_id = ? AND local_date >= ? AND source = 'TASK'`,
        [userId, queryStartDate],
      );
      return row ?? { morningLogs: 0, nightLogs: 0, activityTypes: 0 };
    },
  });
}

/** Map of achievementId -> date first recorded as unlocked (YYYY-MM-DD). */
export function useAchievementUnlocks(userId: number) {
  return useQuery({
    queryKey: ['achievements', 'unlocks', userId],
    queryFn: async () => {
      const db = await getDb();
      const rows = await db.getAllAsync<{ key: string; earned_at: string }>(
        `SELECT key, earned_at FROM achievements WHERE user_id = ? AND source_type = 'record'`,
        [userId]
      );
      return Object.fromEntries(rows.map(r => [r.key, r.earned_at])) as Record<string, string>;
    },
  });
}

/** Records the first-seen unlock date for a Trophy Shelf badge. No-op if already recorded. */
export function useRecordAchievementUnlock(userId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (achievementId: string) => {
      const db = await getDb();
      await db.runAsync(
        `INSERT OR IGNORE INTO achievements (user_id, key, rarity, earned_at, source_type, source_id)
         VALUES (?, ?, 'common', ?, 'record', NULL)`,
        [userId, achievementId, getLocalDate()]
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['achievements', 'unlocks'] });
    },
  });
}
