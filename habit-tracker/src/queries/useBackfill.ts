import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getDb } from '../db/client';
import { canBackfill, computeBackfillSession, computeStreakCounts, type BackfillSessionEntry } from '../game/backfill';
import { getLocalDate, getLocalDateFor, getWeekStart, getWeekStartFor } from '../utils/formatters';
import type { SQLiteDatabase } from 'expo-sqlite';
import { crossedStreakMilestone, type StreakMilestone } from '../game/streakMilestones';
import { boostEndOfDayMs } from '../game/boost';
import { syncCurrentUserToSupabase } from '../api/syncService';
import { applyLifetimeStarsDelta } from '../game/lifetimeRankWrites';
import type { LifetimeTierCrossing, LifetimeTierRow } from '../game/lifetimeRank';
import { enqueuePendingLevelUps } from '../game/pendingLevelUpQueue';
import { rankMascotBridge } from '../lib/rankMascotBridge';
import { cancelTerminalChallengeReminders, logActiveChallengeDay, syncActiveChallengeReminders } from './useChallenge';
import { useLanguage } from '../hooks/useSettings';
import { createActivityKey } from '../lib/activityIdentity';

export type BackfillEntryParams = BackfillSessionEntry;

type BackfillDayParams = {
  date: string;              // 'YYYY-MM-DD' — the missed day to backfill
  entries: BackfillEntryParams[];
};

