import { runMigrations } from '../src/db/migrations';

test('repairs lifetime rank columns when the recorded schema version is already ahead', async () => {
  const db = {
    getFirstAsync: jest.fn(),
    getAllAsync: jest.fn(),
    runAsync: jest.fn().mockResolvedValue({}),
    execAsync: jest.fn().mockResolvedValue(undefined),
  };

  db.getFirstAsync.mockImplementation(async (sql: string) => {
    if (sql === 'PRAGMA user_version') return { user_version: 26 };
    if (sql.includes('SUM(CASE')) return { total: 7 };
    return null;
  });
  db.getAllAsync.mockImplementation(async (sql: string) => {
    if (sql.startsWith('PRAGMA table_info(users)')) {
      return [{ name: 'id' }, { name: 'google_sub' }, { name: 'treat_stars_lifetime' }];
    }
    if (sql.includes('SELECT id, lifetime_stars FROM users')) return [{ id: 1, lifetime_stars: 0 }];
    if (sql.includes('SELECT id, tier_order, stars_required')) return [{ id: 1, tier_order: 1, stars_required: 5 }];
    return [];
  });

  await runMigrations(db as never);

  expect(db.runAsync).toHaveBeenCalledWith(
    'ALTER TABLE users ADD COLUMN lifetime_stars REAL NOT NULL DEFAULT 0',
  );
  expect(db.runAsync).toHaveBeenCalledWith('ALTER TABLE users ADD COLUMN current_tier_id INTEGER');
  expect(db.runAsync).toHaveBeenCalledWith(
    'UPDATE users SET lifetime_stars = ?, current_tier_id = ? WHERE id = ?',
    [7, 1, 1],
  );
});

test('preserves an existing lifetime high-water mark during a partial repair', async () => {
  const db = {
    getFirstAsync: jest.fn(),
    getAllAsync: jest.fn(),
    runAsync: jest.fn().mockResolvedValue({}),
    execAsync: jest.fn().mockResolvedValue(undefined),
  };

  db.getFirstAsync.mockImplementation(async (sql: string) => {
    if (sql === 'PRAGMA user_version') return { user_version: 26 };
    if (sql.includes('SUM(CASE')) return { total: 7 };
    return null;
  });
  db.getAllAsync.mockImplementation(async (sql: string) => {
    if (sql.startsWith('PRAGMA table_info(users)')) {
      return [{ name: 'id' }, { name: 'lifetime_stars' }];
    }
    if (sql.includes('SELECT id, lifetime_stars FROM users')) return [{ id: 1, lifetime_stars: 9 }];
    if (sql.includes('SELECT id, tier_order, stars_required')) return [{ id: 1, tier_order: 1, stars_required: 5 }];
    return [];
  });

  await runMigrations(db as never);

  expect(db.runAsync).toHaveBeenCalledWith('ALTER TABLE users ADD COLUMN current_tier_id INTEGER');
  expect(db.runAsync).toHaveBeenCalledWith(
    'UPDATE users SET lifetime_stars = ?, current_tier_id = ? WHERE id = ?',
    [9, 1, 1],
  );
});

test('does not perform a repair when the schema and lifetime rollup are already complete', async () => {
  const db = {
    getFirstAsync: jest.fn(async (sql: string) => {
      if (sql === 'PRAGMA user_version') return { user_version: 27 };
      if (sql.includes('COUNT(*) AS count')) return { count: 0 };
      return null;
    }),
    getAllAsync: jest.fn(async (sql: string) => {
      if (sql.startsWith('PRAGMA table_info(users)')) return [{ name: 'id' }, { name: 'lifetime_stars' }, { name: 'current_tier_id' }];
      return [];
    }),
    runAsync: jest.fn().mockResolvedValue({}),
    execAsync: jest.fn().mockResolvedValue(undefined),
  };

  await runMigrations(db as never);

  expect(db.runAsync).not.toHaveBeenCalled();
});

test('removes the one-active challenge constraint for existing databases', async () => {
  const db = {
    getFirstAsync: jest.fn(async (sql: string) => {
      if (sql === 'PRAGMA user_version') return { user_version: 25 };
      if (sql.includes('COUNT(*) AS count')) return { count: 0 };
      return null;
    }),
    getAllAsync: jest.fn(async (sql: string) => {
      if (sql.startsWith('PRAGMA table_info(users)')) {
        return [{ name: 'id' }, { name: 'lifetime_stars' }, { name: 'current_tier_id' }];
      }
      return [];
    }),
    runAsync: jest.fn().mockResolvedValue({}),
    execAsync: jest.fn().mockResolvedValue(undefined),
  };

  await runMigrations(db as never);

  expect(db.runAsync).toHaveBeenCalledWith('DROP INDEX IF EXISTS idx_challenges_one_active');
  expect(db.runAsync).toHaveBeenCalledWith(
    'CREATE INDEX IF NOT EXISTS idx_challenges_user_status ON challenges(user_id, status)',
  );
});

test('repairs the legacy challenge index when a prior migration already advanced the version', async () => {
  const db = {
    getFirstAsync: jest.fn(async (sql: string) => {
      if (sql === 'PRAGMA user_version') return { user_version: 26 };
      if (sql.includes('COUNT(*) AS count')) return { count: 0 };
      return null;
    }),
    getAllAsync: jest.fn(async (sql: string) => {
      if (sql.startsWith('PRAGMA table_info(users)')) {
        return [{ name: 'id' }, { name: 'lifetime_stars' }, { name: 'current_tier_id' }];
      }
      return [];
    }),
    runAsync: jest.fn().mockResolvedValue({}),
    execAsync: jest.fn().mockResolvedValue(undefined),
  };

  await runMigrations(db as never);

  expect(db.runAsync).toHaveBeenCalledWith('DROP INDEX IF EXISTS idx_challenges_one_active');
  expect(db.runAsync).toHaveBeenCalledWith(
    'CREATE INDEX IF NOT EXISTS idx_challenges_user_status ON challenges(user_id, status)',
  );
});
