import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Sentry from '@sentry/react-native';
import { getDb } from '../db/client';
import { challengeDate, challengeStreak, computeRollover, currentDayIndex, computeProgress, isComplete, DayEntryState as ChallengeLogState, ChallengeStatus, ChallengeMode } from '../lib/challenge';
import {
  weekWindows, currentWeekWindow, weekSessionsDone, sessionsDoneThrough, computePace, computeWeeklyRollover,
  perfectWeekCount, isOverachieverWeek, type PaceState,
} from '../lib/challengeWeekly';
import { deriveLinkedDoneDates, clampThreshold, type ActivityLogRow } from '../lib/challengeLinked';
import type { SQLiteDatabase } from 'expo-sqlite';
import { PHAO_COUNT, computeChallengeReward } from '../config/challenges.config';
import type { LifetimeTierRow } from '../game/lifetimeRank';
import { applyLifetimeStarsDelta } from '../game/lifetimeRankWrites';
import type { LifetimeTierCrossing } from '../game/lifetimeRank';
import { enqueuePendingLevelUps } from '../game/pendingLevelUpQueue';
import { enqueuePendingActivityDeletes } from '../game/pendingActivityDeletes';
import { rankMascotBridge } from '../lib/rankMascotBridge';
import { getWeekStart } from '../utils/formatters';
import type { AppLanguage } from '../config/i18n';
import {
  cancelChallengeReminders,
  syncChallengeReminders as syncChallengeReminderQueue,
  type ChallengeReminderSyncResult,
} from '../utils/notifications';
import { challengeReminderPrefix, type ChallengeReminderState } from '../lib/challengeNotificationPlan';
import { syncCurrentUserToSupabase } from '../api/syncService';
import { useLanguage } from '../hooks/useSettings';

export interface ActiveChallenge {
  id: number;
  name: string;
  taskTypeId: number | null;
  targetDays: number;
  startDate: string;
  status: ChallengeStatus;
  freezesLeft: number;
  beforePhoto: string | null;
  afterPhoto: string | null;
  dayIndex: number;
  daysDone: number;
  streak: number;
  daysLeft: number;
  fraction: number;
  loggedToday: boolean;
  log: { date: string; state: ChallengeLogState }[];
  mode: ChallengeMode;
  weeklyTarget: number | null;
  totalWeeks: number | null;
  weekIndex: number | null;
  weekStart: string | null;
  weekEnd: string | null;
  weekSessionsDone: number | null;
  weekSessionsRequired: number | null;
  weekPaceState: PaceState | null;
  weekDaysRemaining: number | null;
  weekSessionsRemaining: number | null;
  perfectWeeks: number | null;
  overachieverThisWeek: boolean;
  minDuration: number | null;
  minCount: number | null;
  notificationsEnabled: boolean;
  notificationId: string | null;
}

interface ChallengeRow {
  id: number;
  name: string;
  task_type_id: number | null;
  target_days: number;
  start_date: string;
  status: ChallengeStatus;
  streak_current: number;
  freezes_left: number;
  before_photo: string | null;
  after_photo: string | null;
  mode: ChallengeMode;
  weekly_target: number | null;
  total_weeks: number | null;
  min_duration: number | null;
  min_count: number | null;
  notifications_enabled: number;
  notification_id: string | null;
}

interface ChallengeHistoryRow extends ChallengeRow {
  reset_day: number | null;
}

const CHALLENGE_COLUMNS = `id, name, task_type_id, target_days, start_date, status, streak_current, freezes_left, before_photo, after_photo, mode, weekly_target, total_weeks, min_duration, min_count, notifications_enabled, notification_id`;

type ChallengeDeleteRow = {
  status: ChallengeStatus;
  completed_at: string | null;
  notification_id: string | null;
};

type ChallengeRewardRow = {
  id: number;
  week_start: string;
  stars_delta: number;
  is_exact?: number;
  candidate_count?: number;
};

type ChallengeLogDb = Pick<SQLiteDatabase, 'getFirstAsync' | 'getAllAsync' | 'runAsync'>;

export async function cancelTerminalChallengeReminders(
  db: Pick<SQLiteDatabase, 'getAllAsync'>,
  userId: number,
): Promise<void> {
  const rows = await db.getAllAsync<{ id: number; notification_id: string | null }>(
    `SELECT id, notification_id FROM challenges
     WHERE user_id = ? AND status != 'active'`,
    [userId],
  );
  await cancelChallengeReminders([
    ...rows.map(row => row.notification_id),
    ...rows.map(row => challengeReminderPrefix(row.id)),
  ]);
}

/**
 * Query-time done-dates source for a challenge: linked challenges (task_type_id
 * set) derive completions from activity_log (the single source of truth);
 * rollover may persist freeze/reset outcome markers in challenge_log. Manual
 * challenges read the existing challenge_log 'done' rows.
 */
async function getDoneDates(
  db: ChallengeLogDb,
  userId: number,
  row: Pick<ChallengeRow, 'id' | 'task_type_id' | 'start_date' | 'min_duration' | 'min_count'>,
): Promise<string[]> {
  if (row.task_type_id != null) {
    const rows = await db.getAllAsync<{ local_date: string; duration_min: number | null }>(
      `SELECT local_date, duration_min FROM activity_log
       WHERE user_id = ? AND task_type_id = ? AND local_date >= ? AND is_clock_suspect = 0 AND source != 'CHALLENGE'
       ORDER BY local_date ASC`,
      [userId, row.task_type_id, row.start_date],
    );
    const mapped: ActivityLogRow[] = rows.map(r => ({ localDate: r.local_date, durationMin: r.duration_min }));
    return deriveLinkedDoneDates(mapped, { minDuration: row.min_duration, minCount: row.min_count }, row.start_date);
  }
  const logRows = await db.getAllAsync<{ local_date: string }>(
    `SELECT local_date FROM challenge_log WHERE challenge_id = ? AND state = 'done' ORDER BY local_date ASC`,
    [row.id],
  );
  return logRows.map(r => r.local_date);
}

type FullTierRow = LifetimeTierRow;

export type ReactivatedLinkedChallenge = {
  id: number;
  name: string;
  mode: 'streak';
  notificationsEnabled: boolean;
  reminderToken: string | null;
  previousNotificationId: string | null;
};

let reactivationReminderSequence = 0;

