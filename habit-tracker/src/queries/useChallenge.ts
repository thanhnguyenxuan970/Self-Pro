import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDb } from '../db/client';
import { challengeDate, challengeStreak, computeRollover, currentDayIndex, computeProgress, isComplete, DayEntryState as ChallengeLogState, ChallengeStatus } from '../lib/challenge';
import type { SQLiteDatabase } from 'expo-sqlite';

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
  freezes_left: number;
  before_photo: string | null;
  after_photo: string | null;
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
    streak: challengeStreak(logRows.map(r => ({ date: r.local_date, state: r.state }))),
    daysLeft,
    fraction,
    loggedToday: logRows.some(r => r.local_date === today && r.state === 'done'),
    log: logRows.map(r => ({ date: r.local_date, state: r.state })),
  };
}

export function useActiveChallenge(userId: number) {
  return useQuery({
    queryKey: ['challenge', 'active', userId],
    queryFn: async (): Promise<ActiveChallenge | null> => {
      const db = await getDb();
      const row = await db.getFirstAsync<ChallengeRow>(
        `SELECT id, name, task_type_id, target_days, start_date, status, freezes_left, before_photo, after_photo
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
        `SELECT id, name, task_type_id, target_days, start_date, status, freezes_left, before_photo, after_photo
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
        `SELECT id, name, task_type_id, target_days, start_date, status, freezes_left, before_photo, after_photo
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
          `SELECT id, name, task_type_id, target_days, start_date, status, freezes_left, before_photo, after_photo
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
        await txn.runAsync(`UPDATE challenges SET freezes_left = ? WHERE id = ?`, [result.freezesLeft, row.id]);
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
        const row = await txn.getFirstAsync<ChallengeRow>(
          `SELECT id, target_days FROM challenges WHERE user_id = ? AND status = 'active'`,
          [userId],
        );
        if (!row) throw new Error('NO_ACTIVE_CHALLENGE');

        const already = await txn.getFirstAsync<{ id: number }>(
          `SELECT id FROM challenge_log WHERE challenge_id = ? AND local_date = ?`,
          [row.id, today],
        );
        if (already) throw new Error('ALREADY_LOGGED_TODAY');

        await txn.runAsync(
          `INSERT INTO challenge_log (challenge_id, local_date, state) VALUES (?, ?, 'done')`,
          [row.id, today],
        );

        const doneRow = await txn.getFirstAsync<{ n: number }>(
          `SELECT COUNT(*) AS n FROM challenge_log WHERE challenge_id = ? AND state = 'done'`,
          [row.id],
        );
        const daysDone = doneRow?.n ?? 0;
        if (isComplete(daysDone, row.target_days)) {
          await txn.runAsync(`UPDATE challenges SET status = 'done' WHERE id = ?`, [row.id]);
        }
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['challenge'] });
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
          `INSERT INTO challenges (user_id, name, task_type_id, target_days, start_date, freezes_left, before_photo)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
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
          `SELECT id, name, task_type_id, target_days, start_date, status, freezes_left, before_photo, after_photo
           FROM challenges WHERE id = ? AND user_id = ? AND status != 'active'`,
          [challengeId, userId],
        );
        if (!previous) throw new Error('CHALLENGE_NOT_RESTARTABLE');
        const result = await txn.runAsync(
          `INSERT INTO challenges (user_id, name, task_type_id, target_days, start_date, freezes_left, before_photo)
           VALUES (?, ?, ?, ?, ?, 1, ?)`,
          [userId, previous.name, previous.task_type_id, previous.target_days, challengeDate(), previous.before_photo],
        );
        newId = Number(result.lastInsertRowId);
      });
      return newId;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['challenge'] }),
  });
}
