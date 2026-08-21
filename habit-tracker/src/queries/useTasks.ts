import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SQLiteDatabase } from 'expo-sqlite';
import { getDb } from '../db/client';
import { dailyBonusStarsForPoints } from '../config/constants';
import { MAX_PINNED_ACTIVITIES, normalizeActivityName, PickerTask } from '../utils/activityPicker';
import type { LifetimeTierCrossing, LifetimeTierRow } from '../game/lifetimeRank';
import { applyLifetimeStarsDelta } from '../game/lifetimeRankWrites';
import { enqueuePendingLevelUps } from '../game/pendingLevelUpQueue';
import { enqueuePendingActivityDeletes } from '../game/pendingActivityDeletes';
import { rankMascotBridge } from '../lib/rankMascotBridge';
import { syncCurrentUserToSupabase } from '../api/syncService';

interface TaskFormParams {
  name: string;
  kind: 'GOOD' | 'BAD';
  isTimeBased: boolean;
  basePoints: number;
  starPenalty: number;
  icon?: string;
  categoryId?: number | null;
  isTemplate?: boolean;
}

export function useCreateTask(userId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: TaskFormParams): Promise<number> => {
      const db = await getDb();
      // The UNIQUE index is on the exact stored name, so a different exact
      // name that collides once normalized (accents/case stripped) can slide
      // past it and create a second, effectively-duplicate task -- which can
      // then make a preset/challenge-linked lookup resolve to the wrong one.
      // AddActivitySheet already guards this client-side, but this is the
      // only path every caller (e.g. BackfillSheet's template suggestions)
      // goes through, so enforce it here too.
      const existing = await db.getAllAsync<{ id: number; name: string }>(
        `SELECT id, name FROM task_types WHERE user_id = ?`,
        [userId],
      );
      const normalizedTarget = normalizeActivityName(params.name);
      if (existing.some(task => task.name !== params.name && normalizeActivityName(task.name) === normalizedTarget)) {
        throw new Error('DUPLICATE_ACTIVITY_NAME');
      }
      await db.runAsync(
        `INSERT INTO task_types
         (user_id, name, kind, is_time_based, base_points, star_penalty, icon, category_id, archived, is_template)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
         ON CONFLICT(user_id, name) DO UPDATE SET archived = 0, is_time_based = excluded.is_time_based, is_template = MAX(is_template, excluded.is_template)`,
        [userId, params.name, params.kind, params.isTimeBased ? 1 : 0,
         params.basePoints, params.starPenalty, params.icon ?? null,
         params.categoryId ?? null, params.isTemplate ? 1 : 0]
      );
      const row = await db.getFirstAsync<{ id: number }>(
        'SELECT id FROM task_types WHERE user_id = ? AND name = ? AND archived = 0',
        [userId, params.name]
      );
      if (!row) throw new Error(`useCreateTask: task not found after insert (name=${params.name})`);
      return row.id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['today', 'tasks'] }),
  });
}

export function useActivityPickerTasks(userId: number) {
  return useQuery({
    queryKey: ['activity-picker', userId],
    queryFn: async (): Promise<PickerTask[]> => {
      const db = await getDb();
      return db.getAllAsync<PickerTask>(
        `SELECT tt.id, tt.name, tt.kind, tt.icon, tt.is_time_based, tt.base_points, tt.star_penalty,
                tt.archived, tt.is_pinned, tt.is_template, MAX(al.local_date) AS last_used_date
         FROM task_types tt
         LEFT JOIN activity_log al ON al.task_type_id = tt.id AND al.user_id = tt.user_id AND al.source = 'TASK'
         WHERE tt.user_id = ? AND tt.kind = 'GOOD'
         GROUP BY tt.id
         ORDER BY tt.is_pinned DESC, last_used_date DESC, tt.name COLLATE NOCASE`,
        [userId],
      );
    },
  });
}

