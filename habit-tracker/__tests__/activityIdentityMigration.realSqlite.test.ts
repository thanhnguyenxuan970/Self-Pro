import { runMigrations } from '../src/db/migrations';
const { mkdtempSync, rmSync } = jest.requireActual<{
  mkdtempSync: (prefix: string) => string;
  rmSync: (path: string, options: { recursive: boolean; force: boolean }) => void;
}>('node:fs');
const { tmpdir } = jest.requireActual<{ tmpdir: () => string }>('node:os');
const { join } = jest.requireActual<{ join: (...parts: string[]) => string }>('node:path');

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

function createV29Database(path = ':memory:') {
  const native = new DatabaseSync(path);
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

  try {
    await runMigrations(api as never);

    expect(native.prepare('PRAGMA user_version').get()).toEqual({ user_version: 35 });
    const activityColumns = native.prepare('PRAGMA table_info(activity_log)').all() as Array<{ name: string }>;
    expect(activityColumns.map(column => column.name)).toEqual(expect.arrayContaining([
      'activity_key',
      'activity_identity_status',
      'activity_source_task_type_id',
    ]));
    expect(native.prepare(`
      SELECT id, user_id, task_type_id, kind, duration_min, points_earned, stars_delta,
             source, logged_at, local_date, week_start, note,
             activity_key, activity_identity_status, activity_source_task_type_id
      FROM activity_log
    `).all()).toEqual([{
      id: 42,
      user_id: 1,
      task_type_id: null,
      kind: 'GOOD',
      duration_min: null,
      points_earned: 5,
      stars_delta: 2,
      source: 'TASK',
      logged_at: 100,
      local_date: '2026-09-01',
      week_start: '2026-08-31',
      note: 'legacy row',
      activity_key: null,
      activity_identity_status: 'unresolved',
      activity_source_task_type_id: null,
    }]);

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
  } finally {
    native.close();
  }
});

test('retains upgraded rows and durable delete intents across 20 database restarts', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'habi-recovery-sqlite-'));
  const path = join(directory, 'activity.sqlite');
  let open: NativeDatabase | undefined;
  try {
    const { native, api } = createV29Database(path);
    open = native;
    await runMigrations(api as never);
    native.prepare('UPDATE users SET account_key = ? WHERE id = 1').run('legacy@example.com');
    const baseline = native.prepare('SELECT * FROM activity_log WHERE id = 42').get();
    native.close();
    open = undefined;
    for (let cycle = 0; cycle < 20; cycle++) {
      open = new DatabaseSync(path);
      expect(open.prepare('PRAGMA user_version').get()).toEqual({ user_version: 35 });
      expect(open.prepare('SELECT * FROM activity_log WHERE id = 42').get()).toEqual(baseline);
      // A failed delete transaction must roll back both the row and trigger outbox.
      open.exec('BEGIN; DELETE FROM activity_log WHERE id = 42; ROLLBACK;');
      expect(open.prepare('SELECT COUNT(*) AS n FROM pending_activity_deletes').get()).toEqual({ n: 0 });
      open.close();
      open = undefined;
    }
    open = new DatabaseSync(path);
    open.exec('BEGIN; DELETE FROM activity_log WHERE id = 42; COMMIT;');
    const pending = open.prepare('SELECT * FROM pending_activity_deletes').all();
    expect(pending).toHaveLength(1);
    open.close();
    open = undefined;
    for (let cycle = 0; cycle < 20; cycle++) {
      open = new DatabaseSync(path);
      expect(open.prepare('SELECT * FROM pending_activity_deletes').all()).toEqual(pending);
      expect(open.prepare('SELECT COUNT(*) AS n FROM activity_log').get()).toEqual({ n: 0 });
      open.close();
      open = undefined;
    }
  } finally {
    open?.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
