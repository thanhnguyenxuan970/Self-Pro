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
  DELETE_PENDING_ACTIVITY_DELETES_BY_ACCOUNT_KEY,
} from '../src/hooks/useAuth';

function createMockDb(config: {
  byAccountKeyResult?: { id: number } | null;
  bySubResult?: { id: number } | null;
  byEmailResult?: { id: number } | null;
  claimChanges?: number;
  newUserId?: number;
}) {
  const runAsync = jest.fn(async (sql: string, params: unknown[]) => {
    if (sql.includes('WHERE id = 1 AND google_sub IS NULL')) {
      return { changes: config.claimChanges ?? 0 };
    }
    if (sql.startsWith('INSERT INTO users')) {
      return { changes: 1, lastInsertRowId: config.newUserId ?? 42 };
    }
    return { changes: 1 };
  });
  const getFirstAsync = jest.fn(async (sql: string) => {
    if (sql.includes('WHERE account_key = ?')) return config.byAccountKeyResult ?? null;
    if (sql.includes('WHERE google_sub = ?')) return config.bySubResult ?? null;
    if (sql.includes('LOWER(TRIM(google_sub))')) return config.byEmailResult ?? null;
    return null;
  });
  const withTransactionAsync = jest.fn(async (callback: () => Promise<void>) => callback());
  return { runAsync, getFirstAsync, withTransactionAsync } as unknown as SQLiteDatabase;
}

describe('resolveUserRow', () => {
  it('binds the canonical account key when google_sub already matches', async () => {
    const db = createMockDb({ bySubResult: { id: 7 } });
    const result = await resolveUserRow(db, 'sub-1', ' A@B.COM ');
    expect(result).toEqual({ id: 7, isNew: false });
    expect(db.runAsync).toHaveBeenCalledWith(
      'UPDATE users SET account_key = ? WHERE id = ?',
      ['a@b.com', 7],
    );
  });

  it('migrates a legacy row where google_sub was previously stored as the email', async () => {
    const db = createMockDb({ bySubResult: null, byEmailResult: { id: 3 } });
    const result = await resolveUserRow(db, 'sub-new', 'legacy@b.com');
    expect(result).toEqual({ id: 3, isNew: false });
    expect(db.getFirstAsync).toHaveBeenNthCalledWith(
      3,
      'SELECT id FROM users WHERE LOWER(TRIM(google_sub)) = LOWER(TRIM(?)) ORDER BY id LIMIT 1',
      ['legacy@b.com'],
    );
    expect(db.runAsync).toHaveBeenCalledWith(
      'UPDATE users SET google_sub = ?, account_key = ? WHERE id = ?',
      ['sub-new', 'legacy@b.com', 3],
    );
  });

  it('claims the legacy anonymous row (id=1) when neither sub nor email matches', async () => {
    const db = createMockDb({ bySubResult: null, byEmailResult: null, claimChanges: 1 });
    const result = await resolveUserRow(db, 'sub-new', 'new@b.com');
    expect(result).toEqual({ id: 1, isNew: false });
    expect(db.runAsync).toHaveBeenCalledWith(
      'UPDATE users SET google_sub = ?, account_key = ? WHERE id = 1 AND google_sub IS NULL',
      ['sub-new', 'new@b.com'],
    );
  });

  it('inserts a brand-new user and seeds exactly 5 default categories when nothing matches or claims', async () => {
    const db = createMockDb({ bySubResult: null, byEmailResult: null, claimChanges: 0, newUserId: 99 });
    const result = await resolveUserRow(db, 'sub-brand-new', 'brand-new@b.com');
    expect(result).toEqual({ id: 99, isNew: true });
    expect(db.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO users (username, timezone, carry_debt, currency, google_sub, account_key)'),
      ['sub-brand-new', 'brand-new@b.com'],
    );
    const categoryInserts = (db.runAsync as jest.Mock).mock.calls.filter(([sql]) =>
      typeof sql === 'string' && sql.includes('INSERT INTO categories'));
    expect(categoryInserts).toHaveLength(5);
    expect(db.withTransactionAsync).toHaveBeenCalledTimes(1);
  });

  it('reuses the previous local row when the verified email is unchanged but Google subject changes', async () => {
    const getFirstAsync = jest.fn()
      .mockResolvedValueOnce(null) // stable account key is not bound yet
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
    expect(runAsync).toHaveBeenCalledWith(
      'UPDATE users SET google_sub = ?, account_key = ? WHERE id = ?',
      ['sub-new', 'same@example.com', 7],
    );
    expect(runAsync).not.toHaveBeenCalledWith(expect.stringContaining('INSERT INTO users'), expect.anything());
  });

  it('reuses the account-key row after sign-out when Google returns a new subject', async () => {
    const db = createMockDb({ byAccountKeyResult: { id: 7 } });

    await expect(resolveUserRow(db, 'sub-after-reprovision', ' Same@Example.com '))
      .resolves.toEqual({ id: 7, isNew: false });

    expect(db.getFirstAsync).toHaveBeenCalledWith(
      'SELECT id FROM users WHERE account_key = ?',
      ['same@example.com'],
    );
    expect(db.runAsync).toHaveBeenCalledWith(
      'UPDATE users SET google_sub = ? WHERE id = ?',
      ['sub-after-reprovision', 7],
    );
    expect(db.runAsync).not.toHaveBeenCalledWith(expect.stringContaining('INSERT INTO users'), expect.anything());
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

const TABLES_WITH_ACCOUNT_KEY_COLUMN = ['pending_activity_deletes'];

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

  it('purges every account-key scoped table without pretending it has user_id', () => {
    expect(TABLES_WITH_USER_ID_COLUMN).not.toContain('pending_activity_deletes');
    expect(TABLES_WITH_ACCOUNT_KEY_COLUMN).toEqual(['pending_activity_deletes']);
    expect(DELETE_PENDING_ACTIVITY_DELETES_BY_ACCOUNT_KEY)
      .toBe('DELETE FROM pending_activity_deletes WHERE account_key = ?');
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
