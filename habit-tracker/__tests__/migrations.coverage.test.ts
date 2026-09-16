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

    expect(db.execAsync).toHaveBeenCalledWith('PRAGMA user_version = 35');
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
    expect(db.execAsync).toHaveBeenCalledWith('PRAGMA user_version = 35');
  });

  test('rethrows a non-duplicate ALTER TABLE failure', async () => {
    const db = createFreshDatabase();
    db.getFirstAsync.mockImplementation(async (sql: string) => (
      sql === 'PRAGMA user_version' ? { user_version: 1 } : { count: 1 }
    ));
    db.runAsync.mockRejectedValue(new Error('disk is read-only'));
    await expect(runMigrations(db as never)).rejects.toThrow('disk is read-only');
  });

  test('seeds the initial schema when all v1 seed probes are empty', async () => {
    const db = createFreshDatabase();
    db.getFirstAsync.mockImplementation(async (sql: string) => {
      if (sql === 'PRAGMA user_version') return { user_version: 0 };
      if (sql.includes('COUNT(*)')) return { count: 0 };
      if (sql.includes('tier_order = ?')) return null;
      return null;
    });
    await expect(runMigrations(db as never)).resolves.toBeUndefined();
    expect(db.execAsync.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO users (username"))).toBe(true);
  });

  test('runs the tier refresh when v3 finds no canonical tier rows', async () => {
    const db = createFreshDatabase();
    db.getFirstAsync.mockImplementation(async (sql: string) => {
      if (sql === 'PRAGMA user_version') return { user_version: 2 };
      if (sql.includes("rank_name='Delulu'")) return { count: 0 };
      if (sql.includes('tier_order = ?')) return null;
      if (sql.includes('COUNT(*)')) return { count: 1 };
      return null;
    });
    await expect(runMigrations(db as never)).resolves.toBeUndefined();
    expect(db.execAsync.mock.calls.some(([sql]) => String(sql).includes('DELETE FROM tiers WHERE tier_order > 7'))).toBe(true);
  });

  test('updates existing rows in the v13 and v22 tier migrations', async () => {
    const db = createFreshDatabase();
    (db.getFirstAsync as jest.Mock).mockImplementation(async (sql: string) => {
      if (sql === 'PRAGMA user_version') return { user_version: 12 };
      if (sql.includes('tier_order = ?')) return { id: 77 };
      return null;
    });
    await expect(runMigrations(db as never)).resolves.toBeUndefined();
    expect(db.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE tiers'),
      expect.any(Array),
    );
    expect(db.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE tiers SET stars_required'),
      [2560, 'Cosmic', 2000000, 77],
    );
  });

  test('defaults a missing user_version to the initial migration', async () => {
    const db = createFreshDatabase();
    db.getFirstAsync.mockImplementation(async (sql: string) => {
      if (sql === 'PRAGMA user_version') return null;
      if (sql.includes('COUNT(*)')) return { count: 1 };
      return null;
    });
    await expect(runMigrations(db as never)).resolves.toBeUndefined();
    expect(db.execAsync).toHaveBeenCalledWith('PRAGMA user_version = 35');
  });

  test('repairs v27 challenge dates defensively and supports old adapters without transactions', async () => {
    const db = createFreshDatabase();
    db.getFirstAsync.mockImplementation(async (sql: string) => (
      sql === 'PRAGMA user_version' ? { user_version: 27 } : null
    ));
    db.getAllAsync.mockResolvedValue([
      { id: 1, start_date: '2026-08-21', created_at: 'not-a-date' },
      { id: 2, start_date: '2026-08-20', created_at: '2026-08-21T12:00:00Z' },
      { id: 3, start_date: '2026-08-21', created_at: '2026-08-21 12:00:00Z' },
    ] as never);
    (db as { withTransactionAsync?: unknown }).withTransactionAsync = undefined;
    await expect(runMigrations(db as never)).resolves.toBeUndefined();
    expect(db.execAsync).toHaveBeenCalledWith('PRAGMA user_version = 28');
    expect(db.execAsync).toHaveBeenCalledWith('PRAGMA user_version = 29');
    expect(db.execAsync).toHaveBeenCalledWith('PRAGMA user_version = 35');
    expect(db.runAsync).not.toHaveBeenCalledWith(expect.stringContaining('UPDATE challenges SET start_date'), expect.anything());
  });
});
