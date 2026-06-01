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

- **Habit Tracker** — Gamified habit tracking React Native app. Day 21 COMPLETE (2026-06-01).

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

**Status:** Day 21 COMPLETE (2026-06-01). Code lives at `c:\Users\Admin\Desktop\Self-Pro\habit-tracker\`.

**Stack:** React Native + Expo SDK 56 + expo-sqlite (async API) + drizzle-orm (types only, raw SQL for runtime) + TanStack Query v5 + React Navigation v6 bottom tabs + Jest 30 + ts-jest 29 + expo-auth-session v5 + expo-web-browser

**Data model:** append-only `activity_log` as source of truth; derived rollups via `daily_summary` / `weekly_summary`.

**Navigation:** 5 bottom tabs + center FAB — Home (🏠), Analytics (📊), [+FAB], Fund (💰), Rank (🏆). ProfileScreen accessed via avatar tap (modal). Auth gate: `googleUser !== null && isOnboarded` → AppStack; else → SignIn → Onboarding.

**State:** TanStack Query over local DB; each log mutation invalidates `today`, `week`, `fund`, `progress` queries.

**Rank system:** 8-tier Gen Z rank ladder. Weekly reset Monday 00:00 user-local. Self-treat fund in VND.

### Key Decisions (Days 1-9, condensed)
- `drizzle-orm` types-only; all runtime queries raw expo-sqlite (`db.runAsync`, `db.getAllAsync`, `db.getFirstAsync`). `getDb()` singleton Promise.
- All DB writes in `useLogTask` inside `db.withTransactionAsync`. `jest.config.js` uses `transform` (not `globals`).
- `streak_count` set on INSERT, never overwritten. `victory-native@^36` pinned (v40+ requires Skia).
- `ALTER TABLE ADD COLUMN` wrapped in try/catch (SQLite has no `IF NOT EXISTS`). `expo-notifications` dynamic import in `useEffect`.
- Auth: `GoogleUser` in AsyncStorage `'habit_tracker_google_user'`. Gate: `googleUser !== null && isOnboarded`. `parseGoogleUser` validates all 3 fields.
- `AppInner` pattern prevents double `NavigationContainer`. Center FAB uses `tabBarButton: () => <FABButton/>` + `tabPress: e.preventDefault()`.
- SHA-1 debug key: `18:38:B7:BC:9E:95:24:98:ED:FE:5B:71:A4:F2:74:FE:4F:19:70:91`

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
| `RNGoogleSignin: 'androidClientId' is not a valid configuration parameter` | `@react-native-google-signin` v13+ removed `androidClientId` from `configure()`; Android reads client ID from `google-services.json` | Remove `androidClientId` from `GoogleSignin.configure()` call |
| `connectAnimatedNodes: Animated node with tag (parent) [76] does not exist` | `enableScreens()` never called; Fabric batch-dispatches animated node commands before tab bar parent node is registered on native side | Call `enableScreens()` from `react-native-screens` at module level in `index.ts` before `registerRootComponent` |

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
npx tsc --noEmit  # 0 errors
npx expo run:android  # requires native build
```

---

## Habit Tracker Day 19 — Startup Crash Fixes COMPLETE (2026-06-01)

### What Was Fixed
- **`RNGoogleSignin: 'androidClientId' is not a valid configuration parameter`**: Removed `androidClientId` from `GoogleSignin.configure()` in `SignInScreen.tsx`. v16+ reads Android client ID from `google-services.json`; parameter no longer exists in API.
- **`connectAnimatedNodes: Animated node with tag (parent) [76] does not exist`**: Added `enableScreens()` call (from `react-native-screens`) at module level in `index.ts` before `registerRootComponent`. Without it, Fabric's batch-dispatched animated node commands race against the tab bar mount, causing parent node [76] to not exist when child tries to connect.

### Key Decisions (Day 19)
- `enableScreens()` called in `index.ts` at module level (not inside a component) — must run before any navigation renders
- `androidClientId` removal is permanent for `@react-native-google-signin` v13+; Android client ID comes from `google-services.json` only

### [NEEDS USER]
- `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` must be set in `.env.local` — without it, `GoogleSignin.configure()` silently accepts `undefined` and sign-in fails at runtime

