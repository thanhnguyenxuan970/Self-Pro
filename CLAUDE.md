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
- **Habit Tracker** — Gamified habit tracking React Native app. Day 2 COMPLETE (2026-05-28).

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

**Status:** Day 2 COMPLETE (2026-05-28). Code lives at `c:\Users\Admin\Desktop\habit-tracker\` (sibling to this workspace).

**Stack:** React Native + Expo SDK 56 + expo-sqlite (async API) + drizzle-orm (types only, raw SQL for runtime) + TanStack Query v5 + React Navigation v6 bottom tabs + Jest 30 + ts-jest 29

**Data model:** append-only `activity_log` as source of truth; derived rollups via `daily_summary` / `weekly_summary`.

**Navigation:** 4 bottom tabs — Today (✅), Progress (📊 stub), Fund (💰 live), Me (👤 live).

**State:** TanStack Query over local DB; each log mutation invalidates `today`, `week`, `fund` queries.

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

### Day 2 Test Command
```bash
cd C:\Users\Admin\Desktop\habit-tracker
npx jest          # 14/14 pass
npx tsc --noEmit  # 0 errors
npx expo run:android
```

### Day 3 Next Steps
- Progress screen: weekly star chart via `victory-native` + `react-native-svg`
- Streak tracking: populate `streak_count` in `daily_summary` on each log
- Manual spending: WITHDRAWAL entry in Fund screen

### Known Deferred
- `victory-native` + `react-native-svg` deferred to Day 3 (charts on Progress screen)
- Concurrent tap race condition in `useLogTask` (TOCTOU on reads before transaction) — MVP-acceptable, fix pre-multi-user

Key constants: `src/constants.ts`
Schema DDL: `habit_tracker_schema.md` | UI spec: `habit_tracker_ui_architecture.md` | Prototype: `Habit-Tracker-Wireframe-Prototype.html`
