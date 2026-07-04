import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getDb } from '../db/client';
import { getLocalDate } from '../utils/formatters';

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

/** Map of achievementId -> date first recorded as unlocked (YYYY-MM-DD). */
export function useAchievementUnlocks(userId: number) {
  return useQuery({
    queryKey: ['achievements', 'unlocks', userId],
    queryFn: async () => {
      const db = await getDb();
      const rows = await db.getAllAsync<{ achievement_id: string; unlocked_at: string }>(
        `SELECT achievement_id, unlocked_at FROM achievement_unlocks WHERE user_id = ?`,
        [userId]
      );
      return Object.fromEntries(rows.map(r => [r.achievement_id, r.unlocked_at])) as Record<string, string>;
    },
  });
}

/** Records the first-seen unlock date for an achievement. No-op if already recorded. */
export function useRecordAchievementUnlock(userId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (achievementId: string) => {
      const db = await getDb();
      await db.runAsync(
        `INSERT INTO achievement_unlocks (user_id, achievement_id, unlocked_at) VALUES (?, ?, ?)
         ON CONFLICT(user_id, achievement_id) DO NOTHING`,
        [userId, achievementId, getLocalDate()]
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['achievements', 'unlocks'] });
    },
  });
}
