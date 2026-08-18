import type { SQLiteDatabase } from 'expo-sqlite';

jest.mock('../src/db/client', () => ({ getDb: jest.fn() }));
jest.mock('expo-notifications', () => ({
  cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/lib/challenge', () => {
  const actual = jest.requireActual('../src/lib/challenge');
  return { ...actual, challengeDate: jest.fn().mockReturnValue('2026-08-03') };
});

import { getDb } from '../src/db/client';
import { rolloverChallenge } from '../src/queries/useChallenge';
import * as Notifications from 'expo-notifications';

test('cancels the reminder after a streak challenge fails during rollover', async () => {
  const row = {
    id: 7,
    name: 'Read',
    task_type_id: null,
    target_days: 7,
    start_date: '2026-08-01',
    status: 'active' as const,
    streak_current: 0,
    freezes_left: 0,
    before_photo: null,
    after_photo: null,
    mode: 'streak' as const,
    weekly_target: null,
    total_weeks: null,
    min_duration: null,
    min_count: null,
    notifications_enabled: 1,
    notification_id: 'challenge-reminder-7',
  };
  const db = {
    withExclusiveTransactionAsync: async (callback: (txn: SQLiteDatabase) => Promise<void>) => callback(db as unknown as SQLiteDatabase),
    getFirstAsync: jest.fn(async (sql: string) => sql.includes('FROM challenges') ? row : null),
    getAllAsync: jest.fn(async (sql: string) => (
      sql.includes("status != 'active'")
        ? [{ notification_id: 'challenge-reminder-7' }]
        : sql.includes("status = 'active'") ? [row] : []
    )),
    runAsync: jest.fn(async () => ({ changes: 1 })),
  } as unknown as SQLiteDatabase;
  (getDb as jest.Mock).mockResolvedValue(db);

  await rolloverChallenge(5);

  expect(db.runAsync).toHaveBeenCalledWith(
    `UPDATE challenges SET status = 'failed' WHERE id = ?`,
    [7],
  );
  expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('challenge-reminder-7');
});

test('rolls over every active challenge in one transaction', async () => {
  const rows = [7, 8].map(id => ({
    id,
    name: `Challenge ${id}`,
    task_type_id: null,
    target_days: 7,
    start_date: '2026-08-01',
    status: 'active' as const,
    streak_current: 0,
    freezes_left: 0,
    before_photo: null,
    after_photo: null,
    mode: 'streak' as const,
    weekly_target: null,
    total_weeks: null,
    min_duration: null,
    min_count: null,
    notifications_enabled: 1,
    notification_id: `challenge-reminder-${id}`,
  }));
  const db = {
    withExclusiveTransactionAsync: async (callback: (txn: SQLiteDatabase) => Promise<void>) => callback(db as unknown as SQLiteDatabase),
    getFirstAsync: jest.fn(async () => null),
    getAllAsync: jest.fn(async (sql: string) => (
      sql.includes("status != 'active'") ? rows.map(row => ({ notification_id: row.notification_id }))
        : sql.includes("status = 'active'") ? rows : []
    )),
    runAsync: jest.fn(async () => ({ changes: 1 })),
  } as unknown as SQLiteDatabase;
  (getDb as jest.Mock).mockResolvedValue(db);

  await rolloverChallenge(5);

  expect(db.runAsync).toHaveBeenCalledWith(
    `UPDATE challenges SET status = 'failed' WHERE id = ?`,
    [7],
  );
  expect(db.runAsync).toHaveBeenCalledWith(
    `UPDATE challenges SET status = 'failed' WHERE id = ?`,
    [8],
  );
  expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('challenge-reminder-7');
  expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('challenge-reminder-8');
});

test('does not consume a linked challenge freeze twice after reopening the hub', async () => {
  const row = {
    id: 9,
    name: 'Linked challenge',
    task_type_id: 42,
    target_days: 30,
    start_date: '2026-08-01',
    status: 'active' as const,
    streak_current: 0,
    freezes_left: 2,
    before_photo: null,
    after_photo: null,
    mode: 'streak' as const,
    weekly_target: null,
    total_weeks: null,
    min_duration: null,
    min_count: null,
    notifications_enabled: 1,
    notification_id: null,
  };
  const rolloverMarkers: { local_date: string; state: string }[] = [];
  const db = {
    withExclusiveTransactionAsync: async (callback: (txn: SQLiteDatabase) => Promise<void>) => callback(db as unknown as SQLiteDatabase),
    getFirstAsync: jest.fn(async () => null),
    getAllAsync: jest.fn(async (sql: string) => {
      if (sql.includes("status != 'active'")) return [];
      if (sql.includes("status = 'active'")) return [row];
      if (sql.includes('FROM activity_log')) return [];
      if (sql.includes('FROM challenge_log')) return rolloverMarkers;
      return [];
    }),
    runAsync: jest.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes('INSERT INTO challenge_log') && params) {
        rolloverMarkers.push({ local_date: String(params[1]), state: String(params[2]) });
      }
      if (sql.includes('SET freezes_left = ?') && params) row.freezes_left = Number(params[0]);
      return { changes: 1 };
    }),
  } as unknown as SQLiteDatabase;
  (getDb as jest.Mock).mockResolvedValue(db);

  await rolloverChallenge(5);
  await rolloverChallenge(5);

  expect(rolloverMarkers).toEqual([
    { local_date: '2026-08-01', state: 'freeze' },
    { local_date: '2026-08-02', state: 'freeze' },
  ]);
  expect(db.runAsync).toHaveBeenCalledTimes(1 + rolloverMarkers.length);
});
