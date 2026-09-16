import {
  restoreUserDataBackup,
  type CloudBackupPayload,
} from '../src/lib/userDataBackup';

type SqliteRow = Record<string, unknown>;
type NativeStatement = {
  run: (...params: unknown[]) => { changes: number };
  all: (...params: unknown[]) => unknown[];
  get: (...params: unknown[]) => unknown;
};
type NativeDatabase = {
  prepare: (sql: string) => NativeStatement;
  exec: (sql: string) => void;
  close: () => void;
};
type RealDbApi = {
  runAsync: (sql: string, params?: unknown[]) => Promise<{ changes: number }>;
  getAllAsync: <T extends SqliteRow>(sql: string, params?: unknown[]) => Promise<T[]>;
  getFirstAsync: <T extends SqliteRow>(sql: string, params?: unknown[]) => Promise<T | null>;
  withExclusiveTransactionAsync: (task: (transactionDb: RealDbApi) => Promise<void>) => Promise<void>;
};

const { DatabaseSync } = jest.requireActual<{
  DatabaseSync: new (path: string) => NativeDatabase;
}>('node:sqlite');

function createRealSqliteDb() {
  const native = new DatabaseSync(':memory:');
  let api!: RealDbApi;
  api = {
    runAsync: async (sql: string, params: unknown[] = []) => {
      const result = native.prepare(sql).run(...params);
      return { changes: Number(result.changes) };
    },
    getAllAsync: async <T extends SqliteRow>(sql: string, params: unknown[] = []) => (
      native.prepare(sql).all(...params) as unknown as T[]
    ),
    getFirstAsync: async <T extends SqliteRow>(sql: string, params: unknown[] = []) => (
      native.prepare(sql).get(...params) as unknown as T | null
    ),
    withExclusiveTransactionAsync: async (task: (transactionDb: RealDbApi) => Promise<void>) => {
      native.exec('BEGIN IMMEDIATE');
      try {
        await task(api);
        native.exec('COMMIT');
      } catch (error) {
        native.exec('ROLLBACK');
        throw error;
      }
    },
  };
  return { native, api };
}

const payload = (): CloudBackupPayload => ({
  schema_version: 1,
  user: null,
  categories: [],
  task_types: [],
  activity_log: [{
    id: 7,
    task_type_id: null,
    kind: 'GOOD',
    duration_min: null,
    points_earned: 5,
    stars_delta: 1,
    source: 'TASK',
    logged_at: 100,
    local_date: '2026-09-01',
    week_start: '2026-08-31',
    note: null,
    activity_key: 'restored-key',
    activity_identity_status: 'resolved',
    is_backfill: 0,
    is_clock_suspect: 0,
  }],
  daily_summary: [],
  weekly_summary: [],
  reward_unlocks: [],
  fund_transactions: [],
  streak_freezes: [],
  treats: [],
  treat_history: [],
  challenges: [],
  challenge_log: [],
  challenge_days: [],
  achievements: [],
  milestone_stars: [],
  boost_events: [],
});

