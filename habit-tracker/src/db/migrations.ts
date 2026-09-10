import { SQLiteDatabase } from 'expo-sqlite';

type MigrationFn = (db: SQLiteDatabase) => Promise<void>;

// SQLite has no `ADD COLUMN IF NOT EXISTS`; re-running a migration after a
// partial upgrade must tolerate the column already existing.
async function addColumnIfMissing(db: SQLiteDatabase, alterSql: string): Promise<void> {
  try {
    await db.runAsync(alterSql);
  } catch (e: any) {
    if (!e?.message?.includes('duplicate column')) throw e;
  }
}

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
    await addColumnIfMissing(db, sql);
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
  await addColumnIfMissing(db, `ALTER TABLE activity_log ADD COLUMN is_backfill INTEGER NOT NULL DEFAULT 0`);
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
    await addColumnIfMissing(db, sql);
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
    await addColumnIfMissing(db, sql);
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
    await addColumnIfMissing(db, sql);
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
  await addColumnIfMissing(db, `ALTER TABLE activity_log ADD COLUMN is_clock_suspect INTEGER DEFAULT 0`);
}

// v18 -> v19: stable, user-controlled pins for the activity picker.
async function v19(db: SQLiteDatabase): Promise<void> {
  await addColumnIfMissing(db, `ALTER TABLE task_types ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0`);
  await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_task_types_picker ON task_types(user_id, archived, is_pinned)`);
}

// v19 -> v20: translate only activities created from built-in templates.
async function v20(db: SQLiteDatabase): Promise<void> {
  await addColumnIfMissing(db, `ALTER TABLE task_types ADD COLUMN is_template INTEGER NOT NULL DEFAULT 0`);
  await db.runAsync(`UPDATE task_types SET is_template = 1 WHERE name IN ('Running', 'Gym', 'Reading', 'Language Learning', 'Homework', 'Studying', 'Cleaning', 'Cooking', 'Work', 'Study', 'Family', 'Relationship', 'Sports', 'Chạy bộ', 'Đọc sách', 'Học ngoại ngữ', 'Làm bài tập', 'Ôn bài', 'Dọn dẹp', 'Nấu ăn')`);
}

// v20 -> v21: streak milestone bonuses are display-only flex stars; they never
// enter weekly rank or the spendable treat pool.
async function v21(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS milestone_stars (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      milestone_days INTEGER NOT NULL,
      stars INTEGER NOT NULL,
      awarded_at INTEGER NOT NULL,
      UNIQUE(user_id, milestone_days)
    );
    INSERT OR IGNORE INTO milestone_stars (user_id, milestone_days, stars, awarded_at)
    SELECT u.id, m.days, m.stars, CAST(strftime('%s', 'now') AS INTEGER) * 1000
    FROM users u
    JOIN (
      SELECT 7 AS days, 1 AS stars UNION ALL SELECT 14, 2 UNION ALL SELECT 30, 3
      UNION ALL SELECT 60, 5 UNION ALL SELECT 90, 5 UNION ALL SELECT 100, 6
      UNION ALL SELECT 180, 8 UNION ALL SELECT 365, 10
    ) m
    WHERE m.days <= COALESCE((SELECT MAX(streak_count) FROM daily_summary WHERE user_id = u.id), 0);
  `);
}

// v21 -> v22: add the Tier 9 rank without rewriting earned tiers.
// (Originally inserted as 'Singularity'; fresh installs now get 'Cosmic' directly,
//  and v23 renames any row already written by the old v22.)
async function v22(db: SQLiteDatabase): Promise<void> {
  const existing = await db.getFirstAsync<{ id: number }>(
    `SELECT id FROM tiers WHERE tier_order = ? LIMIT 1`,
    [10],
  );
  if (existing) {
    await db.runAsync(
      `UPDATE tiers SET stars_required = ?, rank_name = ?, reward_amount = ?, reward_currency = 'VND' WHERE id = ?`,
      [2560, 'Cosmic', 2000000, existing.id],
    );
  } else {
    await db.runAsync(
      `INSERT INTO tiers (tier_order, stars_required, rank_name, reward_amount, reward_currency) VALUES (?, ?, ?, ?, 'VND')`,
      [10, 2560, 'Cosmic', 2000000],
    );
  }
}

