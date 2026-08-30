# Analytics Year Stars Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every account-level star total and social ranking use the same Analytics Year KPI rather than lifetime stars.

**Architecture:** Keep lifetime columns and economy/recovery writes intact as internal state. Introduce explicit annual public RPCs for Global and Friends so every player is ranked with the same server-side calculation; the client never substitutes a local value for only `YOU`. Reuse the existing local Analytics Year query for personal surfaces and achievement star totals.

**Tech Stack:** Expo SDK 56, React Native, TypeScript, TanStack Query, expo-sqlite, Supabase PostgreSQL migrations, Jest.

**Spec:** `docs/superpowers/specs/2026-08-30-analytics-year-stars-contract.md`

## Global Constraints

- Use positive `activity_log.stars_delta` rows with `source = 'TASK'` only.
- Bound current-year rows by the current calendar year, today, and `activity_start_date`.
- Keep lifetime/economy/recovery storage and RPCs unchanged.
- Preserve privacy: annual social RPCs return pseudonymous player IDs only.
- Do not deploy or write production Supabase data in this task.
- Preserve unrelated dirty work and all emulator/SQLite data.

---

### Task 1: Lock the annual display contract with failing tests

**Files:**
- Modify: `__tests__/useLeaderboard.test.ts`
- Modify: `__tests__/rankDisplayConsistency.test.ts`
- Modify: `__tests__/friends.test.ts`
- Create: `__tests__/analyticsYearLeaderboardMigration.test.ts`
- Modify: `__tests__/leaderboardCompatibility.test.ts`

**Interfaces:**
- The client leaderboard model exposes `yearStars`, not a lifetime value.
- The Friends model exposes `year_stars`/`yearStars` for its social rows.
- The new migration exposes `get_global_year_leaderboard_v1` and `get_my_year_friend_dashboard` with annual-star return fields.

- [x] **Step 1: Update test fixtures and assertions to use annual names and values.**
- [x] **Step 2: Add a regression assertion that a server row's annual value is used for every player, including the current user; a local fallback may only be used when the server value is absent.**
- [x] **Step 3: Add static migration assertions for the annual source filter, date bounds, account boundary, privacy, authenticated grants, and no lifetime ordering.**
- [x] **Step 4: Run the focused tests and verify they fail for the missing annual RPC/model behavior.**

Run from the application directory:

```powershell
npx.cmd jest --runInBand __tests__/useLeaderboard.test.ts __tests__/rankDisplayConsistency.test.ts __tests__/friends.test.ts __tests__/analyticsYearLeaderboardMigration.test.ts __tests__/leaderboardCompatibility.test.ts
```

Expected: FAIL because the current client still calls the lifetime Global/Friends RPCs and exposes lifetime field names.

### Task 2: Make client models and visible surfaces annual

**Files:**
- Modify: `src/queries/useLeaderboard.ts`
- Modify: `src/lib/rankDisplay.ts`
- Modify: `src/components/RankBoardTop15.tsx`
- Modify: `src/screens/RankScreen.tsx`
- Modify: `src/qa/qaSandbox.ts`
- Modify: `src/lib/friends.ts`
- Modify: `src/api/friendsApi.ts`
- Modify: `src/queries/useFriends.ts`
- Modify: `src/components/friends/FriendRow.tsx`
- Modify: `src/components/friends/FriendsSection.tsx`
- Modify: `src/queries/useProgress.ts`
- Modify: `src/screens/ProfileScreen.tsx`
- Modify: `src/screens/TrophyShelfScreen.tsx`
- Modify: `src/components/BadgeUnlockCelebration.tsx`

**Interfaces:**
- `LeaderboardEntry.yearStars` is the only star total used by Global board math/rendering.
- `FriendLadderRow.yearStars` is the only star total used by Friends ladder/summary math/rendering.
- `useAllTimeStats().totalStars` is retained for caller compatibility but now means the Analytics Year TASK-star KPI; other all-time achievement metrics remain unchanged.

- [x] **Step 1: Rename the social display fields and update local/sandbox fixtures without changing lifetime writes or backup payloads.**
- [x] **Step 2: Change `useLeaderboard` to call `get_global_year_leaderboard_v1`; remove the lifetime snapshot call and do not fall back to `get_global_leaderboard_v2`.**
- [x] **Step 3: Remove the current-user-only display override; use the server annual value for a real row and the local annual value only for the pre-server fallback row.**
- [x] **Step 4: Change Friends parsing/query/rendering and catch-gap calculations to use the annual field and annual copy for every ladder row.**
- [x] **Step 5: Change the `totalStars` field returned by `useAllTimeStats` to call the shared Analytics Year query, and include today/boundary in its query key so it cannot stay stale across a year/day boundary.**
- [x] **Step 6: Run the focused tests and verify they pass.**

### Task 3: Add server-authoritative annual social RPCs

**Files:**
- Create: `supabase/migrations/069_analytics_year_social_leaderboards.sql`
- Modify: `__tests__/analyticsYearLeaderboardMigration.test.ts`

**Interfaces:**
- `get_global_year_leaderboard_v1(p_limit integer DEFAULT 50)` returns `player_id uuid, year_stars real, rank bigint, is_current_user boolean, current_streak integer, rank_delta_7d integer`.
- `get_my_year_friend_dashboard()` returns the existing social row shape with `year_stars real` and ranks accepted members by annual stars.

- [x] **Step 1: Implement a shared SQL annual aggregation inside each SECURITY DEFINER function using positive TASK rows, valid `local_date`, current-year bounds, and `activity_start_date`.**
- [x] **Step 2: Keep Global's top-50 plus caller-neighbourhood behavior, pseudonymous IDs, stable email tie-break only inside the server, and `rank_delta_7d = NULL` until an annual snapshot history exists.**
- [x] **Step 3: Keep Friends incoming/outgoing privacy behavior and rank only self plus accepted members by annual stars.**
- [x] **Step 4: Revoke PUBLIC/anon/authenticated execution and grant only `authenticated`; do not alter existing lifetime RPCs.**
- [x] **Step 5: Run the static migration tests and inspect the SQL for syntax/contract mismatches.**

### Task 4: Code gate and regression review

**Files:**
- Modify: `CHANGELOG.md` only if the final behavior description needs correction.

- [x] **Step 1: Run TypeScript.**

```powershell
npx.cmd tsc --noEmit
```

- [x] **Step 2: Run the complete Jest suite.**

```powershell
npx.cmd jest --runInBand
```

- [x] **Step 3: Run diff hygiene.**

```powershell
git diff --check
```

- [x] **Step 4: Re-read the exact diff and verify no lifetime accounting, backup, auth, or unrelated dirty file was changed.**

## Deployment boundary

The new migration is source-only until explicitly deployed. Production Global/Friends cannot prove the annual contract until migration 069 is applied and the same-identity authenticated app flow is exercised; the client must show unavailable rather than display lifetime values during that gap.

## Completion status

COMPLETE for the source and local regression scope. The annual display contract is implemented across the app, while migration 069 remains intentionally undeployed. TypeScript, the complete Jest suite, and diff hygiene pass. `supabase db lint --local` could not connect because no local Postgres instance is running; the migration was checked by static tests and manual SQL contract review.

### Known Errors & Fixes

| Check | Result | Follow-up |
| --- | --- | --- |
| `supabase db lint --local` | Blocked by unavailable local Postgres | Run database lint in an environment with the project database available before deployment. |
