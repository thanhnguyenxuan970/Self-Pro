# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## MCP Tools: code-review-graph

**IMPORTANT: This project has a knowledge graph. ALWAYS use the
code-review-graph MCP tools BEFORE using Grep/Glob/Read to explore
the codebase.** The graph is faster, cheaper (fewer tokens), and gives
you structural context (callers, dependents, test coverage) that file
scanning cannot.

### When to use graph tools FIRST

- **Exploring code**: `semantic_search_nodes` or `query_graph` instead of Grep
- **Understanding impact**: `get_impact_radius` instead of manually tracing imports
- **Code review**: `detect_changes` + `get_review_context` instead of reading entire files
- **Finding relationships**: `query_graph` with callers_of/callees_of/imports_of/tests_for
- **Architecture questions**: `get_architecture_overview` + `list_communities`

Fall back to Grep/Glob/Read **only** when the graph doesn't cover what you need.

### Key Tools

| Tool | Use when |
|------|----------|
| `detect_changes` | Reviewing code changes — gives risk-scored analysis |
| `get_review_context` | Need source snippets for review — token-efficient |
| `get_impact_radius` | Understanding blast radius of a change |
| `get_affected_flows` | Finding which execution paths are impacted |
| `query_graph` | Tracing callers, callees, imports, tests, dependencies |
| `semantic_search_nodes` | Finding functions/classes by name or keyword |
| `get_architecture_overview` | Understanding high-level codebase structure |
| `refactor_tool` | Planning renames, finding dead code |

### Workflow

1. The graph auto-updates on file changes (via hooks).
2. Use `detect_changes` for code review.
3. Use `get_affected_flows` to understand impact.
4. Use `query_graph` pattern="tests_for" to check coverage.

---

## What This Repo Is

A **workspace of agent prompt files and design specs** — not a buildable project itself. Two active projects live here:

- **Habit Tracker** — Gamified habit tracking React Native app. Day 18 COMPLETE (2026-06-01).

---

## Dev Process (process.md)

All implementation tasks follow the 6-phase loop defined in `process.md`. Run phases in order — never skip:

| Phase | Action | Skill/file |
|---|---|---|
| 1 — VALIDATE PLAN | Check plan for gaps before touching code | `check_plan` skill → `check_plan.md` |
| 2 — IMPLEMENT | Write code | — |
| 3 — VERIFY CODE | Review-fix-optimize loop until clean | `check_code` skill → `check_code.md` |
| 4 — REVIEW & FIX | Final review with caveman-review | `caveman:caveman-review` skill |
| 5 — CLOSE | Finalize delivery | `close` skill → `close.md` |
| 6 — COMMIT | Generate commit message | `caveman:caveman-commit` skill |

**Skill reference** (exact names for the `Skill` tool):

| File | Skill name |
|---|---|
| `check_plan.md` | `check_plan` |
| `check_code.md` | `check_code` |
| `review.md` | `review` |
| `close.md` | `close` |

---

## Agent Files

| File | Role |
|---|---|
| `stress-test-agent.md` | Adversarial probe — concurrency, auth, input, boundaries |
| `code-reviewer.md` | Code review — correctness, security, invariant compliance |
| `pr-preparer.md` | Commit message + PR description + sensitive file check |
| `test-runner.md` | Run all tests, report results with file/line context |
| `check_code.md` | Iterative review→fix→optimize loop |
| `check_plan.md` | Iterative plan→fix loop (target ≥95% confidence) |

---

## Habit Tracker Architecture

