import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SQLiteDatabase } from 'expo-sqlite';
import { getDb } from '../db/client';
import { getStoredGoogleUserEmail } from '../hooks/useAuth';
import { syncUserStreak } from '../api/syncService';
import { computeLogTaskRows } from '../game/logTask';
import { getLocalDate, getLocalDateFor, getWeekStart } from '../utils/formatters';
import { computeTierUnlocks, TierRow } from '../game/tierUnlocks';
import { rankMascotBridge } from '../lib/rankMascotBridge';
import { DAILY_BONUS_THRESHOLD, DAILY_BONUS_STARS } from '../config/constants';

type FullTierRow = TierRow & { tier_order: number; rank_name: string };

type DailySummaryRow = { total_points: number; bonus_star_awarded: number; streak_count: number };

async function computeTodayStreak(
  db: SQLiteDatabase, userId: number, today: string, yesterdayDate: string,
  daily: DailySummaryRow | undefined | null,
): Promise<{ todayStreak: number; streakResult: { newStreak: number; prevStreak: number } }> {
  if (daily === null || daily === undefined) {
    const yesterdayRow = await db.getFirstAsync<{ streak_count: number }>(
      `SELECT streak_count FROM daily_summary WHERE user_id = ? AND local_date = ?`,
      [userId, yesterdayDate]
    );
    const prevStreak = yesterdayRow?.streak_count ?? 0;
    const todayStreak = prevStreak + 1;
    return { todayStreak, streakResult: { newStreak: todayStreak, prevStreak } };
  }
  return { todayStreak: 1, streakResult: { newStreak: daily.streak_count, prevStreak: daily.streak_count } };
}

type ActivityLogInsert = {
  user_id: number; task_type_id: number | null; kind: string;
  duration_min: number | null; points_earned: number; stars_delta: number;
  source: string; logged_at: number; local_date: string; week_start: string;
};

