# Multiplier Boost — Implementation Plan (condensed review)

Source spec: `Multiplier Boost - Plan.md` (attached, prototype-scale numbers).
This doc reconciles that spec against the actual habit-tracker codebase and
records the decisions taken before implementation. Written in place of the
full gstack `/autoplan` CEO/Design/Eng/DX pipeline — that pipeline is scaled
for cross-team product review (dual AI voices, codex web-search calls,
telemetry); this is a single hero-surface feature in a solo-dev app, so the
review below covers the same ground (premises, scope, architecture, test
plan) without the enterprise machinery.

## Premises (CEO)

1. "Boost takes over the hero star-balance card" — **false today**. Commit
   `f185dac`/`2d1fc26` merged the old hero card into `HomeHeatmap.tsx`; the
   `heroLabel`/`upDelta`/`noDelta` i18n keys are dead. Decision: build a new,
   isolated `BoostCard` rendered above `HomeHeatmap` rather than deep-editing
   the heavily-used heatmap card. Lower blast radius, same user-visible
   effect (colored surface at the top of Today).
2. Spec's `BASE = 10` stars/log doesn't match the app's real
   `STARS_PER_TASK = 1` (`constants.ts:2`). Decision: multiply the real
   constant, not a fictional one. A x2 boost is +2★/log, not +20.
3. `streakMilestones.ts` already has a **cosmetic-only** `multiplier: 2 | 3`
   field ("⚡ 2× stars today" toast) that never actually multiplies
   `stars_delta` (migration v21 comment). Multiplier Boost is a separate,
   *functional* multiplier. Two different "×2" claims now coexist in the
   app — one real, one cosmetic. Out of blast radius to fix now (shipped,
   tested, unrelated commit); flagged to TODOS.md as a follow-up to
   relabel the streak toast copy so it doesn't read as the same mechanic.
4. Colorway switcher (gold/green/aura × ×2/×3) in spec §5/§8 is a prototype
   control for comparing the two static mockup phones, not a confirmed
   runtime user setting. Decision: ship the gold family only (already
   matches existing `starGold`/`rewardCta` iconography); defer family
   selection to TODOS.md — nothing in the app currently persists a "boost
   color" preference, so it's a clean, separate addition later.

## User decision (asked, not auto-decided)

`stars_delta` is the single source that feeds `weekly_summary.weekly_stars`
(rank progress) **and** `users.treat_stars` (spendable pool, 1★ = 1000 VND
per `constants.ts:22`, used to buy streak freezes). Multiplying at the one
clean insertion point multiplies both. This is a real-money-adjacent
product call, not a taste call — asked the user directly.

**Decision: scale both.** One multiplier, one insertion point
(`computeLogTaskRows`), no special-casing. A x2/x3 boost genuinely doubles
or triples everything earned from logging that day, including treat
currency.

## Scope

**In scope:**
- `boost_events` table (one row per user per local day): multiplier, claim
  deadline, claimed/expires/dismissed timestamps.
- Pure phase-derivation logic (`available → active → expiring → expired`,
  plus an internal `none` phase for "missed the claim window") as a
  function of `(now, event)` — never accumulated/mutated state, so a
  suspended timer or backgrounded app self-corrects on the next tick.
- Multiplier applied at write time, inside the existing `useLogTask`
  transaction (single source of truth, race-free — see Eng below).
- New `BoostCard` component: claim card, active/expiring hero treatment,
  expired dismissible summary sheet (reusing `BackfillSheet`'s
  slide-up-with-scrim skeleton).
- `TaskRow` gets an optional boosted-rate hint on not-yet-logged rows
  ("×2" chip) — the post-log `★` amount already reflects the multiplier
  for free, since it reads `SUM(stars_delta)` from `activity_log`.
- VI/EN copy for all new strings.
- Unit tests for the pure phase/multiplier logic.

**Not in scope (deferred to TODOS.md):**
- Colorway switcher (gold/green/aura) — ship gold only.
- Server-granted/paywalled ×3 — client rolls the multiplier locally for now
  (`BOOST_RARE_CHANCE`), matching the app having no backend event service.
- Relabeling the cosmetic streak-milestone "×m stars" copy.
- Analytics events (`boost_claimed`, `boost_expired`) — no analytics
  pipeline exists in the app today to send them to.

## Architecture (Eng)

```
TodayScreen
 ├─ useBoostEvent(userId)      today's boost_events row (lazy-created)
 ├─ useBoostPhase(event)       1s tick + AppState('active') resume → pure phase fn
 ├─ useClaimBoost / useDismissBoost
 ├─ useBoostSummary(userId, event)   SUM/COUNT activity_log in [claimed_at, expires_at)
 ├─ <BoostCard .../>           renders above <HomeHeatmap>
 └─ <TaskRow boostMultiplier={...} />
```

Race-safety: the multiplier used for a given log is **read inside the same
`db.withTransactionAsync` as the write**, comparing `loggedAt` against the
boost row's `expires_at` at transaction time — never trusting client-side
`phase` state, which can be stale by up to 1 tick. This mirrors the existing
TOCTOU-safe pattern already used for streak/tier writes in `useLogTask`.
Claim is guarded by `UPDATE ... WHERE claimed_at IS NULL` (same idiom as
`awardStreakMilestone`'s `INSERT OR IGNORE`), so a double-tap can't open two
overlapping windows.

`boostStars`/`boostLogs` for the summary sheet are **derived**, not stored —
queried from `activity_log` (the documented source of truth), never a
second bookkeeping column that could drift.

New table only; `ACTIVITY_SYNC_COLUMNS` in `syncService.ts` is unchanged
since `stars_delta` already syncs and already carries the boosted value.
`boost_events` itself is local-only (not synced) — today's boost has no
cross-device meaning.

## Test plan

- `__tests__/boost.test.ts`: phase derivation at every boundary (before
  claim deadline, after deadline/never claimed, just-claimed, the 300s
  expiring threshold from both sides, exactly at `expires_at`, after
  dismissal), multiplier roll distribution, countdown formatting.
- Stress pass (post-implementation): concurrent double-claim, log landing
  exactly at `expires_at`, clock skew/DST, app backgrounded through
  expiry, multiplier persistence across app restart mid-window.
