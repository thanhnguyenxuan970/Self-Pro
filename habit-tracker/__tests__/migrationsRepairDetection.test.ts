import { runMigrations } from '../src/db/migrations';

// Covers the branch existing coverage in migrations.test.ts skips: schema
// columns are already present (so the ALTER TABLE branch never fires) and the
// recorded schema version is already current, but the COALESCE probe still
// finds a user whose lifetime_stars/current_tier_id lag activity_log —
// e.g. a device interrupted between committing the ALTER TABLE and running
// its one-time backfill in an earlier app version. runMigrations must still
// repair that user rather than trusting the version number alone.

function createDb(config: {
  userLifetimeStars: number;
  activityTotal: number;
  incompleteCount: number;
  currentTierId?: number | null;
}) {
  const runAsync = jest.fn(async (sql: string) => {
    // A real SQLite connection rejects ADD COLUMN when the column already
    // exists.  The production helper deliberately catches that duplicate
    // error so the auth-only-v30 reconciliation remains idempotent.  Model
    // that behavior here instead of letting the double silently accept an
    // ALTER and making the assertion observe a fake schema mutation.
    if (sql === 'ALTER TABLE users ADD COLUMN account_key TEXT') {
      throw new Error('duplicate column name: account_key');
    }
    return {};
  });
  const getFirstAsync = jest.fn(async (sql: string) => {
    if (sql === 'PRAGMA user_version') return { user_version: 30 };
    if (sql.includes('COUNT(*) AS count')) {
      return { count: config.currentTierId == null ? config.incompleteCount : 0 };
    }
    if (sql.includes('SUM(CASE')) return { total: config.activityTotal };
    return null;
  });
  const getAllAsync = jest.fn(async (sql: string) => {
    if (sql.startsWith('PRAGMA table_info(users)')) {
      // Rank and account-key columns already exist -- no migration branch may fire.
      return [
        { name: 'id' },
        { name: 'lifetime_stars' },
        { name: 'current_tier_id' },
        { name: 'account_key' },
      ];
    }
    if (sql.includes('SELECT id, lifetime_stars FROM users')) {
      return [{ id: 5, lifetime_stars: config.userLifetimeStars }];
    }
    if (sql.includes('SELECT id, tier_order, stars_required')) {
      return [{ id: 2, tier_order: 1, stars_required: 10 }];
    }
    return [];
  });
  const execAsync = jest.fn().mockResolvedValue(undefined);
  return { getFirstAsync, getAllAsync, runAsync, execAsync };
}

test('repairs a user whose recorded lifetime total lags activity_log even though the schema version and columns are already current', async () => {
  const db = createDb({ userLifetimeStars: 3, activityTotal: 12, incompleteCount: 1 });

  await runMigrations(db as never);

  // The full build reconciles auth-only v30 by attempting the account-key
  // ADD COLUMN and handling SQLite's duplicate-column error. No rank-column
  // ALTER is allowed when those columns are already present.
  expect(db.runAsync).toHaveBeenCalledWith('ALTER TABLE users ADD COLUMN account_key TEXT');
  expect(db.runAsync).not.toHaveBeenCalledWith(
    'ALTER TABLE users ADD COLUMN lifetime_stars REAL NOT NULL DEFAULT 0',
  );
  expect(db.runAsync).not.toHaveBeenCalledWith(
    'ALTER TABLE users ADD COLUMN current_tier_id INTEGER',
  );
  // Repairs the lagging total up to the activity_log-derived value.
  expect(db.runAsync).toHaveBeenCalledWith(
    'UPDATE users SET lifetime_stars = ?, current_tier_id = ? WHERE id = ?',
    [12, 2, 5],
  );
});

test('does not scan or rewrite any user when the incomplete-row probe reports zero, even at a stale-looking lifetime total', async () => {
  const db = createDb({ userLifetimeStars: 3, activityTotal: 12, incompleteCount: 0 });

  await runMigrations(db as never);

  // Reconciliation still probes the auth-only account-key column; it must
  // not rewrite any rank/user row when the incomplete-row probe is empty.
  expect(db.runAsync).toHaveBeenCalledWith('ALTER TABLE users ADD COLUMN account_key TEXT');
  expect(db.runAsync).not.toHaveBeenCalledWith(
    'UPDATE users SET lifetime_stars = ?, current_tier_id = ? WHERE id = ?',
    expect.anything(),
  );
  expect(db.getAllAsync).not.toHaveBeenCalledWith(
    'SELECT id, lifetime_stars FROM users',
  );
});

test('does not mistake a server-adjusted activity mirror for an incomplete local rank migration', async () => {
  const db = createDb({
    userLifetimeStars: 260,
    activityTotal: 450,
    incompleteCount: 1,
    currentTierId: 6,
  });

  await runMigrations(db as never);

  const probe = db.getFirstAsync.mock.calls.find(([sql]) => String(sql).includes('COUNT(*) AS count'))?.[0];
  expect(probe).toEqual(expect.stringContaining('u.current_tier_id IS NULL'));
  expect(db.runAsync).not.toHaveBeenCalledWith(
    'UPDATE users SET lifetime_stars = ?, current_tier_id = ? WHERE id = ?',
    expect.anything(),
  );
  expect(db.getAllAsync).not.toHaveBeenCalledWith(
    'SELECT id, lifetime_stars FROM users',
  );
});
