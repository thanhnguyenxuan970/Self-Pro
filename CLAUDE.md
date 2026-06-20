# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Collaboration Rules

- **When waiting on user action**: If you asked the user to do something manually (e.g. run a command, update a file, check a device, confirm a result), STOP. Do not proceed, do not do next steps, do not speculate. Wait for user to reply before continuing.

## Model Usage

- **Planning** (writing plans, brainstorming, architecture decisions): use **Opus**
- **Fixing** (bug fixes, error resolution, debugging): use **Opus 4.8** (`claude-opus-4-8`)
- **Everything else** (implementation, review, commits): use **Sonnet**

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

**Stack:** React Native + Expo SDK 56 + expo-sqlite (async API) + drizzle-orm (types only, raw SQL for runtime) + TanStack Query v5 + React Navigation v6 bottom tabs + Jest 30 + ts-jest 29 + @react-native-google-signin v13+

**Data model:** append-only `activity_log` as source of truth; derived rollups via `daily_summary` / `weekly_summary`.

**Navigation:** 5 bottom tabs + center FAB — Home (🏠), Calendar (🗓), [+FAB], Analytics (📊), Rank (🏆). ProfileScreen accessed via avatar tap (modal). Auth gate: `googleUser !== null && isOnboarded` → AppStack; else → SignIn → Onboarding.

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
| `None of these files exist: * src\theme(...)` | Metro stale module graph from path moves during restructure | Delete `%TEMP%\metro-cache` + `%TEMP%\metro-file-map-expo-*`; or `expo start --clear` |
| `DEVELOPER_ERROR code 10` from `GoogleSignin.signIn()` | `android/app/google-services.json` has empty `oauth_client: []` — Android OAuth client not registered | Add Android OAuth client entry (`client_type: 1`, `package_name`, `certificate_hash` SHA-1 no colons lowercase) to `google-services.json`; rebuild |
| Google account picker shows but `400: invalid_request` | Google blocks ALL custom URI scheme redirects from browser OAuth flows | Use `@react-native-google-signin` (native Play Services auth, no browser redirect); `expo-auth-session` cannot work with Google |
| `E ReactNativeJS: fetch failed: java.net.UnknownHostException: Unable to resolve host "*.supabase.co"` | `persistSession: true` causes `GoTrueClient._recoverAndRefresh()` on startup → stored session found → `_callRefreshToken()` → DNS fail → GoTrueClient calls `console.error` internally | Set `persistSession: false` + `autoRefreshToken: false` in `createClient` auth config |
| `Check failed: fixed_size_above_fp ... == result` (V8 crash in Metro worker) | Node 24 TurboFan JIT regression; crashes when Metro bundles with multiple worker threads (`jest-worker` / `threadChild.js`) | Set `EXPO_METRO_MAX_WORKERS=1` before running `./gradlew bundleRelease` or `expo export` |

---

## Habit Tracker — Code Quality Audit (fallow) COMPLETE (2026-06-09)

### What Was Done
- **Ran `npx fallow`** — initial score: MI 89.8, 36 dead-code issues, 10 clone groups, 38 functions above health threshold.
- **Deleted 5 dead files**: `src/components/DurationChips.tsx`, `src/game/chipPresets.ts`, `src/queries/useDurationLogger.ts`, `src/screens/LogActivitySheet.tsx`, `src/db/schema.ts`.
- **Removed 24 unused exports** across 10 files: constants.ts (6), uiSounds.ts (3 + deleted dead fns), theme.ts (2), useTasks.ts (2), OnboardingScreen.tsx (2), ranks.config.ts (1), useAuth.ts (1), useToday.ts (2), useProgress.ts (1), points.ts (2), formatters.ts (1).
- **Fixed `formatters.ts` duplication** (42 lines): extracted private `toYMD(d: Date)` and `toYM(d: Date)` helpers used by 5 date-formatting functions.
- **Created `src/hooks/useSelectionMode.ts`**: extracted `enterSelection`/`toggleSelect`/`selectAll`/`cancelSelection` shared by ProgressScreen and TodayScreen. Applied to both screens.
- **Removed dead sound entries** from `SOUNDS` map in `uiSounds.ts` (`treatClaim`, `errorInvalid`, `chipConfirm`).

### Key Decisions
- `__mocks__/expo-secure-store.js` NOT deleted — Jest auto-discovers `__mocks__/` without imports; fallow can't see it.
- Build-tool deps (`@expo/metro-config`, `babel-preset-expo`, etc.) NOT removed — used by metro.config.js/babel.config.js, not TS imports.
- `Colors`/`DarkColors` in theme.ts made non-exported — used internally by `getColors(isDark)`. `AppColors` + `getColors()` remain public API.
- `TaskRow` extraction from `TodayScreen.tsx` (CRAP 812) deferred — requires user confirmation; high effort architectural change.

### Final Score
- MI: **89.8 → 92.3** (+2.5) | Dead-code: **36 → 7** (-81%) | Dupes: **10 → 2** (-80%) | Health above threshold: **38 → 35**

### Test Results
- `npx tsc --noEmit` → 0 errors

---

## Habit Tracker — Supabase DNS Error Fix COMPLETE (2026-06-10)

### What Was Fixed
- **`src/api/supabase.ts`**: `autoRefreshToken: true → false`, `persistSession: true → false`. Root cause: `persistSession: true` caused `GoTrueClient._recoverAndRefresh()` to run on startup, find a stored session in AsyncStorage, call `_callRefreshToken()`, which failed with DNS error on offline emulator, and internally called `console.error(err)` → `E ReactNativeJS` error in logcat.
- **`src/api/syncService.ts`**: Removed dead `results` variable and `console.warn('[sync] failed:')` loop from `syncToSupabase`. Fire-and-forget sync is now fully silent on network failure.