// v22 -> v23: lifetime rank state, replacing the weekly-reset rank/leaderboard model.
// lifetime_stars/current_tier_id live on `users` (same pattern as the existing
// treat_stars_lifetime column) rather than on weekly_summary, which stays untouched
// for its other (non-rank) weekly stats/challenge-pacing consumers.
async function ensureLifetimeRankColumns(db: SQLiteDatabase, forceBackfill = false): Promise<void> {
  const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(users)');
  const columnNames = new Set(columns.map(column => column.name));
  let repaired = false;

  if (!columnNames.has('lifetime_stars')) {
    await db.runAsync('ALTER TABLE users ADD COLUMN lifetime_stars REAL NOT NULL DEFAULT 0');
    repaired = true;
  }
  if (!columnNames.has('current_tier_id')) {
    await db.runAsync('ALTER TABLE users ADD COLUMN current_tier_id INTEGER');
    repaired = true;
  }
  if (!repaired && !forceBackfill) {
    // A migration can be interrupted after ALTER TABLE but before its
    // backfill. Detect that partial state cheaply so a later startup retries
    // the repair instead of trusting the recorded schema version forever.
    const incomplete = await db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) AS count
       FROM users AS u
       WHERE u.current_tier_id IS NULL
         AND (
           COALESCE(u.lifetime_stars, 0) < COALESCE((
             SELECT SUM(CASE WHEN stars_delta > 0 THEN stars_delta ELSE 0 END)
             FROM activity_log WHERE user_id = u.id
           ), 0)
           OR COALESCE(u.lifetime_stars, 0) >= COALESCE((
             SELECT MIN(stars_required) FROM tiers
           ), 1)
         )`,
    );
    if ((incomplete?.count ?? 0) === 0) return;
  }

  // Backfill from activity_log (the source of truth), not from weekly_summary sums,
  // since activity_log is authoritative and this is a one-time derivation, not a
  // reconciliation against potentially-drifted weekly rollups.
  const users = await db.getAllAsync<{ id: number; lifetime_stars: number | null }>(
    `SELECT id, lifetime_stars FROM users`,
  );
  const tiers = await db.getAllAsync<{ id: number; tier_order: number; stars_required: number }>(
    `SELECT id, tier_order, stars_required FROM tiers ORDER BY tier_order ASC`,
  );
  for (const user of users) {
    const totals = await db.getFirstAsync<{ total: number | null }>(
      `SELECT SUM(CASE WHEN stars_delta > 0 THEN stars_delta ELSE 0 END) AS total
       FROM activity_log WHERE user_id = ?`,
      [user.id],
    );
    // Rank is a high-water mark. Preserve an already-recorded lifetime total
    // when repairing only the missing tier column or recovering from a partial
    // migration; activity_log remains the source for newly-added totals.
    const activityTotal = Math.max(0, totals?.total ?? 0);
    const lifetimeStars = Math.max(0, user.lifetime_stars ?? 0, activityTotal);
    const reachedTier = [...tiers].reverse().find(t => t.stars_required <= lifetimeStars) ?? null;
    await db.runAsync(
      `UPDATE users SET lifetime_stars = ?, current_tier_id = ? WHERE id = ?`,
      [lifetimeStars, reachedTier?.id ?? null, user.id],
    );
  }
}

async function v23(db: SQLiteDatabase): Promise<void> {
  // Force the backfill on the migration path so an interrupted run retries
  // even when both ALTER TABLE statements already committed.
  await ensureLifetimeRankColumns(db, true);
}

// v23 -> v24: tier 9 rebrand Singularity -> Cosmic (Mock A chosen).
// Covers devices whose DB already ran the original v22-lineage v23.
async function v24(db: SQLiteDatabase): Promise<void> {
  await db.runAsync(
    `UPDATE tiers SET rank_name = 'Cosmic' WHERE tier_order = 10 AND rank_name = 'Singularity'`,
  );
}

// v24 -> v25: Multiplier Boost — one row per user per local day. claimed_at/
// expires_at/dismissed_at start NULL (available); set on claim/expiry/dismiss.
async function v25(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS boost_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      local_date TEXT NOT NULL,
      multiplier INTEGER NOT NULL,
      claim_deadline INTEGER NOT NULL,
      claimed_at INTEGER,
      expires_at INTEGER,
      dismissed_at INTEGER,
      created_at INTEGER NOT NULL,
      UNIQUE(user_id, local_date)
    );
  `);
}