**Status:** Day 18 COMPLETE (2026-06-01). Code lives at `c:\Users\Admin\Desktop\Self-Pro\habit-tracker\`.

**Stack:** React Native + Expo SDK 56 + expo-sqlite (async API) + drizzle-orm (types only, raw SQL for runtime) + TanStack Query v5 + React Navigation v6 bottom tabs + Jest 30 + ts-jest 29 + expo-auth-session v5 + expo-web-browser

**Data model:** append-only `activity_log` as source of truth; derived rollups via `daily_summary` / `weekly_summary`.

**Navigation:** 5 bottom tabs + center FAB — Home (🏠), Analytics (📊), [+FAB], Fund (💰), Rank (🏆). ProfileScreen accessed via avatar tap (modal). Auth gate: `googleUser !== null && isOnboarded` → AppStack; else → SignIn → Onboarding.

**State:** TanStack Query over local DB; each log mutation invalidates `today`, `week`, `fund`, `progress` queries.

**Rank system:** 8-tier Gen Z rank ladder. Weekly reset Monday 00:00 user-local. Self-treat fund in VND.

### Key Decisions (Day 1)
- `drizzle-orm` used for TypeScript type inference only — NOT for query execution. All runtime queries use raw expo-sqlite API (`db.runAsync`, `db.getAllAsync`, `db.getFirstAsync`).
- `getDb()` returns `Promise<SQLiteDatabase>` (singleton pattern caching the promise). App.tsx awaits it before mounting navigator.
- All DB writes in `useLogTask` wrapped in `db.withTransactionAsync` for atomicity (includes activity, daily/weekly summary, tier unlocks, fund deposits).
- Default seed: user_id=1 (`me`), 8 tiers, 1 task (`Exercise`) seeded in `runMigrations`.
- `jest.config.js` uses `transform` (not deprecated `globals`) for ts-jest. `tsconfig.json` has `"types": ["jest"]`.

### Key Decisions (Day 2)
- `App.tsx` weekly reset: single `UPDATE weekly_summary SET finalized=1 WHERE week_start < ?` — handles multi-week gaps in one SQL call. Dropped `computeWeeklyReset` from App.tsx (pure fn kept for tests, no longer called at startup).
- Tier unlock detection reads `oldStars` BEFORE transaction, uses `INSERT OR IGNORE` + `r.changes > 0` guard to prevent duplicate `fund_transactions` deposits.
- `starPenalty` validation in `MeScreen.handleSave` now gated on `form.kind === 'BAD'` to avoid confusing errors when kind toggled after entering BAD values.
- `archiveTask` uses `mutateAsync().catch()` in Alert callback for error surfacing.
- `renderRow` in `FundScreen` moved to module level (no closure captures → stable ref).

### Day 2 Files Created/Modified
```
habit-tracker/
├── src/constants.ts              ← SOURCE_TASK, SOURCE_DAILY_BONUS, SOURCE_PENALTY
├── src/logic/logTask.ts          ← use SOURCE_* constants
├── src/logic/weeklyReset.ts      ← NEW: computeWeeklyReset()
├── src/logic/tierUnlocks.ts      ← NEW: computeTierUnlocks()
├── src/queries/useToday.ts       ← tier unlock + fund deposit in transaction
├── src/queries/useFund.ts        ← NEW: useFundBalance, useFundLedger
├── src/queries/useTasks.ts       ← NEW: useCreateTask, useUpdateTask, useArchiveTask
├── src/screens/FundScreen.tsx    ← balance header + ledger
├── src/screens/MeScreen.tsx      ← task CRUD with create/edit/archive modal
├── App.tsx                       ← weekly reset on startup
└── __tests__/
    ├── weeklyReset.test.ts       ← 3 tests
    └── tierUnlocks.test.ts       ← 5 tests
Total: 14/14 tests pass
```

### Key Decisions (Day 3)
- `streak_count` computed by reading yesterday's `daily_summary` row BEFORE the transaction (outside `withTransactionAsync`). Guard is `daily === null` (first log of day). `ON CONFLICT DO UPDATE` intentionally omits `streak_count` — set once on INSERT, never overwritten.
- `victory-native@^36` pinned (NOT v40+). v40 switched to `@shopify/react-native-skia` — different API. v36 uses `react-native-svg` (SVG-based, compatible with Expo SDK 56).
- `useProgressData` queryKey uses `rangeKey` scoped to the active range (`today` for D, `weekStart` for W, `monthPrefix` for M, `year` for Y) — avoids stale cache across date boundaries.
- `ProgressScreen` uses named export `export function ProgressScreen()` (not default) — matches existing `import { ProgressScreen }` in `RootNavigator.tsx`.
- `FundScreen.handleSpend` uses `mutateAsync` wrapped in try/catch — surfaces DB errors via `Alert` without crashing.
- `react-native-svg` is a native module — requires `npx expo run:android` (not Expo Go).

### Day 3 Files Created/Modified
```
habit-tracker/
├── src/logic/formatters.ts       ← ADD getLocalDateFor(date: Date)
├── src/queries/useToday.ts       ← streak logic, +progress invalidation
├── src/queries/useProgress.ts    ← NEW: useProgressData, useStreakCount, useStarsToNextTier
├── src/queries/useFund.ts        ← ADD useSpendFund mutation
├── src/screens/ProgressScreen.tsx← REPLACE: D/W/M/Y chart + StatStrip
├── src/screens/FundScreen.tsx    ← ADD withdrawal modal
└── __tests__/streak.test.ts      ← NEW: 3 tests
Total: 17/17 tests pass
```

### Key Decisions (Day 4)
- `ALTER TABLE users ADD COLUMN` wrapped in try/catch — SQLite has no `ADD COLUMN IF NOT EXISTS`; only expected error is "duplicate column name" on re-run.
- `scheduleHabitReminder` validates time BEFORE calling `cancelAllScheduledNotificationsAsync` — prevents cancelling existing notification when called with invalid input.
- expo-notifications v56 trigger requires `type: SchedulableTriggerInputTypes.DAILY` (not old `{ hour, minute, repeats: true }` shape). `NotificationBehavior` requires `shouldShowBanner` + `shouldShowList` fields.
- `expo-notifications` imported dynamically inside `scheduleHabitReminder`/`cancelHabitReminder` so pure `parseNotificationTime` tests run without native modules.
- Category picker chips in modal use `[styles.kindBtn, { flex: 0 }, ...]` — `kindBtn` has `flex: 1` which collapses in unbounded horizontal ScrollView without the override.
- `useCategories` queryKey `['categories', userId]` — separate from `['today']` tree, not invalidated by task mutations (categories are static).
- Toast shown via `setTimeout(500)` AFTER `dbReady` state — ensures `<Toast />` component is mounted before `Toast.show()` is called.
- Week-reset detection reads/writes `last_seen_week_start` column on `users` table (added via migration) — no AsyncStorage dependency.

### Day 4 Files Created/Modified
```
habit-tracker/
├── src/db/migrations.ts          ← ALTER TABLE users (last_seen_week_start, notification_time), seed 5 categories
├── src/queries/useToday.ts       ← ADD useCategories hook; useTodayTasks includes category_id
├── src/queries/useTasks.ts       ← ADD categoryId to TaskFormParams, INSERT/UPDATE SQL
├── src/queries/useSettings.ts    ← NEW: useNotificationTime, useSetNotificationTime
├── src/logic/weekReset.ts        ← NEW: shouldShowWeekResetToast()
├── src/logic/notifications.ts    ← NEW: parseNotificationTime, scheduleHabitReminder, cancelHabitReminder
├── src/screens/TodayScreen.tsx   ← CategoryChips horizontal scroll filter
├── src/screens/MeScreen.tsx      ← Category picker in task modal + Notifications section
├── App.tsx                       ← Week reset detection + toast + notification permissions
└── __tests__/
    ├── weekResetToast.test.ts    ← NEW: 3 tests
    └── notifications.test.ts     ← NEW: 5 tests