export async function restoreReactivatedChallengeReminders(
  db: Pick<SQLiteDatabase, 'runAsync'>,
  challenges: ReactivatedLinkedChallenge[],
): Promise<void> {
  // The committed transaction deliberately leaves a temporary token so a
  // concurrent completion cannot be mistaken for an already-synced row. Do
  // not schedule a legacy DAILY alarm here: the caller runs the central,
  // state-aware DATE reconciliation immediately after this cleanup.
  const previousIds = challenges
    .map(challenge => challenge.previousNotificationId)
    .filter((id): id is string => id != null);
  try {
    await cancelChallengeReminders(previousIds);
  } catch {}

  for (const challenge of challenges) {
    if (!challenge.notificationsEnabled || challenge.reminderToken == null) continue;
    await db.runAsync(
      "UPDATE challenges SET notification_id = NULL WHERE id = ? AND status = 'active' AND notification_id = ?",
      [challenge.id, challenge.reminderToken],
    );
  }
}

/**
 * A linked Challenge derives its checked days from activity_log. If its final
 * Daily activity is unchecked on the completion date, restore the Challenge
 * to active and reverse only the completion side effects that this Challenge
 * created. This runs in the same transaction as the Daily uncheck.
 */
export async function reconcileUnloggedLinkedChallenges(
  db: ChallengeLogDb,
  params: { userId: number; taskTypeId: number; localDate: string },
): Promise<{ lifetimeCrossings: LifetimeTierCrossing[]; reactivatedChallenges: ReactivatedLinkedChallenge[]; deletedActivityIds: number[] }> {
  const rows = await db.getAllAsync<ChallengeLogRow & { name: string; notifications_enabled: number; notification_id: string | null }>(
    `SELECT id, name, task_type_id, target_days, mode, weekly_target, total_weeks, start_date, min_duration, min_count, notifications_enabled, notification_id
     FROM challenges
     WHERE user_id = ? AND task_type_id = ? AND status = 'done' AND mode = 'streak' AND completed_at = ?
     ORDER BY id ASC`,
    [params.userId, params.taskTypeId, params.localDate],
  );
  const lifetimeCrossings: LifetimeTierCrossing[] = [];
  const reactivatedChallenges: ReactivatedLinkedChallenge[] = [];
  const deletedActivityIds: number[] = [];
  let tiers: FullTierRow[] | null = null;

  for (const row of rows) {
    const daysDone = (await getDoneDates(db, params.userId, row)).length;
    if (isComplete(daysDone, row.target_days)) continue;

    const rewardRow = await db.getFirstAsync<ChallengeRewardRow>(
      `SELECT id, week_start, stars_delta,
              (reward.note = ?) AS is_exact,
              COUNT(*) FILTER (WHERE reward.note IS NULL) OVER () AS candidate_count
       FROM activity_log AS reward
       WHERE reward.user_id = ? AND reward.source = 'CHALLENGE' AND reward.local_date = ?
         AND (
           reward.note = ?
           OR (
             reward.note IS NULL AND EXISTS (
               SELECT 1 FROM achievements AS achievement
                WHERE achievement.user_id = reward.user_id
                  AND achievement.source_type = 'challenge'
                  AND achievement.source_id = ?
                  AND achievement.earned_at = reward.local_date
             )
           )
         )
       ORDER BY is_exact DESC, reward.id DESC
       LIMIT 1`,
      [`challenge:${row.id}`, params.userId, params.localDate, `challenge:${row.id}`, row.id],
    );
    if (rewardRow) {
      if (rewardRow.is_exact !== 1 && (rewardRow.candidate_count ?? 0) > 1) {
        throw new Error('AMBIGUOUS_CHALLENGE_REWARD');
      }
      await db.runAsync(
        `UPDATE weekly_summary
         SET weekly_stars = MAX(0, weekly_stars - ?)
         WHERE user_id = ? AND week_start = ?`,
        [rewardRow.stars_delta, params.userId, rewardRow.week_start],
      );
      tiers ??= await db.getAllAsync<FullTierRow>(
        `SELECT id, tier_order, rank_name, stars_required FROM tiers ORDER BY stars_required ASC`,
      );
      lifetimeCrossings.push(...(await applyLifetimeStarsDelta(db, params.userId, -rewardRow.stars_delta, tiers)).crossings);
      await db.runAsync(
        `UPDATE users
         SET treat_stars = MAX(0, treat_stars - ?),
             treat_stars_lifetime = MAX(0, treat_stars_lifetime - ?)
         WHERE id = ?`,
        [rewardRow.stars_delta, rewardRow.stars_delta, params.userId],
      );
      await db.runAsync(`DELETE FROM activity_log WHERE id = ? AND user_id = ?`, [rewardRow.id, params.userId]);
      deletedActivityIds.push(rewardRow.id);
    }
    await db.runAsync(
      `DELETE FROM achievements WHERE user_id = ? AND source_type = 'challenge' AND source_id = ?`,
      [params.userId, row.id],
    );
    const reminderToken = row.notifications_enabled
      ? `reactivation:${row.id}:${Date.now()}:${++reactivationReminderSequence}`
      : null;
    await db.runAsync(
      `UPDATE challenges
       SET status = 'active', completed_at = NULL, streak_current = ?, notification_id = ?
       WHERE id = ? AND user_id = ?`,
      [daysDone, reminderToken, row.id, params.userId],
    );
    reactivatedChallenges.push({
      id: row.id,
      name: row.name,
      mode: 'streak',
      notificationsEnabled: !!row.notifications_enabled,
      reminderToken,
      previousNotificationId: row.notification_id,
    });
  }
  return { lifetimeCrossings, reactivatedChallenges, deletedActivityIds };
}

function challengeAchievementKey(params: { mode: ChallengeMode; targetDays: number; weeklyTarget: number | null; totalWeeks: number | null }): string {
  return params.mode === 'streak'
    ? `challenge_complete_${params.targetDays}`
    : `challenge_complete_weekly_${params.weeklyTarget}x${params.totalWeeks}`;
}