export function useSetTaskPinned(userId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ taskId, pinned }: { taskId: number; pinned: boolean }) => {
      const db = await getDb();
      await db.withTransactionAsync(async () => {
        if (pinned) {
          const row = await db.getFirstAsync<{ count: number }>(
            'SELECT COUNT(*) AS count FROM task_types WHERE user_id = ? AND archived = 0 AND is_pinned = 1', [userId],
          );
          if ((row?.count ?? 0) >= MAX_PINNED_ACTIVITIES) throw new Error('PIN_LIMIT');
        }
        await db.runAsync('UPDATE task_types SET is_pinned = ? WHERE id = ? AND user_id = ?', [pinned ? 1 : 0, taskId, userId]);
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['activity-picker', userId] }),
  });
}

export function useRestoreTask(userId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (taskId: number) => {
      const db = await getDb();
      await db.runAsync('UPDATE task_types SET archived = 0 WHERE id = ? AND user_id = ?', [taskId, userId]);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['activity-picker', userId] });
      qc.invalidateQueries({ queryKey: ['today', 'tasks', userId] });
    },
  });
}

type ArchiveLogRow = {
  id: number; local_date: string; week_start: string;
  points_earned: number; stars_delta: number; kind: string;
};

type DateAccum = { points: number; stars: number; weekStart: string };
type WeekAccum = { points: number; stars: number };

function groupLogsByDate(logs: ArchiveLogRow[]): Map<string, DateAccum> {
  const byDate = new Map<string, DateAccum>();
  for (const row of logs) {
    const cur = byDate.get(row.local_date) ?? { points: 0, stars: 0, weekStart: row.week_start };
    byDate.set(row.local_date, {
      points: cur.points + row.points_earned,
      stars: cur.stars + row.stars_delta,
      weekStart: row.week_start,
    });
  }
  return byDate;
}

function groupLogsByWeek(logs: ArchiveLogRow[]): Map<string, WeekAccum> {
  const byWeek = new Map<string, WeekAccum>();
  for (const row of logs) {
    const cur = byWeek.get(row.week_start) ?? { points: 0, stars: 0 };
    byWeek.set(row.week_start, {
      points: cur.points + row.points_earned,
      stars: cur.stars + row.stars_delta,
    });
  }
  return byWeek;
}

async function revertDailySummaries(
  db: SQLiteDatabase, userId: number,
  byDate: Map<string, DateAccum>,
  byWeek: Map<string, WeekAccum>,
  kind: string,
): Promise<{ totalTreatDelta: number; bonusStarsRemoved: number; deletedActivityIds: number[] }> {
  let totalTreatDelta = 0;
  let bonusStarsRemoved = 0;
  const deletedActivityIds: number[] = [];
  const dates = [...byDate.keys()];
  if (dates.length === 0) return { totalTreatDelta, bonusStarsRemoved, deletedActivityIds };
  // Batched into one query instead of one round-trip per date.
  const datePlaceholders = dates.map(() => '?').join(',');
  const dailyRows = await db.getAllAsync<{ local_date: string; total_points: number; bonus_star_awarded: number }>(
    `SELECT local_date, total_points, bonus_star_awarded FROM daily_summary WHERE user_id = ? AND local_date IN (${datePlaceholders})`,
    [userId, ...dates],
  );
  const dailyByDate = new Map(dailyRows.map(r => [r.local_date, r]));

  for (const [date, { points: taskPoints, stars: taskStars, weekStart }] of byDate) {
    const daily = dailyByDate.get(date);
    if (!daily) continue;

    const remainingPoints = daily.total_points - taskPoints;
    const remainingBonusStars = dailyBonusStarsForPoints(remainingPoints);
    const bonusStars = Math.max(0, daily.bonus_star_awarded - remainingBonusStars);
    bonusStarsRemoved += bonusStars;

    if (bonusStars > 0) {
      const staleRows = await db.getAllAsync<{ id: number }>(
        `SELECT id FROM activity_log WHERE user_id = ? AND local_date = ? AND source = 'DAILY_BONUS'`,
        [userId, date]
      );
      deletedActivityIds.push(...staleRows.map(row => row.id));
      await db.runAsync(
        `DELETE FROM activity_log WHERE user_id = ? AND local_date = ? AND source = 'DAILY_BONUS'`,
        [userId, date]
      );
      if (remainingBonusStars > 0) {
        await db.runAsync(
          `INSERT INTO activity_log
           (user_id, task_type_id, kind, duration_min, points_earned, stars_delta, source, logged_at, local_date, week_start)
           VALUES (?, NULL, 'DAILY_BONUS', NULL, 0, ?, 'DAILY_BONUS', ?, ?, ?)`,
          [userId, remainingBonusStars, Date.now(), date, weekStart],
        );
      }
      const wk = byWeek.get(weekStart) ?? { points: 0, stars: 0 };
      byWeek.set(weekStart, { ...wk, stars: wk.stars + bonusStars });
    }

    if (kind === 'GOOD') totalTreatDelta += taskStars + bonusStars;

    if (remainingPoints <= 0) {
      await db.runAsync(
        `DELETE FROM daily_summary WHERE user_id = ? AND local_date = ?`,
        [userId, date]
      );
    } else {
      await db.runAsync(
        `UPDATE daily_summary SET
           total_points = MAX(0, total_points - ?),
           bonus_star_awarded = ?
         WHERE user_id = ? AND local_date = ?`,
        [taskPoints, remainingBonusStars, userId, date]
      );
    }
  }
  return { totalTreatDelta, bonusStarsRemoved, deletedActivityIds };
}