test('restore replacement deletes do not enqueue cloud deletes, while real deletes still do', async () => {
  const { native, api } = createRealSqliteDb();
  native.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY, account_key TEXT);
    CREATE TABLE activity_log (
      id INTEGER PRIMARY KEY, user_id INTEGER, task_type_id INTEGER,
      kind TEXT, duration_min INTEGER, points_earned INTEGER, stars_delta INTEGER,
      source TEXT, logged_at INTEGER, local_date TEXT, week_start TEXT, note TEXT,
      activity_key TEXT, activity_identity_status TEXT,
      activity_source_task_type_id INTEGER, is_backfill INTEGER,
      is_clock_suspect INTEGER
    );
    CREATE TABLE categories (id INTEGER PRIMARY KEY, user_id INTEGER, name TEXT, icon TEXT, sort_order INTEGER, archived INTEGER);
    CREATE TABLE task_types (id INTEGER PRIMARY KEY, user_id INTEGER, name TEXT, kind TEXT, is_time_based INTEGER, base_points INTEGER, star_penalty INTEGER, category_id INTEGER, icon TEXT, archived INTEGER, sort_order INTEGER, is_pinned INTEGER, is_template INTEGER);
    CREATE TABLE daily_summary (id INTEGER PRIMARY KEY, user_id INTEGER, local_date TEXT, total_points INTEGER, bonus_star_awarded INTEGER, streak_count INTEGER);
    CREATE TABLE weekly_summary (id INTEGER PRIMARY KEY, user_id INTEGER, week_start TEXT, total_points INTEGER, weekly_stars INTEGER, peak_stars INTEGER, current_tier_id INTEGER, start_debt INTEGER, finalized INTEGER);
    CREATE TABLE reward_unlocks (id INTEGER PRIMARY KEY, user_id INTEGER, tier_id INTEGER, week_start TEXT, stars_at_unlock INTEGER, reward_amount INTEGER, claimed INTEGER, claimed_at INTEGER);
    CREATE TABLE fund_transactions (id INTEGER PRIMARY KEY, user_id INTEGER, type TEXT, amount INTEGER, currency TEXT, source_unlock_id INTEGER, note TEXT, occurred_at INTEGER);
    CREATE TABLE streak_freezes (id INTEGER PRIMARY KEY, user_id INTEGER, local_date TEXT, purchased_at INTEGER);
    CREATE TABLE treats (id INTEGER PRIMARY KEY, user_id INTEGER, name TEXT, icon TEXT, target_stars INTEGER, approx_amount INTEGER, currency TEXT, status TEXT, sort_order INTEGER, reached_at TEXT, enjoyed_at TEXT, created_at TEXT);
    CREATE TABLE treat_history (id INTEGER PRIMARY KEY, user_id INTEGER, treat_id INTEGER, name TEXT, stars_spent INTEGER, amount INTEGER, currency TEXT, enjoyed_at TEXT);
    CREATE TABLE challenges (id INTEGER PRIMARY KEY, user_id INTEGER, name TEXT, task_type_id INTEGER);
    CREATE TABLE challenge_log (id INTEGER PRIMARY KEY, challenge_id INTEGER, local_date TEXT, state TEXT);
    CREATE TABLE challenge_days (id INTEGER PRIMARY KEY, challenge_id INTEGER, local_date TEXT, logged_at INTEGER);
    CREATE TABLE achievements (id INTEGER PRIMARY KEY, user_id INTEGER, key TEXT, rarity TEXT, earned_at TEXT, source_type TEXT, source_id INTEGER);
    CREATE TABLE milestone_stars (id INTEGER PRIMARY KEY, user_id INTEGER, milestone_days INTEGER, stars INTEGER, awarded_at INTEGER);
    CREATE TABLE boost_events (id INTEGER PRIMARY KEY, user_id INTEGER, local_date TEXT, multiplier INTEGER, claim_deadline INTEGER, claimed_at INTEGER, expires_at INTEGER, dismissed_at INTEGER, created_at INTEGER);
    CREATE TABLE pending_activity_deletes (
      account_key TEXT NOT NULL, local_activity_id INTEGER NOT NULL,
      activity_key TEXT, created_at INTEGER NOT NULL,
      PRIMARY KEY (account_key, local_activity_id)
    );
    CREATE TABLE activity_restore_suppression (user_id INTEGER PRIMARY KEY);

    CREATE TRIGGER trg_activity_log_enqueue_delete
    AFTER DELETE ON activity_log
    WHEN EXISTS (
      SELECT 1 FROM users
       WHERE users.id = OLD.user_id
         AND users.account_key IS NOT NULL
         AND length(trim(users.account_key)) > 0
    )
    AND NOT EXISTS (
      SELECT 1 FROM activity_restore_suppression
       WHERE activity_restore_suppression.user_id = OLD.user_id
    )
    BEGIN
      INSERT OR IGNORE INTO pending_activity_deletes
        (account_key, local_activity_id, activity_key, created_at)
      SELECT users.account_key, OLD.id, NULLIF(trim(OLD.activity_key), ''), 1
        FROM users
       WHERE users.id = OLD.user_id;
    END;

    INSERT INTO users (id, account_key) VALUES (1, 'account@example.com');
    INSERT INTO activity_log
      (id, user_id, kind, points_earned, stars_delta, source, logged_at,
       local_date, week_start, activity_key, activity_identity_status)
    VALUES (7, 1, 'GOOD', 3, 1, 'TASK', 90, '2026-09-01', '2026-08-31', 'old-key', 'resolved');
    INSERT INTO pending_activity_deletes
      (account_key, local_activity_id, activity_key, created_at)
    VALUES
      ('account@example.com', 7, 'restored-key', 1),
      ('account@example.com', 99, 'unrelated-key', 1),
      ('account@example.com', 100, NULL, 1);
  `);

  await expect(restoreUserDataBackup(api as never, 1, payload()))
    .rejects.toThrow('Restore blocked: snapshot contains an activity with a pending user delete');

  expect(native.prepare('SELECT id, activity_key FROM activity_log').all()).toEqual([
    expect.objectContaining({ id: 7, activity_key: 'old-key' }),
  ]);
  expect(native.prepare(
    'SELECT local_activity_id, activity_key FROM pending_activity_deletes ORDER BY local_activity_id',
  ).all()).toEqual([
    expect.objectContaining({ local_activity_id: 7, activity_key: 'restored-key' }),
    expect.objectContaining({ local_activity_id: 99, activity_key: 'unrelated-key' }),
    expect.objectContaining({ local_activity_id: 100, activity_key: null }),
  ]);
  expect(native.prepare('SELECT COUNT(*) AS count FROM activity_restore_suppression').get())
    .toEqual(expect.objectContaining({ count: 0 }));

  // An explicit reconciliation removes the user's pending delete intent;
  // only then is replacement restore allowed to suppress its own trigger.
  await api.runAsync(
    'DELETE FROM pending_activity_deletes WHERE activity_key = ?',
    ['restored-key'],
  );

  native.exec(`
    CREATE TRIGGER fail_restore_insert
    BEFORE INSERT ON activity_log
    WHEN NEW.activity_key = 'restored-key'
    BEGIN
      SELECT RAISE(ABORT, 'restore insert failure');
    END;
  `);
  await expect(restoreUserDataBackup(api as never, 1, payload()))
    .rejects.toThrow('restore insert failure');
  expect(native.prepare('SELECT id, activity_key FROM activity_log').all()).toEqual([
    expect.objectContaining({ id: 7, activity_key: 'old-key' }),
  ]);
  expect(native.prepare('SELECT COUNT(*) AS count FROM activity_restore_suppression').get())
    .toEqual(expect.objectContaining({ count: 0 }));
  native.exec('DROP TRIGGER fail_restore_insert');

  await restoreUserDataBackup(api as never, 1, payload());

  expect(native.prepare('SELECT id, activity_key FROM activity_log').all()).toEqual([
    expect.objectContaining({ id: 7, activity_key: 'restored-key' }),
  ]);
  expect(native.prepare(
    'SELECT local_activity_id, activity_key FROM pending_activity_deletes ORDER BY local_activity_id',
  ).all()).toEqual([
    expect.objectContaining({ local_activity_id: 99, activity_key: 'unrelated-key' }),
    expect.objectContaining({ local_activity_id: 100, activity_key: null }),
  ]);
  expect(native.prepare('SELECT COUNT(*) AS count FROM activity_restore_suppression').get())
    .toEqual(expect.objectContaining({ count: 0 }));

  await api.runAsync(
    `INSERT INTO activity_log
      (id, user_id, kind, points_earned, stars_delta, source, logged_at,
       local_date, week_start, activity_key, activity_identity_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [101, 1, 'GOOD', 1, 1, 'TASK', 101, '2026-09-02', '2026-08-31', 'later-key', 'resolved'],
  );
  await api.runAsync('DELETE FROM activity_log WHERE id = ?', [101]);

  expect(native.prepare(
    'SELECT local_activity_id, activity_key FROM pending_activity_deletes WHERE local_activity_id = 101',
  ).get()).toEqual(expect.objectContaining({ local_activity_id: 101, activity_key: 'later-key' }));
  native.close();
});
