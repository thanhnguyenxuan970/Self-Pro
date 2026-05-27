# Habit Tracker — UI Architecture, Components & Schema Extension

Extends `habit_tracker_schema.md` (the 7 base tables). This doc adds: navigation/IA, the React Native component tree, the categories + savings-ledger tables, the viral-meme rank ladder, and analytics views.

---

## 1. Navigation architecture (IA)

```
App
└─ Tab navigator (bottom, 4 tabs — minimal)
   ├─ Today      → primary tracking screen (default)
   ├─ Progress   → analytics (D/W/M/Y time-series)
   ├─ Fund       → self-reward savings + ledger
   └─ Me         → rank ladder, streak, settings
   Modals (pushed over any tab):
   ├─ QuickLog   → add/log a task with optional timer
   ├─ LogTreat   → record a withdrawal from the fund
   └─ ManageTasks→ CRUD task types + categories
```

Single-thumb reachable. No nested tabs, no hamburger — minimalism is the spec.

---

## 2. Component tree (per screen)

```
<TodayScreen>
  <TopBar>            logo mark · <RankBadge/> · todayPoints
  <CategoryChips/>    horizontal scroll; All + dynamic categories
  <TaskList>
    <TaskRow>         <IconCheckbox/> name <PointHint/ | TimerHint/>
    <TaskRow kind=BAD> red <IconCheckbox state=penalty/> name −50★
  <AddTaskFAB/>       → QuickLog modal
  <BottomTabBar/>

<ProgressScreen>
  <RangeToggle/>      D | W | M | Y (segmented)
  <TimeSeriesChart/>  bars/line; good=accent, penalties=danger
  <StatStrip>         <Stat streak/> <Stat starsThisWeek/> <Stat toNextTier/>

<FundScreen>
  <FundHeader/>       available balance · next-tier hint + progress bar
  <LedgerList>
    <LedgerRow type=DEPOSIT/>     rank name · +amount (green)
    <LedgerRow type=WITHDRAWAL/>  treat note · −amount (red)
    <LedgerRow type=BALANCE/>     running balance
  <LogTreatButton/>   → LogTreat modal

<MeScreen>
  <RankLadder/>       8 tiers; current highlighted; debt state if negative
  <StreakCard/> <SettingsList currency, timezone, carryDebt/>

Shared: <IconCheckbox/> <RankBadge/> <CurrencyText/> <ProgressBar/>
```

State: TanStack Query over the local DB (SQLite via op-sqlite/Drizzle); each log mutation invalidates `today`, `week`, `fund` queries.

---

## 3. Schema extension

```sql
-- A. CATEGORIES (drives the filter chips)
CREATE TABLE categories (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  name        TEXT NOT NULL,                 -- "Mind", "Body", "Discipline"
  icon        TEXT NOT NULL DEFAULT 'circle',-- Tabler icon name
  sort_order  INTEGER NOT NULL DEFAULT 0,
  archived    INTEGER NOT NULL DEFAULT 0
);

-- B. extend task_types with icon + category
ALTER TABLE task_types ADD COLUMN category_id INTEGER REFERENCES categories(id);
ALTER TABLE task_types ADD COLUMN icon TEXT NOT NULL DEFAULT 'square-check';

-- C. FUND TRANSACTIONS (unified deposit/withdrawal ledger)
CREATE TABLE fund_transactions (
  id              INTEGER PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id),
  type            TEXT NOT NULL CHECK (type IN ('DEPOSIT','WITHDRAWAL')),
  amount          INTEGER NOT NULL,             -- always positive; sign by type
  currency        TEXT NOT NULL DEFAULT 'VND',
  source_unlock_id INTEGER REFERENCES reward_unlocks(id), -- set for DEPOSITs
  note            TEXT,                          -- "Cà phê", "New game"
  occurred_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_fund_user ON fund_transactions(user_id, occurred_at);
```

Deposit flow: when `checkTierUnlocks` inserts a `reward_unlocks` row, also insert a matching `DEPOSIT` in `fund_transactions` (or generate deposits lazily from unclaimed unlocks — pick one source of truth; the explicit ledger is cleaner for the spec's "update spent amounts" requirement).

```sql
-- Fund balance (cumulative, e.g. 5k + 10k − 20k)
SELECT COALESCE(SUM(CASE WHEN type='DEPOSIT' THEN amount ELSE -amount END),0) AS balance
FROM fund_transactions WHERE user_id = ?;
```

---

## 4. Rank ladder — viral meme/trend names

Same exponential star thresholds; names pulled from current viral internet culture (TikTok/IG/Threads). **Practical note: memes decay fast — keep `rank_name` a config value you can seasonally swap without touching logic.**

```sql
UPDATE tiers SET rank_name = CASE tier_order
  WHEN 0 THEN 'NPC'             -- background character, no arc yet
  WHEN 1 THEN 'Delulu'         -- manifesting the glow-up
  WHEN 2 THEN 'Mewing'         -- locked in, grinding
  WHEN 3 THEN 'Rizz'           -- momentum / charisma
  WHEN 4 THEN 'Gigachad'       -- peak discipline
  WHEN 5 THEN 'Aura Farmer'    -- racking up aura points
  WHEN 6 THEN 'Main Character'  -- main character energy
  WHEN 7 THEN 'GOATED'         -- final form
END;
```

Negative balance → display state `"Caught in 4K"` (busted) below NPC, signalling debt.

---

## 5. Analytics — time-series via views (no redundant storage)

All series derive from `activity_log`; expose as SQL views, query by range.

```sql
-- Daily series (points + net stars per day)
CREATE VIEW v_daily AS
SELECT user_id, local_date AS bucket,
       SUM(points_earned) AS points,
       SUM(stars_delta)   AS net_stars
FROM activity_log GROUP BY user_id, local_date;

-- Monthly / yearly: bucket on substr(local_date,1,7) and substr(...,1,4)
CREATE VIEW v_monthly AS
SELECT user_id, substr(local_date,1,7) AS bucket,
       SUM(points_earned) AS points, SUM(stars_delta) AS net_stars
FROM activity_log GROUP BY user_id, substr(local_date,1,7);
```

- Day / Week → read `daily_summary` / `weekly_summary` (already maintained).
- Month / Year → `v_monthly` / a yearly view.
- Penalty bars rendered separately (filter `source='PENALTY'`) so the chart shows the "easy to lose" drops in red.

---

## 6. Logo direction (minimal)

A single mark: an outline circle with a `+1%` lockup, or a checkbox-square that doubles as the app icon. Monochrome, one weight, scales to a 1024² app icon without detail loss. No mascot, no gradient — consistent with the no-heavy-graphics spec.