function challengeAchievementRarity(params: { mode: ChallengeMode; targetDays: number; totalWeeks: number | null }): 'common' | 'rare' | 'legendary' {
  if (params.mode === 'weekly') {
    if ((params.totalWeeks ?? 0) >= 12) return 'legendary';
    if ((params.totalWeeks ?? 0) >= 8) return 'rare';
    return 'common';
  }
  if (params.targetDays >= 66) return 'legendary';
  if (params.targetDays >= 30) return 'rare';
  return 'common';
}

async function awardChallengeCompletion(
  db: ChallengeLogDb,
  params: {
    userId: number; challengeId: number; taskTypeId: number | null; localDate: string;
    mode: ChallengeMode; targetDays: number; weeklyTarget: number | null; totalWeeks: number | null;
  },
): Promise<LifetimeTierCrossing[]> {
  const { stars: rewardStars } = params.mode === 'streak'
    ? computeChallengeReward({ mode: 'streak', targetDays: params.targetDays })
    : computeChallengeReward({ mode: 'weekly', weeklyTarget: params.weeklyTarget!, totalWeeks: params.totalWeeks! });
  const weekStart = getWeekStart();
  const nowMs = Date.now();
  const tiers = await db.getAllAsync<FullTierRow>(
    `SELECT id, tier_order, rank_name, stars_required FROM tiers ORDER BY stars_required ASC`,
  );
  await db.runAsync(
    `INSERT INTO activity_log
      (user_id, task_type_id, kind, duration_min, points_earned, stars_delta, source, logged_at, local_date, week_start, note)
     VALUES (?, ?, 'CHALLENGE', NULL, 0, ?, 'CHALLENGE', ?, ?, ?, ?)`,
    [params.userId, params.taskTypeId, rewardStars, nowMs, params.localDate, weekStart, `challenge:${params.challengeId}`],
  );
  await db.runAsync(
    `INSERT INTO weekly_summary (user_id, week_start, total_points, weekly_stars)
     VALUES (?, ?, 0, ?)
     ON CONFLICT(user_id, week_start) DO UPDATE SET
       weekly_stars = weekly_stars + ?`,
    [params.userId, weekStart, rewardStars, rewardStars],
  );
  const { crossings } = await applyLifetimeStarsDelta(db, params.userId, rewardStars, tiers);

  await db.runAsync(
    `UPDATE users
     SET treat_stars = treat_stars + ?, treat_stars_lifetime = treat_stars_lifetime + ?
     WHERE id = ?`,
    [rewardStars, rewardStars, params.userId],
  );
  await db.runAsync(
    `INSERT OR IGNORE INTO achievements (user_id, key, rarity, earned_at, source_type, source_id)
     VALUES (?, ?, ?, ?, 'challenge', ?)`,
    [
      params.userId,
      challengeAchievementKey(params),
      challengeAchievementRarity(params),
      params.localDate,
      params.challengeId,
    ],
  );
  return crossings;
}

async function completeStreakChallenge(
  db: ChallengeLogDb,
  row: Pick<ChallengeRow, 'id' | 'task_type_id' | 'target_days' | 'mode' | 'weekly_target' | 'total_weeks'>,
  params: { userId: number; localDate: string },
  daysDone: number,
): Promise<LifetimeTierCrossing[]> {
  await db.runAsync(
    `UPDATE challenges SET status = 'done', streak_current = ?, completed_at = ? WHERE id = ?`,
    [daysDone, params.localDate, row.id],
  );
  return awardChallengeCompletion(db, {
    userId: params.userId,
    challengeId: row.id,
    taskTypeId: row.task_type_id,
    localDate: params.localDate,
    mode: row.mode,
    targetDays: row.target_days,
    weeklyTarget: row.weekly_target,
    totalWeeks: row.total_weeks,
  });
}

export type LogActiveChallengeDayResult = {
  status: 'logged' | 'already_logged' | 'no_active_challenge';
  lifetimeCrossings: LifetimeTierCrossing[];
};

type ChallengeLogRow = Pick<
  ChallengeRow,
  'id' | 'task_type_id' | 'target_days' | 'mode' | 'weekly_target' | 'total_weeks' | 'start_date' | 'min_duration' | 'min_count'
>;

async function logChallengeDayForRow(
  db: ChallengeLogDb,
  row: ChallengeLogRow,
  params: { userId: number; localDate: string },
): Promise<{ status: 'logged' | 'already_logged'; lifetimeCrossings: LifetimeTierCrossing[] }> {
  if (row.task_type_id != null) {
    const doneDates = await getDoneDates(db, params.userId, row);
    const daysDone = doneDates.length;
    let lifetimeCrossings: LifetimeTierCrossing[] = [];
    if (row.mode === 'streak' && isComplete(daysDone, row.target_days)) {
      lifetimeCrossings = await completeStreakChallenge(db, row, params, daysDone);
    } else {
      await db.runAsync(`UPDATE challenges SET streak_current = ? WHERE id = ?`, [daysDone, row.id]);
    }
    return { status: 'logged', lifetimeCrossings };
  }

  const already = await db.getFirstAsync<{ id: number }>(
    `SELECT id FROM challenge_log WHERE challenge_id = ? AND local_date = ?`,
    [row.id, params.localDate],
  );
  if (already) return { status: 'already_logged', lifetimeCrossings: [] };

  await db.runAsync(
    `INSERT INTO challenge_log (challenge_id, local_date, state) VALUES (?, ?, 'done')`,
    [row.id, params.localDate],
  );
  await db.runAsync(
    `INSERT INTO challenge_days (challenge_id, local_date, logged_at)
     VALUES (?, ?, ?)
     ON CONFLICT(challenge_id, local_date) DO NOTHING`,
    [row.id, params.localDate, Date.now()],
  );

  const doneRow = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM challenge_log WHERE challenge_id = ? AND state = 'done'`,
    [row.id],
  );
  const daysDone = doneRow?.n ?? 0;
  const streakRow = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM challenge_log WHERE challenge_id = ? AND state != 'reset'`,
    [row.id],
  );
  const streakCurrent = streakRow?.n ?? 0;
  let lifetimeCrossings: LifetimeTierCrossing[] = [];
  if (row.mode === 'streak' && isComplete(daysDone, row.target_days)) {
    lifetimeCrossings = await completeStreakChallenge(db, row, params, streakCurrent);
  } else {
    await db.runAsync(`UPDATE challenges SET streak_current = ? WHERE id = ?`, [streakCurrent, row.id]);
  }

  return { status: 'logged', lifetimeCrossings };
}