---

## Habit Tracker Day 20 — Sign-out + Account Picker Fix COMPLETE (2026-06-01)

### What Was Fixed
- **Sign-out session leak**: `signOut()` in `useAuth.ts` now calls `GoogleSignin.revokeAccess()` before `GoogleSignin.signOut()` — revokes server-side OAuth token so next sign-in cannot silently reuse cached credentials.
- **Account picker bypass**: `handleGoogleSignIn` in `SignInScreen.tsx` calls `GoogleSignin.signOut()` (try/catch) immediately before `GoogleSignin.signIn()` — clears native session cache so account picker always appears.

### Key Decisions (Day 20)
- `revokeAccess()` before `signOut()` in sign-out path: revokeAccess revokes the server-side token; signOut clears native session. Both wrapped in single try/catch — failure is non-fatal since local AsyncStorage + React state are cleared in `finally`.
- `signOut()` in sign-in path: calling signOut before signIn is the canonical `@react-native-google-signin` pattern to force account selection. Silent failure (first-launch user has no session) is expected and benign.

---

## Habit Tracker Day 21 — UI/UX Improvements COMPLETE (2026-06-01)

### What Was Built
- **Logout → bottom of ProfileScreen**: Removed from `CÀI ĐẶT` card; now standalone outlined danger button at end of ScrollView.
- **SettingsScreen** (new): Gear icon ⚙️ in TodayScreen topbar → `Settings` modal. Sections: GIAO DIỆN (dark mode Switch), NGÔN NGỮ (VN/EN selector with ✓), TÀI KHOẢN (delete account with Alert).
- **`useSettings.ts`** (new): `useDarkMode()` + `useLanguage()` — AsyncStorage-backed hooks (`habit_dark_mode`, `habit_language`).
- **`deleteAccount(uid)`** in `useAuth.ts`: deletes all user tables in `withTransactionAsync`, then calls `resetSyncCursors`, then revokes Google + clears AsyncStorage. Propagates DB errors (caller shows Alert).
- **Activity log bulk delete**: `useRecentActivityLogs` + `useDeleteActivityLogs` in `useProgress.ts`. "NHẬT KÝ HOẠT ĐỘNG" section in ProgressScreen — long-press → selection mode, tap to toggle, "Tất cả" select-all, "Xoá (N)" with Alert confirmation + `.catch` error handler.
- **Rank milestone gate**: `currentStars >= 5` guard in RankScreen — shows ❓ + "Chưa có rank" + "Tích đủ 5 ★" until first milestone reached.

### Key Decisions (Day 21)
- `deleteAccount` propagates DB transaction error (no try/catch swallow) — SettingsScreen catch block shows Alert; sign-out only runs on success.
- `useDarkMode`/`useLanguage` use optimistic state update (state first, then AsyncStorage) — UI instant, storage failure silent but acceptable for settings.
- Settings navigation: `TodayScreen` uses `navigation.navigate('Settings' as never)` — consistent with existing `navigate('Profile' as never)` pattern.
- `useDeleteActivityLogs` parameterized placeholders: `ids.map(() => '?').join(',')` — safe, no injection.
- Dark mode toggle persists to AsyncStorage but does not retheme the app live (requires re-mount). Acceptable MVP.

### Test Command (Day 21)
```bash
cd C:\Users\Admin\Desktop\Self-Pro\habit-tracker
npx jest          # 73/73 pass
npx tsc --noEmit  # 0 errors
npx expo run:android  # requires native build
```

---

## Habit Tracker Day 22 — Duration Chips + Star Overhaul COMPLETE (2026-06-01)

