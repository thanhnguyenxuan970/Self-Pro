import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDb } from '../db/client';
import { challengeDate, challengeStreak, computeRollover, currentDayIndex, computeProgress, isComplete, DayEntryState as ChallengeLogState, ChallengeStatus } from '../lib/challenge';
import type { SQLiteDatabase } from 'expo-sqlite';
import { challengeCompletionStars, PHAO_COUNT } from '../config/challenges.config';
import { computeTierUnlocks, type TierRow } from '../game/tierUnlocks';
import { getWeekStart } from '../utils/formatters';

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
}

type ChallengeDeleteRow = {
  status: ChallengeStatus;
  completed_at: string | null;
};

type ChallengeRewardRow = {
  id: number;
  week_start: string;
  stars_delta: number;
};

type ChallengeLogDb = Pick<SQLiteDatabase, 'getFirstAsync' | 'getAllAsync' | 'runAsync'>;

type FullTierRow = TierRow & { tier_order: number; rank_name: string };

function challengeAchievementKey(targetDays: number): string {
  return `challenge_complete_${targetDays}`;
}

function challengeAchievementRarity(targetDays: number): 'common' | 'rare' | 'legendary' {
  if (targetDays >= 66) return 'legendary';
  if (targetDays >= 30) return 'rare';
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
  params: { userId: number; challengeId: number; taskTypeId: number | null; targetDays: number; localDate: string },
): Promise<void> {
  const rewardStars = challengeCompletionStars(params.targetDays);
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
  await handleTierUnlocks(db, tiers, params.userId, weekStart, newUnlocks);
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
      challengeAchievementKey(params.targetDays),
      challengeAchievementRarity(params.targetDays),
      params.localDate,
      params.challengeId,
    ],
  );
}

export async function logActiveChallengeDay(
  db: ChallengeLogDb,
  params: { userId: number; localDate: string; taskTypeId?: number | null },
): Promise<'logged' | 'already_logged' | 'no_active_challenge'> {
  const row = params.taskTypeId == null
    ? await db.getFirstAsync<Pick<ChallengeRow, 'id' | 'task_type_id' | 'target_days'>>(
      `SELECT id, task_type_id, target_days FROM challenges WHERE user_id = ? AND status = 'active'`,
      [params.userId],
    )
    : await db.getFirstAsync<Pick<ChallengeRow, 'id' | 'task_type_id' | 'target_days'>>(
      `SELECT id, task_type_id, target_days
       FROM challenges
       WHERE user_id = ? AND status = 'active' AND task_type_id = ?`,
      [params.userId, params.taskTypeId],
    );
  if (!row) return 'no_active_challenge';

  const already = await db.getFirstAsync<{ id: number }>(
    `SELECT id FROM challenge_log WHERE challenge_id = ? AND local_date = ?`,
    [row.id, params.localDate],
  );
  if (already) return 'already_logged';

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
  if (isComplete(daysDone, row.target_days)) {
    await db.runAsync(
      `UPDATE challenges SET status = 'done', streak_current = ?, completed_at = ? WHERE id = ?`,
      [streakCurrent, params.localDate, row.id],
    );
    await awardChallengeCompletion(db, {
      userId: params.userId,
      challengeId: row.id,
      taskTypeId: row.task_type_id,
      targetDays: row.target_days,
      localDate: params.localDate,
    });
  } else {
    await db.runAsync(`UPDATE challenges SET streak_current = ? WHERE id = ?`, [streakCurrent, row.id]);
  }

  return 'logged';
}

async function loadChallengeWithLog(db: SQLiteDatabase, row: ChallengeRow, today: string): Promise<ActiveChallenge> {
  const logRows = await db.getAllAsync<{ local_date: string; state: ChallengeLogState }>(
    `SELECT local_date, state FROM challenge_log WHERE challenge_id = ? ORDER BY local_date ASC`,
    [row.id],
  );
  const daysDone = logRows.filter(r => r.state === 'done').length;
  const { fraction, daysLeft } = computeProgress(daysDone, row.target_days);
  return {
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
    streak: row.streak_current || challengeStreak(logRows.map(r => ({ date: r.local_date, state: r.state }))),
    daysLeft,
    fraction,
    loggedToday: logRows.some(r => r.local_date === today && r.state === 'done'),
    log: logRows.map(r => ({ date: r.local_date, state: r.state })),
  };
}