export async function logActiveChallengeDay(
  db: ChallengeLogDb,
  params: { userId: number; localDate: string; taskTypeId?: number | null; challengeId?: number | null },
): Promise<LogActiveChallengeDayResult> {
  const values = params.challengeId != null
    ? [params.userId, params.challengeId]
    : params.taskTypeId == null
      ? [params.userId]
      : [params.userId, params.taskTypeId];
  const where = params.challengeId != null
    ? "user_id = ? AND id = ? AND status = 'active'"
    : params.taskTypeId == null
      ? "user_id = ? AND status = 'active' AND task_type_id IS NULL"
      : "user_id = ? AND status = 'active' AND task_type_id = ?";
  const rows = await db.getAllAsync<ChallengeLogRow>(
    `SELECT id, task_type_id, target_days, mode, weekly_target, total_weeks, start_date, min_duration, min_count
     FROM challenges WHERE ${where} ORDER BY id ASC`,
    values,
  );
  if (rows.length === 0) return { status: 'no_active_challenge', lifetimeCrossings: [] };

  // Linked challenges (task_type_id set): completion is derived query-time
  // from activity_log, no parallel challenge_log/challenge_days write
  // (PHẦN 3's "1 nguồn sự thật"). Weekly-mode completion is rollover-only --
  // a week can't be judged complete until it has fully elapsed -- so only
  // streak mode can complete inline here.
  let anyLogged = false;
  const lifetimeCrossings: LifetimeTierCrossing[] = [];
  for (const row of rows) {
    const result = await logChallengeDayForRow(db, row, params);
    anyLogged = anyLogged || result.status === 'logged';
    lifetimeCrossings.push(...result.lifetimeCrossings);
  }
  return {
    status: anyLogged ? 'logged' : 'already_logged',
    lifetimeCrossings,
  };
}

async function loadChallengeWithLog(db: SQLiteDatabase, row: ChallengeRow, today: string, userId: number): Promise<ActiveChallenge> {
  const linked = row.task_type_id != null;

  // Linked challenges derive completion dates query-time from activity_log;
  // manual challenges keep reading challenge_log 'done' rows exactly as
  // before. Linked rollover markers are intentionally not counted as done.
  const derivedDoneDates = linked ? await getDoneDates(db, userId, row) : null;
  const logRows = linked
    ? derivedDoneDates!.map(date => ({ local_date: date, state: 'done' as ChallengeLogState }))
    : await db.getAllAsync<{ local_date: string; state: ChallengeLogState }>(
      `SELECT local_date, state FROM challenge_log WHERE challenge_id = ? ORDER BY local_date ASC`,
      [row.id],
    );
  const daysDone = logRows.filter(r => r.state === 'done').length;
  const { fraction, daysLeft } = computeProgress(daysDone, row.target_days);

  // Linked-streak challenges have no persisted freeze/reset markers -- derive
  // the current streak live via the same gap-filling logic manual streak
  // rollover uses, without writing anything (rolloverChallenge still owns
  // status/freezes_left transitions for linked challenges).
  const streak = linked
    ? (row.mode === 'streak'
      ? (computeRollover({ startDate: row.start_date, today, loggedDates: new Set(derivedDoneDates!), freezesLeft: row.freezes_left }).failed ? 0 : daysDone)
      : daysDone)
    : (row.streak_current || challengeStreak(logRows.map(r => ({ date: r.local_date, state: r.state }))));

  const base = {
    id: row.id,
    name: row.name,
    taskTypeId: row.task_type_id,
    targetDays: row.target_days,
    startDate: row.start_date,
    status: row.status,
    freezesLeft: row.freezes_left,
    beforePhoto: row.before_photo,
    afterPhoto: row.after_photo,
    dayIndex: currentDayIndex(row.start_date, today),
    daysDone,
    streak,
    daysLeft,
    fraction,
    loggedToday: logRows.some(r => r.local_date === today && r.state === 'done'),
    log: logRows.map(r => ({ date: r.local_date, state: r.state })),
    minDuration: row.min_duration,
    minCount: row.min_count,
    notificationsEnabled: !!row.notifications_enabled,
    notificationId: row.notification_id,
    mode: row.mode,
  };

  if (row.mode !== 'weekly' || row.weekly_target == null || row.total_weeks == null) {
    return {
      ...base,
      weeklyTarget: null, totalWeeks: null, weekIndex: null, weekStart: null, weekEnd: null,
      weekSessionsDone: null, weekSessionsRequired: null, weekPaceState: null, weekDaysRemaining: null, weekSessionsRemaining: null,
      perfectWeeks: null, overachieverThisWeek: false,
    };
  }

  const doneDates = new Set(logRows.filter(r => r.state === 'done').map(r => r.local_date));
  const windows = weekWindows(row.start_date, row.total_weeks);
  const activeWindow = currentWeekWindow(row.start_date, row.total_weeks, today)
    ?? windows[windows.length - 1];
  const sessionsThisWeek = sessionsDoneThrough(doneDates, row.start_date, today);
  const sessionsRequired = row.weekly_target * activeWindow.weekIndex;
  const pace = computePace({
    weeklyTarget: sessionsRequired,
    sessionsDone: sessionsThisWeek,
    today,
    weekEnd: activeWindow.end,
  });
  const elapsedOutcomes = windows
    .filter(w => w.end < today)
    .map(w => ({ hit: sessionsDoneThrough(doneDates, row.start_date, w.end) >= row.weekly_target! * w.weekIndex }));

  return {
    ...base,
    weeklyTarget: row.weekly_target,
    totalWeeks: row.total_weeks,
    weekIndex: activeWindow.weekIndex,
    weekStart: activeWindow.start,
    weekEnd: activeWindow.end,
    weekSessionsDone: sessionsThisWeek,
    weekSessionsRequired: sessionsRequired,
    weekPaceState: pace.state,
    weekDaysRemaining: pace.daysRemaining,
    weekSessionsRemaining: pace.sessionsRemaining,
    perfectWeeks: perfectWeekCount(elapsedOutcomes),
    overachieverThisWeek: isOverachieverWeek(weekSessionsDone(doneDates, activeWindow), row.weekly_target),
  };
}

