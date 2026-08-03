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
      sql.includes("status != 'active'") ? [{ notification_id: 'challenge-reminder-7' }] : []
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
