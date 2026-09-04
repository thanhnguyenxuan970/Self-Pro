import { runMigrations } from '../src/db/migrations';

function createFreshDatabase() {
  const db = {
    getFirstAsync: jest.fn(async (sql: string) => {
      if (sql === 'PRAGMA user_version') return { user_version: 0 };
      if (sql.includes('SELECT id FROM tiers WHERE tier_order = ?')) return null;
      if (sql.includes('COUNT(*)')) return { count: 1 };
      return null;
    }),
    getAllAsync: jest.fn(async (sql: string) => {
      if (sql.startsWith('PRAGMA table_info(users)')) {
        return [{ name: 'id' }, { name: 'lifetime_stars' }, { name: 'current_tier_id' }];
      }
      return [];
    }),
    runAsync: jest.fn().mockResolvedValue({ changes: 1, lastInsertRowId: 1 }),
    execAsync: jest.fn().mockResolvedValue(undefined),
    withTransactionAsync: jest.fn(async (callback: () => Promise<void>) => callback()),
  };
  return db;
}

describe('full migration chain contract', () => {
  test('runs every migration from a pre-v1 database and leaves the repair pass safe', async () => {
    const db = createFreshDatabase();

    await expect(runMigrations(db as never)).resolves.toBeUndefined();

    expect(db.execAsync).toHaveBeenCalledWith('PRAGMA user_version = 29');
    expect(db.withTransactionAsync).toHaveBeenCalled();
    expect(db.execAsync.mock.calls.some(([sql]) => String(sql).includes('CREATE TABLE challenges_new'))).toBe(true);
    expect(db.runAsync.mock.calls.some(([sql]) => String(sql).includes("UPDATE tiers SET rank_name = 'Cosmic'"))).toBe(true);
  });

  test('tolerates duplicate columns during a resumed migration', async () => {
    const db = createFreshDatabase();
    db.getFirstAsync.mockImplementation(async (sql: string) => {
      if (sql === 'PRAGMA user_version') return { user_version: 1 };
      if (sql.includes('COUNT(*)')) return { count: 1 };
      return null;
    });
    db.runAsync.mockImplementation(async (sql: string) => {
      if (sql.startsWith('ALTER TABLE')) throw new Error('duplicate column name: resumed');
      return { changes: 1, lastInsertRowId: 1 };
    });

    await expect(runMigrations(db as never)).resolves.toBeUndefined();
    expect(db.execAsync).toHaveBeenCalledWith('PRAGMA user_version = 29');
  });
});