export async function deleteChallengeById(
  db: Pick<SQLiteDatabase, 'getFirstAsync' | 'runAsync'>,
  userId: number,
  challengeId: number,
): Promise<{ notificationId: string | null; deletedActivityIds: number[] }> {
  const deletedActivityIds: number[] = [];
  const challenge = await db.getFirstAsync<ChallengeDeleteRow>(
    `SELECT status, completed_at, notification_id FROM challenges WHERE id = ? AND user_id = ?`,
    [challengeId, userId],
  );
  if (!challenge) throw new Error('CHALLENGE_NOT_FOUND');

  if (challenge.status === 'done' && challenge.completed_at) {
    const rewardRow = await db.getFirstAsync<ChallengeRewardRow>(
      `SELECT id, week_start, stars_delta,
              (reward.note = ?) AS is_exact,
              COUNT(*) FILTER (WHERE reward.note IS NULL) OVER () AS candidate_count
       FROM activity_log AS reward
       WHERE reward.user_id = ? AND reward.source = 'CHALLENGE' AND reward.local_date = ?
         AND (
           reward.note = ?
           OR (
             reward.note IS NULL AND EXISTS (
               SELECT 1 FROM achievements AS achievement
                WHERE achievement.user_id = reward.user_id
                  AND achievement.source_type = 'challenge'
                  AND achievement.source_id = ?
                  AND achievement.earned_at = reward.local_date
             )
           )
         )
       ORDER BY is_exact DESC, reward.id DESC
       LIMIT 1`,
      [`challenge:${challengeId}`, userId, challenge.completed_at, `challenge:${challengeId}`, challengeId],
    );

    if (rewardRow) {
      if (rewardRow.is_exact !== 1 && (rewardRow.candidate_count ?? 0) > 1) {
        throw new Error('AMBIGUOUS_CHALLENGE_REWARD');
      }
      await db.runAsync(
        `UPDATE weekly_summary
         SET weekly_stars = MAX(0, weekly_stars - ?)
         WHERE user_id = ? AND week_start = ?`,
        [rewardRow.stars_delta, userId, rewardRow.week_start],
      );
      await db.runAsync(
        `UPDATE users SET treat_stars = MAX(0, treat_stars - ?) WHERE id = ?`,
        [rewardRow.stars_delta, userId],
      );
      await db.runAsync(`DELETE FROM activity_log WHERE id = ? AND user_id = ?`, [rewardRow.id, userId]);
      deletedActivityIds.push(rewardRow.id);
    }
  }

  await db.runAsync(
    `DELETE FROM achievements WHERE user_id = ? AND source_type = 'challenge' AND source_id = ?`,
    [userId, challengeId],
  );
  await db.runAsync(`DELETE FROM challenge_days WHERE challenge_id = ?`, [challengeId]);
  await db.runAsync(`DELETE FROM challenge_log WHERE challenge_id = ?`, [challengeId]);
  await db.runAsync(`DELETE FROM challenges WHERE id = ? AND user_id = ?`, [challengeId, userId]);
  return { notificationId: challenge.notification_id ?? null, deletedActivityIds };
}

export async function deleteChallengesById(
  db: Pick<SQLiteDatabase, 'withExclusiveTransactionAsync'>,
  userId: number,
  challengeIds: number[],
): Promise<{ deletedActivityIds: number[] }> {
  const reminderIds: string[] = [];
  const deletedActivityIds: number[] = [];
  await db.withExclusiveTransactionAsync(async txn => {
    for (const challengeId of challengeIds) {
      const result = await deleteChallengeById(txn, userId, challengeId);
      if (result.notificationId) reminderIds.push(result.notificationId);
      deletedActivityIds.push(...result.deletedActivityIds);
    }
  });

  await cancelChallengeReminders([
    ...reminderIds,
    ...challengeIds.map(challengeReminderPrefix),
  ]);
  return { deletedActivityIds };
}

async function getActiveChallengeRows(db: SQLiteDatabase, userId: number): Promise<ChallengeRow[]> {
  return db.getAllAsync<ChallengeRow>(
    `SELECT ${CHALLENGE_COLUMNS}
     FROM challenges WHERE user_id = ? AND status = 'active'
     ORDER BY created_at DESC, id DESC`,
    [userId],
  );
}

/** Reconcile the single Challenge-owned notification queue from committed
 * local state. The DB token is a prefix for the new deterministic slots; old
 * exact IDs remain accepted by the scheduler for one migration cycle. */
export async function syncActiveChallengeReminders(
  userId: number,
  lang: AppLanguage,
  options: { now?: Date; requestPermission?: boolean; forceReschedule?: boolean; isActive?: () => boolean } = {},
): Promise<ChallengeReminderSyncResult> {
  const db = await getDb();
  if (options.isActive && !options.isActive()) {
    return {
      granted: false,
      permissionError: false,
      scheduleError: false,
      scheduled: 0,
      cancelled: 0,
      failed: 0,
      failedChallengeIds: [],
      candidateCount: 0,
      omittedCount: 0,
      challengeTokens: new Map(),
    };
  }
  const now = options.now ?? new Date();
  const today = challengeDate(now);
  const rows = await getActiveChallengeRows(db, userId);
  const challenges = await Promise.all(rows.map(row => loadChallengeWithLog(db, row, today, userId)));
  const states: ChallengeReminderState[] = challenges.map(challenge => ({
    challengeId: challenge.id,
    challengeName: challenge.name,
    mode: challenge.mode,
    status: challenge.status,
    notificationsEnabled: challenge.notificationsEnabled,
    loggedToday: challenge.loggedToday,
    freezesLeft: challenge.freezesLeft,
    weekPaceState: challenge.weekPaceState,
    weekEnd: challenge.weekEnd,
    today,
  }));
  const storedNotificationIds = new Map(rows.map(row => [row.id, row.notification_id]));
  const result = await syncChallengeReminderQueue(states, lang, {
    now,
    requestPermission: options.requestPermission,
    forceReschedule: options.forceReschedule,
    isActive: options.isActive,
    storedNotificationIds,
  });

  if (options.isActive && !options.isActive()) return result;

  const raceCancelled: string[] = [];
  for (const challenge of challenges) {
    const nextToken = result.challengeTokens.get(challenge.id) ?? null;
    if (nextToken === challenge.notificationId) continue;
    const update = await db.runAsync(
      `UPDATE challenges SET notification_id = ?
       WHERE id = ? AND user_id = ? AND status = 'active'`,
      [nextToken, challenge.id, userId],
    );
    if (nextToken != null && update.changes === 0) raceCancelled.push(challengeReminderPrefix(challenge.id));
  }
  if (raceCancelled.length) await cancelChallengeReminders(raceCancelled);

  if (result.omittedCount > 0) {
    console.warn(`[notifications] Challenge notification plan omitted ${result.omittedCount} slot(s)`);
  }
  return result;
}