// v25 -> v26: allow a user to run multiple challenges concurrently. Older
// builds enforced one active challenge with a partial unique index; remove it
// while retaining the non-unique lookup index for challenge screens.
async function removeLegacyOneActiveChallengeIndex(db: SQLiteDatabase): Promise<void> {
  // Keep these as separate calls. Some Expo SQLite versions do not reliably
  // apply a DROP followed by CREATE when both statements are passed to
  // execAsync, which could leave the old unique index behind.
  await db.runAsync('DROP INDEX IF EXISTS idx_challenges_one_active');
  await db.runAsync('CREATE INDEX IF NOT EXISTS idx_challenges_user_status ON challenges(user_id, status)');
}

async function v26(db: SQLiteDatabase): Promise<void> {
  await removeLegacyOneActiveChallengeIndex(db);
}

// v26 -> v27: repair databases that already recorded v26 before the index
// cleanup was made reliable.
async function v27(db: SQLiteDatabase): Promise<void> {
  await removeLegacyOneActiveChallengeIndex(db);
}

const LEGACY_CHALLENGE_TIME_ZONE = 'Asia/Ho_Chi_Minh';

function localDateForMigration(now: Date): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function legacyChallengeDateForMigration(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: LEGACY_CHALLENGE_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function migrationDayNumber(value: string): number {
  const [year, month, day] = value.split('-').map(Number);
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

function parseSqliteUtcDate(value: string): Date | null {
  const normalized = value.trim().replace(' ', 'T');
  const iso = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized) ? normalized : `${normalized}Z`;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** v27 -> v28: align active Challenge ledgers with device-local dates.
 * activity_log already stores device-local dates, while older Challenge rows
 * were created with the hardcoded Vietnam date. Use each Challenge's creation
 * instant to calculate the historical legacy/device delta, and only shift rows
 * whose stored start date still matches that legacy date. This avoids applying
 * today's timezone boundary to a Challenge created on a different calendar
 * day, and leaves already-correct or terminal history immutable. */
async function v28(db: SQLiteDatabase): Promise<void> {
  const activeChallenges = await db.getAllAsync<{
    id: number;
    start_date: string;
    created_at: string;
  }>(
    'SELECT id, start_date, created_at FROM challenges WHERE status = ?',
    ['active'],
  );

  const shiftActiveLedgers = async () => {
    for (const challenge of activeChallenges) {
      const createdAt = parseSqliteUtcDate(challenge.created_at);
      if (!createdAt) continue;

      const legacyDate = legacyChallengeDateForMigration(createdAt);
      if (challenge.start_date !== legacyDate) continue;

      const localDate = localDateForMigration(createdAt);
      const shiftDays = migrationDayNumber(localDate) - migrationDayNumber(legacyDate);
      if (shiftDays === 0) continue;

      const modifier = `${shiftDays > 0 ? '+' : ''}${shiftDays} days`;
      await db.runAsync(
        `UPDATE challenges SET start_date = date(start_date, ?)
         WHERE id = ? AND status = 'active'`,
        [modifier, challenge.id],
      );
      await db.runAsync(
        `UPDATE challenge_log SET local_date = date(local_date, ?)
         WHERE challenge_id = ?`,
        [modifier, challenge.id],
      );
      await db.runAsync(
        `UPDATE challenge_days SET local_date = date(local_date, ?)
         WHERE challenge_id = ?`,
        [modifier, challenge.id],
      );
    }
    // Keep the migration marker in the same transaction as the date shift.
    // If the process dies after the updates commit but before runMigrations
    // advances user_version, a later launch must not apply the shift twice.
    await db.execAsync('PRAGMA user_version = 28');
  };

  if (typeof db.withTransactionAsync === 'function') {
    await db.withTransactionAsync(shiftActiveLedgers);
  } else {
    // Test doubles and very old expo-sqlite adapters may not expose the
    // transaction helper; the production path above remains atomic.
    await shiftActiveLedgers();
  }
}

// v28 -> v29: restore fast-path presence checks must remain indexed even on
// older databases with large audit/history tables. The other probed tables
// already have a user-leading unique or lookup index from earlier migrations.
async function v29(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_categories_user_name ON categories(user_id, name);
    CREATE INDEX IF NOT EXISTS idx_treat_history_user ON treat_history(user_id);
    CREATE INDEX IF NOT EXISTS idx_milestone_stars_user ON milestone_stars(user_id);
  `);
}

// v29 -> v30: durable, account-scoped outbox for activity rows that were
// deleted locally and still need their Supabase twins removed.
async function v30(db: SQLiteDatabase): Promise<void> {
  const createAccountOutbox = async () => {
    // account_key is populated only after the app has verified the current
    // Google/Supabase identity. Existing google_sub values cannot be translated
    // safely because they are provider subjects rather than email addresses.
    await addColumnIfMissing(db, 'ALTER TABLE users ADD COLUMN account_key TEXT');
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS pending_activity_deletes (
        account_key       TEXT NOT NULL CHECK (
          length(account_key) > 0 AND account_key = lower(trim(account_key))
        ),
        local_activity_id INTEGER NOT NULL CHECK (local_activity_id > 0),
        created_at        INTEGER NOT NULL,
        -- activity_log.id is AUTOINCREMENT, so this key names one immutable
        -- delete intent for the lifetime of this SQLite database.
        PRIMARY KEY (account_key, local_activity_id)
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_account_key
        ON users(account_key)
        WHERE account_key IS NOT NULL;

      CREATE INDEX IF NOT EXISTS idx_pending_activity_deletes_drain
        ON pending_activity_deletes(account_key, created_at, local_activity_id);
    `);
  };

  if (typeof db.withTransactionAsync === 'function') {
    await db.withTransactionAsync(createAccountOutbox);
  } else {
    // Test doubles and legacy adapters may omit the helper. The SDK 56
    // production path above keeps the v30 schema change atomic.
    await createAccountOutbox();
  }
}