async function revertWeeklySummaries(
  db: SQLiteDatabase, userId: number,
  byWeek: Map<string, WeekAccum>,
): Promise<void> {
  const weeks = [...byWeek.keys()];
  if (weeks.length === 0) return;
  for (const [weekStart, { points, stars }] of byWeek) {
    await db.runAsync(
      `UPDATE weekly_summary SET
         total_points = MAX(0, total_points - ?),
         weekly_stars = MAX(0, weekly_stars - ?)
       WHERE user_id = ? AND week_start = ?`,
      [points, stars, userId, weekStart]
    );
  }
}

async function revertTreatStars(
  db: SQLiteDatabase, userId: number,
  kind: string, logs: ArchiveLogRow[], totalTreatDelta: number,
): Promise<void> {
  if (kind === 'GOOD') {
    await db.runAsync(
      `UPDATE users SET treat_stars = MAX(0, treat_stars - ?) WHERE id = ?`,
      [Math.max(0, totalTreatDelta), userId]
    );
  } else {
    const totalBadPenalty = logs.reduce((s, r) => s + Math.abs(r.stars_delta), 0);
    await db.runAsync(
      `UPDATE users SET treat_stars = treat_stars + ? WHERE id = ? AND penalty_hits_treats = 1`,
      [totalBadPenalty, userId]
    );
  }
}

async function recomputeStreaks(db: SQLiteDatabase, userId: number): Promise<void> {
  const remainingDays = await db.getAllAsync<{ id: number; local_date: string }>(
    `SELECT id, local_date FROM daily_summary WHERE user_id = ? ORDER BY local_date ASC`,
    [userId]
  );
  let prevDate: string | null = null;
  let streak = 0;
  const updates: Promise<unknown>[] = [];
  for (const day of remainingDays) {
    if (prevDate !== null) {
      const diffDays = Math.round(
        (new Date(day.local_date).getTime() - new Date(prevDate).getTime()) / 86400000
      );
      streak = diffDays === 1 ? streak + 1 : 1;
    } else {
      streak = 1;
    }
    // Streak values are fully precomputed above, so these writes have no
    // ordering dependency on each other -- fire concurrently instead of
    // paying one sequential bridge round-trip per day.
    updates.push(db.runAsync(`UPDATE daily_summary SET streak_count = ? WHERE id = ?`, [streak, day.id]));
    prevDate = day.local_date;
  }
  await Promise.all(updates);
}