export function useActiveChallenges(userId: number) {
  return useQuery({
    queryKey: ['challenge', 'active', userId],
    queryFn: async (): Promise<ActiveChallenge[]> => {
      const db = await getDb();
      const today = challengeDate();
      const rows = await getActiveChallengeRows(db, userId);
      return Promise.all(rows.map(row => loadChallengeWithLog(db, row, today, userId)));
    },
  });
}

export function useChallengeHistory(userId: number) {
  return useQuery({
    queryKey: ['challenge', 'history', userId],
    queryFn: async (): Promise<ChallengeHistoryRow[]> => {
      const db = await getDb();
      return db.getAllAsync<ChallengeHistoryRow>(
        `SELECT ${CHALLENGE_COLUMNS}, resets.reset_day
         FROM challenges
         LEFT JOIN (
           SELECT cl.challenge_id AS challenge_id,
                  CAST(julianday(MIN(cl.local_date)) - julianday(c.start_date) + 1 AS INTEGER) AS reset_day
           FROM challenge_log cl
           JOIN challenges c ON c.id = cl.challenge_id
           WHERE cl.state = 'reset'
           GROUP BY cl.challenge_id, c.start_date
         ) resets ON resets.challenge_id = challenges.id
         WHERE challenges.user_id = ? AND challenges.status != 'active'
         ORDER BY challenges.created_at DESC LIMIT 50`,
        [userId],
      );
    },
  });
}

export function useChallengeById(userId: number, challengeId: number | null) {
  return useQuery({
    queryKey: ['challenge', 'detail', userId, challengeId],
    enabled: challengeId != null,
    queryFn: async (): Promise<ActiveChallenge | null> => {
      if (challengeId == null) return null;
      const db = await getDb();
      const row = await db.getFirstAsync<ChallengeRow>(
        `SELECT ${CHALLENGE_COLUMNS}
         FROM challenges WHERE id = ? AND user_id = ?`,
        [challengeId, userId],
      );
      if (!row) return null;
      return loadChallengeWithLog(db, row, challengeDate(), userId);
    },
  });
}

/** Lazy rollover — call on ChallengeHub/ChallengeDetail mount. Fills gap days
 *  (consume freeze or fail) since there is no midnight timer in this app. */
export function useChallengeRollover(userId: number) {
  const qc = useQueryClient();
  const [lang] = useLanguage();
  return useMutation({
    mutationFn: async (): Promise<void> => {
      await rolloverChallenge(userId);
      try {
        await syncActiveChallengeReminders(userId, lang);
      } catch {}
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['challenge'] });
      qc.invalidateQueries({ queryKey: ['rank'] });
      qc.invalidateQueries({ queryKey: ['today'] });
      qc.invalidateQueries({ queryKey: ['week'] });
      qc.invalidateQueries({ queryKey: ['progress'] });
      void syncCurrentUserToSupabase()
        .catch(error => { if (__DEV__) console.warn('[sync] rollover sync failed:', error); })
        .finally(() => {
          qc.invalidateQueries({ queryKey: ['rank'] });
          qc.invalidateQueries({ queryKey: ['leaderboard'] });
        });
    },
  });
}

async function rolloverChallengeRow(
  txn: ChallengeLogDb,
  userId: number,
  row: ChallengeRow,
  today: string,
): Promise<LifetimeTierCrossing[]> {
  if (row.mode === 'weekly' && row.weekly_target != null && row.total_weeks != null) {
    return rolloverWeeklyChallenge(txn, userId, row as ChallengeRow & { weekly_target: number; total_weeks: number }, today);
  }

  if (row.task_type_id != null) {
    const doneDates = await getDoneDates(txn, userId, row);
    const rolloverRows = await txn.getAllAsync<{ local_date: string }>(
      `SELECT local_date FROM challenge_log WHERE challenge_id = ?`,
      [row.id],
    );
    const result = computeRollover({
      startDate: row.start_date,
      today,
      loggedDates: new Set([...doneDates, ...rolloverRows.map(log => log.local_date)]),
      freezesLeft: row.freezes_left,
    });
    for (const day of result.fillDays) {
      await txn.runAsync(
        `INSERT INTO challenge_log (challenge_id, local_date, state) VALUES (?, ?, ?)
         ON CONFLICT(challenge_id, local_date) DO NOTHING`,
        [row.id, day.date, day.state],
      );
    }
    if (result.freezesLeft !== row.freezes_left) {
      await txn.runAsync(`UPDATE challenges SET freezes_left = ? WHERE id = ?`, [result.freezesLeft, row.id]);
    }
    if (result.failed) {
      await txn.runAsync(`UPDATE challenges SET status = 'failed' WHERE id = ?`, [row.id]);
    }
    return [];
  }

  const logRows = await txn.getAllAsync<{ local_date: string }>(
    `SELECT local_date FROM challenge_log WHERE challenge_id = ?`,
    [row.id],
  );
  const loggedDates = new Set(logRows.map(r => r.local_date));
  const result = computeRollover({
    startDate: row.start_date,
    today,
    loggedDates,
    freezesLeft: row.freezes_left,
  });
  if (result.fillDays.length === 0) return [];

  for (const day of result.fillDays) {
    await txn.runAsync(
      `INSERT INTO challenge_log (challenge_id, local_date, state) VALUES (?, ?, ?)
       ON CONFLICT(challenge_id, local_date) DO NOTHING`,
      [row.id, day.date, day.state],
    );
  }
  const usedFreeze = result.fillDays.some(day => day.state === 'freeze');
  const streakCurrent = result.failed
    ? 0
    : (await txn.getFirstAsync<{ n: number }>(
      `SELECT COUNT(*) AS n FROM challenge_log WHERE challenge_id = ? AND state != 'reset'`,
      [row.id],
    ))?.n ?? 0;
  await txn.runAsync(
    `UPDATE challenges
     SET freezes_left = ?, freeze_used = CASE WHEN ? THEN 1 ELSE freeze_used END, streak_current = ?
     WHERE id = ?`,
    [result.freezesLeft, usedFreeze ? 1 : 0, streakCurrent, row.id],
  );
  if (result.failed) {
    await txn.runAsync(`UPDATE challenges SET status = 'failed' WHERE id = ?`, [row.id]);
  }
  return [];
}