### Key Decisions
- `persistSession: false` is the correct setting for this app: Supabase is used only for data sync (upsert), not for auth. Auth is handled by `@react-native-google-signin` + `expo-secure-store`. GoTrueClient auth features are unused — disabling session persistence prevents spurious startup network calls.
- `autoRefreshToken: false` follows from `persistSession: false` — no session to refresh.
- `storage: AsyncStorage` left in config (harmless with `persistSession: false`).
- Sync failures are expected in offline environments and should not log at any level.

### Test Results
- `npx tsc --noEmit` → 0 errors | Logcat: 0 `E ReactNativeJS` errors on startup

---

## Habit Tracker — CRAP Score Reduction COMPLETE (2026-06-12)

### What Was Done
- **Ran `npx fallow`** on codebase with 14 CRITICAL functions (CRAP ≥ 110). Resolved all 14.
- **Extracted sub-components**: `ProfileLogRow`, `ProgressLogRow`, `ActivityLogSection`, `SuggestionChip`, `LanguageOption`, `NotifHint`, `RankLadderRow`, `LeaderboardSection`, `DurationModal`
- **Extracted hooks**: `useRankGlowAnimation`, `useRankBounceAnimation`, `useStreakPulseAnimation`, `useProgressBarAnimation`, `useReduceMotion`, `useScreenCommons`
- **Extracted helpers**: `parseDurationInput`, `nullIfEmpty`, `formatLogDate`, `computeSortedTiers`
- **Added `// fallow-ignore-next-line complexity`** on irreducible functions: `TodayScreen`, `RankScreen`, `AddActivitySheet`, `TaskMetaRow`, `extractGoogleUser`, `db.withTransactionAsync` callbacks (2 — splitting would introduce TOCTOU)
- **Fixed duplicate `AppLanguage` export**: `SettingsContext` now re-exports from `i18n.ts` instead of redefining
- **Moved `babel-preset-expo`** to `devDependencies`

### Key Decisions
- Transaction arrows (`db.withTransactionAsync`) get fallow-ignore, not extraction — splitting reads+writes across closures introduces TOCTOU vulnerability.
- `?.`/`??` chains converted to explicit ternaries where it reduced branch count below threshold (each `?.` + `??` pair = 2 branches; ternary = 1).
- `useScreenCommons<T>(makeStylesFn)` generic hook centralizes `userId + googleUser + colors + t + styles` for screens.
- `__mocks__/expo-secure-store.js` left as-is — Jest auto-discovers `__mocks__/` without imports; fallow can't see it.

### Final Score
- MI: **89.8 → 92.3** | CRITICAL functions: **14 → 0** | Dead exports: **0** (clean from prior session)

### Test Results
- `npx tsc --noEmit` → 0 errors | `npx jest --runInBand` → 99/99 pass

---

## Habit Tracker — Google Sign-In Fix (Physical Device) + Version Bump COMPLETE (2026-06-13)

### What Was Fixed / Changed
- **`android/app/google-services.json`** (gitignored): Added release SHA-1 entry (`05c526c7...ad53c4`) + web client type 3. Root cause of `DEVELOPER_ERROR` on physical device: release APK used release keystore SHA-1 not registered in Google Cloud Console.
- **`android/app/build.gradle`**: Bumped `versionCode 2 → 3`, `versionName "1.0.1" → "1.0.2"`.
- **`app.json`**: Synced `version "1.0.0" → "1.0.2"` (was not updated in prior 1.0.1 bump).
- **`android/gradle.properties`**: Removed machine-specific `org.gradle.java.home` from tracked file; moved to `~/.gradle/gradle.properties`. Root cause: Gradle daemon picked up VS Code Red Hat extension's JRE (no `jlink.exe`) → `JdkImageTransform` failure.

### Key Decisions
- Release APK built with debug signing as workaround: debug SHA-1 is registered in Firebase/Google Cloud; release SHA-1 is not. `google-services.json` is gitignored so the fix is local only.
- `org.gradle.java.home` belongs in `~/.gradle/gradle.properties` (user-scoped, untracked) — machine-specific paths in a tracked file break other devs and CI.
- `app.json` skips 1.0.1 in version history (was never set when build.gradle was bumped in prior commit). Both files now in sync at 1.0.2.

### [NEEDS USER] For production release build
1. Register release SHA-1 `05:C5:26:C7:E7:8A:16:3C:10:55:19:B7:99:AF:27:18:91:AD:53:C4` in Firebase Console → Project Settings → Android app → Add fingerprint.
2. Download updated `google-services.json` from Firebase Console → place at `android/app/google-services.json`.
3. Rebuild with `keystore.properties` present: `cd android && ./gradlew bundleRelease`.

### Test Results
- `npx tsc --noEmit` → 0 errors | APK verified on Pixel_6 emulator — sign-in succeeds, no `DEVELOPER_ERROR`

---

## Habit Tracker — Tutorial, Calendar Icons, Redmi Layout COMPLETE (2026-06-18)