Total: 50/50 tests pass (includes pre-existing seedTemplates tests)
```

### Key Decisions (Day 5)
- Auth flow via AsyncStorage key `'habit_tracker_onboarded'`. No real auth — MVP offline. `parseOnboarded(null) = false` → safe default = show SignIn.
- `AppInner` pattern in App.tsx: `App()` provides `QueryClientProvider`, `AppInner` holds db+auth hooks. `RootNavigator` owns the single `<NavigationContainer>`. Prevents double-container React Navigation error.
- Center FAB: `tabBarButton: () => <FABButton/>` + `tabPress: e.preventDefault()`. Slot occupied, action deferred to Day 6 (log-activity sheet).
- `ProfileScreen` replaces `MeScreen` — accessed via avatar tap as modal (`presentation: 'modal'`). `MeScreen.tsx` on disk but no longer imported anywhere.
- `useRankData` imports `USER_ID` directly (no param) — single-user MVP, query always scoped to user 1.
- `useDepositFund` invalidates `['fund']` prefix → hits both `['fund', 'balance', userId]` and `['fund', 'ledger', userId]`.
- `useAuth` `.catch(() => {}).finally(() => setIsLoading(false))` — AsyncStorage failure treated as "not onboarded" (user sees SignIn; safe default).

### Day 5 Files Created/Modified
```
habit-tracker/
├── src/theme.ts                     ← NEW: sage green design tokens
├── src/hooks/useAuth.ts             ← NEW: AsyncStorage onboarding flag
├── src/constants.ts                 ← ADD USER_ID, TemplateTask, TemplateCategory, TEMPLATE_CATEGORIES
├── src/logic/seedTemplates.ts       ← NEW: buildTemplateTasks(selectedKeys)
├── src/logic/rankUtils.ts           ← NEW: getCurrentTier, getStarsToNextTier
├── src/logic/fundDeposit.ts         ← NEW: validateDeposit
├── src/queries/useFund.ts           ← ADD useDepositFund mutation
├── src/queries/useRank.ts           ← NEW: useRankData
├── src/screens/SignInScreen.tsx     ← NEW: email+password sign-in UI
├── src/screens/OnboardingScreen.tsx ← NEW: template category grid
├── src/screens/RankScreen.tsx       ← NEW: tier ladder, progress bar, weekly history
├── src/screens/ProfileScreen.tsx    ← NEW: task CRUD + profile header (replaces MeScreen)
├── src/screens/FundScreen.tsx       ← REWRITE: deposit modal + sage green theme
├── src/screens/TodayScreen.tsx      ← REWRITE: sage green theme + avatar nav
├── src/screens/ProgressScreen.tsx   ← REWRITE: sage green theme
├── src/navigation/RootNavigator.tsx ← REWRITE: 5-tab + FAB + auth gating
├── App.tsx                          ← REWRITE: AppInner pattern + useAuth
└── __tests__/
    ├── auth.test.ts                 ← NEW: 4 tests (parseOnboarded)
    ├── seedTemplates.test.ts        ← NEW: 6 tests (buildTemplateTasks)
    ├── rankUtils.test.ts            ← NEW: 9 tests (getCurrentTier, getStarsToNextTier)
    └── fundDeposit.test.ts          ← NEW: 6 tests (validateDeposit)