export async function rolloverChallenge(userId: number): Promise<void> {
      const db = await getDb();
      const today = challengeDate();
      let lifetimeCrossings: LifetimeTierCrossing[] = [];
      await db.withExclusiveTransactionAsync(async (txn) => {
        const rows = await txn.getAllAsync<ChallengeRow>(
          `SELECT ${CHALLENGE_COLUMNS}
           FROM challenges WHERE user_id = ? AND status = 'active' ORDER BY id ASC`,
          [userId],
        );
        for (const row of rows) {
          lifetimeCrossings.push(...await rolloverChallengeRow(txn, userId, row, today));
        }
      });

      await cancelTerminalChallengeReminders(db, userId);

      if (lifetimeCrossings.length > 0) {
        rankMascotBridge.ref?.current?.playRankUp();
        rankMascotBridge.onRankUp?.(lifetimeCrossings);
        enqueuePendingLevelUps(lifetimeCrossings).catch(() => {});
      }
}

async function rolloverWeeklyChallenge(
  txn: ChallengeLogDb,
  userId: number,
  row: ChallengeRow & { weekly_target: number; total_weeks: number },
  today: string,
): Promise<LifetimeTierCrossing[]> {
  const logRows = await txn.getAllAsync<{ local_date: string; state: ChallengeLogState }>(
    `SELECT local_date, state FROM challenge_log WHERE challenge_id = ?`,
    [row.id],
  );
  // Linked challenges derive done-dates from activity_log (no persisted
  // 'done' challenge_log write); challenge_log is still used for the
  // window-end miss markers below (reset), which are an outcome
  // ledger, not raw completion data, for both linked and manual challenges.
  const doneDates = row.task_type_id != null
    ? new Set(await getDoneDates(txn, userId, row))
    : new Set(logRows.filter(r => r.state === 'done').map(r => r.local_date));
  const result = computeWeeklyRollover({
    startDate: row.start_date,
    totalWeeks: row.total_weeks,
    weeklyTarget: row.weekly_target,
    today,
    doneDates,
  });
  if (result.fillWeeks.length === 0 && !result.done) return [];

  for (const week of result.fillWeeks) {
    await txn.runAsync(
      `INSERT INTO challenge_log (challenge_id, local_date, state) VALUES (?, ?, ?)
       ON CONFLICT(challenge_id, local_date) DO NOTHING`,
      [row.id, week.weekEnd, week.state],
    );
  }
  if (result.failed) {
    await txn.runAsync(`UPDATE challenges SET status = 'failed' WHERE id = ?`, [row.id]);
    return [];
  }
  if (result.done) {
    await txn.runAsync(`UPDATE challenges SET status = 'done', completed_at = ? WHERE id = ?`, [today, row.id]);
    return awardChallengeCompletion(txn, {
      userId,
      challengeId: row.id,
      taskTypeId: row.task_type_id,
      localDate: today,
      mode: 'weekly',
      targetDays: row.target_days,
      weeklyTarget: row.weekly_target,
      totalWeeks: row.total_weeks,
    });
  }
  return [];
}

export function useLogChallengeDay(userId: number) {
  const qc = useQueryClient();
  const [lang] = useLanguage();
  return useMutation({
    mutationFn: async (challengeId: number): Promise<{ lifetimeCrossings: LifetimeTierCrossing[] }> => {
      const db = await getDb();
      const today = challengeDate();
      let lifetimeCrossings: LifetimeTierCrossing[] = [];
      await db.withExclusiveTransactionAsync(async (txn) => {
        const result = await logActiveChallengeDay(txn, { userId, localDate: today, challengeId });
        if (result.status === 'no_active_challenge') throw new Error('NO_ACTIVE_CHALLENGE');
        if (result.status === 'already_logged') throw new Error('ALREADY_LOGGED_TODAY');
        lifetimeCrossings = result.lifetimeCrossings;
      });
      await cancelTerminalChallengeReminders(db, userId);
      try {
        await syncActiveChallengeReminders(userId, lang);
      } catch {}
      return { lifetimeCrossings };
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['challenge'] });
      qc.invalidateQueries({ queryKey: ['week'] });
      qc.invalidateQueries({ queryKey: ['rank'] });
      qc.invalidateQueries({ queryKey: ['progress'] });
      qc.invalidateQueries({ queryKey: ['treats'] });
      qc.invalidateQueries({ queryKey: ['achievements'] });
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
  });
}

type CreateChallengeParams = {
  name: string;
  taskTypeId: number | null;
  freezesLeft: number;
  beforePhoto?: string | null;
  notificationsEnabled: boolean;
  /** Only meaningful when taskTypeId is set (linked challenge). */
  minDuration?: number | null;
  minCount?: number | null;
} & ({ mode: 'streak'; targetDays: number } | { mode: 'weekly'; weeklyTarget: number; totalWeeks: number });

export function useCreateChallenge(userId: number) {
  const qc = useQueryClient();
  const [lang] = useLanguage();
  return useMutation({
    mutationFn: async (params: CreateChallengeParams): Promise<{ notificationDenied: boolean }> => {
      const db = await getDb();
      const today = challengeDate();
      const targetDays = params.mode === 'streak' ? params.targetDays : params.totalWeeks * 7;
      const weeklyTarget = params.mode === 'weekly' ? params.weeklyTarget : null;
      const totalWeeks = params.mode === 'weekly' ? params.totalWeeks : null;
      const minDuration = params.taskTypeId != null ? clampThreshold(params.minDuration) : null;
      const minCount = params.taskTypeId != null ? clampThreshold(params.minCount) : null;
      let challengeId: number;
      try {
        const result = await db.runAsync(
          `INSERT INTO challenges (user_id, name, task_type_id, mode, target_days, weekly_target, total_weeks, start_date, streak_current, freezes_left, freeze_used, before_photo, notifications_enabled, min_duration, min_count)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 0, ?, ?, ?, ?)`,
          [userId, params.name, params.taskTypeId, params.mode, targetDays, weeklyTarget, totalWeeks, today, params.freezesLeft, params.beforePhoto ?? null, params.notificationsEnabled ? 1 : 0, minDuration, minCount],
        );
        challengeId = Number(result.lastInsertRowId);
      } catch (e: any) {
        if (e?.message?.includes('UNIQUE constraint failed')) throw new Error('ACTIVE_EXISTS');
        throw e;
      }
      let notificationDenied = false;
      if (params.notificationsEnabled) {
        try {
          const result = await syncActiveChallengeReminders(userId, lang, { requestPermission: true });
          notificationDenied = !result.granted
            || result.permissionError
            || result.scheduleError
            || result.failedChallengeIds.includes(challengeId);
        } catch (e) {
          notificationDenied = true;
          Sentry.captureException(e);
        }
      }
      return { notificationDenied };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['challenge'] });
    },
  });
}