export function useArchiveTask(userId: number) {
  const qc = useQueryClient();
  return useMutation({
    // Accepts a single id or an id[] so multi-select delete (TodayScreen)
    // runs as one transaction / one invalidation batch instead of N of each,
    // matching useDeleteChallenge's batched-mutation pattern.
    mutationFn: async (taskIdOrIds: number | number[]): Promise<{ lifetimeCrossings: LifetimeTierCrossing[] }> => {
      const taskIds = Array.isArray(taskIdOrIds) ? taskIdOrIds : [taskIdOrIds];
      if (taskIds.length === 0) return { lifetimeCrossings: [] };
      const db = await getDb();
      let lifetimeCrossings: LifetimeTierCrossing[] = [];
      const deletedActivityIds: number[] = [];

      await db.withTransactionAsync(async () => {
        for (const taskId of taskIds) {
          // Archiving hard-deletes this task_type's activity_log rows below --
          // for a linked+active challenge, those rows are the derivation source
          // for its completion, so archiving would silently break/reset it.
          const linkedActive = await db.getFirstAsync<{ id: number }>(
            `SELECT id FROM challenges WHERE user_id = ? AND task_type_id = ? AND status = 'active'`,
            [userId, taskId],
          );
          if (linkedActive) throw new Error('TASK_TYPE_LINKED_TO_ACTIVE_CHALLENGE');

          const allLogs = await db.getAllAsync<ArchiveLogRow>(
            `SELECT id, local_date, week_start, points_earned, stars_delta, kind
             FROM activity_log WHERE user_id = ? AND task_type_id = ? AND source = 'TASK'`,
            [userId, taskId]
          );

          if (allLogs.length > 0) {
            const kind = allLogs[0].kind;
            const byDate = groupLogsByDate(allLogs);
            const byWeek = groupLogsByWeek(allLogs);

            const { totalTreatDelta, bonusStarsRemoved, deletedActivityIds: bonusRowIds } = await revertDailySummaries(db, userId, byDate, byWeek, kind);

            await db.runAsync(
              `DELETE FROM activity_log WHERE user_id = ? AND task_type_id = ? AND source = 'TASK'`,
              [userId, taskId]
            );
            deletedActivityIds.push(...allLogs.map(log => log.id), ...bonusRowIds);

            await revertWeeklySummaries(db, userId, byWeek);
            await revertTreatStars(db, userId, kind, allLogs, totalTreatDelta);
            await recomputeStreaks(db, userId);

            const deletedPositiveStars = allLogs.reduce((total, log) => total + Math.max(0, log.stars_delta), 0) + bonusStarsRemoved;
            if (deletedPositiveStars > 0) {
              const tiers = await db.getAllAsync<LifetimeTierRow>(
                'SELECT id, tier_order, rank_name, stars_required FROM tiers ORDER BY stars_required ASC',
              );
              lifetimeCrossings = (await applyLifetimeStarsDelta(db, userId, -deletedPositiveStars, tiers)).crossings;
            }
          }

          await db.runAsync(
            `UPDATE task_types SET archived = 1 WHERE id = ? AND user_id = ?`,
            [taskId, userId]
          );
        }
      });
      await enqueuePendingActivityDeletes(userId, deletedActivityIds);

      return { lifetimeCrossings };
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['activity-picker', userId] });
      qc.invalidateQueries({ queryKey: ['today'] });
      qc.invalidateQueries({ queryKey: ['week'] });
      qc.invalidateQueries({ queryKey: ['progress'] });
      qc.invalidateQueries({ queryKey: ['rank'] });
      void syncCurrentUserToSupabase()
        .catch(error => { if (__DEV__) console.warn('[sync] archived task sync failed:', error); })
        .finally(() => {
          qc.invalidateQueries({ queryKey: ['rank'] });
          qc.invalidateQueries({ queryKey: ['leaderboard'] });
        });
      if (data?.lifetimeCrossings?.length) {
        rankMascotBridge.ref?.current?.playRankUp();
        rankMascotBridge.onRankUp?.(data.lifetimeCrossings);
        enqueuePendingLevelUps(data.lifetimeCrossings).catch(() => {});
      }
    },
  });
}

export function useUpdateTaskName(userId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ taskId, name, isTimeBased }: { taskId: number; name: string; isTimeBased?: boolean }) => {
      const db = await getDb();
      await db.runAsync(
        `UPDATE task_types SET name = ?, is_time_based = COALESCE(?, is_time_based) WHERE id = ? AND user_id = ?`,
        [name, isTimeBased == null ? null : isTimeBased ? 1 : 0, taskId, userId]
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['today'] });
      qc.invalidateQueries({ queryKey: ['week'] });
      qc.invalidateQueries({ queryKey: ['progress'] });
      qc.invalidateQueries({ queryKey: ['calendar'] });
      qc.invalidateQueries({ queryKey: ['activity-picker', userId] });
    },
  });
}
