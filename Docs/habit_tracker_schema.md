# Gamified Habit Tracker — Schema & Implementation Logic

Portable SQL (SQLite for local-first; trivially upgradable to Postgres). Single source of truth = an append-only `activity_log`; everything else is a derived rollup for speed.

---

## 1. Constants (the rule engine)

```ts
const STARS_PER_TASK            = 1;     // 1 task = 1 Star
const DAILY_BONUS_THRESHOLD     = 50;    // 50 pts in a day = +1 Star (once/day)
const DAILY_BONUS_STARS         = 1;
const TIME_UNIT_MINUTES         = 30;    // +1 pt per 30 min
const DEFAULT_PENALTY_STARS     = 50;    // bad habit = -50 Stars
```

**Point rule (note the spec's exact behavior):** 90 min = 3 pts means points are *purely* the time multiplier, not base + time.
`points = is_time_based ? max(1, floor(duration_min / 30)) : 1`
→ 30 min = 1, 60 = 2, 90 = 3, non-timed task = 1.

---

## 2. Schema (DDL)

```sql
-- 1. USERS (multi-user ready; one row for personal use)
CREATE TABLE users (
  id          INTEGER PRIMARY KEY,
  username    TEXT NOT NULL,
  timezone    TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh', -- drives Monday 00:00 reset
  carry_debt  INTEGER NOT NULL DEFAULT 1,   -- 1 = negative balance carries to next week
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 2. TASK TYPES (catalog of trackable activities)
CREATE TABLE task_types (
  id            INTEGER PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id),
  name          TEXT NOT NULL,                              -- "Reading", "Porn", "Late sleep"
  kind          TEXT NOT NULL CHECK (kind IN ('GOOD','BAD')),
  is_time_based INTEGER NOT NULL DEFAULT 0,                 -- 1 = uses 30-min multiplier
  base_points   INTEGER NOT NULL DEFAULT 1,                 -- pts for a non-timed completion
  star_penalty  INTEGER NOT NULL DEFAULT 0,                 -- BAD habits (e.g. 50)
  archived      INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 3. ACTIVITY LOG (append-only ledger — single source of truth)
CREATE TABLE activity_log (
  id            INTEGER PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id),
  task_type_id  INTEGER NOT NULL REFERENCES task_types(id),
  kind          TEXT NOT NULL CHECK (kind IN ('GOOD','BAD')),
  duration_min  INTEGER,                                    -- NULL for non-timed / bad habits
  points_earned INTEGER NOT NULL DEFAULT 0,
  stars_delta   INTEGER NOT NULL DEFAULT 0,                 -- +1 task / +1 bonus / -50 penalty
  source        TEXT NOT NULL DEFAULT 'TASK'
                CHECK (source IN ('TASK','DAILY_BONUS','PENALTY')),
  logged_at     TEXT NOT NULL DEFAULT (datetime('now')),
  local_date    TEXT NOT NULL,                              -- YYYY-MM-DD in user tz
  week_start    TEXT NOT NULL,                              -- Monday YYYY-MM-DD in user tz
  note          TEXT
);
CREATE INDEX idx_log_user_week ON activity_log(user_id, week_start);
CREATE INDEX idx_log_user_date ON activity_log(user_id, local_date);

-- 4. TIERS (config — same thresholds drive BOTH rank name AND monetary reward)
CREATE TABLE tiers (
  id              INTEGER PRIMARY KEY,
  tier_order      INTEGER NOT NULL UNIQUE,
  stars_required  INTEGER NOT NULL,            -- 0,5,10,20,40,80,160,320 (exponential)
  rank_name       TEXT NOT NULL,               -- Gen Z slang
  reward_amount   INTEGER NOT NULL DEFAULT 0,  -- self-treat fund unlock (configurable)
  reward_currency TEXT NOT NULL DEFAULT 'VND'
);

-- 5. DAILY SUMMARY (drives the 50-pt bonus + streaks)
CREATE TABLE daily_summary (
  id                 INTEGER PRIMARY KEY,
  user_id            INTEGER NOT NULL REFERENCES users(id),
  local_date         TEXT NOT NULL,
  total_points       INTEGER NOT NULL DEFAULT 0,
  bonus_star_awarded INTEGER NOT NULL DEFAULT 0,  -- guarantees +1 fires once/day
  streak_count       INTEGER NOT NULL DEFAULT 0,  -- consecutive days hitting 50 pts
  UNIQUE(user_id, local_date)
);

-- 6. WEEKLY SUMMARY (drives ranks; resets Monday 00:00)
CREATE TABLE weekly_summary (
  id              INTEGER PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id),
  week_start      TEXT NOT NULL,                 -- Monday YYYY-MM-DD
  total_points    INTEGER NOT NULL DEFAULT 0,
  weekly_stars    INTEGER NOT NULL DEFAULT 0,    -- CURRENT balance (can be negative = debt)
  peak_stars      INTEGER NOT NULL DEFAULT 0,    -- high-water mark → tier unlocks
  current_tier_id INTEGER REFERENCES tiers(id),  -- rank from CURRENT weekly_stars
  start_debt      INTEGER NOT NULL DEFAULT 0,    -- carried-over negative balance
  finalized       INTEGER NOT NULL DEFAULT 0,    -- set true at Monday reset
  UNIQUE(user_id, week_start)
);

-- 7. REWARD UNLOCKS (self-treat fund ledger)
CREATE TABLE reward_unlocks (
  id              INTEGER PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id),
  tier_id         INTEGER NOT NULL REFERENCES tiers(id),
  week_start      TEXT NOT NULL,
  stars_at_unlock INTEGER NOT NULL,
  reward_amount   INTEGER NOT NULL,
  reward_currency TEXT NOT NULL DEFAULT 'VND',
  unlocked_at     TEXT NOT NULL DEFAULT (datetime('now')),
  claimed         INTEGER NOT NULL DEFAULT 0,
  claimed_at      TEXT,
  UNIQUE(user_id, tier_id, week_start)           -- one unlock per tier per week
);
```

---

## 3. Tier seed — Gen Z rank ladder (exponential)

A "glow-up" arc using current internet slang. Reward amounts are placeholders (`stars × 1000 VND`) — edit freely; the `"$5k"` from your spec maps to whatever currency/scale you set here.

```sql
INSERT INTO tiers (tier_order, stars_required, rank_name, reward_amount) VALUES
 (0,   0, 'NPC',            0),       -- no character development yet
 (1,   5, 'Locked In',      5000),
 (2,  10, 'Cooking',        10000),
 (3,  20, 'Sigma',          20000),
 (4,  40, 'Goated',         40000),
 (5,  80, 'Aura Farmer',    80000),
 (6, 160, 'Main Character', 160000),
 (7, 320, 'Final Boss',     320000);
```

Negative balance → UI shows an **"In the Negatives"** debt state below NPC.

---

## 4. Implementation logic

```ts
// ---------- POINTS ----------
function computePoints(tt: TaskType, durationMin?: number): number {
  if (tt.kind === 'BAD') return 0;
  if (!tt.is_time_based || !durationMin) return tt.base_points;     // 1 pt
  return Math.max(1, Math.floor(durationMin / TIME_UNIT_MINUTES));  // 90 → 3
}

// ---------- LOG A TASK / HABIT (single transaction) ----------
function logEvent(userId, taskTypeId, durationMin?, note?) {
  const tz        = getUser(userId).timezone;
  const now       = nowInTz(tz);
  const localDate = fmtDate(now);          // YYYY-MM-DD
  const weekStart = mondayOf(now, tz);     // ISO Monday in user tz
  const tt        = getTaskType(taskTypeId);

  runWeeklyResetIfNeeded(userId, now);     // local-first guard (see §5)
  const ws = getOrCreateWeek(userId, weekStart);
  const ds = getOrCreateDay(userId, localDate);

  if (tt.kind === 'GOOD') {
    const pts = computePoints(tt, durationMin);

    insertLog({ userId, taskTypeId, kind:'GOOD', durationMin, points:pts,
                starsDelta:+STARS_PER_TASK, source:'TASK', localDate, weekStart, note });
    applyStars(ws, +STARS_PER_TASK);
    ds.total_points += pts;  ws.total_points += pts;

    // Daily 50-pt bonus — fires exactly once per day
    if (ds.total_points >= DAILY_BONUS_THRESHOLD && !ds.bonus_star_awarded) {
      insertLog({ userId, taskTypeId, kind:'GOOD', points:0,
                  starsDelta:+DAILY_BONUS_STARS, source:'DAILY_BONUS', localDate, weekStart });
      applyStars(ws, +DAILY_BONUS_STARS);
      ds.bonus_star_awarded = 1;
      ds.streak_count = consecutiveBonusDays(userId, localDate);
    }
  } else { // BAD habit
    const penalty = tt.star_penalty || DEFAULT_PENALTY_STARS;
    insertLog({ userId, taskTypeId, kind:'BAD', points:0,
                starsDelta:-penalty, source:'PENALTY', localDate, weekStart, note });
    applyStars(ws, -penalty);              // weekly_stars may go negative
  }

  checkTierUnlocks(userId, ws);            // rewards (high-water mark)
  ws.current_tier_id = rankFor(ws.weekly_stars);  // rank (current balance)
  saveWeek(ws); saveDay(ds);
}

// peak_stars only ever rises → debt can't revoke an unlocked reward
function applyStars(ws, delta) {
  ws.weekly_stars += delta;
  if (ws.weekly_stars > ws.peak_stars) ws.peak_stars = ws.weekly_stars;
}

// Reward unlocks on CROSSING/PASSING a threshold; loop handles multi-tier overshoot.
// UNIQUE(user,tier,week) makes it idempotent → no double-unlock after debt + reclimb.
function checkTierUnlocks(userId, ws) {
  for (const t of getTiers()) {
    if (t.stars_required > 0
        && ws.peak_stars >= t.stars_required
        && !rewardExists(userId, t.id, ws.week_start)) {
      insertRewardUnlock({ userId, tierId:t.id, weekStart:ws.week_start,
        starsAtUnlock:ws.weekly_stars, rewardAmount:t.reward_amount,
        currency:t.reward_currency });
    }
  }
}

// Rank = highest tier whose threshold <= CURRENT balance (drops with debt)
function rankFor(weeklyStars) {
  const t = getTiers().sort((a,b)=>b.stars_required-a.stars_required)
                      .find(t => weeklyStars >= t.stars_required);
  return (t ?? tier0).id;   // negative balance → NPC / debt state in UI
}
```

---

## 5. Weekly reset (Monday 00:00, user-local)

```ts
function runWeeklyResetIfNeeded(userId, now) {
  const tz   = getUser(userId).timezone;
  const mon  = mondayOf(now, tz);
  const prev = getWeek(userId, previousMonday(mon));
  if (!prev || prev.finalized) return;

  prev.finalized = 1;
  prev.current_tier_id = rankFor(prev.weekly_stars);
  saveWeek(prev);

  // carry debt forward so the punishment can't be "waited out"
  const carry = (getUser(userId).carry_debt && prev.weekly_stars < 0)
              ? prev.weekly_stars : 0;
  const next = getOrCreateWeek(userId, mon);
  next.weekly_stars = carry;
  next.start_debt   = carry;
  next.peak_stars   = Math.max(0, carry);
  saveWeek(next);
}
```

- **Local-first:** call `runWeeklyResetIfNeeded` on app open — no cron needed.
- **Cloud multi-user:** a server job at each user's local Monday 00:00 (group users by tz) does the same finalize+rollover.

---

## 6. Self-treat fund (queries)

```sql
-- Available fund (unclaimed unlocks)
SELECT COALESCE(SUM(reward_amount),0) AS available, reward_currency
FROM reward_unlocks WHERE user_id = ? AND claimed = 0 GROUP BY reward_currency;

-- Claim a reward (mark paid-out)
UPDATE reward_unlocks SET claimed = 1, claimed_at = datetime('now') WHERE id = ?;
```

---

## 7. Edge cases handled

| Case | Resolution |
|---|---|
| Multi-tier overshoot (4→6 skips, or 4→25) | Loop unlocks **all** crossed tiers via `peak_stars` |
| Penalty after unlock | Reward persists (high-water mark); only rank drops |
| Re-climb after debt | No re-unlock — `UNIQUE(user,tier,week)` |
| Double daily bonus | Blocked by `bonus_star_awarded` flag |
| Timezone / DST on Monday reset | All dates computed in `users.timezone` |
| Audit / undo | `activity_log` is append-only; rollups are rebuildable from it |
```
