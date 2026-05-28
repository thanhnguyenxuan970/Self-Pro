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

- **PokeScan** — Pokémon card scanning app. Code lives in sibling `android/` and `backend/` dirs (outside this workspace). Agent prompts here drive development of that code.
- **Habit Tracker** — Gamified habit tracking React Native app. Day 5 COMPLETE (2026-05-28).

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

## Multi-Agent Workflow (dev-workflow.md — PokeScan)

For PokeScan tasks, dispatch agents in parallel then chain reviewers:

**Step 1 — parallel:** invoke `android-agent` + `backend-agent` simultaneously (two Agent tool calls in one response).

**Step 2a** — after both finish: `test-runner` (paste both outputs)

**Step 2b** — after test-runner: `code-reviewer`

**Step 2c** — after code-reviewer approves: `pr-preparer`

Gate rules — do not proceed to next step if current step reports failures.

---

## Agent Files

| File | Role |
|---|---|
| `android-agent.md` | PokeScan Android (Kotlin/Compose/Hilt/Room) |
| `backend-agent.md` | PokeScan backend (FastAPI/SQLAlchemy async) |
| `code-reviewer.md` | Code review with CRITICAL/WARNING/INFO classification |
| `pr-preparer.md` | Commit message + PR description + CLAUDE.md flag check |
| `test-runner.md` | Run all tests, report results |
| `qa-tester.md` | QA checklist per file |
| `ux-tester.md` | UX review |
| `web-designer.md` | Web design review |
| `check_code.md` | Iterative review→fix→optimize loop |
| `check_plan.md` | Iterative plan→fix loop (target ≥95% confidence) |

---

## PokeScan Architecture

### Backend (`backend/app/`)
FastAPI + SQLAlchemy async + pydantic-settings v2. Entry: `main.py`.

Key invariants:
- `get_current_user_id` lives **only** in `dependencies.py` — never import from routers
- eBay uses `SECURITY-APPNAME` query param, not OAuth Bearer
- JP SKU detection: `endswith("-jp")` or `"-jp-" in sku` — not `"jp" in sku`
- `tier=pro` validated server-side via Bearer JWT; forced `free` if absent/invalid
- `SELECT ... FOR UPDATE` in `get_or_create_user` — do not remove
- `server_default` AND `default` both required on `User.tier`
- Guard `if not settings.apple_bundle_id` before building `valid_ids` → 503 on misconfiguration

### Android (`android/app/src/main/java/com/pokescan/app/`)
Kotlin + Jetpack Compose + Hilt + Room + Retrofit + Moshi.

Key invariants:
- `collectAsStateWithLifecycle` not `collectAsState`
- `SwipeToDismissBox` not deprecated `SwipeToDismiss`
- `SupervisorJob` required in `SetDatabaseService` scope
- `AuthEventBus`: `SharedFlow<Unit>(replay=0, extraBufferCapacity=1)`
- No singleton ViewModels

### Test Commands
```bash
# Android — all tests
cd android && ./gradlew test --tests "com.pokescan.app.*" 2>&1

# Android — single class
cd android && ./gradlew test --tests "com.pokescan.app.ClassName" 2>&1

# Backend — all tests
cd backend && python -m pytest tests/ -v 2>&1

# Backend — single file
cd backend && python -m pytest tests/test_file.py -v 2>&1
```

Test requirements:
- Android: `testOptions { unitTests.isReturnDefaultValues = true }` in `build.gradle.kts`
- Backend: `POKESCAN_USE_MOCK=1` env var to skip external API calls

---

## Habit Tracker Architecture

**Status:** Day 4 COMPLETE (2026-05-28). Code lives at `c:\Users\Admin\Desktop\habit-tracker\` (sibling to this workspace).

**Stack:** React Native + Expo SDK 56 + expo-sqlite (async API) + drizzle-orm (types only, raw SQL for runtime) + TanStack Query v5 + React Navigation v6 bottom tabs + Jest 30 + ts-jest 29

**Data model:** append-only `activity_log` as source of truth; derived rollups via `daily_summary` / `weekly_summary`.

**Navigation:** 5 bottom tabs + center FAB — Home (🏠), Analytics (📊), [+FAB], Fund (💰), Rank (🏆). ProfileScreen accessed via avatar tap (modal). Auth flow: AsyncStorage flag gates SignIn→Onboarding vs MainTabs.

**State:** TanStack Query over local DB; each log mutation invalidates `today`, `week`, `fund`, `progress` queries.

**Rank system:** 8-tier Gen Z rank ladder. Weekly reset Monday 00:00 user-local. Self-treat fund in VND.

### Key Decisions (Day 1)
- `drizzle-orm` used for TypeScript type inference only — NOT for query execution. All runtime queries use raw expo-sqlite API (`db.runAsync`, `db.getAllAsync`, `db.getFirstAsync`).
- `getDb()` returns `Promise<SQLiteDatabase>` (singleton pattern caching the promise). App.tsx awaits it before mounting navigator.
- All DB writes in `useLogTask` wrapped in `db.withTransactionAsync` for atomicity (includes activity, daily/weekly summary, tier unlocks, fund deposits).
- Default seed: user_id=1 (`me`), 8 tiers, 1 task (`Exercise`) seeded in `runMigrations`.
- `jest.config.js` uses `transform` (not deprecated `globals`) for ts-jest. `tsconfig.json` has `"types": ["jest"]`.

### Day 1 Files Created
```
habit-tracker/
├── src/constants.ts
├── src/db/schema.ts, migrations.ts, client.ts
├── src/logic/logTask.ts, formatters.ts
├── src/queries/queryClient.ts, useToday.ts
├── src/screens/TodayScreen.tsx, ProgressScreen.tsx, FundScreen.tsx, MeScreen.tsx
├── src/navigation/RootNavigator.tsx
├── App.tsx
├── babel.config.js, jest.config.js
└── __tests__/logTask.test.ts  ← 6/6 pass
```

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

### Day 3 Test Command
```bash
cd C:\Users\Admin\Desktop\habit-tracker
npx jest          # 17/17 pass
npx tsc --noEmit  # 0 errors
npx expo run:android  # requires native build (react-native-svg)
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

### Day 4 Test Command
```bash
cd C:\Users\Admin\Desktop\habit-tracker
npx jest          # 50/50 pass
npx tsc --noEmit  # 0 errors
npx expo run:android  # requires native build
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

### Day 5 Test Command
```bash
cd C:\Users\Admin\Desktop\habit-tracker
npx jest          # 50/50 pass
npx tsc --noEmit  # 0 errors
npx expo run:android  # requires native build
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

### Day 6 Test Command
```bash
cd C:\Users\Admin\Desktop\habit-tracker
npx jest          # 55/55 pass
npx tsc --noEmit  # 0 errors
npx expo run:android  # requires native build for LogActivitySheet
```

### Known Deferred
- Concurrent tap race condition in `useLogTask` (TOCTOU on reads before transaction) — MVP-acceptable, fix pre-multi-user
- `handleSaveNotif` in ProfileScreen: DB write before native schedule — if native call fails, DB has time but no active notification (user can retry)
- Nested `Modal` inside `Modal` (LogActivitySheet duration sub-prompt): known z-index issue on Android <9 / some manufacturer skins — test on target devices

Key constants: `src/constants.ts`
Schema DDL: `habit_tracker_schema.md` | UI spec: `habit_tracker_ui_architecture.md` | Prototype: `Habit-Tracker-Wireframe-Prototype.html`
