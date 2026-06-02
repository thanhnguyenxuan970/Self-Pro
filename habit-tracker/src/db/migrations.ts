import { SQLiteDatabase } from 'expo-sqlite';

export async function runMigrations(db: SQLiteDatabase) {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      timezone TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
      carry_debt INTEGER NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'VND'
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      icon TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      archived INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS task_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      kind TEXT NOT NULL,
      is_time_based INTEGER NOT NULL DEFAULT 0,
      base_points INTEGER NOT NULL DEFAULT 10,
      star_penalty INTEGER NOT NULL DEFAULT 50,
      category_id INTEGER,
      icon TEXT,
      archived INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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

    CREATE TABLE IF NOT EXISTS daily_summary (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      local_date TEXT NOT NULL,
      total_points INTEGER NOT NULL DEFAULT 0,
      bonus_star_awarded INTEGER NOT NULL DEFAULT 0,
      streak_count INTEGER NOT NULL DEFAULT 0,
      UNIQUE(user_id, local_date)
    );

    CREATE TABLE IF NOT EXISTS weekly_summary (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      week_start TEXT NOT NULL,
      total_points INTEGER NOT NULL DEFAULT 0,
      weekly_stars REAL NOT NULL DEFAULT 0,
      peak_stars REAL NOT NULL DEFAULT 0,
      current_tier_id INTEGER,
      start_debt REAL NOT NULL DEFAULT 0,
      finalized INTEGER NOT NULL DEFAULT 0,
      UNIQUE(user_id, week_start)
    );

    CREATE TABLE IF NOT EXISTS tiers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tier_order INTEGER NOT NULL,
      stars_required REAL NOT NULL,
      rank_name TEXT NOT NULL,
      reward_amount REAL NOT NULL,
      reward_currency TEXT NOT NULL DEFAULT 'VND'
    );

    CREATE TABLE IF NOT EXISTS reward_unlocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      tier_id INTEGER NOT NULL,
      week_start TEXT NOT NULL,
      stars_at_unlock REAL NOT NULL,
      reward_amount REAL NOT NULL,
      claimed INTEGER NOT NULL DEFAULT 0,
      claimed_at INTEGER,
      UNIQUE(user_id, tier_id, week_start)
    );

    CREATE TABLE IF NOT EXISTS fund_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'VND',
      source_unlock_id INTEGER,
      note TEXT,
      occurred_at INTEGER NOT NULL
    );
  `);

  // Day 4 / Day 9+ migrations: new user columns
  for (const sql of [
    `ALTER TABLE users ADD COLUMN last_seen_week_start TEXT`,
    `ALTER TABLE users ADD COLUMN notification_time TEXT`,
    `ALTER TABLE users ADD COLUMN google_sub TEXT`,
    `ALTER TABLE users ADD COLUMN treat_stars INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE users ADD COLUMN treat_stars_lifetime INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE users ADD COLUMN value_per_star INTEGER NOT NULL DEFAULT 1000`,
    `ALTER TABLE users ADD COLUMN penalty_hits_treats INTEGER NOT NULL DEFAULT 1`,
  ]) {
    try { await db.runAsync(sql); } catch (e: any) {
      if (!e?.message?.includes('duplicate column')) throw e;
    }
  }

  // Seed default categories if empty
  const catCount = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM categories'
  );
  if (!catCount || catCount.count === 0) {
    await db.execAsync(`
      INSERT INTO categories (user_id, name, icon, sort_order) VALUES
      (1, 'Health', '🏃', 1),
      (1, 'Mind',   '🧠', 2),
      (1, 'Work',   '💼', 3),
      (1, 'Social', '👥', 4),
      (1, 'Other',  '⭐', 5);
    `);
  }

  // Seed default tiers if empty
  const tierCount = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM tiers'
  );
  if (!tierCount || tierCount.count === 0) {
    await db.execAsync(`
      INSERT INTO tiers (tier_order, stars_required, rank_name, reward_amount, reward_currency) VALUES
      (1, 5,   'Delulu',         50000,  'VND'),
      (2, 10,  'Mewing',         100000, 'VND'),
      (3, 20,  'Rizz',           150000, 'VND'),
      (4, 40,  'Gigachad',       200000, 'VND'),
      (5, 80,  'Aura Farmer',    300000, 'VND'),
      (6, 160, 'Main Character', 500000, 'VND'),
      (7, 320, 'GOATED',         750000, 'VND');
    `);
  }

  // Migrate existing tiers to absurd rank names + new star thresholds (idempotent)
  const hasNewTiers = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM tiers WHERE rank_name='Delulu'`
  );
  if (!hasNewTiers || hasNewTiers.count === 0) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(`DELETE FROM tiers WHERE tier_order > 7;`);
      for (const [order, stars, name] of [
        [1, 5,   'Delulu'],
        [2, 10,  'Mewing'],
        [3, 20,  'Rizz'],
        [4, 40,  'Gigachad'],
        [5, 80,  'Aura Farmer'],
        [6, 160, 'Main Character'],
        [7, 320, 'GOATED'],
      ] as [number, number, string][]) {
        await db.runAsync(
          `UPDATE tiers SET rank_name=?, stars_required=? WHERE tier_order=?`,
          [name, stars, order]
        );
      }
    });
  }

  // Seed default user if empty
  const userCount = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM users'
  );
  if (!userCount || userCount.count === 0) {
    await db.execAsync(
      `INSERT INTO users (username, timezone, carry_debt, currency)
       VALUES ('me', 'Asia/Ho_Chi_Minh', 0, 'VND')`
    );
  }

  // Day 8 migrations: streak_freezes
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS streak_freezes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      local_date TEXT NOT NULL,
      purchased_at INTEGER NOT NULL,
      UNIQUE(user_id, local_date)
    );
  `);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS treats (
      id            INTEGER PRIMARY KEY,
      user_id       INTEGER NOT NULL REFERENCES users(id),
      name          TEXT NOT NULL,
      icon          TEXT NOT NULL DEFAULT 'gift',
      target_stars  INTEGER NOT NULL,
      approx_amount INTEGER NOT NULL,
      currency      TEXT NOT NULL DEFAULT 'VND',
      status        TEXT NOT NULL DEFAULT 'ACTIVE'
                    CHECK (status IN ('ACTIVE','ENJOYED','ARCHIVED')),
      sort_order    INTEGER NOT NULL DEFAULT 0,
      reached_at    TEXT,
      enjoyed_at    TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_treats_user ON treats(user_id, status, sort_order);

    CREATE TABLE IF NOT EXISTS treat_history (
      id          INTEGER PRIMARY KEY,
      user_id     INTEGER NOT NULL REFERENCES users(id),
      treat_id    INTEGER NOT NULL REFERENCES treats(id),
      name        TEXT NOT NULL,
      stars_spent INTEGER NOT NULL,
      amount      INTEGER NOT NULL,
      currency    TEXT NOT NULL DEFAULT 'VND',
      enjoyed_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Remove duplicate task names per user (keep lowest id), then enforce uniqueness
  await db.execAsync(`
    DELETE FROM task_types WHERE id NOT IN (
      SELECT MIN(id) FROM task_types GROUP BY user_id, name
    );
  `);
  await db.execAsync(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_task_types_user_name
    ON task_types (user_id, name);
  `);

  // Seed default task_type for Day 1 verification
  const taskCount = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM task_types'
  );
  if (!taskCount || taskCount.count === 0) {
    await db.execAsync(
      `INSERT OR IGNORE INTO task_types (user_id, name, kind, is_time_based, base_points, star_penalty, archived)
       VALUES (1, 'Exercise', 'GOOD', 0, 10, 50, 0)`
    );
  }
}