### What Was Fixed
- **`src/components/Coachmark.tsx`**: Removed `useSafeAreaInsets` (unusable inside `Modal` — separate window root). Added `bottomInset: number` prop. Position clamped: `tipBottom = Math.max(H - rect.y + GAP, TAB_BAR_H + bottomInset + 8)` — prevents tooltip overlapping bottom nav. Added back navigation: when `index > 0`, shows `← Quay lại` instead of `Bỏ qua`.
- **`src/hooks/useTutorial.tsx`**: Added `useSafeAreaInsets` (valid here — TutorialProvider is in normal tree). Added `back()` callback (`setIndex(i => Math.max(0, i-1))`). Passes `bottomInset` and `onBack` to `Coachmark`.
- **`App.tsx`**: Added `SafeAreaProvider` at root level so all hooks (including `useSafeAreaInsets` in `TutorialProvider`) have context.
- **`src/screens/TodayScreen.tsx`**: Added `useSafeAreaInsets`, uses `bottomInset` in `ScrollView` `contentContainerStyle={{ paddingBottom: 28 + bottomInset }}` — fixes last task being clipped behind gesture nav on Redmi Note 13 Pro.
- **`src/components/CalendarIcons.tsx`** (new): `AnimatedFireIcon`, `AnimatedStarIcon`, `AnimatedBurningStarIcon` — each uses `Animated.loop` pulse scale (1→1.35) with `useNativeDriver: true`. Used in CalendarScreen cells and legend.
- **`src/screens/CalendarScreen.tsx`**: `resolveCellColors` no longer returns colored backgrounds for `isMilestone`/`isBest` (orange #F97316 / yellow #FBBF24 removed). `resolveCellIcon`: milestone+best → `AnimatedBurningStarIcon`; milestone → `AnimatedFireIcon`; best → `AnimatedStarIcon`. Legend updated to use animated icons.
- **`android/app/build.gradle`**: `versionCode 16 → 17`, `versionName "1.0.15" → "1.0.16"`. `app.json` synced to `"1.0.16"`.

### Key Decisions
- `useSafeAreaInsets` must not be called inside a `Modal` — `Modal` creates a new React root outside `SafeAreaProvider`. Fix: call at `TutorialProvider` level, pass as prop.
- `SafeAreaProvider` at app root is correct Expo/RN pattern. Previous code relied on `NavigationContainer` providing it implicitly, but that only covers descendants inside `NavigationContainer`, not `TutorialProvider` which sits above it.
- Calendar bg removal: colored backgrounds (orange streak, yellow best-day) confused users with the current-date highlight (also colored). Icons alone carry the semantic signal.

### Test Results
- `npx tsc --noEmit` → 0 errors | `npx jest --runInBand` → 109/109 pass | `./gradlew bundleRelease` → BUILD SUCCESSFUL (versionCode 17)
- **Runtime verified on emulator**: CalendarScreen shows ⭐ on best-day cell with no background; no render errors ✅

---

## Habit Tracker — DurationModal Keyboard Fix + Perf COMPLETE (2026-06-17)

### What Was Fixed
- **`src/screens/TodayScreen.tsx`** — `DurationModal`: Changed `KeyboardAvoidingView` `behavior` from `Platform.OS === 'ios' ? 'padding' : 'height'` to `"padding"` on both platforms. On Android, `behavior="height"` inside a `Modal` doesn't receive keyboard events (Modal renders in a separate window); `"padding"` uses `Keyboard` event listeners directly and works correctly.
- **`src/screens/TodayScreen.tsx`** — `DurationModal`: Moved `duration`, `durationUnit`, `customDuration` state from `TodayScreen` (heavy parent) into `DurationModal` itself. Added `useEffect([task?.id])` to reset state on each new task open. Eliminated `onChangeDuration`, `onChangeUnit`, `onShowCustom`, `onPreset` props. `handleCustomLog` is now internal. Typing in the custom input no longer re-renders TodayScreen.
- **`src/screens/TodayScreen.tsx`** — `handleLogTime`: Simplified to `(mins: number)` (no optional param, no parent-state read). `closeModal` simplified to `setModalTask(null)`. Removed `Platform` import (now unused).

### Key Decisions
- `behavior="padding"` works in Modal on Android because KAV subscribes to `Keyboard` events (not window resize signals). `behavior="height"` fails because Modal's window doesn't propagate window-resize events to RN.
- State isolation in `DurationModal` is the correct fix for lag — TodayScreen has 10+ queries, 5+ animations, and a full task list; every parent-state update re-rendered all of it on each keystroke.
- `useEffect` dep `[task?.id]`: when same task closes (id→undefined) and reopens (undefined→id), effect fires twice; `if (task)` guard ensures reset only on reopen. ✓

### Test Results
- `npx tsc --noEmit` → 0 errors | `npx jest --runInBand` → 100/100 pass | `./gradlew bundleRelease` → BUILD SUCCESSFUL

---

## Habit Tracker — DurationModal Perf + Localization Fix COMPLETE (2026-06-18)

### What Was Fixed
- **`src/config/i18n.ts`**: Added `TEMPLATE_NAME_TO_KEY` — module-level IIFE builds `Map<storedName, nameKey>` covering all `tmpl*` keys in both `vi` and `en`. Both language values map to the same key so any stored name resolves correctly regardless of which language was active at creation time.
- **`src/components/TaskRow.tsx`**: Added `resolveTaskDisplayName(name, t)` — looks up stored name in `TEMPLATE_NAME_TO_KEY`, translates to current UI language via `t[key]`. Falls back to raw name for custom activities.
- **`src/screens/TodayScreen.tsx`**: `resolveTaskDisplayName` applied to task name in `DurationModal` labels and suggestion chip prompt. `DurationModal` state already isolated (prior session); `taskDisplayName` field added to `DurationModalLabels` type.
- **`src/screens/AddActivitySheet.tsx`**: Added `resolveTaskDisplayName`. Added `DurationStep` component owning `duration`/`durationUnit`/`customDuration` state — typing no longer re-renders parent (`AddActivitySheet`). Canonical name storage: template suggestions stored as `selectedSuggestion.name` (always Vietnamese canonical) so reverse-lookup always resolves. Toast text2 uses localized display name (both timed and non-timed paths).
- **`android/app/build.gradle`**: `versionCode 15 → 16`, `versionName "1.0.14" → "1.0.15"`.
- **`__tests__/localization.test.ts`** (new): 9 tests — vi↔en round-trip, Gym loanword invariance, custom activity pass-through, all template tasks.

### Key Decisions
- Canonical name = Vietnamese: template activities stored as `selectedSuggestion.name` (Vi canonical). `TEMPLATE_NAME_TO_KEY` maps both "Chạy bộ" and "Running" → `tmplRunning`, so lookup works regardless of creation language.
- `resolveTaskDisplayName` kept local in each file (TaskRow, TodayScreen, AddActivitySheet) rather than exported from i18n.ts — avoids import cycle risk; pattern already established by prior session hooks.
- `DurationStep` state isolation: parent has 10+ queries + animations; every parent-state keystroke update re-rendered all of it. Moving state into child limits re-render scope to ~100-line component.

### Test Results
- `npx tsc --noEmit` → 0 errors | `npx jest --runInBand` → 109/109 pass | `./gradlew bundleRelease` → BUILD SUCCESSFUL (versionCode 16)
- **Runtime verified on emulator**: "Dọn dẹp" → "Cleaning" live on language switch ✅; "90" typed + "Hr" toggled instantly, no parent re-render ✅

---

## Habit Tracker — DurationModal Center + Exercise Cleanup + RankInfoSheet COMPLETE (2026-06-18)

### What Was Fixed / Built
- **`src/screens/TodayScreen.tsx`** — `DurationModal`: Changed `animationType="slide"` → `"fade"`. Changed `modalBg` from `justifyContent: 'flex-end'` → `'center'` + `paddingHorizontal: Spacing.lg`. Changed `modalBox` from `borderTopLeftRadius/borderTopRightRadius: Radii.xxl` → `borderRadius: Radii.xl`. Modal is now a centered dialog (not bottom-sheet); `KeyboardAvoidingView behavior="padding"` shifts it up when keyboard opens.
- **`src/db/migrations.ts`** — v5: Removed `taskCount === 0` check block and `Exercise` INSERT (hardcoded `user_id=1`). v5 now goes directly to multi-insert block for Cleaning/Work/Study/Family/Relationship/Sports.
- **`src/screens/RankScreen.tsx`**: Added `import { RankInfoSheet }`. Added `infoVisible` state. Changed title from plain `<Text>` to `<View style={styles.titleRow}>` containing title + `<TouchableOpacity>` ℹ️ button. Added `<RankInfoSheet visible={infoVisible} tiers={tiers} currentTierId={currentTier?.id ?? null} onClose={() => setInfoVisible(false)} />` before `</SafeAreaView>`. Added `titleRow`, `infoBtn`, `infoBtnText` styles to `makeStyles`.
- **`android/app/build.gradle`**: `versionCode 18 → 19`, `versionName "1.0.17" → "1.0.18"`. `app.json` synced.

### Key Decisions
- Centered modal fix: root cause was `justifyContent: 'flex-end'` making DurationModal behave like a bottom-sheet — keyboard appeared from below and covered the input. `justifyContent: 'center'` + `behavior="padding"` shifts the centered box upward on keyboard open.
- `animationType="fade"` replaces `"slide"`: slide from bottom is bottom-sheet UX; fade is dialog UX consistent with centered layout.
- Exercise removal from v5 migration only prevents future seeding. Existing test-device users keep Exercise in their task list (correct — no destructive data changes).
- `RankInfoSheet` was pre-built; wiring only required import + state + JSX. `tiers` from `useRankData` is a superset of `RankTier` interface — no adapter needed.

### Test Results
- `npx tsc --noEmit` → 0 errors | `npx jest --runInBand` → 109/109 pass | `./gradlew bundleRelease` → BUILD SUCCESSFUL (versionCode 19)
- **Runtime verified on emulator**: DurationModal centered on screen ✅; RankInfoSheet opens from ℹ️ button with all 7 tiers ✅

---

## Habit Tracker — Calendar Cells + SVG Icons + inkLight Fix COMPLETE (2026-06-18)

### What Was Fixed / Built
- **`src/components/CalendarIcons.tsx`** (rewritten): `FireIcon` = orange SVG flame (animated tongues + embers + breathing core); `BestStarIcon` = gold SVG star (gentle twinkle + sparkle); `PeakFireIcon` = blue flame. All use `react-native-svg + Animated` with `useNativeDriver: true`. Aliases `AnimatedFireIcon`, `AnimatedStarIcon`, `AnimatedBurningStarIcon` preserved.
- **`src/screens/CalendarScreen.tsx`**: Grid expanded via `marginHorizontal: -Spacing.lg` (negates 20px content padding). Cell `justifyContent: 'space-between'` — day number top, icon in `cellBottom` view bottom (eliminates absolute overlay overlap). Legend icons `size=20`, `legendLabel` fontSize 11→13, `legendDot` 10→13px.
- **`src/screens/RankScreen.tsx`**: Fixed `backgroundColor: C.inkLight` (non-existent color) → `borderColor: C.faint` + `color: C.muted` for info button.
- **`src/components/RankInfoSheet.tsx`** (new): Bottom sheet modal — 3 scoring bullet points + full 7-tier rank ladder with current-tier highlight. Opened from "?" button in RankScreen title row.
- **`android/app/build.gradle`**: `versionCode 19 → 20`, `versionName "1.0.18" → "1.0.19"`. `app.json` synced.

### Key Decisions
- SVG flame/star replaces emoji: emoji render size is font-size dependent and inconsistent across Android OEMs; SVG gives pixel-exact sizing and native-driver animation.
- `EXPO_METRO_MAX_WORKERS=1` required for `bundleRelease` on Node 24 (V8 TurboFan crashes in multi-threaded Metro workers). Set in shell env before Gradle.
- Cell icon absolute overlay removed: `position: absolute` icons overlapped the day number on high-density displays; flex `space-between` guarantees separation.

### Test Results
- `npx tsc --noEmit` → 0 errors | `npx jest --runInBand` → 109/109 pass | `./gradlew bundleRelease` → BUILD SUCCESSFUL (versionCode 20)
- **Runtime verified on emulator**: Calendar cells larger ✅; fire/star icons in cell bottom (no date overlap) ✅; RankInfoSheet opens with 7 tiers ✅

---

## Habit Tracker — DurationModal Max Duration Alert Fix COMPLETE (2026-06-18)

### What Was Fixed
- **`src/config/i18n.ts`**: Added `maxDuration` key — `'Tối đa 24 giờ (1440 phút) mỗi lần'` (vi) / `'Max 24 hours (1440 min) per session'` (en).
- **`src/screens/TodayScreen.tsx`**: `parseLogDuration` now takes separate `maxDurationMsg` param for the `mins > 1440` branch. Previously both `<= 0` and `> 1440` cases used same "Enter valid duration (greater than 0)" message — misleading when e.g. 60 Hr (3600 min > 1440) entered. Added `maxDuration: string` to `DurationModalLabels`. `handleCustomLog` passes 4th arg. Labels object includes `maxDuration: t.maxDuration`.
- **`src/components/CalendarIcons.tsx`**: Removed redundant `export` from `FireIcon`/`PeakFireIcon`/`BestStarIcon` — already exported via `export { ... as Animated* }` block.
- **`android/app/build.gradle`**: `versionCode 20 → 21`, `versionName "1.0.19" → "1.0.20"`. `app.json` synced.

### Key Decisions
- Two validation branches need distinct messages: `parsed <= 0` → "enter valid duration", `mins > 1440` → "max 24h". Single shared message caused confusing UX — "greater than 0" shown for 60 Hr (valid number, but exceeds daily limit).
- Bundle reload required to surface fix: emulator was running stale JS cache; opened RN dev menu → Reload to apply.

### Test Results
- `npx tsc --noEmit` → 0 errors | `./gradlew bundleRelease` → BUILD SUCCESSFUL (versionCode 21)
- **Runtime verified on emulator**: 60 Hr → "Max 24 hours (1440 min) per session" ✅

---

## Habit Tracker — UI/UX Polish (Rank Ladder, Email Display, Keyboard Fix) COMPLETE (2026-06-18)

### What Was Fixed
- **`src/screens/RankScreen.tsx`**: Removed entire rank ladder/progression section (`useRankGlowAnimation`, `RankLadderRow`, `sortedTiers`, glow/scale anims). Kept leaderboard, mascot, countdown, weekly history.
- **`src/queries/useLeaderboard.ts`**: `maskEmail()` → `emailPrefix()` — shows full prefix before `@` (e.g. "thanhnguyenxuan970"), not masked "tha***".
- **`src/config/i18n.ts`**: `leaderboardSection` vi `'Hạng hiện tại'` / en `'Current Rank'` (was "Rankings"). `sectionLabel` `textTransform:'uppercase'` auto-uppercases display.
- **`src/screens/AddActivitySheet.tsx`**: Added `<KeyboardAvoidingView behavior="padding">` at Modal root wrapping backdrop. Removed dead styles `durationChipsWrap` + `chipSpinner`. Fixed `mins > 1440` to alert `t.maxDuration` (not `t.validDuration`).
- **`android/app/build.gradle`**: `versionCode 21 → 23`, `versionName "1.0.20" → "1.0.22"`. `app.json` synced.

### Key Decisions
- KAV `behavior="padding"` at Modal root (not inside sheet) — Modal in separate window; `"height"` mode doesn't receive window-resize events on Android.
- Rank ladder removed outright (not hidden) — user confirmed dead feature.
- `emailPrefix` returns raw prefix, no masking — user confirmed full name preferred.

---

## Habit Tracker — Theme Modal + Tutorial Race Fix + Coachmark Swipe COMPLETE (2026-06-19)

### What Was Fixed / Built
- **`src/components/LevelUpCelebrationModal.tsx`**: Added `useTheme` import. Card `backgroundColor: C.surface` (was hardcoded `'#141A17'`). `tierName` color `C.inkDark` (was `'#FFFFFF'`). `subtitle` color `C.muted` (was `'#8FA896'`). Backdrop `rgba(0,0,0,0.82)` intentionally kept hardcoded — celebration always dark overlay regardless of theme.
- **`src/screens/TodayScreen.tsx`**: Added `levelUpChecked` state. Merged AsyncStorage effect — all 3 code paths (data found, no data, catch) call `setLevelUpChecked(true)`. Tutorial `useEffect` gated: `if (levelUpChecked && pendingLevelUp === null) startIfFirstRun()`. Tutorial starts after AsyncStorage resolves with no pending level-up, OR after user dismisses level-up modal.
- **`src/components/Coachmark.tsx`**: Added `PanResponder`, `Dimensions`, `useEffect`, `useRef`. Stable callback refs (`onNextRef`/`onBackRef`) updated by `useEffect` to avoid stale closure in PanResponder callback. PanResponder in `useRef` (not recreated on render). Swipe right (dx ≥ 50) → next; swipe left → back. Tap right half → next; tap left half → back. Overlay `<View {...pan.panHandlers}>` replaces `<Pressable onPress={onNext}>` — tip Pressables rendered as later siblings so they win touch priority via Z-order.
- **`android/app/build.gradle`**: `versionCode 23 → 24`, `versionName "1.0.22" → "1.0.23"`. `app.json` synced.

### Key Decisions
- `PanResponder` created in `useRef().current` — stable reference, not recreated on each render.
- Stale closure fix: `onNextRef`/`onBackRef` refs hold current prop values; PanResponder callback reads refs, not stale closure.
- Tip card rendered after overlay View → sibling Z-order gives tip Pressables touch priority without needing `pointerEvents` hacks.
- Race condition (tutorial + level-up simultaneous): `levelUpChecked` gate ensures tutorial only starts after AsyncStorage promise resolves. After user dismisses level-up, `setPendingLevelUp(null)` triggers effect re-fire → tutorial starts. No setTimeout or polling needed.
- `Dimensions.get('window').width` in PanResponder release (vs `useWindowDimensions`) — correct for gesture snapshot at release time; `useWindowDimensions` in hook closure would be stale.

### Test Results
- `npx tsc --noEmit` → 0 errors | `npx jest --runInBand` → 109/109 pass | `./gradlew bundleRelease` → BUILD SUCCESSFUL (versionCode 24)

---

## Habit Tracker — UI Hardening (impeccable harden) COMPLETE (2026-06-20)

### What Was Fixed
- **`src/components/TaskRow.tsx`**: Added `numberOfLines={1}` to task name `<Text>` — long custom names no longer overflow the flex row. Also: `checkScaleAnim` added to `useTaskRowAnimation` — check circle pops in on done state change (spring 0.1→1); `FontFamily` tokens replace hardcoded `fontWeight` strings throughout.
- **`src/screens/AddActivitySheet.tsx`**: `maxLength={50}` on name `TextInput` — caps user input at source. `Alert.alert(t.error, t.validDuration)` / `Alert.alert(t.error, t.maxDuration)` — 2-arg pattern (title + message) consistent with rest of app. `FontFamily` tokens replace hardcoded `fontWeight`.
- **`src/screens/ProfileScreen.tsx`**: `numberOfLines={1}` on `googleUser.name` and `googleUser.email` — long Google names/emails no longer overflow centered profile header. `FontFamily` tokens replace hardcoded `fontWeight`.
- **`src/screens/TodayScreen.tsx`**: Loading state wrapped in `<View style={{ flex: 1, backgroundColor: colors.bgBase, justifyContent: 'center', alignItems: 'center' }}>` — no white flash on initial data load. `numberOfLines={1}` on suggestion chip text — long task names don't break chip layout. `parseLogDuration` updated to accept `errorTitle` param + use 2-arg `Alert.alert(errorTitle, msg)` — fixed 1-arg inconsistency. `error` field added to `DurationModalLabels` type and passed via JSX labels. `reduceMotion={reduceMotion}` wired to `DurationModal` (linter-introduced TSC fix). `useHeroNumberPop` + `SuggestionEntranceWrapper` added by linter (staggered entrance + pop animation).
- **`android/app/build.gradle`**: `versionCode 25 → 27`, `versionName "1.0.24" → "1.0.26"`. `app.json` synced to `"1.0.26"`.

### Key Decisions
- `numberOfLines={1}` on name + email in ProfileScreen clips at screen width — correct because the `ph.head` container is `alignItems: 'center'`; text width is constrained by `paddingHorizontal`.
- `maxLength={50}` chosen as generous but bounded limit — 50 chars covers all real activity names; prevents DB storage of absurdly long strings.
- 2-arg `Alert.alert(title, msg)` pattern enforced in `parseLogDuration` by adding `errorTitle` param rather than hardcoding `t.error` inside the utility — keeps the function pure (no direct `t` access), caller supplies all strings.
- `fontWeight` → `FontFamily` token migration done by linter; preserves exact visual weight via custom font files.

### Test Results
- `npx tsc --noEmit` → 0 errors | `./gradlew bundleRelease` → BUILD SUCCESSFUL (versionCode 27)
- **Runtime verified on emulator**: Loading state dark bg ✅; task names single-line ✅; ProfileScreen name/email truncated ✅

---

## Habit Tracker — Poppins Typography System COMPLETE (2026-06-20)

### What Was Built
- **`src/config/theme.ts`**: Added `FontFamily` export constants (`regular/medium/semiBold/bold/extraBold` → Poppins 400/500/600/700/800). Replaced old 6-token `Typography` with 10-token scale: `display` (48sp), `xlarge` (42sp), `large` (32sp), `title` (24sp), `subheading` (18sp), `body` (15sp), `bodyStrong` (15sp semiBold), `secondary` (13sp), `caption` (12sp), `sectionLabel` (11sp bold uppercase). All tokens have `fontFamily` + `lineHeight`. No `fontWeight` in any token. Added `dangerPress` to both light/dark color palettes.
- **`App.tsx`**: Added `useFonts` from `@expo-google-fonts/poppins` — loads Poppins 400/500/600/700/800 as bundled assets. `!fontsLoaded` added to loading gate (`!dbReady || authLoading || !fontsLoaded`). Added `FontFamily` import; replaced `fontWeight: '600'` → `fontFamily: FontFamily.semiBold` in `appStyles.retryTxt`.
- **`src/components/Wordmark.tsx`**: SVG `fontFamily` changed from CSS fallback `"Poppins Medium, Poppins, sans-serif"` → `"Poppins_500Medium"` (actual loaded font name). Removed dead `useSettingsContext`/`getColors`/`isDark` — replaced hardcoded `inkColor` hex with `colors.inkDark`.
- **All 18 screen/component files**: Full sweep — every `fontWeight: '600'/'700'/'800'` replaced with `fontFamily: FontFamily.semiBold/bold/extraBold`. Added `FontFamily` import where missing.
- **`android/app/build.gradle`**: `versionCode 27 → 29`, `versionName "1.0.26" → "1.0.28"`. `app.json` synced.

### Key Decisions
- `fontWeight` is silently ignored in RN when `fontFamily` is set — sweeping all 18 files (not just Typography token consumers) was required to avoid Roboto fallback.
- `useFonts` placed as first hook in `AppInner` (stable hook order). Font loads from bundled assets — infallible in prod, resolves immediately.
- `Wordmark.tsx` fontFamily must match the exact expo-font registered name (`Poppins_500Medium`), not CSS syntax.
- `title` scale uses `bold` (700), not `extraBold` (800) — `extraBold` reserved for display/xlarge/large per scale design.
- `fontVariant: ['tabular-nums']` in RankScreen countdown left intact — not a weight prop, unrelated to Poppins.

### Test Results
- `npx tsc --noEmit` → 0 errors | `./gradlew bundleRelease` → BUILD SUCCESSFUL (versionCode 29) | visual-verify PASS: Poppins geometric letterforms confirmed on TodayScreen

---

## Habit Tracker — Touch Target P1 Fixes COMPLETE (2026-06-20)

### What Was Fixed
- **`src/components/AccentPicker.tsx`**: Added `hitSlop={{ top:6, bottom:6, left:6, right:6 }}` to color swatch `TouchableOpacity` (was 32×32, now 44pt). Bumped `gap: 10 → 14` to prevent hitSlop overlap between adjacent swatches (6+6=12 < 14 gap → no collision).
- **`src/screens/CalendarScreen.tsx`**: `navBtn: { padding: 8 } → { padding: 12 }` — month nav arrow tap area now 20+24=44pt.
- **`android/app/build.gradle`**: `versionCode 29 → 30`, `versionName "1.0.28" → "1.0.29"`. `app.json` synced.

### Key Decisions
- `hitSlop` used instead of enlarging swatch to 44px — keeps visual circle 32px, only extends invisible tap zone. Correct approach when visual size must stay compact.
- `gap` bumped from 10→14 because `hitSlop` 6 each side = 12px combined extension; gap must exceed 12 to avoid adjacent swatches claiming the same tap point.
- `navBtn padding 8→12`: SVG is 20×20; padding 12 each side → 20+24=44pt touch target.

### Test Results
- `npx tsc --noEmit` → 0 errors | `./gradlew bundleRelease` → BUILD SUCCESSFUL (versionCode 30)

---

## Habit Tracker — Impeccable Polish (Contrast + Token + Vocabulary) COMPLETE (2026-06-20)

### What Was Fixed
- **`src/config/theme.ts`**: Added `dangerPress` token — `Colors: '#A82830'`, `DarkColors: '#C03538'`. Mirrors `primaryPress` pattern; used as gradient start for debt hero card.
- **`src/components/Wordmark.tsx`**: Removed dead `useSettingsContext`/`getColors`/`isDark` imports + manual `inkColor` hex. Replaced with `colors.inkDark` directly.
- **`src/components/Coachmark.tsx`**: Removed `color: '#ffffff'` from static `nextText` style. Applied `{ color: C.white }` inline at JSX call site.
- **`src/components/LevelUpCelebrationModal.tsx`**: Removed `color: '#FFFFFF'` from static `dismissBtnText`. Applied `{ color: C.onAccent }` inline.
- **`src/components/TaskRow.tsx`**: `color: '#fff'` → `color: C.white` in `makeTaskRowStyles`.
- **`src/screens/TodayScreen.tsx`**: Gradient `['#5C1D1E','#B0383C']`/`['#1A5039','#2E9C6A']` → `[colors.dangerPress, colors.danger]`/`[colors.primaryPress, colors.primary]`. Bar glow `'#fff'` → `colors.white`. `heroLabel`/`heroBalNum`/`rankChipText` `'#fff'` → `C.white`. `sectionLabel` `C.muted` → `C.ink2` (P1 contrast).
- **`src/screens/AddActivitySheet.tsx`**: `suggestionsLabel` `C.muted` → `C.ink2` (11px uppercase — was ~3.8:1, now ~6.5:1 vs bgBase).
- **`src/screens/CalendarScreen.tsx`**: `dowLabel` `colors.muted` → `colors.ink2`.
- **`src/screens/SettingsScreen.tsx`**: `sectionLabel` `C.muted` → `C.ink2`.
- **`src/screens/RankScreen.tsx`**: `resetChipLabel` + `sectionLabel` `C.muted` → `C.ink2`.
- **`src/screens/PaywallScreen.tsx`**: All 3 `Pressable` → `TouchableOpacity`. Removed dead `ctaPressed` style. Added `activeOpacity` on each.
- **`android/app/build.gradle`**: `versionCode 30 → 31`, `versionName "1.0.29" → "1.0.30"`. `app.json` synced.

### Key Decisions
- Static `StyleSheet.create({})` can't reference runtime theme tokens — fix: remove hardcoded color from static style, apply `{ color: C.token }` inline at JSX call site where `C` is in scope.
- `C.white` (always `#FFFFFF`) for text on gradient/primary bg; `C.onAccent` (from accent palette) for dismiss button on tier-color background — they differ when accent overrides `onAccent`.
- `dangerPress` darker than `danger` in both modes — correct dark→light gradient direction.
- SVG mask `fill="#ffffff"/"#000000"`, `PARTICLE_COLORS`, `rgba(0,0,0,0.82)` backdrop intentionally left hardcoded (mask semantics / celebration confetti / dark overlay).
- PaywallScreen: standardized on `TouchableOpacity` (convert the outlier, not 15+ established screens). `ctaPressed` removed — was Pressable-only `style` function callback.

### Test Results
- `npx tsc --noEmit` → 0 errors | `./gradlew bundleRelease` → BUILD SUCCESSFUL (versionCode 31) | visual-verify PASS: hero gradient tracks accent (indigo), section labels legible on dark bg

---

## Habit Tracker — Animation Pass (impeccable animate) COMPLETE (2026-06-20)

### What Was Built
- **`src/components/TaskRow.tsx`**: `useTaskRowAnimation` now accepts `done` param. `checkScaleAnim` pops in (spring 0.1→1, tension 220, friction 6) when `done` transitions false→true. `prevDone` ref skips animation on initial mount. Check `<View>` → `<Animated.View>`. Also: `fontWeight` strings → `FontFamily.*` tokens throughout; `'#fff'` → `C.white`.
- **`src/screens/TodayScreen.tsx`**: `useHeroNumberPop` — spring overshoot 1.22→1 when `weeklyStars` increases. `SuggestionEntranceWrapper` — staggered fade+translateX entrance (60ms/item, spring 180/14). `DurationModal` — scale 0.92→1 + opacity 0→1 spring on open. All gated on `reduceMotion`. `fontWeight` → `FontFamily.*` throughout.
- Added `// eslint-disable-line react-hooks/exhaustive-deps` on `SuggestionEntranceWrapper` mount-once effect.
- **`android/app/build.gradle`**: `versionCode 31`, `versionName "1.0.30"`. `app.json` synced.

### Key Decisions
- All animations use `useNativeDriver: true` (transform/opacity only — no layout props animated).
- `prevDone.current === null` guard prevents spurious pop on initial render for already-checked tasks.
- `SuggestionEntranceWrapper` effect deps `[]` is intentional — entrance fires once at mount, not on re-render.
- Product register: delight only at right moments. Check circle + hero number are immediate feedback; suggestion chips entrance is purposeful reveal. DurationModal scale-in is dialog entry polish.

### Test Results
- `npx tsc --noEmit` → 0 errors | `npx jest --runInBand` → 109/109 pass | `./gradlew bundleRelease` → BUILD SUCCESSFUL | visual-verify PASS: TodayScreen renders clean, no regressions

## Habit Tracker — Onboarding Hero + Tutorial i18n COMPLETE (2026-06-20)

### What Was Built
- **`src/screens/OnboardingScreen.tsx`**: Full rewrite as 2-step branded flow. Step 0 (Hero): `RankMascot tier={0}` with breathing pulse loop, "Habi" wordmark in brand green, tagline, 3 benefit cards, language flag switcher top-right. Step 1 (Setup): back button, "Về bạn…" heading, gender picker pills, birth year `(tuỳ chọn)`, submit CTA. Slide+fade transition between steps via `fadeAnim`/`slideAnim` (useRef + Animated.parallel).
- **`src/hooks/useTutorial.tsx`**: `STEPS` array replaced by `useMemo<Step[]>(() => [...], [t])` inside `TutorialProvider`. Steps pull from `useTranslations()` — tutorial text switches language live when user changes settings.
- **`src/components/Coachmark.tsx`**: Hardcoded button strings → `t.back`, `t.tutSkip`, `t.tutDone`, `t.tutNext`. `fontWeight: '700'` → `FontFamily.bold` for brand font. `color: '#ffffff'` → `C.white` (theme-aware).
- **`src/config/i18n.ts`**: 28 new keys in vi + en: `onboardHeroTagline`, `onboardHeroBenefit1/2/3`, `onboardHeroCta`, `onboardSetupTitle/Subtitle`, `onboardBirthYearOptional`, `tutNext/Done/Skip`, `tutStep0-5Title/Body`.
- **`android/app/build.gradle`**: `versionCode 31`, `versionName "1.0.30"` (bumped by hook). `app.json` synced.

### Key Decisions
- Language switcher on hero step (not buried in setup form) — user picks language before seeing any content; avoids Vietnamese-first confusion for EN users.
- `pulseAnim` loop started in `useEffect([], [])` (mount only) — mascot breathes throughout both steps without restarting on step change.
- `useMemo([t])` for steps — if user changes language mid-tutorial (unlikely but possible), steps regenerate correctly; `index` stays valid since array length is constant 6.
- OnboardingScreen visual verify: requires sign-out to reach; flagged for manual test on next fresh install.

### Test Results
- `npx tsc --noEmit` → 0 errors | `npx jest --runInBand` → 109/109 pass | `./gradlew bundleRelease` → BUILD SUCCESSFUL
