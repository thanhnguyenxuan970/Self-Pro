import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { SQLiteDatabase } from 'expo-sqlite';
import { getDb } from '../db/client';
import { getStoredGoogleUser } from '../hooks/useAuth';
import { syncCurrentUserToSupabase, syncUserStreak } from '../api/syncService';
import { cancelTerminalChallengeReminders, logActiveChallengeDay } from './useChallenge';
import { computeLogTaskRows } from '../game/logTask';
import { getLocalDate, getLocalDateFor, getWeekStart } from '../utils/formatters';
import { dailyBonusStarsForPoints } from '../config/constants';
import { crossedStreakMilestone, type StreakMilestone } from '../game/streakMilestones';
import {
  boostEndOfDayMs,
  isBoostActiveAt,
  summarizeBoostLogs,
  type BoostEventRow,
  type BoostLogRow,
  type BoostSummary,
} from '../game/boost';
import { applyLifetimeStarsDelta } from '../game/lifetimeRankWrites';
import type { LifetimeTierCrossing, LifetimeTierRow } from '../game/lifetimeRank';
import { enqueuePendingLevelUps } from '../game/pendingLevelUpQueue';
import { rankMascotBridge } from '../lib/rankMascotBridge';

type FullTierRow = LifetimeTierRow;

type DailySummaryRow = { total_points: number; bonus_star_awarded: number; streak_count: number };
export type TodayBoost = BoostEventRow & { id: number; local_date: string };

const EMPTY_BOOST_SUMMARY: BoostSummary = {
  boostStars: 0,
  boostLogs: 0,
  baseStars: 0,
  bonusStars: 0,
  totalStars: 0,
};

export function useTodayBoost(userId: number) {
  const today = getLocalDate();
  return useQuery({
    queryKey: ['today', 'boost', userId, today],
    queryFn: async () => {
      const db = await getDb();
      return db.getFirstAsync<TodayBoost>(
        `SELECT id, local_date, multiplier, claim_deadline, claimed_at, expires_at, dismissed_at
         FROM boost_events WHERE user_id = ? AND local_date = ? LIMIT 1`,
        [userId, today],
      );
    },
  });
}

export function useTodayBoostSummary(userId: number, event: TodayBoost | null | undefined) {
  const claimedAt = event?.claimed_at ?? null;
  const expiresAt = event?.expires_at ?? null;
  return useQuery({
    queryKey: ['today', 'boost-summary', userId, event?.id ?? null, claimedAt, expiresAt],
    enabled: claimedAt !== null && expiresAt !== null,
    queryFn: async (): Promise<BoostSummary> => {
      if (claimedAt === null || expiresAt === null || !event) return EMPTY_BOOST_SUMMARY;
      const db = await getDb();
      const logs = await db.getAllAsync<BoostLogRow>(
        `SELECT source, kind, stars_delta
         FROM activity_log
         WHERE user_id = ? AND local_date = ? AND logged_at >= ? AND logged_at < ?
           AND source = 'TASK' AND kind = 'GOOD'`,
        [userId, event.local_date, claimedAt, expiresAt],
      );
      return summarizeBoostLogs(logs);
    },
  });
}

export function useTodayBoostedTaskIds(userId: number, event: TodayBoost | null | undefined) {
  const claimedAt = event?.claimed_at ?? null;
  const expiresAt = event?.expires_at ?? null;
  return useQuery({
    queryKey: ['today', 'boosted-task-ids', userId, event?.id ?? null, claimedAt, expiresAt],
    enabled: claimedAt !== null && expiresAt !== null,
    queryFn: async () => {
      if (claimedAt === null || expiresAt === null || !event) return new Set<number>();
      const db = await getDb();
      const rows = await db.getAllAsync<{ task_type_id: number }>(
        `SELECT DISTINCT task_type_id
         FROM activity_log
         WHERE user_id = ? AND local_date = ? AND logged_at >= ? AND logged_at < ?
           AND task_type_id IS NOT NULL AND source = 'TASK' AND kind = 'GOOD'`,
        [userId, event.local_date, claimedAt, expiresAt],
      );
      return new Set(rows.map(row => row.task_type_id));
    },
  });
}

