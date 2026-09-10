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

  expect(db.runAsync).not.toHaveBeenCalledWith(
    'ALTER TABLE users ADD COLUMN lifetime_stars REAL NOT NULL DEFAULT 0',
  );
  expect(db.runAsync).not.toHaveBeenCalledWith(
    'ALTER TABLE users ADD COLUMN current_tier_id INTEGER',
  );
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

test('adds indexes for bounded account-restore presence probes', async () => {
  const db = {
    getFirstAsync: jest.fn(async (sql: string) => {
      if (sql === 'PRAGMA user_version') return { user_version: 28 };
      if (sql.includes('COUNT(*) AS count')) return { count: 0 };
      return null;
    }),
    getAllAsync: jest.fn(async (sql: string) => (
      sql.startsWith('PRAGMA table_info(users)')
        ? [{ name: 'id' }, { name: 'lifetime_stars' }, { name: 'current_tier_id' }]
        : []
    )),
    runAsync: jest.fn().mockResolvedValue({}),
    execAsync: jest.fn().mockResolvedValue(undefined),
    withTransactionAsync: jest.fn(async (callback: () => Promise<void>) => callback()),
  };

  await runMigrations(db as never);

  expect(db.execAsync).toHaveBeenCalledWith(expect.stringContaining(
    'CREATE INDEX IF NOT EXISTS idx_categories_user_name ON categories(user_id, name);',
  ));
  expect(db.execAsync).toHaveBeenCalledWith(expect.stringContaining(
    'CREATE INDEX IF NOT EXISTS idx_treat_history_user ON treat_history(user_id);',
  ));
  expect(db.execAsync).toHaveBeenCalledWith(expect.stringContaining(
    'CREATE INDEX IF NOT EXISTS idx_milestone_stars_user ON milestone_stars(user_id);',
  ));
});

test('adds the account-scoped pending activity delete outbox for v29 databases', async () => {
  const db = {
    getFirstAsync: jest.fn(async (sql: string) => {
      if (sql === 'PRAGMA user_version') return { user_version: 29 };
      if (sql.includes('COUNT(*) AS count')) return { count: 0 };
      return null;
    }),
    getAllAsync: jest.fn(async (sql: string) => (
      sql.startsWith('PRAGMA table_info(users)')
        ? [{ name: 'id' }, { name: 'lifetime_stars' }, { name: 'current_tier_id' }]
        : []
    )),
    runAsync: jest.fn().mockResolvedValue({}),
    execAsync: jest.fn().mockResolvedValue(undefined),
    withTransactionAsync: jest.fn(async (callback: () => Promise<void>) => callback()),
  };

  await runMigrations(db as never);

  expect(db.runAsync).toHaveBeenCalledWith(
    'ALTER TABLE users ADD COLUMN account_key TEXT',
  );
  expect(db.withTransactionAsync).toHaveBeenCalledTimes(4);
  expect(db.execAsync).toHaveBeenCalledWith(expect.stringContaining(
    'CREATE TABLE IF NOT EXISTS pending_activity_deletes',
  ));
  expect(db.execAsync).toHaveBeenCalledWith(expect.stringContaining(
    'PRIMARY KEY (account_key, local_activity_id)',
  ));
  expect(db.execAsync).toHaveBeenCalledWith(expect.stringContaining(
    'local_activity_id INTEGER NOT NULL CHECK (local_activity_id > 0)',
  ));
  expect(db.execAsync).toHaveBeenCalledWith(expect.stringContaining(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_users_account_key',
  ));
  expect(db.execAsync.mock.calls.some(([sql]) => (
    /CREATE INDEX IF NOT EXISTS idx_pending_activity_deletes_drain\s+ON pending_activity_deletes\(account_key, created_at, local_activity_id\)/
      .test(String(sql))
  ))).toBe(true);
  expect(db.execAsync).toHaveBeenCalledWith('PRAGMA user_version = 35');
});

test('does not advance v30 when the atomic schema transaction fails', async () => {
  const db = {
    getFirstAsync: jest.fn(async (sql: string) => (
      sql === 'PRAGMA user_version' ? { user_version: 29 } : null
    )),
    getAllAsync: jest.fn().mockResolvedValue([]),
    runAsync: jest.fn().mockResolvedValue({}),
    execAsync: jest.fn(async (sql: string) => {
      if (sql.includes('CREATE TABLE IF NOT EXISTS pending_activity_deletes')) {
        throw new Error('SQLITE_FULL');
      }
    }),
    withTransactionAsync: jest.fn(async (callback: () => Promise<void>) => callback()),
  };

  await expect(runMigrations(db as never)).rejects.toThrow('SQLITE_FULL');
  expect(db.withTransactionAsync).toHaveBeenCalledTimes(1);
  expect(db.execAsync).not.toHaveBeenCalledWith('PRAGMA user_version = 30');
});

test('reconciles an auth-only v30 database before full outbox sync', async () => {
  const db = {
    getFirstAsync: jest.fn(async (sql: string) => {
      if (sql === 'PRAGMA user_version') return { user_version: 30 };
      if (sql.includes('COUNT(*) AS count')) return { count: 0 };
      return null;
    }),
    getAllAsync: jest.fn(async (sql: string) => (
      sql.startsWith('PRAGMA table_info(users)')
        ? [{ name: 'id' }, { name: 'account_key' }, { name: 'lifetime_stars' }, { name: 'current_tier_id' }]
        : []
    )),
    runAsync: jest.fn().mockResolvedValue({}),
    execAsync: jest.fn().mockResolvedValue(undefined),
    withTransactionAsync: jest.fn(async (callback: () => Promise<void>) => callback()),
  };

  await runMigrations(db as never);

  expect(db.withTransactionAsync).toHaveBeenCalledTimes(4);
  expect(db.execAsync).toHaveBeenCalledWith(expect.stringContaining(
    'CREATE TABLE IF NOT EXISTS pending_activity_deletes',
  ));
  expect(db.execAsync).toHaveBeenCalledWith(expect.stringContaining(
    'CREATE INDEX IF NOT EXISTS idx_pending_activity_deletes_drain',
  ));
  expect(db.execAsync).toHaveBeenCalledWith('PRAGMA user_version = 35');
});

test('does not shift an active Challenge whose stored date is not the legacy creation date', async () => {
  const db = {
    getFirstAsync: jest.fn(async (sql: string) => {
      if (sql === 'PRAGMA user_version') return { user_version: 27 };
      if (sql.includes('COUNT(*) AS count')) return { count: 0 };
      return null;
    }),
    getAllAsync: jest.fn(async (sql: string) => {
      if (sql.startsWith('PRAGMA table_info(users)')) {
        return [{ name: 'id' }, { name: 'lifetime_stars' }, { name: 'current_tier_id' }];
      }
      if (sql.includes('SELECT id, start_date, created_at FROM challenges')) {
        return [{ id: 9, start_date: '2026-08-18', created_at: '2026-08-19 12:00:00' }];
      }
      return [];
    }),
    runAsync: jest.fn().mockResolvedValue({}),
    execAsync: jest.fn().mockResolvedValue(undefined),
    withTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
  };

  await runMigrations(db as never);

  expect(db.getAllAsync).toHaveBeenCalledWith(
    expect.stringContaining('SELECT id, start_date, created_at FROM challenges'),
    ['active'],
  );
  expect(db.runAsync).not.toHaveBeenCalledWith(
    expect.stringContaining('UPDATE challenges SET start_date'),
    expect.anything(),
  );
});
