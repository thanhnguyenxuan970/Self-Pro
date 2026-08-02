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
import { computeTierUnlocks, type TierRow } from '../game/tierUnlocks';
import { applyLifetimeStarsDelta } from '../game/lifetimeRankWrites';
import type { LifetimeTierCrossing } from '../game/lifetimeRank';
import { enqueuePendingLevelUps } from '../game/pendingLevelUpQueue';
import { rankMascotBridge } from '../lib/rankMascotBridge';
import { getWeekStart } from '../utils/formatters';
import { scheduleChallengeReminder, cancelChallengeReminder } from '../utils/notifications';
import { syncCurrentUserToSupabase } from '../api/syncService';
import { useLanguage } from '../hooks/useSettings';

interface ActiveChallenge {
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
};

type ChallengeLogDb = Pick<SQLiteDatabase, 'getFirstAsync' | 'getAllAsync' | 'runAsync'>;

/**
 * Query-time done-dates source for a challenge: linked challenges (task_type_id
 * set) derive from activity_log (no persisted write -- PHẦN 3's "1 nguồn sự
 * thật"); manual challenges read the existing challenge_log 'done' rows.
 */
async function getDoneDates(
  db: ChallengeLogDb,
  userId: number,
  row: Pick<ChallengeRow, 'id' | 'task_type_id' | 'start_date' | 'min_duration' | 'min_count'>,
): Promise<string[]> {
  if (row.task_type_id != null) {
    const rows = await db.getAllAsync<{ local_date: string; duration_min: number | null }>(
      `SELECT local_date, duration_min FROM activity_log
       WHERE user_id = ? AND task_type_id = ? AND local_date >= ? AND is_clock_suspect = 0
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

type FullTierRow = TierRow & { tier_order: number; rank_name: string };

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

async function getCarryOverTierId(
  db: ChallengeLogDb,
  userId: number,
  tiers: FullTierRow[],
  currentWeekStart: string,
): Promise<number> {
  const sorted = [...tiers].sort((a, b) => a.tier_order - b.tier_order);
  const lowestTier = sorted[0];

  const lastWeek = await db.getFirstAsync<{ weekly_stars: number; current_tier_id: number | null }>(
    `SELECT weekly_stars, current_tier_id FROM weekly_summary
     WHERE user_id = ? AND week_start < ?
     ORDER BY week_start DESC LIMIT 1`,
    [userId, currentWeekStart],
  );

  if (!lastWeek || lastWeek.current_tier_id === null) return lowestTier.id;

  const lastTier = sorted.find(tier => tier.id === lastWeek.current_tier_id);
  if (!lastTier) return lowestTier.id;
  if (lastWeek.weekly_stars !== 0) return lastWeek.current_tier_id;

  const demotedTier = sorted.find(tier => tier.tier_order === lastTier.tier_order - 1);
  return demotedTier?.id ?? lowestTier.id;
}

async function handleTierUnlocks(
  db: ChallengeLogDb,
  tiers: FullTierRow[],
  userId: number,
  weekStart: string,
  newUnlocks: ReturnType<typeof computeTierUnlocks>,
): Promise<void> {
  if (newUnlocks.length === 0) return;
  const firstUnlock = newUnlocks[0];
  for (const unlock of newUnlocks) {
    await db.runAsync(
      `INSERT OR IGNORE INTO reward_unlocks
       (user_id, tier_id, week_start, stars_at_unlock, reward_amount, claimed)
       VALUES (?, ?, ?, ?, 0, 0)`,
      [unlock.user_id, unlock.tier_id, unlock.week_start, unlock.stars_at_unlock],
    );
  }
  const tier = tiers.find(item => item.id === firstUnlock.tier_id);
  if (!tier) return;
  await db.runAsync(
    `UPDATE weekly_summary SET current_tier_id = ? WHERE user_id = ? AND week_start = ?`,
    [tier.id, userId, weekStart],
  );
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
  const weeklyRow = await db.getFirstAsync<{ weekly_stars: number; current_tier_id: number | null }>(
    `SELECT weekly_stars, current_tier_id FROM weekly_summary WHERE user_id = ? AND week_start = ?`,
    [params.userId, weekStart],
  );
  const alreadyUnlocked = await db.getAllAsync<{ tier_id: number }>(
    `SELECT tier_id FROM reward_unlocks WHERE user_id = ? AND week_start = ?`,
    [params.userId, weekStart],
  );
  const carryOverTierId = weeklyRow === null
    ? await getCarryOverTierId(db, params.userId, tiers, weekStart)
    : (weeklyRow.current_tier_id ?? tiers.find(tier => tier.tier_order === 1)!.id);
  const startingTierOrder = tiers.find(tier => tier.id === carryOverTierId)?.tier_order ?? 0;
  const oldStars = weeklyRow?.weekly_stars ?? 0;
  const newUnlocks = computeTierUnlocks({
    userId: params.userId,
    weekStart,
    oldStars,
    newStars: oldStars + rewardStars,
    tiers,
    alreadyUnlockedTierIds: alreadyUnlocked.map(row => row.tier_id),
    startingTierOrder,
  });

  await db.runAsync(
    `INSERT INTO activity_log
      (user_id, task_type_id, kind, duration_min, points_earned, stars_delta, source, logged_at, local_date, week_start)
     VALUES (?, ?, 'CHALLENGE', NULL, 0, ?, 'CHALLENGE', ?, ?, ?)`,
    [params.userId, params.taskTypeId, rewardStars, nowMs, params.localDate, weekStart],
  );
  await db.runAsync(
    `INSERT INTO weekly_summary (user_id, week_start, total_points, weekly_stars, peak_stars, current_tier_id)
     VALUES (?, ?, 0, ?, ?, ?)
     ON CONFLICT(user_id, week_start) DO UPDATE SET
       weekly_stars = weekly_stars + ?,
       peak_stars = MAX(peak_stars, weekly_stars + ?)`,
    [params.userId, weekStart, rewardStars, Math.max(0, rewardStars), carryOverTierId, rewardStars, rewardStars],
  );
  // Legacy weekly tier-unlock bookkeeping — superseded by the lifetime rollup
  // below for rank display/celebration purposes. See the matching comment in
  // useToday.ts's useLogTask for why this still runs.
  await handleTierUnlocks(db, tiers, params.userId, weekStart, newUnlocks);

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

export async function logActiveChallengeDay(
  db: ChallengeLogDb,
  params: { userId: number; localDate: string; taskTypeId?: number | null },
): Promise<LogActiveChallengeDayResult> {
  const row = params.taskTypeId == null
    ? await db.getFirstAsync<Pick<ChallengeRow, 'id' | 'task_type_id' | 'target_days' | 'mode' | 'weekly_target' | 'total_weeks' | 'start_date' | 'min_duration' | 'min_count'>>(
      `SELECT id, task_type_id, target_days, mode, weekly_target, total_weeks, start_date, min_duration, min_count FROM challenges WHERE user_id = ? AND status = 'active'`,
      [params.userId],
    )
    : await db.getFirstAsync<Pick<ChallengeRow, 'id' | 'task_type_id' | 'target_days' | 'mode' | 'weekly_target' | 'total_weeks' | 'start_date' | 'min_duration' | 'min_count'>>(
      `SELECT id, task_type_id, target_days, mode, weekly_target, total_weeks, start_date, min_duration, min_count
       FROM challenges
       WHERE user_id = ? AND status = 'active' AND task_type_id = ?`,
      [params.userId, params.taskTypeId],
    );
  if (!row) return { status: 'no_active_challenge', lifetimeCrossings: [] };

  // Linked challenges (task_type_id set): completion is derived query-time
  // from activity_log, no parallel challenge_log/challenge_days write
  // (PHẦN 3's "1 nguồn sự thật"). Weekly-mode completion is rollover-only --
  // a week can't be judged complete until it has fully elapsed -- so only
  // streak mode can complete inline here.
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
  // Weekly-mode completion is rollover-only -- a week (and the challenge as a
  // whole) can't be judged complete until it has fully elapsed, so only
  // streak mode can complete inline here on a same-day log.
  let lifetimeCrossings: LifetimeTierCrossing[] = [];
  if (row.mode === 'streak' && isComplete(daysDone, row.target_days)) {
    lifetimeCrossings = await completeStreakChallenge(db, row, params, streakCurrent);
  } else {
    await db.runAsync(`UPDATE challenges SET streak_current = ? WHERE id = ?`, [streakCurrent, row.id]);
  }

  return { status: 'logged', lifetimeCrossings };
}

async function loadChallengeWithLog(db: SQLiteDatabase, row: ChallengeRow, today: string, userId: number): Promise<ActiveChallenge> {
  const linked = row.task_type_id != null;

  // Linked challenges derive done-dates query-time from activity_log (no
  // persisted challenge_log write); manual challenges keep reading
  // challenge_log 'done' rows exactly as before.
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
): Promise<void> {
  const challenge = await db.getFirstAsync<ChallengeDeleteRow>(
    `SELECT status, completed_at, notification_id FROM challenges WHERE id = ? AND user_id = ?`,
    [challengeId, userId],
  );
  if (!challenge) throw new Error('CHALLENGE_NOT_FOUND');

  await cancelChallengeReminder(challenge.notification_id);

  if (challenge.status === 'done' && challenge.completed_at) {
    const rewardRow = await db.getFirstAsync<ChallengeRewardRow>(
      `SELECT id, week_start, stars_delta
       FROM activity_log
       WHERE user_id = ? AND source = 'CHALLENGE' AND local_date = ?
       ORDER BY id DESC
       LIMIT 1`,
      [userId, challenge.completed_at],
    );

    if (rewardRow) {
      const weeklyRow = await db.getFirstAsync<{ weekly_stars: number }>(
        `SELECT weekly_stars FROM weekly_summary WHERE user_id = ? AND week_start = ?`,
        [userId, rewardRow.week_start],
      );
      const newWeeklyStars = Math.max(0, (weeklyRow?.weekly_stars ?? 0) - rewardRow.stars_delta);

      await db.runAsync(
        `UPDATE weekly_summary
         SET weekly_stars = MAX(0, weekly_stars - ?)
         WHERE user_id = ? AND week_start = ?`,
        [rewardRow.stars_delta, userId, rewardRow.week_start],
      );
      await db.runAsync(
        `DELETE FROM reward_unlocks
         WHERE user_id = ? AND week_start = ? AND claimed = 0
           AND tier_id IN (SELECT id FROM tiers WHERE stars_required > ?)`,
        [userId, rewardRow.week_start, newWeeklyStars],
      );
      await db.runAsync(
        `UPDATE users SET treat_stars = MAX(0, treat_stars - ?) WHERE id = ?`,
        [rewardRow.stars_delta, userId],
      );
      await db.runAsync(`DELETE FROM activity_log WHERE id = ? AND user_id = ?`, [rewardRow.id, userId]);
    }
  }

  await db.runAsync(
    `DELETE FROM achievements WHERE user_id = ? AND source_type = 'challenge' AND source_id = ?`,
    [userId, challengeId],
  );
  await db.runAsync(`DELETE FROM challenge_days WHERE challenge_id = ?`, [challengeId]);
  await db.runAsync(`DELETE FROM challenge_log WHERE challenge_id = ?`, [challengeId]);
  await db.runAsync(`DELETE FROM challenges WHERE id = ? AND user_id = ?`, [challengeId, userId]);
}

export function useActiveChallenge(userId: number) {
  return useQuery({
    queryKey: ['challenge', 'active', userId],
    queryFn: async (): Promise<ActiveChallenge | null> => {
      const db = await getDb();
      const row = await db.getFirstAsync<ChallengeRow>(
        `SELECT ${CHALLENGE_COLUMNS}
         FROM challenges WHERE user_id = ? AND status = 'active'`,
        [userId],
      );
      if (!row) return null;
      return loadChallengeWithLog(db, row, challengeDate(), userId);
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
  return useMutation({
    mutationFn: async (): Promise<void> => {
      await rolloverChallenge(userId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['challenge'] });
      qc.invalidateQueries({ queryKey: ['rank'] });
      qc.invalidateQueries({ queryKey: ['today'] });
      qc.invalidateQueries({ queryKey: ['week'] });
      qc.invalidateQueries({ queryKey: ['progress'] });
      void syncCurrentUserToSupabase()
        .catch(error => { if (__DEV__) console.warn('[sync] rollover sync failed:', error); })
        .finally(() => { qc.invalidateQueries({ queryKey: ['leaderboard'] }); });
    },
  });
}

export async function rolloverChallenge(userId: number): Promise<void> {
      const db = await getDb();
      const today = challengeDate();
      let lifetimeCrossings: LifetimeTierCrossing[] = [];
      await db.withExclusiveTransactionAsync(async (txn) => {
        const row = await txn.getFirstAsync<ChallengeRow>(
          `SELECT ${CHALLENGE_COLUMNS}
           FROM challenges WHERE user_id = ? AND status = 'active'`,
          [userId],
        );
        if (!row) return;

        if (row.mode === 'weekly' && row.weekly_target != null && row.total_weeks != null) {
          lifetimeCrossings = await rolloverWeeklyChallenge(txn, userId, row as ChallengeRow & { weekly_target: number; total_weeks: number }, today);
          return;
        }

        if (row.task_type_id != null) {
          // Linked streak challenge: no challenge_log to fill -- derive
          // done-dates and write only the summary columns already on
          // `challenges` (there is no per-day row to persist for a linked
          // challenge, so a "gap" here is a live fact re-derived on every
          // call, never a stored fill).
          const doneDates = await getDoneDates(txn, userId, row);
          const result = computeRollover({
            startDate: row.start_date,
            today,
            loggedDates: new Set(doneDates),
            freezesLeft: row.freezes_left,
          });
          if (result.freezesLeft !== row.freezes_left) {
            await txn.runAsync(`UPDATE challenges SET freezes_left = ? WHERE id = ?`, [result.freezesLeft, row.id]);
          }
          if (result.failed) {
            await txn.runAsync(`UPDATE challenges SET status = 'failed' WHERE id = ?`, [row.id]);
          }
          return;
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
        if (result.fillDays.length === 0) return;

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
      });

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
  return useMutation({
    mutationFn: async (): Promise<{ lifetimeCrossings: LifetimeTierCrossing[] }> => {
      const db = await getDb();
      const today = challengeDate();
      let lifetimeCrossings: LifetimeTierCrossing[] = [];
      await db.withExclusiveTransactionAsync(async (txn) => {
        const result = await logActiveChallengeDay(txn, { userId, localDate: today });
        if (result.status === 'no_active_challenge') throw new Error('NO_ACTIVE_CHALLENGE');
        if (result.status === 'already_logged') throw new Error('ALREADY_LOGGED_TODAY');
        lifetimeCrossings = result.lifetimeCrossings;
      });
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
        .finally(() => { qc.invalidateQueries({ queryKey: ['leaderboard'] }); });
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
          const notificationId = await scheduleChallengeReminder(params.name, params.mode, lang);
          if (notificationId) {
            await db.runAsync(`UPDATE challenges SET notification_id = ? WHERE id = ?`, [notificationId, challengeId]);
          } else {
            notificationDenied = true;
          }
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
      const row = await db.getFirstAsync<{ name: string; mode: ChallengeMode }>(
        `SELECT name, mode FROM challenges WHERE id = ? AND user_id = ?`,
        [challengeId, userId],
      );
      if (!row) return false;
      const notificationId = await scheduleChallengeReminder(row.name, row.mode, lang);
      if (!notificationId) return false;
      await db.runAsync(`UPDATE challenges SET notification_id = ? WHERE id = ?`, [notificationId, challengeId]);
      return true;
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
      let challengeName = '';
      let challengeMode: ChallengeMode = 'streak';
      await db.withExclusiveTransactionAsync(async txn => {
        const previous = await txn.getFirstAsync<ChallengeRow>(
          `SELECT ${CHALLENGE_COLUMNS}
           FROM challenges WHERE id = ? AND user_id = ? AND status != 'active'`,
          [challengeId, userId],
        );
        if (!previous) throw new Error('CHALLENGE_NOT_RESTARTABLE');
        const result = await txn.runAsync(
          `INSERT INTO challenges (user_id, name, task_type_id, mode, target_days, weekly_target, total_weeks, start_date, streak_current, freezes_left, freeze_used, before_photo, notifications_enabled, min_duration, min_count)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 0, ?, ?, ?, ?)`,
          [userId, previous.name, previous.task_type_id, previous.mode, previous.target_days, previous.weekly_target, previous.total_weeks, challengeDate(), previous.mode === 'streak' ? PHAO_COUNT : 0, previous.before_photo, previous.notifications_enabled, previous.min_duration, previous.min_count],
        );
        newId = Number(result.lastInsertRowId);
        notificationsEnabled = !!previous.notifications_enabled;
        challengeName = previous.name;
        challengeMode = previous.mode;
      });
      let notificationDenied = false;
      if (notificationsEnabled) {
        try {
          const notificationId = await scheduleChallengeReminder(challengeName, challengeMode, lang);
          if (notificationId) {
            await db.runAsync(`UPDATE challenges SET notification_id = ? WHERE id = ?`, [notificationId, newId]);
          } else {
            notificationDenied = true;
          }
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
      await db.withExclusiveTransactionAsync(async txn => {
        for (const challengeId of ids) {
          await deleteChallengeById(txn as unknown as SQLiteDatabase, userId, challengeId);
        }
      });
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
