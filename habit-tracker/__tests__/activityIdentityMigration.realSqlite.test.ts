import { runMigrations } from '../src/db/migrations';

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
  execAsync: (sql: string) => Promise<void>;
  runAsync: (sql: string, params?: unknown[]) => Promise<{ changes: number }>;
  getAllAsync: <T>(sql: string, params?: unknown[]) => Promise<T[]>;
  getFirstAsync: <T>(sql: string, params?: unknown[]) => Promise<T | null>;
  withTransactionAsync: (task: () => Promise<void>) => Promise<void>;
};

const { DatabaseSync } = jest.requireActual<{
  DatabaseSync: new (path: string) => NativeDatabase;
}>('node:sqlite');

function createV29Database() {
  const native = new DatabaseSync(':memory:');
  let api!: RealDbApi;
  api = {
    execAsync: async (sql: string) => {
      native.exec(sql);
    },
    runAsync: async (sql: string, params: unknown[] = []) => {
      const result = native.prepare(sql).run(...params);
      return { changes: Number(result.changes) };
    },
    getAllAsync: async <T>(sql: string, params: unknown[] = []) => (
      native.prepare(sql).all(...params) as unknown as T[]
    ),
    getFirstAsync: async <T>(sql: string, params: unknown[] = []) => (
      native.prepare(sql).get(...params) as unknown as T | null
    ),
    withTransactionAsync: async (task: () => Promise<void>) => {
      native.exec('BEGIN');
      try {
        await task();
        native.exec('COMMIT');
      } catch (error) {
        native.exec('ROLLBACK');
        throw error;
      }
    },
  };

  native.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY,
      username TEXT NOT NULL,
      timezone TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
      carry_debt INTEGER NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'VND',
      lifetime_stars REAL NOT NULL DEFAULT 0,
      current_tier_id INTEGER
    );
    CREATE TABLE activity_log (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL,
      task_type_id INTEGER,
      kind TEXT NOT NULL,
      duration_min INTEGER,
      points_earned INTEGER NOT NULL DEFAULT 0,
      stars_delta REAL NOT NULL DEFAULT 0,
      source TEXT NOT NULL,
      logged_at INTEGER NOT NULL,
      local_date TEXT NOT NULL,
      week_start TEXT NOT NULL,
      note TEXT
    );
    CREATE TABLE tiers (
      id INTEGER PRIMARY KEY,
      tier_order INTEGER NOT NULL,
      stars_required REAL NOT NULL,
      rank_name TEXT NOT NULL
    );
    INSERT INTO users (id, username, lifetime_stars, current_tier_id)
      VALUES (1, 'legacy', 4, 1);
    INSERT INTO tiers (id, tier_order, stars_required, rank_name)
      VALUES (1, 1, 0, 'Seed');
    INSERT INTO activity_log
      (id, user_id, kind, points_earned, stars_delta, source,
       logged_at, local_date, week_start, note)
      VALUES (42, 1, 'GOOD', 5, 2, 'TASK', 100,
              '2026-09-01', '2026-08-31', 'legacy row');
    PRAGMA user_version = 29;
  `);

  return { native, api };
}

test('upgrades a v29 database without rewriting activity data and installs the outbox', async () => {
  const { native, api } = createV29Database();

  await runMigrations(api as never);

  expect(native.prepare('PRAGMA user_version').get()).toEqual({ user_version: 35 });
  const activityColumns = native.prepare('PRAGMA table_info(activity_log)').all() as Array<{ name: string }>;
  expect(activityColumns.map(column => column.name)).toEqual(expect.arrayContaining([
    'activity_key',
    'activity_identity_status',
    'activity_source_task_type_id',
  ]));
  expect(native.prepare('SELECT id, points_earned, activity_key, activity_identity_status FROM activity_log').all())
    .toEqual([expect.objectContaining({
      id: 42,
      points_earned: 5,
      activity_key: null,
      activity_identity_status: 'unresolved',
    })]);

  native.prepare('UPDATE users SET account_key = ? WHERE id = 1').run('legacy@example.com');
  native.prepare('DELETE FROM activity_log WHERE id = 42').run();
  expect(native.prepare(
    'SELECT account_key, local_activity_id, activity_key FROM pending_activity_deletes',
  ).all()).toEqual([expect.objectContaining({
    account_key: 'legacy@example.com',
    local_activity_id: 42,
    activity_key: null,
  })]);

  // A second startup must be idempotent and retain the delete intent.
  await runMigrations(api as never);
  expect(native.prepare('PRAGMA user_version').get()).toEqual({ user_version: 35 });
  expect(native.prepare('SELECT COUNT(*) AS count FROM pending_activity_deletes').get())
    .toEqual({ count: 1 });
  native.close();
});
