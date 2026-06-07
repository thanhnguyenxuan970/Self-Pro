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

**Status:** Tier 2 Core Interactions COMPLETE (2026-06-03). Code lives at `c:\Users\Admin\Desktop\Self-Pro\habit-tracker\`.

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
- Auth: `GoogleUser` in `expo-secure-store` key `'habit_tracker_google_user'` (migrated from AsyncStorage — see Security Fixes). Gate: `googleUser !== null && isOnboarded`. `parseGoogleUser` validates all 3 fields.
- `AppInner` pattern prevents double `NavigationContainer`. Center FAB uses `tabBarButton: () => <FABButton/>` + `tabPress: e.preventDefault()`.
- SHA-1 debug key: `18:38:B7:BC:9E:95:24:98:ED:FE:5B:71:A4:F2:74:FE:4F:19:70:91`

Key constants: `src/config/constants.ts` (after directory restructure)
Schema DDL: `habit_tracker_schema.md` | UI spec: `habit_tracker_ui_architecture.md` | Prototype: `Habit-Tracker-Wireframe-Prototype.html`

---

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
| `Requiring unknown module '2289'` | `await import('@react-native-google-signin')` creates async Metro chunk; internal requires reference IDs absent from that chunk | Use `require(...)` inside async function body; `await import()` is for local TS modules only |

---

## Habit Tracker — UI/UX Updates (2026-06-04)

### What Was Built / Fixed
- **Rank logic**: `currentStars >= 5` gate already in place (confirmed). No change needed.
- **ProgressScreen `src/screens/ProgressScreen.tsx`**: Removed duplicate "Hoạt động" stat from Overview section. Removed invisible opacity:0 placeholder card from All-time section. Both sections now show 3 stats. `sectionLabel.color` and `statV.color` changed from `C.muted`/`C.inkDark` → `C.primary` (green accent, both light + dark modes).
- **New activities `src/db/migrations.ts`**: Added idempotent migration — `INSERT OR IGNORE … SELECT u.id FROM users u` inserts "Cleaning" (🧹) and "Work" (💼) for every existing user. Unique index on `(user_id, name)` ensures no duplicates.
- **`src/screens/FundScreen.tsx`**: `FUND_IN_DEV = true` feature flag. Early return shows 🚧 locked screen (title + "In Development" message). Flip to `false` to restore full screen.
- **`src/screens/SettingsScreen.tsx`**: Added "PHẢN HỒI / FEEDBACK" section with "Báo lỗi / Phản hồi" button — `Linking.openURL('mailto:...')`.
- **`src/config/i18n.ts`**: Added `inDevelopmentTitle`, `inDevelopmentDesc`, `sectionFeedback`, `reportBugLabel` keys in both vi + en.

### Key Decisions
- Accent color on stat values (`C.primary`) applies to both light and dark themes automatically via `getColors(isDark)`.
- `FUND_IN_DEV` constant at module level (not env var) — flip to `false` when feature ships; no build config needed.
- Feedback uses `mailto:` (not URL) — works offline, no external service dependency.
- Cleaning/Work seed uses `FROM users u` subquery — handles multi-user DBs correctly; `INSERT OR IGNORE` idempotent.

### Test Results
- `npx tsc --noEmit` → 0 errors | `npx jest --runInBand` → 98/98 pass

---

## Habit Tracker — Directory Restructure COMPLETE (2026-06-04)

### What Was Done
Reorganized `src/` from flat `logic/` blob (18 files) into semantic layers:

| Layer | Path | Contents |
|-------|------|----------|
| audio | `src/audio/` | `audioEnabled.ts`, `uiSounds.ts`, `rankSound.ts` |
| game | `src/game/` | `logTask.ts`, `points.ts`, `chipPresets.ts`, `treatLogic.ts`, `tierUnlocks.ts`, `rankUtils.ts`, `streakFreeze.ts`, `weeklyReset.ts`, `seedTemplates.ts` |
| utils | `src/utils/` | `formatters.ts`, `notifications.ts`, `settingsLogic.ts`, `weekReset.ts` |
| api | `src/api/` | `supabase.ts` (from `lib/`), `syncService.ts` (from `services/`) |
| config | `src/config/` | `constants.ts`, `theme.ts`, `i18n.ts` + existing `ranks.config.ts` |

Deleted: `src/logic/`, `src/services/`, dead `celebrateSound.ts` stub.

Path aliases in `tsconfig.json` + `babel.config.js`: `@api`, `@audio`, `@game`, `@utils`, `@config`, `@components`, `@contexts`, `@db`, `@hooks`, `@lib`, `@navigation`, `@queries`, `@screens`.

### Key Decisions
- `baseUrl` removed from `tsconfig.json` — TS 6.0.3 deprecates it (TS5101). Paths use `./src/X/*`; works without `baseUrl` in TS 5+.
- Dynamic imports in `useAuth.ts` updated with `replace_all: true` — same pattern appears 3× and 2×.
- `App.tsx` `syncToSupabase(...)` fire-and-forget fixed with `.catch(() => {})` — unhandled rejection guard.

### Test Results
- `npx tsc --noEmit` → 0 errors | `npx jest --runInBand` → 98/98 pass

---

## Habit Tracker — Metro Cache Fix COMPLETE (2026-06-04)

### What Was Fixed
- **Metro bundler compile error**: `"None of these files exist: * src\theme(...)"` — Metro had stale module graph from when `src/theme.ts` temporarily had old import paths during the directory restructure. All source files already had correct paths (`../config/theme`, `../audio/uiSounds`, etc.); issue was Metro cache, not code.
- **Fix**: Deleted `C:\Users\Admin\AppData\Local\Temp\metro-cache` + `metro-file-map-expo-*`. Metro rebuilds from scratch on next `expo start`.

### Key Decisions
- Metro's file-map cache persists across restarts and holds module resolution from any previous bundling attempt — including failed attempts with stale paths.
- `expo start --clear` or manual cache deletion are equivalent; manual deletion was used since Metro was not running.

| Error | Cause | Fix |
|-------|-------|-----|
| `None of these files exist: * src\theme(.android.ts\|.native.ts\|.ts\|...)` | Metro cached stale module graph from directory restructure transition; `src/theme.ts` moved to `src/config/theme.ts` | Delete `%TEMP%\metro-cache` and `%TEMP%\metro-file-map-expo-*`; or `expo start --clear` |

---

## Habit Tracker — Rebranding + UI Cleanup COMPLETE (2026-06-04)

### What Was Built / Fixed
- **`src/screens/SignInScreen.tsx`**: Replaced `🌿` emoji with SVG ring+checkmark logo (react-native-svg: ring arc `strokeDasharray`, filled center circle, white checkmark path). Title changed "Greedy Clock" → "Habit ring". Subtitle changed to "daily completion, the loop". `logo` style renamed `logoContainer`.
- **`src/screens/TodayScreen.tsx`**: Empty-state `🌱` → `🎯`.
- **`src/config/i18n.ts`**: Removed `🌿` from `onboardTitle` in both vi and en.
- **`app.json`**: `"name"` → `"Habit ring"`.

### Key Decisions
- SVG logo uses `react-native-svg` (already a dep via RankMascot) — no new native dependency.
- Brand strings ("Habit ring", "daily completion, the loop") hardcoded, not i18n'd — brand identity, not UI copy.
- `strokeDasharray="115 24"` for r=22 ring: 300° arc (115px) + 60° gap (24px); gap positioned at lower-right via `rotate(150 30 30)`.

### Test Results
- `npx tsc --noEmit` → 0 errors | `npx jest --runInBand` → 98/98 pass

---

## Habit Tracker — Google Play Upload Setup COMPLETE (2026-06-04)

### What Was Done
- **Package name**: Changed `com.anonymous.habittracker` → `com.habitring.app` in `app.json`, `android/app/build.gradle` (namespace + applicationId), `android/app/src/main/java/com/habitring/app/MainActivity.kt` + `MainApplication.kt` (declaration + moved to new dir).
- **Removed `SYSTEM_ALERT_WINDOW`** from `AndroidManifest.xml` — Play Store rejects without justification; dev-only artifact.
- **Production keystore** generated: `android/app/habitring-release.keystore` (alias: `habitring`, validity: 10,000 days, password: `***REDACTED***`). **Back this up — losing it = can't update the app on Play Store.**
- **Release signing** wired in `android/app/build.gradle`: loads `android/keystore.properties`; falls back to debug if file absent (CI-safe).
- **`android/.gitignore`**: Added `*.keystore` + `keystore.properties`.
- **`eas.json`** created: development / preview (APK) / production (AAB) profiles.

### Key Decisions
- `keystore.properties` loaded via `rootProject.file(...)` (android-root relative); `storeFile` is `habitring-release.keystore` (resolves from `android/app/`).
- Ternary fallback in release buildType — CI builds without `keystore.properties` still compile.
- `SYSTEM_ALERT_WINDOW` removed outright; no production feature needs it.

### [NEEDS USER] Before uploading to Play Store
1. **`google-services.json`**: Download from Google Cloud Console -> Firebase -> Android app (`com.habitring.app`). Place at `android/app/google-services.json`.
2. **Update OAuth Android client**: Package `com.habitring.app`, SHA-1 release: `05:C5:26:C7:E7:8A:16:3C:10:55:19:B7:99:AF:27:18:91:AD:53:C4`.
3. **Build AAB**: `cd android && ./gradlew bundleRelease` -> `android/app/build/outputs/bundle/release/app-release.aab`.
4. **Play Console**: Create app, upload AAB, store listing + privacy policy + content rating.

### Release Keystore Fingerprints
- **SHA-1**: `05:C5:26:C7:E7:8A:16:3C:10:55:19:B7:99:AF:27:18:91:AD:53:C4`
- **SHA-256**: `39:7A:4C:AB:43:18:51:97:C7:9D:4B:EB:51:78:7D:CB:7C:1D:3A:FB:7B:24:2F:D2:F4:8F:66:BE:E1:2A:5B:E2`

---

## Habit Tracker — Calendar Screen + Fund Removal COMPLETE (2026-06-04)

### What Was Built / Changed
- **`src/queries/useCalendar.ts`** (new): `useCalendarData(userId, yearMonth)` — queries `activity_log` + `daily_summary` for a month, computes per-day stars, marks `is_best_day` (= max stars day) and `is_milestone` (streak_count in [3,7,14,30,100]).
- **`src/screens/CalendarScreen.tsx`** (new): Month grid calendar. Prev/next navigation. Day cells: green (milestone streak) > gold (best day) > soft green (active) > plain. Today ring border. Month summary stats (total stars, active days, best day). Legend. Locale-aware month label via `useLanguage`.
- **`src/navigation/RootNavigator.tsx`**: Tab order changed Home → Calendar → [FAB] → Analytics → Rank. `FundScreen` import replaced with `CalendarScreen`. `IconGift` replaced with `IconCalendar` (SVG). Unused `Rect` import removed.
- **`src/screens/ProfileScreen.tsx`**: Replaced `useTreatPool` + vault stat with `useAllTimeStats` → shows total all-time stars.
- **`src/config/i18n.ts`**: Added `tabCalendar`, `calendarTitle`, `calendarBestDay`, `calendarMilestone`, `calendarActive`, `calendarTotalStars`, `calendarActiveDays`, `calendarBest`, `statTotalStars` in both vi + en.

### Deleted
- `src/screens/FundScreen.tsx`
- `src/queries/useFund.ts`
- `src/queries/useTreats.ts`
- `src/game/treatLogic.ts`
- `__tests__/treatLogic.test.ts`

### Key Decisions
- `is_best_day` uses max within current month view only (not all-time), so it updates as user navigates months.
- Milestone streaks: [3, 7, 14, 30, 100] — milestone takes visual precedence over best-day (green > gold) since streak milestones are rarer.
- `cells` array memoized on `yearMonth` to avoid rebuild on every render.
- Locale derived from `useLanguage()` hook (not from `t` object comparison which was always true).
- `statTotalStars` added; `statVault` kept in i18n (unused but harmless; removing requires en/vi parity update).
- 90/90 tests pass (8 treatLogic tests removed with the module).

---

## Habit Tracker — ProgressScreen Stats Refactor COMPLETE (2026-06-05)

### What Was Changed
- **`src/screens/ProgressScreen.tsx`**: Merged two stat sections (`TỔNG QUAN` + `TOÀN THỜI GIAN`) into one `THỐNG KÊ` section. Single 6-card grid replaces two separate 3-card grids.
- **`src/config/i18n.ts`**: Removed `overviewSection`, `allTimeSection`, `longestStreak`. Added `statsSection`, `currentStreak`. Relabeled `starsThisWeek` → "Sao hiện tại / Current stars". Relabeled `bestStreak` vi → "Streak kỷ lục".

### Key Decisions
- `longestStreak` was mislabeled — `useStreakCount` returns current streak, not longest. Renamed key to `currentStreak` and label to "Streak hiện tại".
- `starsThisWeek` relabeled to "Sao hiện tại" — data is `tierInfo.currentStars` (rank progress), not weekly count.
- `bestStreak` vi renamed "Streak kỷ lục" (record streak) — clearly distinct from "Streak hiện tại" (current).
- All 6 stats kept; only structure and labels changed — no data loss.

### Test Results
- `npx tsc --noEmit` → 0 errors | `npx jest --runInBand` → 90/90 pass

---

## Habit Tracker — Analytics Screen BA/DA Overhaul COMPLETE (2026-06-05)

### What Was Built
- **`src/queries/useProgress.ts`**: Added `useWeeklyConsistency(userId)` — COUNT(DISTINCT local_date) FROM activity_log WHERE week_start = current week. Added `useTopActivities(userId, limit=3)` — JOIN task_types, GROUP BY task_type_id, ORDER BY count DESC. Inner JOIN excludes null task_type_id; `source='TASK'` filter ensures all rows have it.
- **`src/screens/ProgressScreen.tsx`**: Stats 2×2 grid — replaced "Tổng sao" (redundant with Profile) with "X/7 Ngày/tuần này" (weekly consistency). Period nav label now shows "Tuần này"/"Tháng này"/etc. (always visible, tappable to reset to current). Added "THÓI QUEN NHIỀU NHẤT" section — top 3 habits with relative progress bars (bar width = count/maxCount as %). Removed unused `useAllTimeStats` import/query.
- **`src/config/i18n.ts`**: Added keys: `weeklyActiveDays`, `topHabits`, `times(n)`, `periodToday`, `periodThisWeek`, `periodThisMonth`, `periodThisYear` in both vi + en.

### Key Decisions
- Weekly consistency from `activity_log` (not `daily_summary`) — `daily_summary` has no `week_start` column; `activity_log` does.
- Bar width uses percentage string `\`${pct}%\`` — RN `ViewStyle.width` accepts `string` (DimValue); no `as any` cast needed.
- `topActivities[0].count` divisor safe — rendered only when `topActivities.length > 0`.
- `useAllTimeStats` kept in `useProgress.ts` — still used by `ProfileScreen`; only removed from `ProgressScreen` import.
- Stats: current stars, streak, to-next-rank, active-days/week — covers all 4 habit motivation signals (progress, consistency, goal, rank).

### Test Results
- `npx tsc --noEmit` → 0 errors | `npx jest --runInBand` → 90/90 pass

---

## Habit Tracker — UI & Logic Fixes COMPLETE (2026-06-05)

### What Was Fixed
- **`src/screens/CalendarScreen.tsx`**: Wrapped `ScrollView` in `SafeAreaView edges={['top']}` from `react-native-safe-area-context`. `safeArea` style takes `backgroundColor`; `container` is pure `flex: 1`. Fixes header overlapping notch/status bar.
- **`src/screens/RankScreen.tsx`**: Removed `LinearGradient` philosophy card (dark `#1B1F1D`/`#3F4642` section at bottom of rank screen). Removed associated `philo`/`philoQ`/`philoA` styles and `expo-linear-gradient` import.
- **`src/screens/RankScreen.tsx`**: `sortedTiers` now returns only `[currentTier]` instead of all 7 tiers sorted desc. Leaderboard restricted to user's current rank only. Removed stagger slide-in animation (`ladderAnims` ref + `hasAnimated` effect) — pointless for 1 item and caused invisible render (`translateX: -30` native animation didn't fire reliably post-hot-reload). Kept glow loop + scale pop on current tier.

### Key Decisions
- `SafeAreaView` from `react-native-safe-area-context` (not RN core) — consistent with RankScreen pattern; `edges={['top']}` only to allow bottom tab bar to manage its own insets.
- Stagger animation removed (not just fixed) — with single tier display, slide-in stagger adds zero UX value. Root cause was native driver `translateX: -30` initial value causing invisible row until animation fired; removing the animation eliminates the class of bug.
- `!tier` null-guard added in map — defensive against `getCurrentTier` returning undefined when `tiers` DB is empty.

### Test Results
- `npx tsc --noEmit` → 0 errors | `npx jest --runInBand` → 90/90 pass

---

## Habit Tracker — Toggle-Undo + New Activities COMPLETE (2026-06-05)

### What Was Fixed / Built
- **`src/queries/useToday.ts`**: Added `useUnlogTask` mutation. Finds all `activity_log` rows for today with `source='TASK'` for the given `task_type_id`, deletes them, reverses `daily_summary` and `weekly_summary`, and reverses `treat_stars`. Also reverses the daily bonus row (deletes `source='DAILY_BONUS'` + un-sets `bonus_star_awarded`) when removing the task drops remaining points below `DAILY_BONUS_THRESHOLD`.
- **`src/screens/TodayScreen.tsx`**: `handleLog` now checks `loggedIds?.has(task.id)` first — if already logged, calls `unlogTask.mutateAsync` (undo path) instead of logging again. `logPending` prop now includes `unlogTask.isPending` to block double-taps during unlog.
- **`src/db/migrations.ts`**: Idempotent seed for 4 new activities — Study 📚 (timed), Family 👨‍👩‍👧, Relationship 💑, Sports ⚽ (timed) — inserted for all existing users.

### Key Decisions
- Toggle check before `is_time_based` guard — clicking a done time-based task also undoes, consistent with non-timed behavior.
- `weekly_stars = MAX(0, weekly_stars - ?)` floor added — unlog on edge cases (fresh user, negative weekly_stars from prior BAD tasks) stays non-negative.
- `logPending || unlogTask.isPending` combined — prevents race where tap during in-flight unlog triggers immediate re-log.
- Study and Sports set `is_time_based = 1` (log duration); Family and Relationship `is_time_based = 0` (check-in habits).

### Test Results
- `npx tsc --noEmit` → 0 errors | `npx jest --runInBand` → 90/90 pass

---

## Habit Tracker — Metro Cache Fix + SignInScreen Updates COMPLETE (2026-06-05)

- **Metro cache**: `ReferenceError: Property 'ladderAnims'/'useAllTimeStats' doesn't exist` — stale bundle, source already clean. Fix: delete `%LOCALAPPDATA%\Temp\metro-cache`. Verified via `expo export --platform android`.
- **`src/screens/SignInScreen.tsx`**: DEVELOPER_ERROR (code 10) handler + `__DEV__`-only "⚡ Dev Login" button with try/finally guard.
- **`package.json`**: jest `^30→~29.7`, `@types/jest` `^30→29.5.14` — aligns with ts-jest 29 constraint.
- **`app.json`**: `adaptiveIcon.backgroundColor` → `#E6F4EC` (green brand alignment).

### Key Decisions
- Dev login `if (isNew) onSignIn()` correct — returning users navigate via auth context re-render; callback only for new-user onboarding flow.
- Metro stale-bundle errors: not a code bug. Pattern: source clean → delete cache dir → rebuild.

| Error | Cause | Fix |
|-------|-------|-----|
| `ReferenceError: Property 'ladderAnims' doesn't exist` | Metro cached stale bundle referencing ref removed in prior session | Delete `%LOCALAPPDATA%\Temp\metro-cache`; rebuild |
| `ReferenceError: Property 'useAllTimeStats' doesn't exist` | Same Metro stale cache | Same fix |

### Test Results
- `npx tsc --noEmit` → 0 errors | `npx jest --runInBand` → 90/90 pass

---

## Habit Tracker — FAB 2-Step Flow COMPLETE (2026-06-06)

### What Was Built
- **`src/screens/AddActivitySheet.tsx`** (rewritten): FAB now opens a 2-step wizard.
  - **Step 1**: Name input + suggestion chips (from `TEMPLATE_CATEGORIES`, name-only, no emoji). → button (active when name non-empty). Tapping suggestion pre-fills name + advances to Step 2. Suggestions stay highlighted after selection.
  - **Step 2**: "← Quay lại" back button, activity name header, "Bao lâu?" duration chips (15min 30min 45min 1h 2h), "Không hẹn giờ" no-timer button. Selecting any option creates task template + logs it immediately (CREATE + LOG in one flow).
- **`src/queries/useTasks.ts`**: `useCreateTask.mutationFn` now returns task ID (SELECT after INSERT OR IGNORE) — needed to chain log call.
- **`src/config/i18n.ts`**: Added `back`, `searchActivities`, `logNow`, `addActivityHowLong`, `addActivityNoTimer` in vi + en.
- **`src/screens/LogActivitySheet.tsx`** (also reworked, but currently unused — `AddActivitySheet` is the FAB target): Same 2-step pattern applied; kept for potential future use.

### Key Decisions
- Combined CREATE + LOG in one flow — user taps FAB → picks activity → picks duration → done. No need to visit TodayScreen and tap separately.
- `useCreateTask` returns task ID via `SELECT id … WHERE user_id=? AND name=?` after `INSERT OR IGNORE` — safe even if task already exists (idempotent).
- Duration chips (15/30/45min, 1h, 2h) all set `isTimeBased: true`; "No timer" sets `isTimeBased: false` — replaces the removed hourly-tracking toggle.
- Removed from AddActivitySheet: emoji icon field, GOOD/BAD kind toggle, `isTimeBased` switch, inline save button.
- `LogActivitySheet` is an orphaned component (not in navigation); left with 2-step refactor applied.

### Test Results
- `npx tsc --noEmit` → 0 errors | `npx jest --runInBand` → 90/90 pass

---

## Habit Tracker — Brand UI + Logo Update COMPLETE (2026-06-05)

### What Was Changed
- **`src/config/theme.ts`**: Aligned brand colors to logo master — `primary` `#2E9C6A` → `#25B36E`, `primaryHover` `#248057` → `#1E9B5E`, `primaryPress` `#1E6646` → `#177A49`, `primarySoft` `#DCEDE3` → `#C6E9D5`, `starGold` `#D9952B` → `#E0A93B` (both light + dark). Hero shadow updated to `#177A49`.
- **`src/screens/SignInScreen.tsx`**: SVG logo replaced with exact master geometry — two-tone ring (track `#C6E9D5` + arc `#25B36E`, 315° arc from 12 o'clock clockwise to 9 o'clock), amber dot `#E0A93B` at gap, dark-green checkmark `#0F7A50`. Mint bg rect `#E6F4EC` gives app-icon badge look. Title changed to two-color inline: "habit " inherits dark ink, "ring" uses `colors.primary` green. Logo size 64→88.

### Key Decisions
- Logo bg rect (`#E6F4EC`) hardcoded (not theme token) — brand color, intentional; mint badge looks correct in both light and dark modes as a brand element.
- Two-color title via nested `<Text>` — "habit " inherits parent's `inkDark` color; only "ring" span sets override to `colors.primary`.
- `starGold` updated to `#E0A93B` — matches amber dot from logo; affects star icons across HomeScreen/RankScreen.

### Test Results
- `npx tsc --noEmit` → 0 errors | `npx jest --runInBand` → 90/90 pass

---

## Habit Tracker — Duration Unit Selector + No Auto-Log on Create COMPLETE (2026-06-06)

### What Was Changed
- **`src/screens/AddActivitySheet.tsx`**: FAB Step 2 no longer auto-logs. Replaced numeric duration input + log button with two choice buttons: "⏱ Có hẹn giờ / Timed" and "Không hẹn giờ / No timer". `handleCreate(isTimeBased)` only calls `createTask.mutateAsync` — task appears on TodayScreen unchecked, user logs manually. Removed `useLogTask`, `durationInput` state, and `logTask` usage entirely.
- **`src/screens/TodayScreen.tsx`**: Duration modal (tap timed task → log) now has Hours/Minutes unit toggle. `durationUnit` state (`'min' | 'hr'`). Two stacked buttons next to numeric input. `handleLogTime` converts: `parsed * 60` when hours selected. Unit resets to `'min'` on success and cancel.
- **`src/config/i18n.ts`**: Added `addActivityTimedBtn`, `taskAdded`, `unitMin`, `unitHour`, `validDuration` in both vi + en.

### Key Decisions
- FAB creates only (no log) — user intent at FAB is "I want to track this", not "I did this now". Logging at TodayScreen keeps the intent clear.
- Step 2 simplified to type selection (Timed / No timer) — duration is irrelevant at creation time since points are computed per actual log duration.
- `submittingRef` double-submit guard covers both "Timed" and "No timer" paths — no race possible.
- Unit toggle is vertical (stacked `Min` / `Hr`) alongside the numeric input — fits modal width without wrapping.

### Test Results
- `npx tsc --noEmit` → 0 errors | `npx jest --runInBand` → 90/90 pass

---

## Habit Tracker — ProgressScreen Performance Fixes COMPLETE (2026-06-06)

### What Was Fixed
- **`src/screens/ProgressScreen.tsx`**: Memoized all chart-derived data to eliminate VictoryChart JS-thread re-animations:
  - `RANGES` → `useMemo([t.rangeDay/Week/Month/Year])` — stable array ref
  - `formatBucket` → `useCallback([t.dayAbbr])` + `?? bucket` fallback (was returning `undefined` on bad date/index)
  - `goodData`, `badData`, `totalSum`, `tickValues` → single `useMemo([chartData])` — Victory re-renders only on actual data change
  - `tickFormat` → `useCallback([chartData, range, formatBucket])` — stable fn ref for VictoryAxis
  - `YEAR_MONTHS` hoisted to module-level const — avoids 12-element array allocation per tick call
  - `VictoryChart animate={false}` — kills JS-thread animation loop (v36 uses react-spring on JS thread)

### Key Decisions
- Single `useMemo` for all 4 chart arrays: one `[chartData]` dep handles `goodData`/`badData`/`totalSum`/`tickValues` atomically.
- `animate={false}` correct for v36: VictoryNative v36 animations run on JS thread via react-spring — disabling removes "JS thread busy" dev-console warnings without visual regression.

### Test Results
- `npx tsc --noEmit` → 0 errors | `npx jest --runInBand` → 90/90 pass

---

## Habit Tracker — Timed Suggestion Log Bug Fix COMPLETE (2026-06-07)

### What Was Fixed
- **`src/screens/TodayScreen.tsx`**: `handleSuggestionLog` now opens duration modal for timed tasks instead of logging directly with `durationMin: undefined`. Added `icon: string | null` to parameter type to match `SuggestedTask`. Spread + `{ category_id: null, sort_order: 0 }` fills `Task` shape for modal.

### Key Decisions
- Bug: timed suggestion (Study/Sports) logged with `durationMin: undefined` → `Math.max(1, floor(0/TIME_UNIT))` = 1pt/1★ always, ignoring actual duration.
- Fix routes timed suggestions through existing duration modal (same path as timed task-list items). Non-timed path unchanged; `isTimeBased: false` hardcoded since branch is now guaranteed non-timed.
- After modal log, suggestion chip disappears via `loggedIds` query invalidation — `setDismissedSuggestions` not needed for timed path.

### Test Results
- `npx tsc --noEmit` → 0 errors | `npx jest --runInBand` → 90/90 pass

| Error | Cause | Fix |
|-------|-------|-----|
| `Unable to load script` on emulator | Metro process dead or stale node on port 8081 | `Stop-Process -Id <PID> -Force`; `start cmd /k "npx expo start"`; `adb reverse tcp:8081 tcp:8081`; `adb shell am force-stop com.habitring.app && adb shell am start -n com.habitring.app/.MainActivity` |

---

## Habit Tracker — Chart Padding + Duration Chips COMPLETE (2026-06-07)

### What Was Fixed / Built

- **`src/queries/useProgress.ts`**: `useProgressData` now pads chart buckets to fill the full expected range — weekly shows all 7 days (Mon–Sun), daily shows 00h to current hour, monthly shows day 1 to today, yearly shows Jan to current month. Added `fmtDate` helper + `padBuckets` function. Rows from SQL merged into skeleton via Map lookup; missing days default to `{ goodStars: 0, badStars: 0 }`.
- **`src/screens/AddActivitySheet.tsx`**: Eliminated 2-step flow entirely. Now a single screen: name input → suggestion chips → duration chips (always visible, grayed until name entered). Tapping a suggestion fills the name inline (no step navigation). Duration chips `disabled={!hasName}` give visual feedback. Labels use `t.unitMin.toLowerCase()` for correct case ("15 phút" not "15 Phút"). Removed: `step` state, `handleNext`, `handleBack`, `→` button, all Step 2 header styles.

### Key Decisions
- Chart padding done in `queryFn` (not component useMemo) — data arrives pre-padded, `tickValues` and `tickFormat` stay consistent with full range.
- Monthly + daily padding capped at "today" (no future buckets shown) to keep chart honest.
- Single-step flow: user said "skip the 'Bao lâu?' step (what they called 'Set Reminder') and jump directly to time selection." Eliminating the step means duration chips appear inline — no intermediate navigation screen.
- Duration chips are visual shortcuts for `isTimeBased` only — actual logged duration is still entered at log time from TodayScreen.
- `.toLowerCase()` on i18n unit labels — `unitMin: 'Phút'` (titlecase) looks wrong mid-label; lowercase matches natural Vietnamese usage.

### Test Results
- `npx tsc --noEmit` → 0 errors | `npx jest --runInBand` → 90/90 pass

---

## Habit Tracker — Analytics Chart Fix COMPLETE (2026-06-07)

### What Was Fixed
- **`src/screens/ProgressScreen.tsx`**: Added `useWindowDimensions` + `chartWidth = windowWidth - 70`. Passed as `width={chartWidth}` to `VictoryChart` — fixes chart overflowing card + Victory's broken domain calculation when width was undefined.
- **`src/screens/ProgressScreen.tsx`**: `totalSum === 0` added to empty-state guard — when all buckets are zero (no activity today), shows "Chưa có hoạt động nào" instead of VictoryChart with degenerate Y-domain producing garbage axis labels.
- **`src/screens/ProgressScreen.tsx`**: `visibleTicks` memoized — daily decimates to every 3rd hour, monthly every 5th day. Prevents X-axis label crowding.

### Key Decisions
- `useWindowDimensions` (not `Dimensions.get`) — hook re-runs on rotation.
- `totalSum === 0` empty-state guard preferred over `minDomain`/`domain` — avoids fighting Victory's stacking domain logic; zero-bar chart has no UX value anyway.
- `tickFormat(tv)` still uses `tv - 1` index — correct because `visibleTicks` is a subset of the same 1-based values; Victory passes the original tick value, not the subset index.

### Test Results
- `npx tsc --noEmit` → 0 errors | `npx jest --runInBand` → 90/90 pass

---

## Habit Tracker — Analytics X-Axis Tick Fix COMPLETE (2026-06-07)

### What Was Fixed
- **`src/screens/ProgressScreen.tsx`**: `visibleTicks` useMemo rewritten to eliminate two X-axis UI glitches:
  - **D range**: Removed `|| i === tickValues.length - 1` — previously appended "23h" as last label on past days, breaking the clean every-3h pattern (21h → 23h = 2h gap vs expected 3h).
  - **M range**: Replaced fixed step-5 with dynamic step (step=3 when ≤10 days, step=5 otherwise). Last tick only appended when gap to previous sparse tick is `> step / 2` — prevents "06"/"07" crowding when early in the month.

### Key Decisions
- D range: drop always-append-last. `i % 3 === 0` is sufficient — hour 21 is the natural last clean tick for a 24h chart; forcing "23h" creates an irregular 2h gap.
- M range: dynamic step because a 7-day chart needs denser labels (step-3 → "01","04","07") than a 30-day chart (step-5 → "01","06",...). Gap threshold `> step/2` prevents adjacent label cramming while allowing meaningful last ticks.
- Unreachable dead-code guard (`!sparse.length`) removed — `i%step===0` always matches index 0 when `tickValues` is non-empty.

### Test Results
- `npx tsc --noEmit` → 0 errors | `npx jest --runInBand` → 90/90 pass

---

## Habit Tracker — Product Fixes & Refinements COMPLETE (2026-06-07)

### What Was Fixed

- **`src/screens/ProgressScreen.tsx`**: Year range period nav hidden. When `range === 'Y'`, prev/next arrows and period label are not rendered — always locked to current year (offset resets to 0 on range switch, which already existed). Eliminates confusion from navigating into years with no data.
- **`src/screens/AddActivitySheet.tsx`**: Removed `existingNames` filter from suggestion chips. All template activities always shown regardless of whether already added — prevents suggestions disappearing after first use. Also removed unused `useTodayTasks` import. `suggestions` useMemo simplified to `TEMPLATE_CATEGORIES.flatMap(c => c.tasks)`.
- **`src/screens/SignInScreen.tsx`**: Removed `__DEV__` dev login block entirely (button + styles). Google authentication is now the only auth path. Updated alert message that referenced dev login.
- **`src/screens/SettingsScreen.tsx`**: Feedback button changed from `mailto:` to Google Forms URL (`https://forms.gle/REPLACE_WITH_YOUR_FORM_ID`).

### Feedback System Decision
**Replaced email with Google Forms.** Rationale: no email client required on user device; responses auto-aggregate to Google Sheets; Apps Script / Zapier / Make can automate tagging and routing; free; reporters need no account. Alternative considered: GitHub Issues (better for devs, requires GitHub account for reporters — not suitable for end users).

### Key Decisions
- Year lock: hiding nav (not disabling) is cleaner UX — no grayed arrows to confuse. Offset already resets on range change.
- Suggestions always-show: `INSERT OR IGNORE` on task creation handles duplicates at DB level; showing existing templates gives user quick re-access to already-created habits.
- Dev login removal: production binary should enforce real auth. If you need dev testing, use a real Google account on an emulator.

### [NEEDS USER] Before shipping feedback button
1. Create a Google Form at forms.google.com with fields: Type (Bug/Suggestion/Other), Description, Contact (optional).
2. Get the short URL: Share → Get link → shorten to `forms.gle/...`.
3. Replace `'https://forms.gle/REPLACE_WITH_YOUR_FORM_ID'` in `src/screens/SettingsScreen.tsx`.
4. Optionally: set up a Google Sheets trigger to email/Slack you on new response.

### Test Results
- `npx tsc --noEmit` → 0 errors | `npx jest --runInBand` → 90/90 pass