// v30 -> v31: add the nullable stable activity identity. Existing rows stay
// unresolved until a reviewed provenance mapping exists; local_id is never an
// implicit identity.
async function v31(db: SQLiteDatabase): Promise<void> {
  const ensureActivityIdentity = async () => {
    await addColumnIfMissing(db, 'ALTER TABLE activity_log ADD COLUMN activity_key TEXT');
    await db.execAsync(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_activity_user_key
        ON activity_log(user_id, activity_key)
        WHERE activity_key IS NOT NULL;
    `);
  };

  if (typeof db.withTransactionAsync === 'function') {
    await db.withTransactionAsync(ensureActivityIdentity);
  } else {
    await ensureActivityIdentity();
  }
}

// v31 -> v32: preserve the stable activity key in the delete outbox. The
// trigger runs before callers hard-delete a row, so a remote delete cannot
// fall back to a device-local id when two devices share the same id.
async function v32(db: SQLiteDatabase): Promise<void> {
  const ensureActivityDeleteIdentity = async () => {
    await addColumnIfMissing(db, 'ALTER TABLE users ADD COLUMN account_key TEXT');
    await addColumnIfMissing(db, 'ALTER TABLE activity_log ADD COLUMN activity_key TEXT');
    await db.execAsync(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_activity_user_key
        ON activity_log(user_id, activity_key)
        WHERE activity_key IS NOT NULL;
    `);
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS pending_activity_deletes (
        account_key       TEXT NOT NULL CHECK (
          length(account_key) > 0 AND account_key = lower(trim(account_key))
        ),
        local_activity_id INTEGER NOT NULL CHECK (local_activity_id > 0),
        created_at        INTEGER NOT NULL,
        activity_key      TEXT,
        PRIMARY KEY (account_key, local_activity_id)
      );
    `);
    await addColumnIfMissing(db, 'ALTER TABLE pending_activity_deletes ADD COLUMN activity_key TEXT');
    await db.execAsync(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_pending_activity_deletes_activity_key
        ON pending_activity_deletes(account_key, activity_key)
        WHERE activity_key IS NOT NULL;

      CREATE TABLE IF NOT EXISTS activity_restore_suppression (
        user_id INTEGER PRIMARY KEY
      );

      DROP TRIGGER IF EXISTS trg_activity_log_enqueue_delete;
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
        SELECT users.account_key,
               OLD.id,
               NULLIF(trim(OLD.activity_key), ''),
               CAST(strftime('%s', 'now') AS INTEGER) * 1000
          FROM users
         WHERE users.id = OLD.user_id
           AND users.account_key IS NOT NULL
           AND length(trim(users.account_key)) > 0;
      END;
    `);
  };

  if (typeof db.withTransactionAsync === 'function') {
    await db.withTransactionAsync(ensureActivityDeleteIdentity);
  } else {
    await ensureActivityDeleteIdentity();
  }
}

