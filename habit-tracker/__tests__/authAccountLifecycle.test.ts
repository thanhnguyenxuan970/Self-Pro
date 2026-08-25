import type { SQLiteDatabase } from 'expo-sqlite';
const mockCancelChallengeReminders = jest.fn();
const mockInvalidateChallengeReminderSync = jest.fn();
jest.mock('../src/utils/notifications', () => ({
  cancelChallengeReminders: mockCancelChallengeReminders,
  invalidateChallengeReminderSync: mockInvalidateChallengeReminderSync,
}));
import {
  cancelUserChallengeReminders,
  resolveUserRow,
  RESET_PROGRESS_STATEMENTS,
  DELETE_ACCOUNT_STATEMENTS,
} from '../src/hooks/useAuth';

function createMockDb(config: {
  bySubResult?: { id: number } | null;
  byEmailResult?: { id: number } | null;
  claimChanges?: number;
  newUserId?: number;
}) {
  let getFirstCallCount = 0;
  const runAsync = jest.fn(async (sql: string, params: unknown[]) => {
    if (sql.startsWith('UPDATE users SET google_sub = ? WHERE id = 1')) {
      return { changes: config.claimChanges ?? 0 };
    }
    if (sql.startsWith('INSERT INTO users')) {
      return { changes: 1, lastInsertRowId: config.newUserId ?? 42 };
    }
    return { changes: 1 };
  });
  const getFirstAsync = jest.fn(async () => {
    getFirstCallCount++;
    // 1st call = lookup by google_sub, 2nd call = lookup by legacy email-as-sub
    return getFirstCallCount === 1 ? (config.bySubResult ?? null) : (config.byEmailResult ?? null);
  });
  const withTransactionAsync = jest.fn(async (callback: () => Promise<void>) => callback());
  return { runAsync, getFirstAsync, withTransactionAsync } as unknown as SQLiteDatabase;
}

describe('resolveUserRow', () => {
  it('returns the existing row when google_sub already matches — no writes', async () => {
    const db = createMockDb({ bySubResult: { id: 7 } });
    const result = await resolveUserRow(db, 'sub-1', 'a@b.com');
    expect(result).toEqual({ id: 7, isNew: false });
    expect(db.runAsync).not.toHaveBeenCalled();
  });

  it('migrates a legacy row where google_sub was previously stored as the email', async () => {
    const db = createMockDb({ bySubResult: null, byEmailResult: { id: 3 } });
    const result = await resolveUserRow(db, 'sub-new', 'legacy@b.com');
    expect(result).toEqual({ id: 3, isNew: false });
    expect(db.getFirstAsync).toHaveBeenNthCalledWith(
      2,
      'SELECT id FROM users WHERE LOWER(TRIM(google_sub)) = LOWER(TRIM(?)) ORDER BY id LIMIT 1',
      ['legacy@b.com'],
    );
    expect(db.runAsync).toHaveBeenCalledWith('UPDATE users SET google_sub = ? WHERE id = ?', ['sub-new', 3]);
  });

  it('claims the legacy anonymous row (id=1) when neither sub nor email matches', async () => {
    const db = createMockDb({ bySubResult: null, byEmailResult: null, claimChanges: 1 });
    const result = await resolveUserRow(db, 'sub-new', 'new@b.com');
    expect(result).toEqual({ id: 1, isNew: false });
  });

  it('inserts a brand-new user and seeds exactly 5 default categories when nothing matches or claims', async () => {
    const db = createMockDb({ bySubResult: null, byEmailResult: null, claimChanges: 0, newUserId: 99 });
    const result = await resolveUserRow(db, 'sub-brand-new', 'brand-new@b.com');
    expect(result).toEqual({ id: 99, isNew: true });
    const categoryInserts = (db.runAsync as jest.Mock).mock.calls.filter(([sql]) =>
      typeof sql === 'string' && sql.includes('INSERT INTO categories'));
    expect(categoryInserts).toHaveLength(5);
    expect(db.withTransactionAsync).toHaveBeenCalledTimes(1);
  });

  it('reuses the previous local row when the verified email is unchanged but Google subject changes', async () => {
    const getFirstAsync = jest.fn()
      .mockResolvedValueOnce(null) // new subject is not present
      .mockResolvedValueOnce({ id: 7 }); // previous subject owns the data
    const runAsync = jest.fn(async () => ({ changes: 1 }));
    const db = {
      getFirstAsync,
      runAsync,
      withTransactionAsync: jest.fn(async (callback: () => Promise<void>) => callback()),
    } as unknown as SQLiteDatabase;

    await expect(resolveUserRow(db, 'sub-new', 'same@example.com', undefined, 'sub-old'))
      .resolves.toEqual({ id: 7, isNew: false });
    expect(runAsync).toHaveBeenCalledWith('UPDATE users SET google_sub = ? WHERE id = ?', ['sub-new', 7]);
    expect(runAsync).not.toHaveBeenCalledWith(expect.stringContaining('INSERT INTO users'), expect.anything());
  });
});