Total: 50/50 tests pass
```

### Key Decisions (Day 6)
- `LogActivitySheet`: React Native `Modal`-based bottom sheet (no external library). Nested `Modal` for duration sub-prompt (higher z-index, fade animation). `fabVisible` state in `AppStack` was discarded (`[, setFabVisible]`) since Day 5 — fixed to `[fabVisible, setFabVisible]`.
- `AppStack` return wrapped in `<>` fragment to render `<LogActivitySheet>` alongside `<Stack.Navigator>`. Modal is a portal — does not need to be inside NavigationContainer.
- `useArchiveCategory` in `useTasks.ts`: invalidates `['categories', userId]` (TodayScreen filter chips) + `['today', 'tasks']` (defensive). SQL scoped with `AND user_id = ?`.
- Max-tier display already worked in both screens (`starsNeeded=0` is falsy → 'MAX' in ProgressScreen; `starsToNext > 0` guard in RankScreen). Day 6 added 2 boundary tests (159→1, 161→0) to confirm.
- `ProfileScreen` categories section uses existing `row`/`sectionHeader`/`archiveBtn`/`sectionTitle` styles — no new StyleSheet entries.
- `MeScreen.tsx` deleted — orphaned since Day 5 ProfileScreen refactor.

### Day 6 Files Created/Modified
```
habit-tracker/
├── src/screens/LogActivitySheet.tsx  ← NEW: FAB bottom sheet + nested duration modal
├── src/navigation/RootNavigator.tsx  ← fix fabVisible destructure, add LogActivitySheet
├── src/queries/useTasks.ts           ← ADD useArchiveCategory mutation
├── src/screens/ProfileScreen.tsx     ← ADD categories section + useArchiveCategory
├── src/screens/MeScreen.tsx          ← DELETED (orphaned)
└── __tests__/
    ├── logActivitySheet.test.ts      ← NEW: 3 tests (needsDurationPrompt)
    └── rankUtils.test.ts             ← ADD 2 boundary tests (max-tier)
