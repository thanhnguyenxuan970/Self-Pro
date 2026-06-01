# Treats System — Schema & Logic (replaces the Fund flow)

Supersedes `tiers`-as-rewards + `fund_transactions` from the earlier schema. Stars no longer "deposit" into a balance — they accumulate in a **savings pool** that **unlocks named treats**, and enjoying a treat **spends** stars from the pool.

---

## 1. The model decision (why a shared pool)

The reframed UI shows treats at different unlock distances ("26★ to unlock", "276★ to unlock") — these are all measured against **one accumulating pool**, not per-treat sub-accounts.

```
GOOD task / daily bonus  ──►  treat_stars  (savings pool, never resets)
                              │
                              ├─ treat.unlockable when pool ≥ treat.target_stars
                              └─ "Enjoy" a treat  ──►  pool −= target_stars (spend)

GOOD/BAD also ──► weekly_stars (resets Mon, drives RANK + leaderboard — unchanged)
```

**Two balances, two jobs:**
| Balance | Resets? | Drives | Penalty effect |
|---|---|---|---|
| `weekly_stars` | Mon 00:00 | Rank + leaderboard | Goes negative (debt) — unchanged |
| `treat_stars` (pool) | Never | Treat unlocks | Floors at 0 (configurable) |

This split is what removes the "bank account" confusion: there's no single money number — the pool is just a quiet progress counter behind named goals.

---

## 2. Schema

```sql
-- Pool lives on the user (single counter; lifetime is audit-only, never decreases)
ALTER TABLE users ADD COLUMN treat_stars          INTEGER NOT NULL DEFAULT 0; -- spendable pool
ALTER TABLE users ADD COLUMN treat_stars_lifetime INTEGER NOT NULL DEFAULT 0; -- audit / "total earned"
ALTER TABLE users ADD COLUMN value_per_star       INTEGER NOT NULL DEFAULT 1000;  -- 1★ = 1.000đ
ALTER TABLE users ADD COLUMN penalty_hits_treats  INTEGER NOT NULL DEFAULT 1;     -- 1 = "easy to lose"

-- The wishlist
CREATE TABLE treats (
  id            INTEGER PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id),
  name          TEXT NOT NULL,                 -- "Bubble tea", "New headphones"
  icon          TEXT NOT NULL DEFAULT 'gift',  -- Tabler icon name
  target_stars  INTEGER NOT NULL,              -- stars needed to unlock
  approx_amount INTEGER NOT NULL,              -- real money shown as muted sub-label (≈20k)
  currency      TEXT NOT NULL DEFAULT 'VND',
  status        TEXT NOT NULL DEFAULT 'ACTIVE'
                CHECK (status IN ('ACTIVE','ENJOYED','ARCHIVED')),
  sort_order    INTEGER NOT NULL DEFAULT 0,
  reached_at    TEXT,                          -- first time pool >= target (for "ready!" nudge)
  enjoyed_at    TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_treats_user ON treats(user_id, status, sort_order);

-- Optional: keep an "enjoyed" history (replaces fund_transactions' withdrawal log)
CREATE TABLE treat_history (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  treat_id    INTEGER NOT NULL REFERENCES treats(id),
  name        TEXT NOT NULL,                   -- snapshot (treat may be edited later)
  stars_spent INTEGER NOT NULL,
  amount      INTEGER NOT NULL,
  currency    TEXT NOT NULL DEFAULT 'VND',
  enjoyed_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**Target from price:** when the user adds a treat by real price, derive stars:
`target_stars = round(approx_amount / value_per_star)` → 300.000đ ÷ 1.000 = 300★.

---

## 3. Logic

```ts
// ---- EARN: good task / bonus feeds BOTH balances ----
function onStarsEarned(user, delta) {            // delta > 0
  applyStars(weekState, +delta);                 // existing weekly/rank logic (unchanged)
  user.treat_stars          += delta;            // savings pool
  user.treat_stars_lifetime += delta;
  markNewlyReached(user);                         // flip reached_at on any treat now affordable
}

// ---- PENALTY: weekly takes full hit; pool optionally bitten, floored at 0 ----
function onPenalty(user, penalty) {              // penalty > 0
  applyStars(weekState, -penalty);               // weekly_stars CAN go negative (debt)
  if (user.penalty_hits_treats) {
    user.treat_stars = Math.max(0, user.treat_stars - penalty);  // pool never < 0
  }
}

// ---- DISPLAY computeds (per treat) ----
function decorate(treat, user) {
  return {
    ...treat,
    unlockable:    treat.status === 'ACTIVE' && user.treat_stars >= treat.target_stars,
    starsToUnlock: Math.max(0, treat.target_stars - user.treat_stars),
    progressPct:   Math.min(100, Math.round(user.treat_stars / treat.target_stars * 100)),
  };
}

// ---- ENJOY: spend stars from the pool (the only "withdrawal") ----
function enjoyTreat(user, treatId) {
  const t = getTreat(treatId);
  if (t.status !== 'ACTIVE')                 throw new Error('Already enjoyed / archived');
  if (user.treat_stars < t.target_stars)     throw new Error('Not enough stars yet');

  user.treat_stars -= t.target_stars;        // spend — pool drops, other treats re-progress
  t.status = 'ENJOYED';
  t.enjoyed_at = nowIso();
  insertTreatHistory({ userId:user.id, treatId:t.id, name:t.name,
                       starsSpent:t.target_stars, amount:t.approx_amount, currency:t.currency });
  save(user, t);
}

// flips reached_at once, to fire a "🎉 ready to enjoy" nudge without spamming
function markNewlyReached(user) {
  for (const t of activeTreats(user.id)) {
    if (!t.reached_at && user.treat_stars >= t.target_stars) {
      t.reached_at = nowIso(); saveTreat(t); notifyReady(t);
    }
  }
}
```

---

## 4. Migration from the old fund

```sql
-- 1. Seed the pool from any prior unclaimed unlocks (if you kept reward_unlocks)
UPDATE users SET treat_stars =
  (SELECT COALESCE(SUM(stars_at_unlock),0) FROM reward_unlocks
   WHERE user_id = users.id AND claimed = 0);

-- 2. Convert old fixed tiers into starter treats (optional, gives users something to chase)
INSERT INTO treats (user_id, name, icon, target_stars, approx_amount)
SELECT u.id, t.rank_name || ' treat', 'gift', t.stars_required, t.reward_amount
FROM users u CROSS JOIN tiers t WHERE t.stars_required > 0;

-- 3. fund_transactions / reward_unlocks can be dropped or kept read-only for history.
```

---

## 5. Edge cases

| Case | Resolution |
|---|---|
| Enjoy two treats, second now unaffordable | Pool is shared — second correctly shows it needs more stars again |
| Penalty after a treat became "reached" | Pool drops; `reached_at` stays (history), but `unlockable` recomputes false until re-earned |
| User edits a treat's price after reaching it | Recompute `target_stars`; `reached_at` re-evaluates on next earn |
| `penalty_hits_treats = 0` | Pool only grows — gentler mode; weekly rank still punishes (keeps "lose" pressure without nuking savings) |
| Pool can't go negative | `Math.max(0, …)` — "savings toward a treat" has no debt concept (debt lives only in the weekly rank) |
| Archive instead of delete | `status='ARCHIVED'` preserves history integrity |
```
