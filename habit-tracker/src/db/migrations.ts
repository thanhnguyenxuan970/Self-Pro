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

  // Day 4 migrations: new user columns
  for (const sql of [
    `ALTER TABLE users ADD COLUMN last_seen_week_start TEXT`,
    `ALTER TABLE users ADD COLUMN notification_time TEXT`,
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
      (1, 10,  'Newbie',        50000,  'VND'),
      (2, 25,  'Grinder',       100000, 'VND'),
      (3, 50,  'No Life',       150000, 'VND'),
      (4, 100, 'Sigma',         200000, 'VND'),
      (5, 200, 'Gigachad',      300000, 'VND'),
      (6, 350, 'Menace',        500000, 'VND'),
      (7, 500, 'Goat',          750000, 'VND'),
      (8, 750, 'Legendary NPC', 1000000,'VND');
    `);
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

  // Seed default task_type for Day 1 verification
  const taskCount = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM task_types'
  );
  if (!taskCount || taskCount.count === 0) {
    await db.execAsync(
      `INSERT INTO task_types (user_id, name, kind, is_time_based, base_points, star_penalty, archived)
       VALUES (1, 'Exercise', 'GOOD', 0, 10, 50, 0)`
    );
  }
}