Total: 55/55 tests pass
```

### Key Decisions (Day 7)
- `useLogTask` TOCTOU fix: all 4 volatile reads (`daily`, `weeklyRow`, `alreadyUnlocked`, `yesterdayRow`) moved INSIDE `withTransactionAsync`. `tiers` stays outside (static lookup, never written). `nowMs`/`yesterday`/`yesterdayDate` declared before transaction — safe closure captures, not reads.
- `Toast.show()` called before `onClose()` in `submitLog` — toast fires during Modal slide-down animation (Toast is mounted at App root, independent of Modal lifecycle).
- 2 new logTask.test.ts tests: boundary (40+10=50 → bonus fires exactly at threshold) and BAD kind guard (bonusRow never fires for BAD — confirmed by `kind === 'GOOD'` guard in logTask.ts:77).

### Day 7 Files Created/Modified
```
habit-tracker/
├── src/queries/useToday.ts          ← useLogTask: volatile reads moved inside withTransactionAsync
├── src/screens/LogActivitySheet.tsx ← ADD Toast.show() on success
└── __tests__/logTask.test.ts        ← ADD 2 tests (boundary + BAD-task guard)
Total: 57/57 tests pass
```

### Key Decisions (Day 8)
- Nested `Modal` inside `Modal` (LogActivitySheet duration sub-prompt) **fixed**: inner Modal replaced with absolute-positioned `<View>` inside outer Modal. No z-index compounding — single stacking context on all Android versions.
- Notification race condition **fixed**: `handleSaveNotif` in ProfileScreen calls `scheduleHabitReminder` (native) FIRST, then `setNotifTimeMutation.mutateAsync` (DB) only if native succeeds. DB never written on native failure; user can retry.
- Display name stored in AsyncStorage at `'habit_tracker_display_name'` — no DB schema change. Read via `useQuery({ staleTime: Infinity })` in ProfileScreen; written during SignIn `onPress` before `onSignIn()`.
- Streak freeze mechanism: `canPurchaseFreeze` pure validator (priority: HAS_ACTIVITY > ALREADY_FROZEN > NO_STREAK > INSUFFICIENT_FUNDS). Transaction inserts fund WITHDRAWAL + `streak_freezes` row + synthetic `daily_summary` row (`INSERT OR IGNORE`, `streak_count = currentStreak` from day before). `useLogTask` unchanged — reads yesterday's row, increments naturally.
- `useStreakFreezeEligibility`: `yesterday`/`dayBefore` computed at render time (not inside queryFn) — captured in queryKey so cache invalidates at midnight.
- `getRangeLabel` week calc: `(now.getDay() + 6) % 7` maps Sunday=6, Monday=0 correctly for ISO week.
- `useAllTimeStats` uses `Promise.all` for 3 parallel read-only queries (WAL mode safe).
- `useSpendFund` wraps INSERT in `withTransactionAsync`, reads balance inside transaction — atomic guard, no race. Throws `INSUFFICIENT_FUNDS` if `balance < amount`.
- `submittingRef` / `spendingRef` (useRef<boolean>) pattern: synchronous in-flight guard set before any async work, cleared in `.finally()`. Applied to LogActivitySheet (both tap + time paths) and FundScreen.
- `migrations.ts` ALTER TABLE catch narrowed: `catch (e: any) { if (!e?.message?.includes('duplicate column')) throw e; }` — real DB errors propagate.

### Day 8 Files Created/Modified
```
habit-tracker/
├── src/constants.ts                     ← ADD STREAK_FREEZE_COST = 10_000
├── src/db/migrations.ts                 ← ADD streak_freezes table; narrow ALTER TABLE catch
├── src/logic/streakFreeze.ts            ← NEW: canPurchaseFreeze() pure validator
├── src/logic/formatters.ts              ← ADD getRangeLabel(range, now?)
├── src/queries/useFund.ts               ← ADD useStreakFreezeEligibility, usePurchaseStreakFreeze; useSpendFund withTransaction
├── src/queries/useProgress.ts           ← ADD useAllTimeStats
├── src/screens/LogActivitySheet.tsx     ← fix nested Modal → absolute View; submittingRef both paths
├── src/screens/ProfileScreen.tsx        ← ADD notification settings (native-first); display name from AsyncStorage
├── src/screens/SignInScreen.tsx         ← ADD displayName TextInput; save to AsyncStorage on submit
├── src/screens/FundScreen.tsx           ← ADD streak freeze card; spendingRef guard; formatVND for cost
├── src/screens/ProgressScreen.tsx       ← ADD rangeLabel below toggle; all-time stats strip; ScrollView wrap
└── __tests__/
    ├── streakFreeze.test.ts             ← NEW: 5 tests (canPurchaseFreeze)
    └── analyticsRangeLabel.test.ts      ← NEW: 4 tests (getRangeLabel D/W/M/Y)
Total: 66/66 tests pass
```

### Key Decisions (Day 9)
- Google Sign-In via `expo-auth-session` + `expo-web-browser` (PKCE flow). `WebBrowser.maybeCompleteAuthSession()` required at module level of `SignInScreen.tsx` to handle OAuth redirect.
- `GoogleUser` stored in AsyncStorage at `'habit_tracker_google_user'`. `parseGoogleUser` validates all 3 fields (email, name, picture) as strings — rejects partial objects to prevent `<Image uri={undefined}>`.
- Auth gate changed from `isOnboarded` alone to `googleUser !== null && isOnboarded`. Existing onboarded users see SignIn on first launch after update (one-time re-auth).
- `signOut` clears both `ONBOARDED_KEY` and `GOOGLE_USER_KEY` — full reset, re-login shows Onboarding again (intentional for MVP).
- `signInWithGoogle` also writes `'habit_tracker_display_name'` for forward-compatibility with any code still reading that key.
- `userinfo/v2/me` endpoint used for profile fetch — no API enablement needed in GCP (core OAuth2 infrastructure). SHA-1 debug key: `18:38:B7:BC:9E:95:24:98:ED:FE:5B:71:A4:F2:74:FE:4F:19:70:91`.
- ProfileScreen no longer reads display name from AsyncStorage — name/email/picture come from `googleUser` prop drilled from `useAuth`.

### Day 9 Files Created/Modified
```
habit-tracker/
├── src/hooks/useAuth.ts             ← ADD GoogleUser interface, parseGoogleUser, signInWithGoogle, signOut
├── src/screens/SignInScreen.tsx     ← REWRITE: Google OAuth button only (removed email/password form)
├── src/navigation/RootNavigator.tsx ← UPDATE: googleUser gate, pass googleUser/onSignOut to AppStack/ProfileScreen
├── App.tsx                          ← UPDATE: destructure + pass googleUser/signInWithGoogle/signOut
├── src/screens/ProfileScreen.tsx    ← UPDATE: Google photo/name/email in header, sign-out button, remove displayName query
├── app.json                         ← ADD scheme "habittracker" + android intentFilters
├── .env.local                       ← CREATE: placeholder OAuth client IDs (gitignored)
└── __tests__/auth.test.ts           ← ADD 5 tests (parseGoogleUser: null, invalid JSON, missing email, missing picture, valid)
Total: 71/71 tests pass
```

### Day 9 Test Command
```bash
cd C:\Users\Admin\Desktop\Self-Pro\habit-tracker
npx jest          # 71/71 pass
npx tsc --noEmit  # 0 errors
npx expo run:android  # requires native build + OAuth client IDs in .env.local
```

### Known Deferred
- `OnboardingScreen.handleStart` seeds tasks in serial `await` loop — partial failure leaves committed rows; retry creates duplicates (no UNIQUE on task name).
- `requestPermissionsAsync()` result discarded in App.tsx — if user denies, `scheduleHabitReminder` succeeds silently but notification never fires.
- **[BLOCKED]** Day 9 smoke test: requires Google Cloud Console OAuth client IDs. Steps: (1) create Android client (package `com.anonymous.habittracker`, SHA-1 `18:38:B7:BC:9E:95:24:98:ED:FE:5B:71:A4:F2:74:FE:4F:19:70:91`), (2) create Web client (redirect URI `habittracker://`), (3) fill `.env.local`, (4) `npx expo run:android`.