// v32 -> v33: make the unresolved state explicit. Rows created before the
// stable-key rollout (including rows that an earlier local build stamped as
// legacy:<id>) remain local and are quarantined from sync.
async function v33(db: SQLiteDatabase): Promise<void> {
  const ensureActivityIdentityStatus = async () => {
    await addColumnIfMissing(
      db,
      `ALTER TABLE activity_log ADD COLUMN activity_identity_status TEXT NOT NULL DEFAULT 'resolved'`,
    );
    await db.runAsync(
      `UPDATE activity_log
          SET activity_identity_status = 'unresolved'
        WHERE activity_key IS NULL
           OR trim(activity_key) = ''
           OR activity_key LIKE 'legacy:%'
           OR activity_identity_status NOT IN ('resolved', 'unresolved')`,
    );
    await db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_activity_user_identity_status
        ON activity_log(user_id, activity_identity_status);

      CREATE TRIGGER IF NOT EXISTS trg_activity_log_mark_unresolved_identity
      AFTER INSERT ON activity_log
      WHEN NEW.activity_key IS NULL
        OR trim(NEW.activity_key) = ''
        OR NEW.activity_key LIKE 'legacy:%'
      BEGIN
        UPDATE activity_log
           SET activity_identity_status = 'unresolved'
         WHERE id = NEW.id;
      END;
    `);
  };

  if (typeof db.withTransactionAsync === 'function') {
    await db.withTransactionAsync(ensureActivityIdentityStatus);
  } else {
    await ensureActivityIdentityStatus();
  }
}

async function v34(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS activity_restore_suppression (
      user_id INTEGER PRIMARY KEY
    );

    DROP TRIGGER IF EXISTS trg_activity_log_enqueue_delete;
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
      SELECT users.account_key,
             OLD.id,
             NULLIF(trim(OLD.activity_key), ''),
             CAST(strftime('%s', 'now') AS INTEGER) * 1000
        FROM users
       WHERE users.id = OLD.user_id
         AND users.account_key IS NOT NULL
         AND length(trim(users.account_key)) > 0;
    END;
  `);
}

// v34 -> v35: retain a cloud mirror's task reference separately from the
// local task relationship. A restored mirror row may have a valid durable key
// and must compare against the cloud task id without attaching that id locally.
async function v35(db: SQLiteDatabase): Promise<void> {
  await addColumnIfMissing(
    db,
    'ALTER TABLE activity_log ADD COLUMN activity_source_task_type_id INTEGER',
  );
}

const MIGRATIONS: MigrationFn[] = [v1, v2, v3, v4, v5, v6, v7, v8, v9, v10, v11, v12, v13, v14, v15, v16, v17, v18, v19, v20, v21, v22, v23, v24, v25, v26, v27, v28, v29, v30, v31, v32, v33, v34, v35];