export function useRetryChallengeReminder(userId: number) {
  const qc = useQueryClient();
  const [lang] = useLanguage();
  return useMutation({
    mutationFn: async (challengeId: number): Promise<boolean> => {
      const db = await getDb();
      const row = await db.getFirstAsync<{ id: number }>(
        `SELECT id FROM challenges WHERE id = ? AND user_id = ? AND status = 'active'`,
        [challengeId, userId],
      );
      if (!row) return false;
      const result = await syncActiveChallengeReminders(userId, lang, { requestPermission: true });
      return result.granted
        && !result.permissionError
        && !result.scheduleError
        && !result.failedChallengeIds.includes(challengeId);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['challenge'] }),
  });
}

export function useSetChallengeAfterPhoto(userId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ challengeId, uri }: { challengeId: number; uri: string }): Promise<void> => {
      const db = await getDb();
      await db.runAsync(`UPDATE challenges SET after_photo = ? WHERE id = ? AND user_id = ?`, [uri, challengeId, userId]);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['challenge'] });
    },
  });
}

export function useSetChallengeBeforePhoto(userId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ challengeId, uri }: { challengeId: number; uri: string }): Promise<void> => {
      const db = await getDb();
      await db.runAsync(`UPDATE challenges SET before_photo = ? WHERE id = ? AND user_id = ?`, [uri, challengeId, userId]);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['challenge'] }),
  });
}

export async function updateChallengeNameById(db: SQLiteDatabase, userId: number, challengeId: number, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('CHALLENGE_NAME_REQUIRED');
  await db.runAsync(`UPDATE challenges SET name = ? WHERE id = ? AND user_id = ?`, [trimmed, challengeId, userId]);
}

export function useUpdateChallengeName(userId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ challengeId, name }: { challengeId: number; name: string }): Promise<void> => {
      const db = await getDb();
      await updateChallengeNameById(db, userId, challengeId, name);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['challenge'] }),
  });
}

export function useRestartChallenge(userId: number) {
  const qc = useQueryClient();
  const [lang] = useLanguage();
  return useMutation({
    mutationFn: async (challengeId: number): Promise<{ id: number; notificationDenied: boolean }> => {
      const db = await getDb();
      let newId = 0;
      let notificationsEnabled = false;
      await db.withExclusiveTransactionAsync(async txn => {
        const previous = await txn.getFirstAsync<ChallengeRow>(
          `SELECT ${CHALLENGE_COLUMNS}
           FROM challenges WHERE id = ? AND user_id = ? AND status != 'active'`,
          [challengeId, userId],
        );
        if (!previous) throw new Error('CHALLENGE_NOT_RESTARTABLE');
        // useArchiveTask blocks archiving a task linked to an *active*
        // challenge, but this challenge is terminal (done/failed) -- its
        // linked task could have been archived since. Restarting would
        // otherwise create a new active challenge that can never be checked
        // off: an archived task never gets new activity_log rows, so
        // logChallengeDayForRow's linked-task branch would silently no-op
        // forever.
        if (previous.task_type_id != null) {
          const task = await txn.getFirstAsync<{ archived: number }>(
            `SELECT archived FROM task_types WHERE id = ? AND user_id = ?`,
            [previous.task_type_id, userId],
          );
          if (!task || task.archived) throw new Error('LINKED_TASK_ARCHIVED');
        }
        const result = await txn.runAsync(
          `INSERT INTO challenges (user_id, name, task_type_id, mode, target_days, weekly_target, total_weeks, start_date, streak_current, freezes_left, freeze_used, before_photo, notifications_enabled, min_duration, min_count)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 0, ?, ?, ?, ?)`,
          [userId, previous.name, previous.task_type_id, previous.mode, previous.target_days, previous.weekly_target, previous.total_weeks, challengeDate(), previous.mode === 'streak' ? PHAO_COUNT : 0, previous.before_photo, previous.notifications_enabled, previous.min_duration, previous.min_count],
        );
        newId = Number(result.lastInsertRowId);
        notificationsEnabled = !!previous.notifications_enabled;
      });
      let notificationDenied = false;
      if (notificationsEnabled) {
        try {
          const result = await syncActiveChallengeReminders(userId, lang, { requestPermission: true });
          notificationDenied = !result.granted
            || result.permissionError
            || result.scheduleError
            || result.failedChallengeIds.includes(newId);
        } catch (e) {
          notificationDenied = true;
          Sentry.captureException(e);
        }
      }
      return { id: newId, notificationDenied };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['challenge'] }),
  });
}

export function useDeleteChallenge(userId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (challengeIds: number | number[]): Promise<void> => {
      const ids = Array.isArray(challengeIds) ? challengeIds : [challengeIds];
      if (ids.length === 0) return;
      const db = await getDb();
      const { deletedActivityIds } = await deleteChallengesById(db, userId, ids);
      await enqueuePendingActivityDeletes(userId, deletedActivityIds);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['challenge'] });
      qc.invalidateQueries({ queryKey: ['progress'] });
      qc.invalidateQueries({ queryKey: ['week'] });
      qc.invalidateQueries({ queryKey: ['rank'] });
      qc.invalidateQueries({ queryKey: ['today'] });
      qc.invalidateQueries({ queryKey: ['treats'] });
      qc.invalidateQueries({ queryKey: ['achievements'] });
    },
  });
}