export function useActivateTodayBoost(userId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<boolean> => {
      const db = await getDb();
      const nowMs = Date.now();
      const result = await db.runAsync(
        `UPDATE boost_events
         SET claimed_at = ?, expires_at = ?
         WHERE user_id = ? AND local_date = ?
           AND claimed_at IS NULL AND dismissed_at IS NULL AND claim_deadline > ?`,
        [nowMs, boostEndOfDayMs(nowMs), userId, getLocalDate(), nowMs],
      );
      return result.changes > 0;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['today', 'boost', userId] }),
  });
}

export function useDismissTodayBoost(userId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<boolean> => {
      const db = await getDb();
      const nowMs = Date.now();
      const result = await db.runAsync(
        `UPDATE boost_events SET dismissed_at = ?
         WHERE user_id = ? AND local_date = ? AND claimed_at IS NOT NULL
           AND expires_at IS NOT NULL AND expires_at <= ? AND dismissed_at IS NULL`,
        [nowMs, userId, getLocalDate(), nowMs],
      );
      return result.changes > 0;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['today'] }),
  });
}

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

async function replaceDailyBonusRows(
  db: SQLiteDatabase, userId: number, localDate: string, weekStart: string, stars: number,
): Promise<void> {
  await db.runAsync(
    `DELETE FROM activity_log WHERE user_id = ? AND local_date = ? AND source = 'DAILY_BONUS'`,
    [userId, localDate],
  );
  if (stars > 0) {
    await db.runAsync(
      `INSERT INTO activity_log
       (user_id, task_type_id, kind, duration_min, points_earned, stars_delta, source, logged_at, local_date, week_start)
       VALUES (?, NULL, 'DAILY_BONUS', NULL, 0, ?, 'DAILY_BONUS', ?, ?, ?)`,
      [userId, stars, Date.now(), localDate, weekStart],
    );
  }
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
  taskPoints: number, remainingBonusStars: number, remainingPoints: number,
): Promise<void> {
  if (remainingPoints <= 0) {
    await db.runAsync(`DELETE FROM daily_summary WHERE user_id = ? AND local_date = ?`, [userId, today]);
  } else {
    await db.runAsync(
      `UPDATE daily_summary SET
         total_points = MAX(0, total_points - ?),
         bonus_star_awarded = ?
       WHERE user_id = ? AND local_date = ?`,
      [taskPoints, remainingBonusStars, userId, today]
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

export function useTodayTasks(userId: number) {
  return useQuery({
    queryKey: ['today', 'tasks', userId],
    queryFn: async () => {
      const db = await getDb();
      return db.getAllAsync<{
        id: number; name: string; kind: string; is_time_based: number;
        base_points: number; star_penalty: number; icon: string | null;
        category_id: number | null; sort_order: number; is_template: number;
      }>(
        `SELECT id, name, kind, is_time_based, base_points, star_penalty, icon, category_id, sort_order, is_template
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
      return db.getFirstAsync<{ weekly_stars: number }>(
        `SELECT weekly_stars
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
    }): Promise<{ newStreak: number; prevStreak: number; milestone: StreakMilestone | null; lifetimeCrossings: LifetimeTierCrossing[] }> => {
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
        `SELECT id, tier_order, rank_name, stars_required
         FROM tiers ORDER BY stars_required ASC`
      );

      let streakResult = { newStreak: 1, prevStreak: 0 };
      let milestone: StreakMilestone | null = null;
      let lifetimeCrossings: LifetimeTierCrossing[] = [];

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
        const best = await db.getFirstAsync<{ best: number }>(
          `SELECT COALESCE(MAX(streak_count), 0) AS best FROM daily_summary WHERE user_id = ?`,
          [userId],
        );
        const weeklyRow = await db.getFirstAsync<{ weekly_stars: number }>(
          `SELECT weekly_stars FROM weekly_summary WHERE user_id = ? AND week_start = ?`,
          [userId, weekStart]
        );
        const weeklyStars = weeklyRow?.weekly_stars ?? 0;

        const { todayStreak, streakResult: sr } = await computeTodayStreak(db, userId, today, yesterdayDate, daily);
        streakResult = sr;
        milestone = crossedStreakMilestone(best?.best ?? 0, Math.max(best?.best ?? 0, sr.newStreak));
        const availabilityDeadline = boostEndOfDayMs(nowMs);
        if (milestone) {
          await db.runAsync(
            `INSERT OR IGNORE INTO boost_events
             (user_id, local_date, multiplier, claim_deadline, created_at)
             VALUES (?, ?, ?, ?, ?)`,
            [userId, today, milestone.multiplier, availabilityDeadline, nowMs],
          );
        }

        const boost = await db.getFirstAsync<BoostEventRow>(
          `SELECT multiplier, claim_deadline, claimed_at, expires_at, dismissed_at
           FROM boost_events WHERE user_id = ? AND local_date = ? LIMIT 1`,
          [userId, today],
        );
        const multiplier = boost && isBoostActiveAt(nowMs, boost) ? boost.multiplier : undefined;

        const { activityRow, bonusRow } = computeLogTaskRows({
          userId, taskTypeId: params.taskTypeId, kind: params.kind,
          isTimeBased: params.isTimeBased, basePoints: params.basePoints,
          starPenalty: params.starPenalty, durationMin: params.durationMin,
          currentDayPoints: daily?.total_points ?? 0,
          bonusStarsAwarded: daily?.bonus_star_awarded ?? 0,
          multiplier,
          loggedAt: now, localDate: today, weekStart,
        });

        const totalStarsDelta = activityRow.stars_delta + (bonusRow?.stars_delta ?? 0);
        await insertLogRows(db, activityRow, bonusRow);

        await db.runAsync(
          `INSERT INTO daily_summary (user_id, local_date, total_points, bonus_star_awarded, streak_count)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(user_id, local_date) DO UPDATE SET
             total_points = total_points + ?,
             bonus_star_awarded = bonus_star_awarded + ?`,
          [userId, today, (daily?.total_points ?? 0) + activityRow.points_earned,
           bonusRow?.stars_delta ?? 0, todayStreak, activityRow.points_earned, bonusRow?.stars_delta ?? 0]
        );

        await db.runAsync(
          `INSERT INTO weekly_summary (user_id, week_start, total_points, weekly_stars)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(user_id, week_start) DO UPDATE SET
             total_points = total_points + ?,
             weekly_stars = weekly_stars + ?`,
          [userId, weekStart, activityRow.points_earned, weeklyStars + totalStarsDelta,
           activityRow.points_earned, totalStarsDelta]
        );

        lifetimeCrossings = (await applyLifetimeStarsDelta(db, userId, totalStarsDelta, tiers)).crossings;

        await updateTreatPool(db, userId, params.kind, totalStarsDelta, nowMs);
        const challengeResult = await logActiveChallengeDay(db, {
          userId,
          localDate: today,
          taskTypeId: params.taskTypeId,
        });
        lifetimeCrossings = [...lifetimeCrossings, ...challengeResult.lifetimeCrossings];
      });
      await cancelTerminalChallengeReminders(db, userId);

      return { ...streakResult, milestone, lifetimeCrossings };
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['today'] });
      qc.invalidateQueries({ queryKey: ['week'] });
      qc.invalidateQueries({ queryKey: ['treats'] });
      qc.invalidateQueries({ queryKey: ['progress'] });
      qc.invalidateQueries({ queryKey: ['calendar'] });
      qc.invalidateQueries({ queryKey: ['rank'] });
      qc.invalidateQueries({ queryKey: ['challenge'] });
      qc.invalidateQueries({ queryKey: ['achievements'] });
      if (data.lifetimeCrossings.length > 0) {
        rankMascotBridge.ref?.current?.playRankUp();
        rankMascotBridge.onRankUp?.(data.lifetimeCrossings);
        enqueuePendingLevelUps(data.lifetimeCrossings).catch(() => {});
      }
      // Fire-and-forget streak sync — non-fatal if Supabase absent or table not migrated
      getStoredGoogleUser()
        .then(user => user && Promise.all([
          syncUserStreak(user.email, data.newStreak),
          syncCurrentUserToSupabase(),
        ]))
        .then(() => qc.invalidateQueries({ queryKey: ['leaderboard'] }))
        .catch(error => { if (__DEV__) console.warn('[sync] activity log sync failed:', error); });
    },
  });
}