// Auth-only v30 used the same schema version for `account_key` but did not
// know about the activity-delete outbox. A later full build must reconcile
// that shape instead of assuming user_version=30 proves the outbox exists.
async function ensurePendingActivityDeleteOutbox(db: SQLiteDatabase): Promise<void> {
  const ensureSchema = async () => {
    await addColumnIfMissing(db, 'ALTER TABLE users ADD COLUMN account_key TEXT');
    await addColumnIfMissing(db, 'ALTER TABLE activity_log ADD COLUMN activity_key TEXT');
    await addColumnIfMissing(
      db,
      `ALTER TABLE activity_log ADD COLUMN activity_identity_status TEXT NOT NULL DEFAULT 'resolved'`,
    );
    await addColumnIfMissing(
      db,
      'ALTER TABLE activity_log ADD COLUMN activity_source_task_type_id INTEGER',
    );
    await db.runAsync(
      `UPDATE activity_log
          SET activity_identity_status = 'unresolved'
        WHERE activity_key IS NULL
           OR trim(activity_key) = ''
           OR activity_key LIKE 'legacy:%'
           OR activity_identity_status NOT IN ('resolved', 'unresolved')`,
    );
    await db.execAsync(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_activity_user_key
        ON activity_log(user_id, activity_key)
        WHERE activity_key IS NOT NULL;
    `);
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS pending_activity_deletes (
        account_key       TEXT NOT NULL CHECK (
          length(account_key) > 0 AND account_key = lower(trim(account_key))
        ),
        local_activity_id INTEGER NOT NULL CHECK (local_activity_id > 0),
        created_at        INTEGER NOT NULL,
        activity_key      TEXT,
        PRIMARY KEY (account_key, local_activity_id)
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_account_key
        ON users(account_key)
        WHERE account_key IS NOT NULL;

      CREATE INDEX IF NOT EXISTS idx_pending_activity_deletes_drain
        ON pending_activity_deletes(account_key, created_at, local_activity_id);
    `);
    await addColumnIfMissing(db, 'ALTER TABLE pending_activity_deletes ADD COLUMN activity_key TEXT');
    await db.execAsync(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_pending_activity_deletes_activity_key
        ON pending_activity_deletes(account_key, activity_key)
        WHERE activity_key IS NOT NULL;

      CREATE TABLE IF NOT EXISTS activity_restore_suppression (
        user_id INTEGER PRIMARY KEY
      );

      DROP TRIGGER IF EXISTS trg_activity_log_enqueue_delete;
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
        SELECT users.account_key,
               OLD.id,
               NULLIF(trim(OLD.activity_key), ''),
               CAST(strftime('%s', 'now') AS INTEGER) * 1000
          FROM users
         WHERE users.id = OLD.user_id
           AND users.account_key IS NOT NULL
           AND length(trim(users.account_key)) > 0;
      END;

      CREATE INDEX IF NOT EXISTS idx_activity_user_identity_status
        ON activity_log(user_id, activity_identity_status);

      CREATE TRIGGER IF NOT EXISTS trg_activity_log_mark_unresolved_identity
      AFTER INSERT ON activity_log
      WHEN NEW.activity_key IS NULL
        OR trim(NEW.activity_key) = ''
        OR NEW.activity_key LIKE 'legacy:%'
      BEGIN
        UPDATE activity_log
           SET activity_identity_status = 'unresolved'
         WHERE id = NEW.id;
      END;
    `);
  };

  if (typeof db.withTransactionAsync === 'function') {
    await db.withTransactionAsync(ensureSchema);
  } else {
    await ensureSchema();
  }
}

export async function runMigrations(db: SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  const startingVersion = version;

  for (; version < MIGRATIONS.length; version++) {
    await MIGRATIONS[version](db);
    // Integer literal -- safe to interpolate (never derived from user input)
    await db.execAsync(`PRAGMA user_version = ${version + 1}`);
  }

  // Some released builds advanced user_version despite not applying the
  // lifetime-rank columns. Repair the schema by shape as well as version so
  // RankScreen cannot remain on an infinite loading state.
  await ensureLifetimeRankColumns(db);
  if (startingVersion >= 30) {
    await ensurePendingActivityDeleteOutbox(db);
  }
}