Key constants: `src/constants.ts`
Schema DDL: `habit_tracker_schema.md` | UI spec: `habit_tracker_ui_architecture.md` | Prototype: `Habit-Tracker-Wireframe-Prototype.html`

---

## Habit Tracker Day 10 — COMPLETE (2026-05-30)

### What Was Built
Full "App Fixes & Enhancements" pass across all 5 phases:

**Phase 0 — Foundation:**
- `expo-av`, `@supabase/supabase-js`, `react-native-url-polyfill` installed
- `LanguageContext` (vi/en toggle, AsyncStorage key `habit_lang`)
- `ThemeContext` (dark/light, AsyncStorage key `habit_theme`, `DarkColors` in `theme.ts`)
- DB migration: `users.google_sub`, `users.email` columns; tier ladder updated to 320-star max via `UPDATE WHERE tier_order=?` (preserves FKs)
- `useAuth.ts` rewritten: `AuthProvider` context, `AuthUser` type, `resolveUserRow()` (claims legacy `id=1` row, inserts new if needed), `useAuthUser()` convenience hook

**Phase 1 — USER_ID removal:**
- `USER_ID` deleted from `constants.ts`; all 8 files updated to `useAuthUser()` / userId param

**Phase 2 — Auth + Onboarding + Settings:**
- `SignInScreen`: skip button removed — Google Sign-In only
- `OnboardingScreen`: two-step flow (`categories` → `consent`), consent checkbox gates CTA
- `SettingsScreen` (new): dark/light toggle, language toggle, notification time, sign-out
- `RootNavigator`: SettingsScreen added as modal; gear icon `⚙️` in Home header; Fund tab relabeled → "🏦 Tiết Kiệm"
- `ProfileScreen`: categories section, sign-out, notifications removed (moved to Settings)

**Phase 3 — LogActivitySheet bulk rewrite:**
- Multi-select checklist: `Map<taskId, SelectedEntry>`, category filter chips at top
- Already-logged tasks dimmed + badge; re-log prompt via Alert
- Time-based tasks expand inline duration input
- "Ghi lại (N)" button; sequential `mutateAsync` loop (serial, preserves star logic)
- `celebrateSound.ts` + 4 placeholder `.mp3` files (user replaces with real CC0 audio)
- `playCelebration(totalMinutes)` after successful log: level 1–4 based on total duration

**Phase 4 — Screen fixes:**
- `ProgressScreen`: `SafeAreaView edges=['top']`, chart height 240→190
- `FundScreen`: copy → "Tiết Kiệm" / "Tự thưởng"
- `RankScreen`: bilingual tiers via `TIER_NAMES[tier_order][lang]`; leaderboard stub with 🚧 overlay

**Phase 5 — Sync service:**
- `supabase.ts` + `syncService.ts` written; guarded by `EXPO_PUBLIC_SUPABASE_URL` env var (no-op until credentials added)

### Key Decisions (Day 10)
- `google_sub` = `googleUser.email` (workaround: expo-auth-session returns `access_token` not `id_token` by default — no Google user ID available without extra config)
- Legacy `id=1` row claimed by first Google sign-in via `UPDATE users SET google_sub=? WHERE id=1 AND google_sub IS NULL` — preserves all existing device data
- `AuthProvider` context replaces prop-drilling; `useAuthUser()` throws if called outside auth gate (safe — all callers are behind `googleUser !== null && isOnboarded` gate)
- `AuthState.value` wrapped in `useMemo` — prevents all-consumer re-renders on unrelated parent renders
- `doToggle` side-effects (`setExpandedTimeTask`) moved outside `setSelected` updater — no side-effect-in-updater anti-pattern
- Tier seed UPDATE uses `WHERE tier_order=?` (not `INSERT OR REPLACE`) — `INSERT OR REPLACE` changes ROWID, breaking `reward_unlocks.tier_id` FK refs
- MP3 files: placeholder empty files committed so Metro bundler succeeds; user replaces with real CC0 audio

