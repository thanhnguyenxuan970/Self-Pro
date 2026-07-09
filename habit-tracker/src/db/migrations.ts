import { SQLiteDatabase } from 'expo-sqlite';

type MigrationFn = (db: SQLiteDatabase) => Promise<void>;

// v0 -> v1: initial schema + seed data
async function v1(db: SQLiteDatabase): Promise<void> {
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

  const catCount = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM categories');
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

  const tierCount = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM tiers');
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

  const userCount = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM users');
  if (!userCount || userCount.count === 0) {
    await db.execAsync(
      `INSERT INTO users (username, timezone, carry_debt, currency)
       VALUES ('me', 'Asia/Ho_Chi_Minh', 0, 'VND')`
    );
  }
}

// v1 -> v2: new user/task columns
async function v2(db: SQLiteDatabase): Promise<void> {
  for (const sql of [
    `ALTER TABLE users ADD COLUMN last_seen_week_start TEXT`,
    `ALTER TABLE users ADD COLUMN notification_time TEXT`,
    `ALTER TABLE users ADD COLUMN notification_time_2 TEXT`,
    `ALTER TABLE users ADD COLUMN notification_time_3 TEXT`,
    `ALTER TABLE users ADD COLUMN google_sub TEXT`,
    `ALTER TABLE users ADD COLUMN treat_stars INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE users ADD COLUMN treat_stars_lifetime INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE users ADD COLUMN value_per_star INTEGER NOT NULL DEFAULT 1000`,
    `ALTER TABLE users ADD COLUMN penalty_hits_treats INTEGER NOT NULL DEFAULT 1`,
    `ALTER TABLE task_types ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0`,
  ]) {
    try { await db.runAsync(sql); } catch (e: any) {
      if (!e?.message?.includes('duplicate column')) throw e;
    }
  }
}

// v2 -> v3: streak_freezes + treats + treat_history (AUTOINCREMENT)
async function v3(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS streak_freezes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      local_date TEXT NOT NULL,
      purchased_at INTEGER NOT NULL,
      UNIQUE(user_id, local_date)
    );

    CREATE TABLE IF NOT EXISTS treats (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
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
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL REFERENCES users(id),
      treat_id    INTEGER NOT NULL REFERENCES treats(id),
      name        TEXT NOT NULL,
      stars_spent INTEGER NOT NULL,
      amount      INTEGER NOT NULL,
      currency    TEXT NOT NULL DEFAULT 'VND',
      enjoyed_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

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
}

// v3 -> v4: remove duplicate task names + enforce uniqueness
async function v4(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    DELETE FROM task_types WHERE id NOT IN (
      SELECT MIN(id) FROM task_types GROUP BY user_id, name
    );
  `);
  await db.execAsync(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_task_types_user_name
    ON task_types (user_id, name);
  `);
}

// v4 -> v5: seed default task types
async function v5(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    INSERT OR IGNORE INTO task_types (user_id, name, icon, kind, is_time_based, base_points, star_penalty, archived)
    SELECT u.id, 'Cleaning', '🧹', 'GOOD', 0, 10, 50, 0 FROM users u;
    INSERT OR IGNORE INTO task_types (user_id, name, icon, kind, is_time_based, base_points, star_penalty, archived)
    SELECT u.id, 'Work', '💼', 'GOOD', 1, 10, 50, 0 FROM users u;
    INSERT OR IGNORE INTO task_types (user_id, name, icon, kind, is_time_based, base_points, star_penalty, archived)
    SELECT u.id, 'Study', '📚', 'GOOD', 1, 10, 50, 0 FROM users u;
    INSERT OR IGNORE INTO task_types (user_id, name, icon, kind, is_time_based, base_points, star_penalty, archived)
    SELECT u.id, 'Family', '👨‍👩‍👧', 'GOOD', 0, 10, 50, 0 FROM users u;
    INSERT OR IGNORE INTO task_types (user_id, name, icon, kind, is_time_based, base_points, star_penalty, archived)
    SELECT u.id, 'Relationship', '💑', 'GOOD', 0, 10, 50, 0 FROM users u;
    INSERT OR IGNORE INTO task_types (user_id, name, icon, kind, is_time_based, base_points, star_penalty, archived)
    SELECT u.id, 'Sports', '⚽', 'GOOD', 1, 10, 50, 0 FROM users u;
  `);
}

// v5 -> v6: performance indexes on hot tables
async function v6(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_activity_user_date ON activity_log(user_id, local_date);
    CREATE INDEX IF NOT EXISTS idx_activity_user_week ON activity_log(user_id, week_start);
    CREATE INDEX IF NOT EXISTS idx_activity_user_task_date ON activity_log(user_id, task_type_id, local_date);
    CREATE INDEX IF NOT EXISTS idx_fund_user ON fund_transactions(user_id);
  `);
}

