import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDb } from '../db/client';
import { ACHIEVEMENTS } from '../config/achievements';
import { getLocalDate } from '../utils/formatters';

type AchievementSourceType = 'challenge' | 'streak' | 'rank' | 'record';
type AchievementRarity = 'common' | 'rare' | 'legendary';

function achievementSourceType(achievementId: string): AchievementSourceType {
  const achievement = ACHIEVEMENTS.find(item => item.id === achievementId);
  if (achievement?.metric === 'challengeDays') return 'challenge';
  if (achievement?.metric === 'streak') return 'streak';
  if (achievement?.metric === 'rankTier') return 'rank';
  return 'record';
}

function achievementRarity(achievementId: string): AchievementRarity {
  const achievement = ACHIEVEMENTS.find(item => item.id === achievementId);
  if (achievement?.tier === 'silver' || achievement?.tier === 'gold') return 'rare';
  if (achievement?.tier === 'platinum' || achievement?.tier === 'diamond') return 'legendary';
  return 'common';
}

/** Total days completed across all challenges (active + past), all-time. */
export function useChallengeDaysTotal(userId: number) {
  return useQuery({
    queryKey: ['achievements', 'challenge-days', userId],
    queryFn: async () => {
      const db = await getDb();
      const row = await db.getFirstAsync<{ n: number }>(
        `SELECT COUNT(*) AS n FROM challenge_days cd
         JOIN challenges c ON c.id = cd.challenge_id
         WHERE c.user_id = ?`,
        [userId],
      );
      return row?.n ?? 0;
    },
  });
}

/** Map of achievement key -> first earned date (YYYY-MM-DD). */
export function useAchievementUnlocks(userId: number) {
  return useQuery({
    queryKey: ['achievements', 'unlocks', userId],
    queryFn: async () => {
      const db = await getDb();
      const rows = await db.getAllAsync<{ key: string; earned_at: string }>(
        `SELECT key, earned_at FROM achievements WHERE user_id = ?`,
        [userId],
      );
      return Object.fromEntries(rows.map(row => [row.key, row.earned_at])) as Record<string, string>;
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
        `INSERT OR IGNORE INTO achievements (user_id, key, rarity, earned_at, source_type, source_id)
         VALUES (?, ?, ?, ?, ?, NULL)`,
        [
          userId,
          achievementId,
          achievementRarity(achievementId),
          getLocalDate(),
          achievementSourceType(achievementId),
        ],
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['achievements', 'unlocks'] });
    },
  });
}