### Known Deferred / Blocked
- Language toggle affects tab labels via `RootNavigator` — requires app re-mount to pick up (not live). Acceptable for MVP.
- SFX disabled — expo-av removed (incompatible with SDK 56 expo-modules-core). Re-enable by installing a compatible audio library.

## Known Errors & Fixes

| Error | Cause | Fix |
|-------|-------|-----|
| `Client Id property 'androidClientId' must be defined` | `.env.local` missing → env var `undefined` at build time | Create `.env.local` with real OAuth client IDs, rebuild |
| `SignInScreen` profile fields silently null | `GoogleSignin.signIn()` returns nullable `email/name/photo`; `?? ''` bypassed validation | Guard: `if (!email \|\| !name \|\| !photo) { Alert...; return; }` before `onSignInWithGoogle` |
| `expo-notifications: Android Push notifications removed from Expo Go with SDK 53` | Static `import * as Notifications` in `App.tsx` triggers push token listener at module load time | Remove top-level import; use `await import('expo-notifications')` inside `useEffect` wrapped in try-catch |
| `TurboModuleRegistry.getEnforcing(...): 'RNGoogleSignin' could not be found` | Static import of `@react-native-google-signin` evaluated at bundle load before native module registered | Move all usages inside `require(...)` in async function body |
| `ClassNotFoundException: expo.modules.kotlin.types.LazyKType` | `expo-av` (all versions) prebuilt AAR compiled against newer `expo-modules-core`; `LazyKType` absent in SDK 56 | Remove `expo-av`; replace sound logic with no-op stub |

## Habit Tracker Day 15 — Startup Crash Fix + Code Review COMPLETE (2026-06-01)

### What Was Fixed
- **`RNGoogleSignin` TurboModuleRegistry crash** (critical): `SignInScreen.tsx` had static `import { GoogleSignin }` + module-scope `GoogleSignin.configure({})`. Moved all `@react-native-google-signin` usage inside dynamic `import()` in `handleGoogleSignIn()`.
- **`expo-av` LazyKType ClassNotFoundException** (critical): All expo-av versions (14/15/16) are prebuilt Maven AARs compiled against newer `expo-modules-core` — `LazyKType` class missing from SDK 56. Removed expo-av; replaced `celebrateSound.ts` with a no-op stub.
- **Code review fixes**: `resolveUserRow` category INSERT converted from `db.execAsync` template literal to parameterized `db.runAsync` loop; `GoogleSignin.configure` guarded by `configuredRef` (called once); added `console.warn` to swallowed `resolveUserRow` failure; added explanatory comment to `[authLoading]` eslint-disable.

### Key Decisions (Day 15)
- Native modules that crash at bundle evaluation time: use `require()` (not `await import()`) inside async functions. `await import()` creates Metro async chunks; internal requires break. Pattern: `expo-notifications` uses `await import()` in `useEffect`; `@react-native-google-signin` uses `require()` in handler.
- expo-av removal is permanent for SDK 56. `playCelebration` is a documented no-op stub. Re-enable only with a library that compiles from source against SDK 56 deps.
- `[authLoading]` dep on `init()` is correct: fresh sign-ins resolve userId via `signInWithGoogle()` directly; returning users via `init()` closure.

## Habit Tracker Day 16 — Metro Unknown Module Fix COMPLETE (2026-06-01)
- `SignInScreen.tsx` + `useAuth.ts`: `await import('@react-native-google-signin')` → `require(...) as typeof import(...)` — fixes Metro async chunk breakage; type safety preserved
- `SignInScreen.tsx`: `GoogleSignin.configure({})` → passes `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` + `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` from env

### Key Decisions (Day 16)
- `await import()` creates Metro async chunks; google-signin internal `require()` refs module IDs missing from that chunk → `Requiring unknown module N`. `require()` inside async function = lazy eval, no chunk split, all IDs resolved.
- `require(...) as typeof import(...)` restores full TypeScript types lost from bare `require()`.

| Error | Cause | Fix |
|-------|-------|-----|
| `Requiring unknown module '2289'` | `await import('@react-native-google-signin')` creates async Metro chunk; internal requires reference IDs absent from that chunk | Use `require(...)` inside async function body; `await import()` is for local TS modules only |

## Habit Tracker Day 17 — Session Persistence + UI Fidelity COMPLETE (2026-06-01)