// v6 -> v7: cap weekly_stars to 5 (week-2 reset — all accounts capped at first-tier threshold)
async function v7(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`UPDATE weekly_summary SET weekly_stars = MIN(weekly_stars, 5) WHERE weekly_stars > 5`);
}

// v7 -> v8: remove legacy 'Exercise' task type seeded in early builds
async function v8(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    UPDATE activity_log SET task_type_id = NULL
      WHERE task_type_id IN (SELECT id FROM task_types WHERE name = 'Exercise');
    DELETE FROM task_types WHERE name = 'Exercise';
  `);
}

// v8 -> v9: backfill support — is_backfill flag + quota index
async function v9(db: SQLiteDatabase): Promise<void> {
  try { await db.runAsync(`ALTER TABLE activity_log ADD COLUMN is_backfill INTEGER NOT NULL DEFAULT 0`); }
  catch (e: any) { if (!e?.message?.includes('duplicate column')) throw e; }
  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_activity_user_week_bf
      ON activity_log(user_id, week_start, is_backfill)
  `);
}

// v9 -> v10: challenge system (7/21/30/66-day habit challenges)
async function v10(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS challenges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      task_type_id INTEGER,
      target_days INTEGER NOT NULL CHECK(target_days IN (7,21,30,66)),
      start_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','done','failed')),
      freezes_left INTEGER NOT NULL DEFAULT 1,
      before_photo TEXT,
      after_photo TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_challenges_one_active
      ON challenges(user_id) WHERE status='active';

    CREATE TABLE IF NOT EXISTS challenge_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      challenge_id INTEGER NOT NULL,
      local_date TEXT NOT NULL,
      state TEXT NOT NULL CHECK(state IN ('done','reset','freeze')),
      UNIQUE(challenge_id, local_date)
    );
    CREATE INDEX IF NOT EXISTS idx_challenge_log_challenge ON challenge_log(challenge_id);
  `);
}

// v10 -> v11: achievement unlocks (Trophy Shelf)
async function v11(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS achievement_unlocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      achievement_id TEXT NOT NULL,
      unlocked_at TEXT NOT NULL,
      UNIQUE(user_id, achievement_id)
    );
  `);
}

// v11 -> v12: challenge_days + achievements + challenge metadata
async function v12(db: SQLiteDatabase): Promise<void> {
  for (const sql of [
    `ALTER TABLE challenges ADD COLUMN freeze_used INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE challenges ADD COLUMN streak_current INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE challenges ADD COLUMN completed_at TEXT`,
  ]) {
    try { await db.runAsync(sql); } catch (e: any) {
      if (!e?.message?.includes('duplicate column')) throw e;
    }
  }

  await db.execAsync(`
    UPDATE challenges
    SET freeze_used = 1
    WHERE COALESCE(freezes_left, 1) <= 0;

    CREATE TABLE IF NOT EXISTS challenge_days (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      challenge_id INTEGER NOT NULL,
      local_date TEXT NOT NULL,
      logged_at INTEGER NOT NULL,
      UNIQUE(challenge_id, local_date)
    );
    CREATE INDEX IF NOT EXISTS idx_challenge_days_challenge ON challenge_days(challenge_id);

    INSERT OR IGNORE INTO challenge_days (challenge_id, local_date, logged_at)
    SELECT challenge_id, local_date,
           CAST(strftime('%s', local_date || ' 12:00:00') AS INTEGER) * 1000
    FROM challenge_log
    WHERE state = 'done';

    CREATE TABLE IF NOT EXISTS achievements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      key TEXT NOT NULL,
      rarity TEXT NOT NULL CHECK(rarity IN ('common','rare','legendary')),
      earned_at TEXT NOT NULL,
      source_type TEXT NOT NULL CHECK(source_type IN ('challenge','streak','rank','record')),
      source_id INTEGER
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_achievements_scope
      ON achievements(user_id, key, source_type, COALESCE(source_id, -1));

    INSERT OR IGNORE INTO achievements (user_id, key, rarity, earned_at, source_type, source_id)
    SELECT user_id, achievement_id, 'common', unlocked_at, 'record', NULL
    FROM achievement_unlocks;
  `);
}