function tableNameFromDeleteStatement(sql: string): string {
  const match = sql.match(/^DELETE FROM (\w+)/);
  if (!match) throw new Error(`Statement is not a leading DELETE FROM: ${sql}`);
  return match[1];
}

/**
 * Tables in src/db/migrations.ts that carry a user_id column — i.e. per-user data
 * that must be purged on account deletion. Keep this list in sync with the schema:
 * if you add a new `user_id`-scoped table, add its DELETE to DELETE_ACCOUNT_STATEMENTS
 * in src/hooks/useAuth.ts AND add the table name here.
 */
const TABLES_WITH_USER_ID_COLUMN = [
  'activity_log', 'achievements', 'categories', 'challenges', 'daily_summary', 'fund_transactions',
  'boost_events', 'milestone_stars', 'reward_unlocks', 'streak_freezes', 'task_types', 'treat_history', 'treats', 'weekly_summary',
];

describe('destructive account-delete SQL covers every per-user table', () => {
  beforeEach(() => mockCancelChallengeReminders.mockClear());

  it('cancels every persisted challenge reminder before challenge rows are purged', async () => {
    const db = {
      getAllAsync: jest.fn().mockResolvedValue([
        { id: 41, notification_id: 'notification-1' },
        { id: 42, notification_id: 'notification-2' },
      ]),
    } as unknown as SQLiteDatabase;

    await cancelUserChallengeReminders(db, 7);

    expect(db.getAllAsync).toHaveBeenCalledWith(
      'SELECT id, notification_id FROM challenges WHERE user_id = ?',
      [7],
    );
    expect(mockCancelChallengeReminders).toHaveBeenCalledWith([
      'notification-1', 'notification-2', 'habi-ch-41-', 'habi-ch-42-',
    ]);
  });

  it('deleteAccount purges every table that has a user_id column', () => {
    const deletedTables = new Set(DELETE_ACCOUNT_STATEMENTS.map(tableNameFromDeleteStatement));
    const missing = TABLES_WITH_USER_ID_COLUMN.filter(t => !deletedTables.has(t));
    expect(missing).toEqual([]);
  });

  it('resetProgress deliberately preserves user-config tables (categories, task_types, treats)', () => {
    const resetTables = new Set(RESET_PROGRESS_STATEMENTS.map(tableNameFromDeleteStatement));
    expect(resetTables.has('categories')).toBe(false);
    expect(resetTables.has('task_types')).toBe(false);
    expect(resetTables.has('treats')).toBe(false);
    // But it must still clear all progress/history tables.
    expect(resetTables.has('activity_log')).toBe(true);
    expect(resetTables.has('achievements')).toBe(true);
    expect(resetTables.has('challenges')).toBe(true);
    expect(resetTables.has('fund_transactions')).toBe(true);
    expect(resetTables.has('milestone_stars')).toBe(true);
    expect(resetTables.has('boost_events')).toBe(true);
  });
});