/** Generate all YYYY-MM-DD dates from `from` to `to` inclusive. */
function dateRange(from: string, to: string): string[] {
  const dates: string[] = [];
  const cur = new Date(from + 'T12:00:00');
  const end = new Date(to + 'T12:00:00');
  while (cur <= end) {
    dates.push(getLocalDateFor(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

/** Subtract one day from a YYYY-MM-DD string. */
function prevDay(date: string): string {
  const d = new Date(date + 'T12:00:00');
  d.setDate(d.getDate() - 1);
  return getLocalDateFor(d);
}

async function recomputeStreakChain(
  db: SQLiteDatabase,
  userId: number,
  fromDate: string,
  toDate: string,
): Promise<number> {
  const prior = await db.getFirstAsync<{ streak_count: number }>(
    `SELECT streak_count FROM daily_summary WHERE user_id = ? AND local_date = ?`,
    [userId, prevDay(fromDate)],
  );
  const priorStreak = prior?.streak_count ?? 0;

  const range = dateRange(fromDate, toDate);

  const rows = await db.getAllAsync<{ local_date: string; total_points: number }>(
    `SELECT local_date, total_points FROM daily_summary
     WHERE user_id = ? AND local_date >= ? AND local_date <= ?`,
    [userId, fromDate, toDate],
  );
  const pointsByDate = new Map(rows.map(r => [r.local_date, r.total_points]));

  const daysActive = range.map(d => (pointsByDate.get(d) ?? 0) > 0);
  const streakCounts = computeStreakCounts(daysActive, priorStreak);

  for (let i = 0; i < range.length; i++) {
    const d = range[i];
    if (pointsByDate.has(d)) {
      await db.runAsync(
        `UPDATE daily_summary SET streak_count = ? WHERE user_id = ? AND local_date = ?`,
        [streakCounts[i], userId, d],
      );
    }
  }

  return streakCounts[streakCounts.length - 1] ?? 0;
}

interface ActivityLogInsert {
  user_id: number; task_type_id: number | null; kind: string;
  duration_min: number | null | undefined; points_earned: number;
  stars_delta: number; source: string; activity_key?: string;
}

async function insertActivityRows(
  db: SQLiteDatabase, activityRow: ActivityLogInsert,
  bonusRow: ActivityLogInsert | null | undefined,
  nowMs: number, backfillDate: string, backfillWeekStart: string,
): Promise<void> {
  const sql = `INSERT INTO activity_log
    (user_id, task_type_id, kind, duration_min, points_earned, stars_delta,
     source, logged_at, local_date, week_start, activity_key, is_backfill)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`;
  const args = (r: ActivityLogInsert) => [
    r.user_id, r.task_type_id, r.kind, r.duration_min ?? null,
    r.points_earned, r.stars_delta, r.source, nowMs, backfillDate, backfillWeekStart,
    r.activity_key ?? createActivityKey(),
  ];
  await db.runAsync(sql, args(activityRow));
  if (bonusRow) await db.runAsync(sql, args(bonusRow));
}

/**
 * Runs the complete backfill write inside the caller-owned exclusive
 * transaction. Exported so the transaction seam can be regression-tested
 * without mounting React Query hooks.
 */
export async function runBackfillTx(
  db: SQLiteDatabase, entries: BackfillEntryParams[],
  userId: number, backfillDate: string,
  backfillWeekStart: string, currentWeekStart: string, today: string,
): Promise<{ newStreak: number; milestone: StreakMilestone | null; lifetimeCrossings: LifetimeTierCrossing[] }> {
  const now = new Date();
  const nowMs = now.getTime();
  const previousBest = await db.getFirstAsync<{ best: number }>(
    `SELECT COALESCE(MAX(streak_count), 0) AS best FROM daily_summary WHERE user_id = ?`,
    [userId],
  );

  const quotaRow = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(DISTINCT local_date) AS n FROM activity_log WHERE user_id = ? AND week_start = ? AND is_backfill = 1`,
    [userId, currentWeekStart],
  );
  const backfillsUsedThisWeek = quotaRow ? quotaRow.n : 0;

  const existingRow = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM daily_summary WHERE user_id = ? AND local_date = ? AND total_points > 0`,
    [userId, backfillDate],
  );
  const dayHasActivity = existingRow ? existingRow.n > 0 : false;

  const freezeRow = await db.getFirstAsync<{ id: number }>(
    `SELECT id FROM streak_freezes WHERE user_id = ? AND local_date = ?`,
    [userId, backfillDate],
  );
  const txCheck = canBackfill({
    date: backfillDate, today, weekStartOfDate: backfillWeekStart,
    currentWeekStart, dayHasActivity,
    backfillsUsedThisWeek, hasStreakFreeze: !!freezeRow,
  });
  if (!txCheck.allowed) throw new Error(txCheck.reason);

  const existingDaily = await db.getFirstAsync<{ total_points: number; bonus_star_awarded: number }>(
    `SELECT total_points, bonus_star_awarded FROM daily_summary WHERE user_id = ? AND local_date = ?`,
    [userId, backfillDate],
  );

  const session = computeBackfillSession(entries, {
    userId,
    loggedAt: now,
    localDate: backfillDate,
    weekStart: backfillWeekStart,
    initialDayPoints: existingDaily ? existingDaily.total_points : 0,
    initialBonusStars: existingDaily?.bonus_star_awarded ?? 0,
  });

  for (const { activityRow, bonusRow } of session.rows) {
    await insertActivityRows(db, activityRow, bonusRow, nowMs, backfillDate, backfillWeekStart);
  }

  await db.runAsync(
    `INSERT INTO daily_summary (user_id, local_date, total_points, bonus_star_awarded, streak_count)
     VALUES (?, ?, ?, ?, 0)
     ON CONFLICT(user_id, local_date) DO UPDATE SET
       total_points = total_points + ?,
       bonus_star_awarded = excluded.bonus_star_awarded`,
    [userId, backfillDate, session.dayPoints, session.bonusStars, session.sessionPointsDelta],
  );

  const newStreak = await recomputeStreakChain(db, userId, backfillDate, today);
  const currentBest = await db.getFirstAsync<{ best: number }>(
    `SELECT COALESCE(MAX(streak_count), 0) AS best FROM daily_summary WHERE user_id = ?`,
    [userId],
  );
  const milestone = crossedStreakMilestone(previousBest?.best ?? 0, currentBest?.best ?? 0);
  if (milestone) {
    await db.runAsync(
      `INSERT OR IGNORE INTO boost_events
       (user_id, local_date, multiplier, claim_deadline, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, today, milestone.multiplier, boostEndOfDayMs(nowMs), nowMs],
    );
  }

  let lifetimeCrossings: LifetimeTierCrossing[] = [];
  if (session.rankPointsDelta !== 0 || session.rankStarsDelta !== 0) {
    await db.runAsync(
      `INSERT INTO weekly_summary (user_id, week_start, total_points, weekly_stars)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, week_start) DO UPDATE SET
         total_points = total_points + ?,
         weekly_stars = weekly_stars + ?`,
      [userId, currentWeekStart, session.rankPointsDelta, session.rankStarsDelta,
       session.rankPointsDelta, session.rankStarsDelta],
    );

    if (session.rankStarsDelta !== 0) {
      const tiers = await db.getAllAsync<LifetimeTierRow>(
        `SELECT id, tier_order, rank_name, stars_required FROM tiers ORDER BY stars_required ASC`
      );
      lifetimeCrossings = (await applyLifetimeStarsDelta(db, userId, session.rankStarsDelta, tiers)).crossings;
    }
  }

  // Backfill inserts the task rows before syncing the linked Challenge so its
  // query-time activity source sees the complete session. Deduplicate task
  // ids: a session may contain several entries for one task, but one
  // Challenge reconciliation is enough and avoids repeated completion work.
  const taskTypeIds = new Set(
    session.rows
      .map(row => row.activityRow.task_type_id)
      .filter((taskTypeId): taskTypeId is number => taskTypeId != null),
  );
  for (const taskTypeId of taskTypeIds) {
    const challengeResult = await logActiveChallengeDay(db, {
      userId,
      localDate: backfillDate,
      taskTypeId,
    });
    lifetimeCrossings.push(...challengeResult.lifetimeCrossings);
  }

  return { newStreak, milestone, lifetimeCrossings };
}

export function useBackfillDay(userId: number) {
  const qc = useQueryClient();
  const [lang] = useLanguage();

  return useMutation({
    mutationFn: async (params: BackfillDayParams): Promise<{ newStreak: number; milestone: StreakMilestone | null; lifetimeCrossings: LifetimeTierCrossing[] }> => {
      const db = await getDb();
      const today = getLocalDate();
      const currentWeekStart = getWeekStart();
      const backfillDate = params.date;
      const backfillWeekStart = getWeekStartFor(new Date(backfillDate + 'T12:00:00'));

      // Derive date-only guards before the transaction (no DB reads needed).
      const check = canBackfill({
        date: backfillDate,
        today,
        weekStartOfDate: backfillWeekStart,
        currentWeekStart,
        dayHasActivity: false,      // re-verified inside the transaction
        backfillsUsedThisWeek: 0,   // re-verified inside the transaction
        hasStreakFreeze: false,      // re-verified inside the transaction
      });
      // Fail fast on pure date guards (FUTURE / TODAY / NOT_CURRENT_WEEK) before
      // opening a transaction. DB-state guards are re-checked atomically below.
      if (!check.allowed && (check.reason === 'FUTURE' || check.reason === 'TODAY' || check.reason === 'NOT_CURRENT_WEEK')) {
        throw new Error(check.reason);
      }
      if (params.entries.length === 0) throw new Error('EMPTY_SESSION');

      let newStreak = 0;
      let milestone: StreakMilestone | null = null;
      let lifetimeCrossings: LifetimeTierCrossing[] = [];
      await db.withExclusiveTransactionAsync(async (txn) => {
        const result = await runBackfillTx(
          txn, params.entries, userId, backfillDate, backfillWeekStart, currentWeekStart, today,
        );
        newStreak = result.newStreak;
        milestone = result.milestone;
        lifetimeCrossings = result.lifetimeCrossings;
      });
      // The SQLite transaction has committed at this point. Notification
      // cleanup is best-effort and must not turn a successful backfill into a
      // rejected mutation that skips cache invalidation and cloud sync.
      try {
        await cancelTerminalChallengeReminders(db, userId);
      } catch (error) {
        if (__DEV__) console.warn('[notifications] terminal Challenge cleanup failed:', error);
      }
      try {
        await syncActiveChallengeReminders(userId, lang);
      } catch (error) {
        if (__DEV__) console.warn('[notifications] active Challenge reminder sync failed:', error);
      }
      return { newStreak, milestone, lifetimeCrossings };
    },

    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['today'] });
      qc.invalidateQueries({ queryKey: ['week'] });
      qc.invalidateQueries({ queryKey: ['progress'] });
      qc.invalidateQueries({ queryKey: ['calendar'] });
      qc.invalidateQueries({ queryKey: ['backfill'] });
      qc.invalidateQueries({ queryKey: ['challenge'] });
      qc.invalidateQueries({ queryKey: ['treats'] });
      qc.invalidateQueries({ queryKey: ['achievements'] });
      qc.invalidateQueries({ queryKey: ['rank'] });
      void syncCurrentUserToSupabase()
        .catch(error => { if (__DEV__) console.warn('[sync] activity log sync failed:', error); })
        .finally(() => {
          qc.invalidateQueries({ queryKey: ['rank'] });
          qc.invalidateQueries({ queryKey: ['leaderboard'] });
        });
      if (data.lifetimeCrossings.length > 0) {
        rankMascotBridge.ref?.current?.playRankUp();
        rankMascotBridge.onRankUp?.(data.lifetimeCrossings);
        enqueuePendingLevelUps(data.lifetimeCrossings).catch(() => {});
      }
    },

    onError: (_err) => {
      // caller checks err.message for BackfillDenyReason (e.g. 'QUOTA_EXCEEDED')
    },
  });
}