### What Was Built
- **Auth session persistence**: Returning users skip Onboarding on re-sign-in. `resolveUserRow` now returns `{ id, isNew }`. `signInWithGoogle` returns `boolean` (isNew) and auto-sets `ONBOARDED_KEY='true'` for returning users.
- **`GoogleUserContext`**: Added at App root level. Tab screens access Google user data via `useGoogleUser()` without prop drilling.
- **`useTodayLoggedTaskIds`**: New query returning `Set<task_type_id>` of today's logged tasks; queryKey `['today', 'logged', userId, date]` auto-invalidated by existing `['today']` prefix invalidation.
- **UI fidelity pass** — all 5 screens rewritten to match wireframe design:
  - Tab bar: SVG icons (react-native-svg), 86px height, Vietnamese labels
  - TodayScreen: hero LinearGradient card, progress bar toward 50pts, check-circle task list
  - ProgressScreen: segmented control (Ngày/Tuần/Tháng/Năm), chart card, 2×2 stats grids
  - FundScreen: dark gradient balance card (`#15402E→#1E6646`), improved ledger rows
  - RankScreen: rankhero card with glow, rank ladder, philosophy gradient card
  - ProfileScreen: centered 80px avatar, 3-column life stats row, settings card

### Key Decisions (Day 17)
- `signInWithGoogle` returns `boolean` (isNew) — navigator only calls `onSignIn()` (→ Onboarding) for new users; returning users let context-driven navigator swap automatically.
- RANK_EMOJI map in TodayScreen: ascending order `{ 1:'🎮'…7:'👑'…}` — tier_order 1 = lowest = NPC.
- [NEEDS CONFIRMATION] DB tier names are still English (Newbie/Grinder…) — RankScreen RANK_EMOJIS expects Vietnamese. Need to add migration: UPDATE tiers SET rank_name, stars_required WHERE tier_order=? with Vietnamese tier names + star thresholds (target 320-star max from Day 10 spec). Until confirmed, RankScreen shows '•' emoji fallback.

### Code Review Fixes (Day 17)
- `TodayScreen.tsx` — "Por giờ" typo → "Theo giờ"
- `TodayScreen.tsx` — RANK_EMOJI map was inverted (1=👑); fixed to ascending (1=🎮, 7=👑)
- `ProgressScreen.tsx` — dead `avgPoints` var removed; "TB điểm / ngày" label → "Hoạt động" (matches `totalActivities` data)

---

## Habit Tracker Day 18 — Treats System COMPLETE (2026-06-01)

### What Was Built
- Replaced VND fund/balance with star-based treats wishlist
- Two-balance split: `weekly_stars` (rank, resets weekly) vs `treat_stars` (treats, never resets)
- New tables: `treats`, `treat_history`; 4 new user columns (`treat_stars`, `treat_stars_lifetime`, `value_per_star`, `penalty_hits_treats`)
- `src/logic/treatLogic.ts` — `canEnjoyTreat`, `decorateTreat` pure fns
- `src/queries/useTreats.ts` — `useTreatPool`, `useTreats`, `useAddTreat`, `useEnjoyTreat`, `useTreatHistory`
- `FundScreen.tsx` rewritten as TreatsScreen (pool header, wishlist with progress bars, enjoy button, add-treat modal)
- Streak freeze migrated from VND cost (10,000₫) to star cost (10★)
- `useLogTask` earns `treat_stars` on GOOD, deducts on BAD (if `penalty_hits_treats=1`), marks `reached_at` for eligible treats in same transaction
- Deleted: `src/logic/fundDeposit.ts`, `__tests__/fundDeposit.test.ts`

### Key Decisions (Day 18)
- `treat_stars` independent of weekly cycle — accumulates indefinitely; `treat_stars_lifetime` tracks total earned
- `markNewlyReached`: single SQL UPDATE inside `useLogTask` transaction — no N+1; one-time flip of `reached_at IS NULL` guard
- `penalty_hits_treats = 1` default; guard in SQL WHERE clause, not app code
- `useEnjoyTreat`: `MAX(0, treat_stars - ?)` for extra safety even though transaction + `canEnjoyTreat` prevents underflow
- `handleEnjoy` in FundScreen: `enjoyingRef` guard now shows Toast("Đang xử lý…") — no silent no-op on double-tap
- `fund_transactions` table kept (no DROP) — data preserved, no new writes
- `DEFAULT_VALUE_PER_STAR = 1000` (VND/star); no hardcoded `1000` fallbacks anywhere

### Test Command
```bash
cd C:\Users\Admin\Desktop\Self-Pro\habit-tracker
npx jest          # 73/73 pass
npx tsc --noEmit  # 1 pre-existing error: SignInScreen.tsx androidClientId (unrelated)
npx expo run:android  # requires native build
```
