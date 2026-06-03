import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { getDb } from '../db/client';
import { getStoredGoogleUserEmail } from '../hooks/useAuth';
import { syncUserStreak } from '../services/syncService';
import { computeLogTaskRows } from '../logic/logTask';
import { getLocalDate, getLocalDateFor, getWeekStart } from '../logic/formatters';
import { computeTierUnlocks, TierRow } from '../logic/tierUnlocks';

export function useTodayTasks(userId: number) {
  return useQuery({
    queryKey: ['today', 'tasks', userId],
    queryFn: async () => {
      const db = await getDb();
      return db.getAllAsync<{
        id: number; name: string; kind: string; is_time_based: number;
        base_points: number; star_penalty: number; icon: string | null;
        category_id: number | null; sort_order: number;
      }>(
        `SELECT id, name, kind, is_time_based, base_points, star_penalty, icon, category_id, sort_order
         FROM task_types WHERE user_id = ? AND archived = 0 ORDER BY sort_order ASC, kind, name`,
        [userId]
      );
    },
  });
}

export type YesterdayTask = {
  task_type_id: number;
  name: string;
  kind: string;
  is_time_based: number;
  base_points: number;
  star_penalty: number;
  icon: string | null;
  duration_min: number | null;
};

export function useYesterdayLoggedTasks(userId: number) {
  const yesterday = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  })();
  return useQuery({
    queryKey: ['today', 'yesterday', userId, yesterday],
    queryFn: async () => {
      const db = await getDb();
      return db.getAllAsync<YesterdayTask>(
        `SELECT al.task_type_id, tt.name, tt.kind, tt.is_time_based,
                tt.base_points, tt.star_penalty, tt.icon, al.duration_min
         FROM activity_log al
         JOIN task_types tt ON tt.id = al.task_type_id
         WHERE al.user_id = ? AND al.local_date = ? AND al.kind = 'GOOD' AND tt.archived = 0
         GROUP BY al.task_type_id
         ORDER BY al.logged_at DESC`,
        [userId, yesterday]
      );
    },
  });
}

export function useTodayLoggedTaskIds(userId: number) {
  const today = getLocalDate();
  return useQuery({
    queryKey: ['today', 'logged', userId, today],
    queryFn: async () => {
      const db = await getDb();
      const rows = await db.getAllAsync<{ task_type_id: number }>(
        `SELECT DISTINCT task_type_id FROM activity_log
         WHERE user_id = ? AND local_date = ? AND task_type_id IS NOT NULL`,
        [userId, today]
      );
      return new Set(rows.map(r => r.task_type_id));
    },
  });
}

export function useDailySummary(userId: number) {
  const today = getLocalDate();
  return useQuery({
    queryKey: ['today', 'summary', userId, today],
    queryFn: async () => {
      const db = await getDb();
      return db.getFirstAsync<{
        total_points: number; bonus_star_awarded: number; streak_count: number;
      }>(
        `SELECT total_points, bonus_star_awarded, streak_count
         FROM daily_summary WHERE user_id = ? AND local_date = ?`,
        [userId, today]
      );
    },
  });
}

export function useWeeklySummary(userId: number) {
  const weekStart = getWeekStart();
  return useQuery({
    queryKey: ['week', userId, weekStart],
    queryFn: async () => {
      const db = await getDb();
      return db.getFirstAsync<{
        weekly_stars: number; peak_stars: number; current_tier_id: number | null;
      }>(
        `SELECT weekly_stars, peak_stars, current_tier_id
         FROM weekly_summary WHERE user_id = ? AND week_start = ?`,
        [userId, weekStart]
      );
    },
  });
}