// v12 -> v13: extend rank ladder with Final Boss + Ascended
async function v13(db: SQLiteDatabase): Promise<void> {
  const tiers: [number, number, string, number][] = [
    [1, 5, 'Delulu', 50000],
    [2, 10, 'Mewing', 100000],
    [3, 20, 'Rizz', 150000],
    [4, 40, 'Gigachad', 200000],
    [5, 80, 'Aura Farmer', 300000],
    [6, 160, 'Main Character', 500000],
    [7, 320, 'GOATED', 750000],
    [8, 640, 'Final Boss', 1000000],
    [9, 1280, 'Ascended', 1500000],
  ];

  await db.withTransactionAsync(async () => {
    await db.execAsync(`DELETE FROM tiers WHERE tier_order > 9;`);

    for (const [tierOrder, starsRequired, rankName, rewardAmount] of tiers) {
      const existing = await db.getFirstAsync<{ id: number }>(
        `SELECT id FROM tiers WHERE tier_order = ? LIMIT 1`,
        [tierOrder],
      );

      if (existing) {
        await db.runAsync(
          `UPDATE tiers
           SET stars_required = ?, rank_name = ?, reward_amount = ?, reward_currency = 'VND'
           WHERE id = ?`,
          [starsRequired, rankName, rewardAmount, existing.id],
        );
      } else {
        await db.runAsync(
          `INSERT INTO tiers (tier_order, stars_required, rank_name, reward_amount, reward_currency)
           VALUES (?, ?, ?, ?, 'VND')`,
          [tierOrder, starsRequired, rankName, rewardAmount],
        );
      }
    }
  });
}

// v13 -> v14: per-challenge daily reminder toggle
async function v14(db: SQLiteDatabase): Promise<void> {
  for (const sql of [
    `ALTER TABLE challenges ADD COLUMN notifications_enabled INTEGER NOT NULL DEFAULT 1`,
    `ALTER TABLE challenges ADD COLUMN notification_id TEXT`,
  ]) {
    try { await db.runAsync(sql); } catch (e: any) {
      if (!e?.message?.includes('duplicate column')) throw e;
    }
  }
}

// v14 -> v15: weekly challenge mode. Rebuilds `challenges` (SQLite can't ALTER
// a CHECK constraint in place) to: (a) widen target_days's CHECK from the
// fixed (7,21,30,66) set -- which already silently rejected 60/100-day streak
// challenges wired in via CHALLENGE_DURATIONS, a pre-existing production bug
// independent of weekly mode -- to a simple positive-integer sanity check, and
// (b) add mode/weekly_target/total_weeks. Single transaction: a kill mid-copy
// re-runs cleanly from PRAGMA user_version with the original `challenges`
// table still intact (DROP only happens after INSERT...SELECT succeeds).
async function v15(db: SQLiteDatabase): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.execAsync(`
      CREATE TABLE challenges_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        task_type_id INTEGER,
        mode TEXT NOT NULL DEFAULT 'streak' CHECK(mode IN ('streak','weekly')),
        target_days INTEGER NOT NULL CHECK(target_days > 0),
        weekly_target INTEGER CHECK(weekly_target IS NULL OR weekly_target IN (3,4,5,6)),
        total_weeks INTEGER CHECK(total_weeks IS NULL OR total_weeks IN (2,4,8,12)),
        start_date TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','done','failed')),
        freezes_left INTEGER NOT NULL DEFAULT 1,
        freeze_used INTEGER NOT NULL DEFAULT 0,
        streak_current INTEGER NOT NULL DEFAULT 0,
        completed_at TEXT,
        before_photo TEXT,
        after_photo TEXT,
        notifications_enabled INTEGER NOT NULL DEFAULT 1,
        notification_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      INSERT INTO challenges_new
        (id, user_id, name, task_type_id, mode, target_days, weekly_target, total_weeks,
         start_date, status, freezes_left, freeze_used, streak_current, completed_at,
         before_photo, after_photo, notifications_enabled, notification_id, created_at)
      SELECT
        id, user_id, name, task_type_id, 'streak', target_days, NULL, NULL,
        start_date, status, freezes_left, freeze_used, streak_current, completed_at,
        before_photo, after_photo, notifications_enabled, notification_id, created_at
      FROM challenges;

      DROP TABLE challenges;
      ALTER TABLE challenges_new RENAME TO challenges;

      CREATE UNIQUE INDEX IF NOT EXISTS idx_challenges_one_active
        ON challenges(user_id) WHERE status='active';
      CREATE INDEX IF NOT EXISTS idx_challenges_user_status ON challenges(user_id, status);
    `);
  });
}