async function insertLogRows(
  db: SQLiteDatabase,
  activityRow: ActivityLogInsert,
  bonusRow: ActivityLogInsert | null,
): Promise<void> {
  const sql = `INSERT INTO activity_log
    (user_id, task_type_id, kind, duration_min, points_earned, stars_delta, source, logged_at, local_date, week_start)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  await db.runAsync(sql, [
    activityRow.user_id, activityRow.task_type_id, activityRow.kind,
    activityRow.duration_min, activityRow.points_earned, activityRow.stars_delta,
    activityRow.source, activityRow.logged_at, activityRow.local_date, activityRow.week_start,
  ]);
  if (bonusRow) {
    await db.runAsync(sql, [
      bonusRow.user_id, bonusRow.task_type_id, bonusRow.kind, bonusRow.duration_min,
      bonusRow.points_earned, bonusRow.stars_delta, bonusRow.source,
      bonusRow.logged_at, bonusRow.local_date, bonusRow.week_start,
    ]);
  }
}

async function handleTierUnlocks(
  db: SQLiteDatabase,
  tiers: FullTierRow[],
  newUnlocks: ReturnType<typeof computeTierUnlocks>,
): Promise<{ didRankUp: boolean; newTier: { tier_order: number; rank_name: string } | null }> {
  if (newUnlocks.length === 0) return { didRankUp: false, newTier: null };
  const firstUnlock = newUnlocks[0];
  const matched = tiers.find(t => t.id === firstUnlock.tier_id);
  const newTier = matched ? { tier_order: matched.tier_order, rank_name: matched.rank_name } : null;
  for (const unlock of newUnlocks) {
    await db.runAsync(
      `INSERT OR IGNORE INTO reward_unlocks
       (user_id, tier_id, week_start, stars_at_unlock, reward_amount, claimed)
       VALUES (?, ?, ?, ?, ?, 0)`,
      [unlock.user_id, unlock.tier_id, unlock.week_start, unlock.stars_at_unlock, unlock.reward_amount]
    );
  }
  return { didRankUp: true, newTier };
}

async function updateTreatPool(
  db: SQLiteDatabase, userId: number, kind: string, totalStarsDelta: number, nowMs: number,
): Promise<void> {
  if (kind === 'GOOD') {
    await db.runAsync(
      `UPDATE users SET treat_stars = treat_stars + ?, treat_stars_lifetime = treat_stars_lifetime + ? WHERE id = ?`,
      [totalStarsDelta, totalStarsDelta, userId]
    );
  } else {
    await db.runAsync(
      `UPDATE users SET treat_stars = MAX(0, treat_stars - ?) WHERE id = ? AND penalty_hits_treats = 1`,
      [Math.abs(totalStarsDelta), userId]
    );
  }
  await db.runAsync(
    `UPDATE treats SET reached_at = ?
     WHERE user_id = ? AND status = 'ACTIVE' AND reached_at IS NULL
       AND target_stars <= (SELECT treat_stars FROM users WHERE id = ?)`,
    [new Date(nowMs).toISOString(), userId, userId]
  );
}

async function revertDailySummaryUnlog(
  db: SQLiteDatabase, userId: number, today: string,
  taskPoints: number, bonusStars: number, remainingPoints: number,
): Promise<void> {
  if (remainingPoints <= 0) {
    await db.runAsync(`DELETE FROM daily_summary WHERE user_id = ? AND local_date = ?`, [userId, today]);
  } else {
    await db.runAsync(
      `UPDATE daily_summary SET
         total_points = MAX(0, total_points - ?),
         bonus_star_awarded = CASE WHEN ? THEN 0 ELSE bonus_star_awarded END
       WHERE user_id = ? AND local_date = ?`,
      [taskPoints, bonusStars > 0 ? 1 : 0, userId, today]
    );
  }
}

async function revertTreatStarsUnlog(
  db: SQLiteDatabase, userId: number, kind: string, totalStarsDelta: number, taskStars: number,
): Promise<void> {
  if (kind === 'GOOD') {
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

export const PENDING_LEVELUP_KEY = 'pending_levelup_celebration';

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

type SuggestedTask = {
  id: number;
  name: string;
  kind: string;
  is_time_based: number;
  base_points: number;
  star_penalty: number;
  icon: string | null;
};

export function useConsecutiveSuggestions(userId: number) {
  const today = getLocalDate();
  const yesterday = (() => {
    const d = new Date(); d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();
  const dayBefore = (() => {
    const d = new Date(); d.setDate(d.getDate() - 2);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();
  return useQuery({
    queryKey: ['today', 'suggestions', userId, today],
    queryFn: async () => {
      const db = await getDb();
      return db.getAllAsync<SuggestedTask>(
        `SELECT tt.id, tt.name, tt.kind, tt.is_time_based, tt.base_points, tt.star_penalty, tt.icon
         FROM task_types tt
         WHERE tt.user_id = ? AND tt.archived = 0
           AND EXISTS (
             SELECT 1 FROM activity_log WHERE user_id = ? AND task_type_id = tt.id
               AND local_date = ? AND source = 'TASK'
           )
           AND EXISTS (
             SELECT 1 FROM activity_log WHERE user_id = ? AND task_type_id = tt.id
               AND local_date = ? AND source = 'TASK'
           )
           AND NOT EXISTS (
             SELECT 1 FROM activity_log WHERE user_id = ? AND task_type_id = tt.id
               AND local_date = ?
           )`,
        [userId, userId, yesterday, userId, dayBefore, userId, today]
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
    }): Promise<{ newStreak: number; prevStreak: number; didRankUp: boolean; newTier: { tier_order: number; rank_name: string } | null }> => {
      const db = await getDb();
      const today = getLocalDate();
      const weekStart = getWeekStart();
      const now = new Date();
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayDate = getLocalDateFor(yesterday);
      const nowMs = now.getTime();

      // tiers is a static lookup — never written, safe to read outside transaction
      const tiers = await db.getAllAsync<FullTierRow>(
        `SELECT id, tier_order, rank_name, stars_required, reward_amount, reward_currency
         FROM tiers ORDER BY stars_required ASC`
      );

      let streakResult = { newStreak: 1, prevStreak: 0 };
      let didRankUp = false;
      let newTier: { tier_order: number; rank_name: string } | null = null;

      // All volatile reads + computation + writes inside one transaction.
      // This prevents TOCTOU: two concurrent mutateAsync calls can no longer
      // read the same stale daily/weekly rows before either commits.
      // fallow-ignore-next-line complexity
      await db.withTransactionAsync(async () => {
        const daily = await db.getFirstAsync<DailySummaryRow>(
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

        const { todayStreak, streakResult: sr } = await computeTodayStreak(db, userId, today, yesterdayDate, daily);
        streakResult = sr;

        const { activityRow, bonusRow } = computeLogTaskRows({
          userId, taskTypeId: params.taskTypeId, kind: params.kind,
          isTimeBased: params.isTimeBased, basePoints: params.basePoints,
          starPenalty: params.starPenalty, durationMin: params.durationMin,
          currentDayPoints: daily?.total_points ?? 0,
          bonusAlreadyAwarded: !!daily?.bonus_star_awarded,
          loggedAt: now, localDate: today, weekStart,
        });

        const totalStarsDelta = activityRow.stars_delta + (bonusRow?.stars_delta ?? 0);
        const oldStars = weeklyRow?.weekly_stars ?? 0;
        const newUnlocks = computeTierUnlocks({
          userId, weekStart, oldStars, newStars: oldStars + totalStarsDelta,
          tiers, alreadyUnlockedTierIds: alreadyUnlocked.map(r => r.tier_id),
        });

        await insertLogRows(db, activityRow, bonusRow);

        await db.runAsync(
          `INSERT INTO daily_summary (user_id, local_date, total_points, bonus_star_awarded, streak_count)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(user_id, local_date) DO UPDATE SET
             total_points = total_points + ?,
             bonus_star_awarded = CASE WHEN ? THEN 1 ELSE bonus_star_awarded END`,
          [userId, today, (daily?.total_points ?? 0) + activityRow.points_earned,
           bonusRow ? 1 : 0, todayStreak, activityRow.points_earned, bonusRow ? 1 : 0]
        );

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

        const unlockResult = await handleTierUnlocks(db, tiers, newUnlocks);
        didRankUp = unlockResult.didRankUp;
        newTier = unlockResult.newTier;

        await updateTreatPool(db, userId, params.kind, totalStarsDelta, nowMs);
      });

      return { ...streakResult, didRankUp, newTier };
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['today'] });
      qc.invalidateQueries({ queryKey: ['week'] });
      qc.invalidateQueries({ queryKey: ['treats'] });
      qc.invalidateQueries({ queryKey: ['progress'] });
      qc.invalidateQueries({ queryKey: ['rank'] });
      if (data.didRankUp) rankMascotBridge.ref?.current?.playRankUp();
      if (data.didRankUp && data.newTier) {
        const weekStart = getWeekStart();
        AsyncStorage.setItem(PENDING_LEVELUP_KEY, JSON.stringify({
          tierOrder: data.newTier.tier_order,
          tierName: data.newTier.rank_name,
          weekStart,
        })).catch(() => {});
      }
      // Fire-and-forget streak sync — non-fatal if Supabase absent or table not migrated
      getStoredGoogleUserEmail()
        .then(email => { if (email) return syncUserStreak(email, data.newStreak); })
        .catch(() => {});
    },
  });
}

export function useTodayTaskTotalDurations(userId: number) {
  const today = getLocalDate();
  return useQuery({
    queryKey: ['today', 'durations', userId, today],
    queryFn: async () => {
      const db = await getDb();
      const rows = await db.getAllAsync<{ task_type_id: number; total_min: number }>(
        `SELECT task_type_id, SUM(duration_min) AS total_min
         FROM activity_log
         WHERE user_id = ? AND local_date = ? AND task_type_id IS NOT NULL AND source = 'TASK'
         GROUP BY task_type_id`,
        [userId, today]
      );
      return new Map(rows.map(r => [r.task_type_id, r.total_min ?? 0]));
    },
  });
}

export function useUnlogTask(userId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { taskTypeId: number; kind: 'GOOD' | 'BAD' }) => {
      const db = await getDb();
      const today = getLocalDate();
      const weekStart = getWeekStart();

      // fallow-ignore-next-line complexity
      await db.withTransactionAsync(async () => {
        const taskRows = await db.getAllAsync<{ id: number; points_earned: number; stars_delta: number }>(
          `SELECT id, points_earned, stars_delta FROM activity_log
           WHERE user_id = ? AND local_date = ? AND task_type_id = ? AND source = 'TASK'`,
          [userId, today, params.taskTypeId]
        );
        if (taskRows.length === 0) return;

        const taskPoints = taskRows.reduce((s, r) => s + r.points_earned, 0);
        const taskStars = taskRows.reduce((s, r) => s + r.stars_delta, 0);

        const daily = await db.getFirstAsync<{ total_points: number; bonus_star_awarded: number }>(
          `SELECT total_points, bonus_star_awarded FROM daily_summary WHERE user_id = ? AND local_date = ?`,
          [userId, today]
        );
        const weeklyRow = await db.getFirstAsync<{ weekly_stars: number }>(
          `SELECT weekly_stars FROM weekly_summary WHERE user_id = ? AND week_start = ?`,
          [userId, weekStart]
        );

        const remainingPoints = (daily?.total_points ?? 0) - taskPoints;
        let bonusStars = 0;
        if (remainingPoints < DAILY_BONUS_THRESHOLD) {
          const bonusRow = await db.getFirstAsync<{ id: number }>(
            `SELECT id FROM activity_log WHERE user_id = ? AND local_date = ? AND source = 'DAILY_BONUS' LIMIT 1`,
            [userId, today]
          );
          if (bonusRow) {
            bonusStars = DAILY_BONUS_STARS;
            await db.runAsync(
              `DELETE FROM activity_log WHERE user_id = ? AND local_date = ? AND source = 'DAILY_BONUS'`,
              [userId, today]
            );
          }
        }

        const totalStarsDelta = taskStars + bonusStars;
        const newWeeklyStars = Math.max(0, (weeklyRow?.weekly_stars ?? 0) - totalStarsDelta);

        for (const row of taskRows) {
          await db.runAsync(`DELETE FROM activity_log WHERE id = ?`, [row.id]);
        }

        await revertDailySummaryUnlog(db, userId, today, taskPoints, bonusStars, remainingPoints);

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

        await revertTreatStarsUnlog(db, userId, params.kind, totalStarsDelta, taskStars);
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