export function useTodayTaskTotalDurations(userId: number) {
  const today = getLocalDate();
  return useQuery({
    queryKey: ['today', 'durations', userId, today],
    queryFn: async () => {
      const db = await getDb();
      const rows = await db.getAllAsync<{ task_type_id: number; total_min: number; total_stars: number; total_points: number }>(
        `SELECT task_type_id, SUM(duration_min) AS total_min, SUM(stars_delta) AS total_stars, SUM(points_earned) AS total_points
         FROM activity_log
         WHERE user_id = ? AND local_date = ? AND task_type_id IS NOT NULL AND source IN ('TASK', 'DAILY_BONUS')
         GROUP BY task_type_id`,
        [userId, today]
      );
      return new Map(rows.map(r => [r.task_type_id, { duration: r.total_min ?? 0, stars: r.total_stars ?? 0, points: r.total_points ?? 0 }]));
    },
  });
}

export function useUnlogTask(userId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { taskTypeId: number; kind: 'GOOD' | 'BAD' }): Promise<{ lifetimeCrossings: LifetimeTierCrossing[] }> => {
      const db = await getDb();
      const today = getLocalDate();
      const weekStart = getWeekStart();
      let lifetimeCrossings: LifetimeTierCrossing[] = [];

      // tiers is a static lookup — never written, safe to read outside transaction
      const tiers = await db.getAllAsync<FullTierRow>(
        `SELECT id, tier_order, rank_name, stars_required
         FROM tiers ORDER BY stars_required ASC`,
      );
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
        const remainingPoints = (daily?.total_points ?? 0) - taskPoints;
        const currentBonusStars = daily?.bonus_star_awarded ?? 0;
        const remainingBonusStars = dailyBonusStarsForPoints(remainingPoints);
        const bonusStars = Math.max(0, currentBonusStars - remainingBonusStars);
        if (bonusStars > 0) await replaceDailyBonusRows(db, userId, today, weekStart, remainingBonusStars);

        const totalStarsDelta = taskStars + bonusStars;
        // Batched into one query instead of one round-trip per row.
        const rowPlaceholders = taskRows.map(() => '?').join(',');
        await db.runAsync(`DELETE FROM activity_log WHERE id IN (${rowPlaceholders})`, taskRows.map(row => row.id));

        await revertDailySummaryUnlog(db, userId, today, taskPoints, remainingBonusStars, remainingPoints);

        await db.runAsync(
          `UPDATE weekly_summary SET
             total_points = MAX(0, total_points - ?),
             weekly_stars = MAX(0, weekly_stars - ?)
           WHERE user_id = ? AND week_start = ?`,
          [taskPoints, totalStarsDelta, userId, weekStart]
        );

        lifetimeCrossings = (await applyLifetimeStarsDelta(db, userId, -totalStarsDelta, tiers)).crossings;

        await revertTreatStarsUnlog(db, userId, params.kind, totalStarsDelta, taskStars);
      });

      return { lifetimeCrossings };
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['today'] });
      qc.invalidateQueries({ queryKey: ['week'] });
      qc.invalidateQueries({ queryKey: ['progress'] });
      qc.invalidateQueries({ queryKey: ['calendar'] });
      qc.invalidateQueries({ queryKey: ['rank'] });
      void syncCurrentUserToSupabase()
        .catch(error => { if (__DEV__) console.warn('[sync] activity delete sync failed:', error); })
        .finally(() => { qc.invalidateQueries({ queryKey: ['leaderboard'] }); });
      if (data.lifetimeCrossings.length > 0) {
        rankMascotBridge.ref?.current?.playRankUp();
        rankMascotBridge.onRankUp?.(data.lifetimeCrossings);
        enqueuePendingLevelUps(data.lifetimeCrossings).catch(() => {});
      }
    },
  });
}