export function useLogTask(userId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      taskTypeId: number;
      kind: 'GOOD' | 'BAD';
      isTimeBased: boolean;
      basePoints: number;
      starPenalty: number;
      durationMin?: number;
    }) => {
      const db = await getDb();
      const today = getLocalDate();
      const weekStart = getWeekStart();
      const now = new Date();
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayDate = getLocalDateFor(yesterday);
      const nowMs = now.getTime();

      // tiers is a static lookup — never written, safe to read outside transaction
      const tiers = await db.getAllAsync<TierRow>(
        `SELECT id, stars_required, reward_amount, reward_currency
         FROM tiers ORDER BY stars_required ASC`
      );

      let streakResult = { newStreak: 1, prevStreak: 0 };

      // All volatile reads + computation + writes inside one transaction.
      // This prevents TOCTOU: two concurrent mutateAsync calls can no longer
      // read the same stale daily/weekly rows before either commits.
      await db.withTransactionAsync(async () => {
        const daily = await db.getFirstAsync<{
          total_points: number; bonus_star_awarded: number; streak_count: number;
        }>(
          `SELECT total_points, bonus_star_awarded, streak_count FROM daily_summary
           WHERE user_id = ? AND local_date = ?`,
          [userId, today]
        );

        const weeklyRow = await db.getFirstAsync<{ weekly_stars: number }>(
          `SELECT weekly_stars FROM weekly_summary WHERE user_id = ? AND week_start = ?`,
          [userId, weekStart]
        );

        const alreadyUnlocked = await db.getAllAsync<{ tier_id: number }>(
          `SELECT tier_id FROM reward_unlocks WHERE user_id = ? AND week_start = ?`,
          [userId, weekStart]
        );
        const alreadyUnlockedIds = alreadyUnlocked.map(r => r.tier_id);

        let todayStreak = 1;
        if (daily === null) {
          const yesterdayRow = await db.getFirstAsync<{ streak_count: number }>(
            `SELECT streak_count FROM daily_summary WHERE user_id = ? AND local_date = ?`,
            [userId, yesterdayDate]
          );
          const prevStreak = yesterdayRow?.streak_count ?? 0;
          todayStreak = prevStreak + 1;
          streakResult = { newStreak: todayStreak, prevStreak };
        } else {
          streakResult = { newStreak: daily.streak_count, prevStreak: daily.streak_count };
        }

        const { activityRow, bonusRow } = computeLogTaskRows({
          userId,
          taskTypeId: params.taskTypeId,
          kind: params.kind,
          isTimeBased: params.isTimeBased,
          basePoints: params.basePoints,
          starPenalty: params.starPenalty,
          durationMin: params.durationMin,
          currentDayPoints: daily?.total_points ?? 0,
          bonusAlreadyAwarded: !!daily?.bonus_star_awarded,
          loggedAt: now,
          localDate: today,
          weekStart,
        });

        const newDayPts = (daily?.total_points ?? 0) + activityRow.points_earned;
        const totalStarsDelta = activityRow.stars_delta + (bonusRow?.stars_delta ?? 0);
        const oldStars = weeklyRow?.weekly_stars ?? 0;
        const newStars = oldStars + totalStarsDelta;
        const newUnlocks = computeTierUnlocks({
          userId,
          weekStart,
          oldStars,
          newStars,
          tiers,
          alreadyUnlockedTierIds: alreadyUnlockedIds,
        });

        // Insert main activity row
        await db.runAsync(
          `INSERT INTO activity_log
           (user_id, task_type_id, kind, duration_min, points_earned, stars_delta, source, logged_at, local_date, week_start)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [activityRow.user_id, activityRow.task_type_id, activityRow.kind,
           activityRow.duration_min, activityRow.points_earned, activityRow.stars_delta,
           activityRow.source, activityRow.logged_at, activityRow.local_date, activityRow.week_start]
        );

        // Insert bonus row if earned
        if (bonusRow) {
          await db.runAsync(
            `INSERT INTO activity_log
             (user_id, task_type_id, kind, duration_min, points_earned, stars_delta, source, logged_at, local_date, week_start)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [bonusRow.user_id, bonusRow.task_type_id, bonusRow.kind, bonusRow.duration_min,
             bonusRow.points_earned, bonusRow.stars_delta, bonusRow.source,
             bonusRow.logged_at, bonusRow.local_date, bonusRow.week_start]
          );
        }

        // Upsert daily_summary
        await db.runAsync(
          `INSERT INTO daily_summary (user_id, local_date, total_points, bonus_star_awarded, streak_count)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(user_id, local_date) DO UPDATE SET
             total_points = total_points + ?,
             bonus_star_awarded = CASE WHEN ? THEN 1 ELSE bonus_star_awarded END`,
          [userId, today, newDayPts, bonusRow ? 1 : 0, todayStreak,
           activityRow.points_earned, bonusRow ? 1 : 0]
        );

        // Upsert weekly_summary
        await db.runAsync(
          `INSERT INTO weekly_summary (user_id, week_start, total_points, weekly_stars, peak_stars)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(user_id, week_start) DO UPDATE SET
             total_points = total_points + ?,
             weekly_stars = weekly_stars + ?,
             peak_stars = MAX(peak_stars, weekly_stars + ?)`,
          [userId, weekStart, activityRow.points_earned, totalStarsDelta,
           Math.max(0, totalStarsDelta),
           activityRow.points_earned, totalStarsDelta, totalStarsDelta]
        );

        // Insert tier unlocks (no longer deposit to fund — treats system handles rewards)
        for (const unlock of newUnlocks) {
          await db.runAsync(
            `INSERT OR IGNORE INTO reward_unlocks
             (user_id, tier_id, week_start, stars_at_unlock, reward_amount, claimed)
             VALUES (?, ?, ?, ?, ?, 0)`,
            [unlock.user_id, unlock.tier_id, unlock.week_start,
             unlock.stars_at_unlock, unlock.reward_amount]
          );
        }

        // Update treat_stars pool
        if (params.kind === 'GOOD') {
          await db.runAsync(
            `UPDATE users SET
               treat_stars = treat_stars + ?,
               treat_stars_lifetime = treat_stars_lifetime + ?
             WHERE id = ?`,
            [totalStarsDelta, totalStarsDelta, userId]
          );
        } else {
          // BAD task penalty: deduct from pool only if penalty_hits_treats = 1, floor at 0
          const penaltyAmt = Math.abs(totalStarsDelta);
          await db.runAsync(
            `UPDATE users SET treat_stars = MAX(0, treat_stars - ?)
             WHERE id = ? AND penalty_hits_treats = 1`,
            [penaltyAmt, userId]
          );
        }

        // Mark treats as reached if pool now >= their target (one-time flag)
        const nowIso = new Date(nowMs).toISOString();
        await db.runAsync(
          `UPDATE treats SET reached_at = ?
           WHERE user_id = ? AND status = 'ACTIVE' AND reached_at IS NULL
             AND target_stars <= (SELECT treat_stars FROM users WHERE id = ?)`,
          [nowIso, userId, userId]
        );
      });

      return streakResult;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['today'] });
      qc.invalidateQueries({ queryKey: ['week'] });
      qc.invalidateQueries({ queryKey: ['treats'] });
      qc.invalidateQueries({ queryKey: ['progress'] });

      if (!data) return;
      const { newStreak, prevStreak } = data;
      if (newStreak === 1 && prevStreak > 1) {
        Toast.show({
          type: 'error',
          text1: '😔 Chuỗi đã gián đoạn',
          text2: `Streak ${prevStreak} ngày đã kết thúc. Hôm nay bắt đầu lại!`,
          visibilityTime: 3000,
        });
      } else if (newStreak > 1 && prevStreak < newStreak) {
        Toast.show({
          type: 'success',
          text1: `🔥 Streak ${newStreak} ngày!`,
          visibilityTime: 1800,
        });
      }
      // Fire-and-forget streak sync — non-fatal if Supabase absent or table not migrated
      getStoredGoogleUserEmail()
        .then(email => { if (email) return syncUserStreak(email, newStreak); })
        .catch(() => {});
    },
  });
}

export function useCategories(userId: number) {
  return useQuery({
    queryKey: ['categories', userId],
    queryFn: async () => {
      const db = await getDb();
      return db.getAllAsync<{ id: number; name: string; icon: string | null }>(
        `SELECT id, name, icon FROM categories WHERE user_id = ? AND archived = 0 ORDER BY sort_order`,
        [userId]
      );
    },
  });
}
