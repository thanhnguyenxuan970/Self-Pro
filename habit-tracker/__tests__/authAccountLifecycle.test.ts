import type { SQLiteDatabase } from 'expo-sqlite';
import { resolveUserRow, RESET_PROGRESS_STATEMENTS, DELETE_ACCOUNT_STATEMENTS } from '../src/hooks/useAuth';

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
  return { runAsync, getFirstAsync } as unknown as SQLiteDatabase;
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
  'reward_unlocks', 'streak_freezes', 'task_types', 'treat_history', 'treats', 'weekly_summary',
];

describe('destructive account-delete SQL covers every per-user table', () => {
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
  });
});