export async function deleteChallengeById(
  db: Pick<SQLiteDatabase, 'getFirstAsync' | 'runAsync'>,
  userId: number,
  challengeId: number,
): Promise<void> {
  const challenge = await db.getFirstAsync<ChallengeDeleteRow>(
    `SELECT status, completed_at FROM challenges WHERE id = ? AND user_id = ?`,
    [challengeId, userId],
  );
  if (!challenge) throw new Error('CHALLENGE_NOT_FOUND');

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
        `SELECT id, name, task_type_id, target_days, start_date, status, streak_current, freezes_left, before_photo, after_photo
         FROM challenges WHERE user_id = ? AND status = 'active'`,
        [userId],
      );
      if (!row) return null;
      return loadChallengeWithLog(db, row, challengeDate());
    },
  });
}

export function useChallengeHistory(userId: number) {
  return useQuery({
    queryKey: ['challenge', 'history', userId],
    queryFn: async (): Promise<ChallengeRow[]> => {
      const db = await getDb();
      return db.getAllAsync<ChallengeRow>(
        `SELECT id, name, task_type_id, target_days, start_date, status, streak_current, freezes_left, before_photo, after_photo
         FROM challenges WHERE user_id = ? AND status != 'active' ORDER BY created_at DESC`,
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
        `SELECT id, name, task_type_id, target_days, start_date, status, streak_current, freezes_left, before_photo, after_photo
         FROM challenges WHERE id = ? AND user_id = ?`,
        [challengeId, userId],
      );
      if (!row) return null;
      return loadChallengeWithLog(db, row, challengeDate());
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
    },
  });
}

export async function rolloverChallenge(userId: number): Promise<void> {
      const db = await getDb();
      const today = challengeDate();
      await db.withExclusiveTransactionAsync(async (txn) => {
        const row = await txn.getFirstAsync<ChallengeRow>(
          `SELECT id, name, task_type_id, target_days, start_date, status, streak_current, freezes_left, before_photo, after_photo
           FROM challenges WHERE user_id = ? AND status = 'active'`,
          [userId],
        );
        if (!row) return;

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
}

export function useLogChallengeDay(userId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<void> => {
      const db = await getDb();
      const today = challengeDate();
      await db.withExclusiveTransactionAsync(async (txn) => {
        const result = await logActiveChallengeDay(txn, { userId, localDate: today });
        if (result === 'no_active_challenge') throw new Error('NO_ACTIVE_CHALLENGE');
        if (result === 'already_logged') throw new Error('ALREADY_LOGGED_TODAY');
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['challenge'] });
      qc.invalidateQueries({ queryKey: ['week'] });
      qc.invalidateQueries({ queryKey: ['rank'] });
      qc.invalidateQueries({ queryKey: ['progress'] });
      qc.invalidateQueries({ queryKey: ['treats'] });
      qc.invalidateQueries({ queryKey: ['achievements'] });
    },
  });
}

interface CreateChallengeParams {
  name: string;
  taskTypeId: number | null;
  targetDays: number;
  freezesLeft: number;
  beforePhoto?: string | null;
}

export function useCreateChallenge(userId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: CreateChallengeParams): Promise<void> => {
      const db = await getDb();
      const today = challengeDate();
      try {
        await db.runAsync(
          `INSERT INTO challenges (user_id, name, task_type_id, target_days, start_date, streak_current, freezes_left, freeze_used, before_photo)
           VALUES (?, ?, ?, ?, ?, 0, ?, 0, ?)`,
          [userId, params.name, params.taskTypeId, params.targetDays, today, params.freezesLeft, params.beforePhoto ?? null],
        );
      } catch (e: any) {
        if (e?.message?.includes('UNIQUE constraint failed')) throw new Error('ACTIVE_EXISTS');
        throw e;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['challenge'] });
    },
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

export function useRestartChallenge(userId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (challengeId: number): Promise<number> => {
      const db = await getDb();
      let newId = 0;
      await db.withExclusiveTransactionAsync(async txn => {
        const previous = await txn.getFirstAsync<ChallengeRow>(
          `SELECT id, name, task_type_id, target_days, start_date, status, streak_current, freezes_left, before_photo, after_photo
           FROM challenges WHERE id = ? AND user_id = ? AND status != 'active'`,
          [challengeId, userId],
        );
        if (!previous) throw new Error('CHALLENGE_NOT_RESTARTABLE');
        const result = await txn.runAsync(
          `INSERT INTO challenges (user_id, name, task_type_id, target_days, start_date, streak_current, freezes_left, freeze_used, before_photo)
           VALUES (?, ?, ?, ?, ?, 0, ?, 0, ?)`,
          [userId, previous.name, previous.task_type_id, previous.target_days, challengeDate(), PHAO_COUNT, previous.before_photo],
        );
        newId = Number(result.lastInsertRowId);
      });
      return newId;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['challenge'] }),
  });
}

export function useDeleteChallenge(userId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (challengeId: number): Promise<void> => {
      const db = await getDb();
      await db.withExclusiveTransactionAsync(async txn => {
        await deleteChallengeById(txn as unknown as SQLiteDatabase, userId, challengeId);
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