### What Was Built
- **`src/logic/points.ts`** (new): `computeStars(durationMin)` — 1★/30min up to 2h, then half-rate (1★/60min). `formatDuration(min)` → "30m" / "1h" / "1h 30m".
- **`src/logic/chipPresets.ts`** (new): `getChipPresets(userId, taskTypeId)` — ranks user's most-logged durations by frequency+recency. Falls back to [30, 60, 90] defaults for new users. Long-habit graduation: if user habitually logs >2h, escape hatch becomes a real chip.
- **`src/components/DurationChips.tsx`** (new): 1-tap chip logger for time-based tasks. 3 personalized chips + "2h+" escape hatch → text-input bottom sheet. Haptic feedback via `expo-haptics`. Preview shows star count before tap.
- **`src/queries/useDurationLogger.ts`** (new): `useChipPresets(userId, taskTypeId)` query + `useDurationLogger({userId, task, onSuccess, onError})` hook. Wraps `useLogTask`, manages optimistic `justLogged` state, invalidates `['chips', userId, taskId]` on success.
- **`src/logic/logTask.ts`** updated: time-based GOOD tasks now earn `Math.max(1, computeStars(durationMin))` stars instead of flat `STARS_PER_TASK=1`. Non-timed tasks unchanged.
- **`src/screens/LogActivitySheet.tsx`** rewritten: timed tasks → `TimedTaskLogger` overlay with `DurationChips`; non-timed tasks keep original `useLogTask.mutateAsync` flow.

### Key Decisions (Day 22)
- TextInput for 2h+ escape hatch (not `@react-native-picker/picker`) — avoids new native dependency, no rebuild needed.
- `computeStars` uses `Math.max(1, ...)` guard in `logTask.ts` — preserves original 1-star minimum for zero-duration edge case.
- `useDurationLogger` wraps `useLogTask` (not a duplicate transaction) — single source of truth for DB write.
- `expo-haptics` installed via `expo install` — SDK 56 compatible, graceful `.catch(() => {})` on platforms without haptic support.
- `TimedTaskLogger` is a sub-component (not inline JSX) so it gets its own hook scope for `useChipPresets`/`useDurationLogger`.

### Test Command (Day 22)
```bash
cd C:\Users\Admin\Desktop\Self-Pro\habit-tracker
npx jest          # run to verify no regressions
npx tsc --noEmit  # 0 errors
npx expo run:android  # requires native build
```

---

## Habit Tracker Day 23 — Settings Fix + Profile Overhaul + Home Bulk Delete COMPLETE (2026-06-01)

### What Was Fixed / Built
- **Settings dark mode + language toggles**: Root cause — `useDarkMode()`/`useLanguage()` were purely local hooks; each component mount got isolated state. Fix: created `src/contexts/SettingsContext.tsx` as global provider loaded at app root. `useSettings.ts` rewritten to delegate to context. `App.tsx` wraps `AppInner` with `<SettingsProvider>`.
- **ProfileScreen — Categories removed**: Deleted entire "Danh mục" section, `useCategories`/`useArchiveCategory`/`useCreateTask`/`useUpdateTask`/`useArchiveTask` calls, task-manage modal, and all related handlers/styles.
- **ProfileScreen — History feed**: "Hoạt động" → "Lịch sử". Replaced static task-type list with `useRecentActivityLogs(userId, 30)` feed. Each row: `✅/❌` icon + task name + `DD/MM/YYYY · HH:MM` timestamp + star delta.
- **ProfileScreen — Stat label renames**: "Tổng Sao" → "Rank"; "Kho sao" → "Tuần này".
- **TodayScreen — Long-press multi-select bulk delete**: Long-press (300ms) enters selection mode. Tap toggles individual items. "Tất cả" selects all. "Xoá (N)" Alert → archives selected tasks via `useArchiveTask` sequential loop. "Huỷ" exits selection.

### Key Decisions (Day 23)
- `SettingsProvider` placed between `QueryClientProvider` and `AppInner` — settings load is async (AsyncStorage) so context shows defaults until load resolves; acceptable flash since dark mode doesn't retheme live anyway.
- `useSettings.ts` return type changed from `Promise<void>` to `void` — setters are now synchronous state updates (AsyncStorage write is fire-and-forget `.catch(() => {})`); callers don't await.
- History feed uses `useRecentActivityLogs` (existing query, last 30 entries) — no new DB query needed.
- "Tuần này" label shows `treat_stars` (not weekly_stars) — per user rename request; `treat_stars` is lifetime accumulated, label is cosmetic per user spec.
- Bulk delete: sequential `mutateAsync` loop (not parallel) — preserves TanStack Query invalidation ordering; partial failure shows error alert, selection state preserved for retry.