// v15 -> v16: achievement unification. `achievement_unlocks` (Trophy Shelf's
// 9 stat badges) and `achievements` (rarity-tiered, challenge/rank rewards)
// have tracked overlapping badge unlocks since v12's one-time backfill copy.
// This closes any drift since then and retires achievement_unlocks --
// achievements (source_type='record') becomes the single source of truth for
// both. Transaction-wrapped: a kill mid-migration re-runs cleanly from
// PRAGMA user_version with achievement_unlocks still intact (DROP is last).
async function v16(db: SQLiteDatabase): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.execAsync(`
      INSERT OR IGNORE INTO achievements (user_id, key, rarity, earned_at, source_type, source_id)
      SELECT user_id, achievement_id, 'common', unlocked_at, 'record', NULL
      FROM achievement_unlocks;

      DROP TABLE IF EXISTS achievement_unlocks;
    `);
  });
}

// v16 -> v17: linked-completion thresholds. A linked challenge (task_type_id
// set) can require a minimum logged duration and/or a minimum log count per
// day before that day counts as "done" -- e.g. a 1-minute log shouldn't
// complete a "gym" challenge day the same as a full session.
async function v17(db: SQLiteDatabase): Promise<void> {
  for (const sql of [
    `ALTER TABLE challenges ADD COLUMN min_duration INTEGER`,
    `ALTER TABLE challenges ADD COLUMN min_count INTEGER`,
  ]) {
    try { await db.runAsync(sql); } catch (e: any) {
      if (!e?.message?.includes('duplicate column')) throw e;
    }
  }
}

// v17 -> v18: clock-rollback detection. A device with its clock rolled back
// can log an activity that gets attributed to a past local_date, retroactively
// completing a linked-challenge day or resurrecting a lapsed streak.
// syncService.ts flags a row after sync when its client-supplied logged_at is
// implausibly earlier than Supabase's server-assigned created_at; derivation
// (getDoneDates/rollover) then excludes flagged rows. Detection net only --
// does not claw back a reward already granted before the flag arrives (see
// TODOS.md for the deferred full-clawback follow-up).
async function v18(db: SQLiteDatabase): Promise<void> {
  try {
    await db.runAsync(`ALTER TABLE activity_log ADD COLUMN is_clock_suspect INTEGER DEFAULT 0`);
  } catch (e: any) {
    if (!e?.message?.includes('duplicate column')) throw e;
  }
}

const MIGRATIONS: MigrationFn[] = [v1, v2, v3, v4, v5, v6, v7, v8, v9, v10, v11, v12, v13, v14, v15, v16, v17, v18];

export async function runMigrations(db: SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;

  for (; version < MIGRATIONS.length; version++) {
    await MIGRATIONS[version](db);
    // Integer literal -- safe to interpolate (never derived from user input)
    await db.execAsync(`PRAGMA user_version = ${version + 1}`);
  }
}