### Test Command (Day 23)
```bash
cd C:\Users\Admin\Desktop\Self-Pro\habit-tracker
npx jest          # 73/73 pass
npx tsc --noEmit  # 0 errors
npx expo run:android  # requires native build
```

---

## Habit Tracker — Sync Fix COMPLETE (2026-06-01)

### What Was Fixed
- **Supabase `id` identity column conflict**: `syncService.ts` was spreading full SQLite rows (`...r`) into upsert payload, including `id`. Supabase tables use `GENERATED ALWAYS AS IDENTITY` for `id` — PostgreSQL rejects explicit inserts. Fixed by destructuring `({ id, ...r })` in both `syncActivity` and `syncFund` map callbacks. `local_id` still carries the SQLite id for `onConflict: 'user_email,local_id'` dedup.

### Key Decisions
- Supabase `id` is server-generated — never send it from client. `local_id` is the stable dedup key.
- `GENERATED ALWAYS` (not `GENERATED BY DEFAULT`) means `OVERRIDING SYSTEM VALUE` is required to override — simpler to just omit `id`.

---

## Habit Tracker — Settings Notification + UI Fixes COMPLETE (2026-06-01)

### What Was Built / Fixed
- **`taskSelected` full-width highlight**: `TodayScreen.tsx` — `marginHorizontal: -15, paddingHorizontal: 15` cancels `taskCard.paddingHorizontal: 15`, making selection background fill the full card row width.
- **SettingsScreen notification time**: Added `THÔNG BÁO` section with `TextInput` (HH:MM format). `handleNotifBlur` validates on blur/submit, saves via `useSetNotificationTime`, resets to saved value on invalid input. Error shown inline with red border + hint text.
- **`settingsLogic.ts`**: Extracted `parseSettingsBool`, `parseSettingsLang`, `validateNotificationTime` as pure fns. `SettingsContext.tsx` uses them instead of inline comparisons.

### Key Decisions
- `marginHorizontal: -15` hardcoded to match `taskCard.paddingHorizontal: 15` — breaks if card padding changes, acceptable for MVP.
- `handleNotifBlur` error path: restores `notifInput` to `savedNotifTime ?? ''` directly + via `useEffect` (double-set same value, React bails out on second render). Redundant but harmless.
- `useSetNotificationTime` accepts `string | null` — passing `null` when input cleared removes notification time from DB.

---

## Habit Tracker Day 24 — Settings QA & Dev Agent COMPLETE (2026-06-01)

### What Was Built / Fixed
- **`src/logic/settingsLogic.ts`** (new): `parseSettingsBool`, `parseSettingsLang`, `validateNotificationTime` — pure fns extracted from inline context logic for testability.
- **`__tests__/settings.test.ts`** (new): 25 tests covering all 3 logic fns — null/garbage/boundary inputs. TDD — tests written before fixes.
- **`SettingsContext.tsx`**: Uses `parseSettingsBool`/`parseSettingsLang`; added `console.warn` on AsyncStorage load failure (was silent swallow).
- **`SettingsScreen.tsx`**: Added `THÔNG BÁO` section with `useNotificationTime`/`useSetNotificationTime` (hooks existed but were dead code). `submitHandledRef` dedup prevents double-fire from `onSubmitEditing`+`onBlur` both calling save. Restart-required notes under GIAO DIỆN and NGÔN NGỮ sections.

### Key Decisions (Day 24)
- `submitHandledRef` cleared in `handleNotifBlur` (not `handleNotifSubmit`) — `onSubmitEditing` fires before `onBlur`; clearing in submit's finally would reset it before blur checks it, breaking dedup.
- `saveNotifTime()` cannot throw synchronously (state setters + TanStack `mutate` are fire-and-forget), so try/finally on submit is unnecessary complexity.
- Restart notes are italic muted text below each section card — informational only, no modal or alert needed for MVP.

### Test Command (Day 24)
```bash
cd C:\Users\Admin\Desktop\Self-Pro\habit-tracker
npx jest          # 98/98 pass
npx tsc --noEmit  # 0 errors
npx expo run:android  # requires native build
```
