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

---

## Habit Tracker — ExpoSecureStore Startup Crash Fix COMPLETE (2026-06-02)

### What Was Fixed
- **`src/hooks/useAuth.ts`**: Removed top-level `import * as SecureStore from 'expo-secure-store'`. Replaced with lazy `require('expo-secure-store')` inside each async wrapper (`readGoogleUser`, `writeGoogleUser`, `deleteGoogleUser`). Each has AsyncStorage fallback + `console.warn` if SecureStore unavailable.

### Key Decisions
- Static import caused `requireNativeModule('ExpoSecureStore')` at bundle load time — same crash pattern as `@react-native-google-signin` (Day 15/16). Fix is identical: `require()` inside async fn body.
- `require()` (not `await import()`) used per established codebase pattern — `await import()` creates Metro async chunks; `require()` is cached after first call, lazy, no chunk split.
- AsyncStorage fallback restores pre-Day-21 behavior as degraded-but-working fallback. Real SecureStore failures now surface via `console.warn('[auth] SecureStore unavailable...')`.
- `expo-secure-store` IS in `package.json`. Crash occurs when native build predates package addition — lazy loading is resilient regardless.

| Error | Cause | Fix |
|-------|-------|-----|
| `Cannot find native module 'ExpoSecureStore'` | `import * as SecureStore from 'expo-secure-store'` at module top level → `requireNativeModule` runs synchronously at bundle load before native module registers | Replace static import with lazy `require('expo-secure-store')` inside each async function body; add AsyncStorage fallback in catch |
| `TypeError: Cannot read property 'getItemAsync' of undefined` | `require('expo-secure-store')` returns `undefined` when native module absent (no throw); `undefined.getItemAsync` → TypeError caught as warn | Extract `resolveSecureStore()` helper; null-checks `mod?.default ?? mod` and asserts `typeof store?.getItemAsync === 'function'` before use |

---

## Habit Tracker — ExpoSecureStore Crash Fix v2 COMPLETE (2026-06-03)

### What Was Fixed
- **`src/hooks/useAuth.ts`**: `resolveSecureStore()` now checks `(globalThis as any).ExpoModules?.ExpoSecureStore` before calling `require('expo-secure-store')`. Returns `null` if absent. Callers (`readGoogleUser`, `writeGoogleUser`, `deleteGoogleUser`) handle `null` with AsyncStorage fallback — no throw path.

### Key Decisions
- Prior fix (lazy `require` + try-catch) was insufficient: Metro's `guardedLoadModule` intercepts throws from module factories **before** they propagate to the caller's try-catch. A `require()` inside a try-catch does NOT protect against errors thrown at the module's `<global>` scope.
- Real fix: check `globalThis.ExpoModules.ExpoSecureStore` (the native module registry populated by Expo at startup) **before** calling `require`. If absent, skip require entirely — no module factory runs, no crash.
- `resolveSecureStore` return type changed to `| null` (was throwing). All callers use null-check guard pattern instead of try-catch.
- Removed unused `React` default import (no JSX in file).

| Error | Cause | Fix |
|-------|-------|-----|
| `Cannot find native module 'ExpoSecureStore'` (recurring after lazy-require fix) | Metro `guardedLoadModule` intercepts `requireNativeModule` throw from module factory scope before it reaches caller's try-catch | Check `globalThis.ExpoModules?.ExpoSecureStore` before require; skip require entirely when absent |

---

## Habit Tracker — RankMascot Animated Component COMPLETE (2026-06-03)

### What Was Built
- **`src/config/ranks.config.ts`** (new): Single source of truth for rank system — 7-tier config with per-tier SVG geometry, animation keyframes, colors, haptic patterns. Exports `RANKS`, `rankForStars`, `STAR_POINTS`, all interfaces. Replaces hardcoded maps in RankScreen.
- **`src/components/RankMascot.tsx`** (new): Animated star-sprite component. RN built-in `Animated` (not reanimated). Looping per-tier signature animation via single `p` (0→1) driving all transform channels via `interpolate`. `RankMascotHandle.playRankUp()` triggers haptic + pop scale. Uses `react-native-svg` + `expo-haptics`.
- **`src/screens/RankScreen.tsx`** updated: Hero shows animated `RankMascot` (100px, loop=true) when `currentStars >= 5`. Rank ladder shows mini mascots (36px, loop only for current tier). Colors/descriptors from `RANKS[tier_order-1]`. Hardcoded `RANK_EMOJIS`/`RANK_EN`/`RANK_COLORS` maps removed.

### Key Decisions
- Built-in `Animated` (not reanimated): `react-native-reanimated` absent from deps + requires babel plugin + native rebuild.
- `skewX` channel skipped: not supported with `useNativeDriver: true`. Only Delulu uses it; `rotate` covers the effect.
- Pop + loop in nested Views: outer handles `pop` scale, inner handles loop transforms — avoids multiplying two Animated.Values.
- `chanInterp`/`chanInterpDeg` guard is `< 2` (not `=== 0`): `Animated.interpolate` requires ≥2 input/output points.
- Tier mapping: DB `tier_order` (1-based) → `RANKS[tier_order - 1]` (0-based). `rankConfig()` helper in RankScreen.
- `expo-av` not used: removed (ClassNotFoundException: LazyKType crash on SDK 56). Sound field in Rank config exists for future use.
- `mascotRef.playRankUp()` wired but not yet triggered — hook point for future level-up detection in `useLogTask`.

### Test Results
- `npx tsc --noEmit` → 0 errors | `npx jest` → 98/98 pass

---

## Habit Tracker — Tier 2 Core Interactions COMPLETE (2026-06-03)

### What Was Built (items 5-11 from simulation report)
- **`TodayScreen.tsx` Item 5**: `TaskRow` sub-component with check-off animation — spring `scale 1→0.85` + `translateX 0→40` + `opacity 1→0` (300ms, tension 200) on log success; snaps back instantly to show done state. `prevLogged` ref prevents double-fire.
- **`TodayScreen.tsx` Item 6**: Animated progress bar — `Animated.Value` springs to new `dailyPoints` (tension 100, friction 8, JS driver). White glow overlay flashes (`opacity 0.7→0`, 700ms) when crossing 50% and 100% thresholds.
- **`LogActivitySheet.tsx` Item 7**: `animationType="none"` + custom spring backdrop fade (`opacity 0→1`, 220ms) + sheet `translateY 300→0` spring (tension 120). Animate-out runs before `onClose()` so Modal stays visible during exit.
- **`FundScreen.tsx` Item 8**: `TreatCard` now animates progress bar width (spring, JS driver). Confetti burst (6 colored dots scatter via `translateX/Y + opacity`, 700ms) fires when `treat.unlockable` flips `false→true`.
- **`FundScreen.tsx` Item 9**: Enjoy button press animation — `pressIn: 1→0.92`, `pressOut: 0.92→1.12→1` spring; on tap: white radial burst inside button (`opacity 0.6→0` + `scale 0.3→2.5`, clipped by `overflow: hidden`).
- **`FundScreen.tsx` Item 10**: Enjoyed card dims via `Animated.spring` (`opacity 1→0.45`, `scale 1→0.97`) on `isEnjoyed` transition. `prevEnjoyed` ref prevents mount animation for already-enjoyed items.
- **`RankScreen.tsx` Item 11**: Current tier row gets border glow loop (`opacity 0.15↔0.9`, 900ms each, infinite) + scale pop (`1→1.04→1`, spring) on data load. Both driven by `glowAnims/scaleAnims` ref arrays initialized alongside existing `ladderAnims`.

### Key Decisions
- `TaskRow` extracts row into sub-component — hooks (animation refs + `useEffect`) cannot live inside `.map()` callbacks; extraction enforces rules of hooks.
- LogActivitySheet close animation fires before `onClose()` — keeps Modal `visible=true` during exit so animation renders; `setValue` resets after callback for next open.
- Confetti uses `treat.unlockable` as trigger (not raw `reached_at`) — `DecoratedTreat` type exposes `unlockable` directly; semantically equivalent.
- `enjoyBtn` has `overflow: 'hidden'` — clips the radial burst `scale 2.5` to button bounds, giving contained ripple effect.
- Glow loop cleanup in `useEffect` return — prevents memory leak / stale loop on unmount.
- `barGlowOpacity` uses `useNativeDriver: false` — JS driver required since it drives an overlay that changes `opacity` alongside width (which is also JS-driven).

### Test Results
- `npx tsc --noEmit` → 0 errors | `npx jest --runInBand` → 98/98 pass

---

## Habit Tracker — mascotRef.playRankUp() Wired + Rank Invalidation Fix COMPLETE (2026-06-04)

### What Was Built / Fixed
- **`src/lib/rankMascotBridge.ts`** (new): Module singleton `{ ref: RefObject<RankMascotHandle | null> | null }`. Lets `useLogTask.onSuccess` (query layer, no React context) call `playRankUp()` on the hero mascot mounted in `RankScreen`.
- **`src/queries/useToday.ts`**: `didRankUp` flag hoisted outside `withTransactionAsync` — set `true` when `newUnlocks.length > 0`. Returned in mutation result. `onSuccess` calls `rankMascotBridge.ref?.current?.playRankUp()` when `didRankUp`. Also added missing `qc.invalidateQueries({ queryKey: ['rank'] })` — `useRankData` was never refreshed after task logging, causing RankScreen to show stale star counts indefinitely.
- **`src/screens/RankScreen.tsx`**: `useEffect([], [])` registers `mascotRef` into bridge on mount, clears on unmount.

### Key Decisions
- Bridge stores `RefObject` (not `.current`) — ref object is stable; bridge always reads the live `.current` at call time.
- `useEffect` empty deps with `// mascotRef is stable — empty deps intentional` comment — `useRef` returns stable object, no dep needed.
- `playRankUp()` called on currently-mounted mascot: fires correctly for tier 2+ rank-ups (mascot already visible). For first unlock (0→5★), mascot isn't rendered yet so `.current` is null — optional chaining silently no-ops; animation fires on next rank-up.
- `['rank']` added to `useLogTask.onSuccess` invalidation list — pre-existing gap; required for RankScreen to update live after logging.

### Test Results
- `npx tsc --noEmit` → 0 errors | `npx jest --runInBand` → 98/98 pass

---

## Habit Tracker — Per-Tier Rank-Up Sound Effects COMPLETE (2026-06-04)

### What Was Built
- **`src/assets/sounds/ranks/`** (new): 7 tier-specific MP3s copied from `Docs/rank/rank_sound_up/` — `delulu-up.mp3` through `goated-up.mp3`.
- **`src/logic/rankSound.ts`** (new): `playRankSound(tier)` — static `require()` map (Metro bundling constraint), lazy `require('expo-audio')` in try-catch, `createAudioPlayer(source)` + `player.play()`, cleanup via `player.remove()` after 1.1s.
- **`expo-audio`** added to dependencies via `expo install expo-audio`.
- **`src/components/RankMascot.tsx`**: `playRankUp()` now fires haptic first, then `setTimeout(() => playRankSound(rank.tier), 50)` — 50ms delay compensates for haptic motor latency per spec.

### Key Decisions
- Static `require()` map (not dynamic) — Metro bundler requires literal `require()` at build time for asset bundling; dynamic paths are not resolvable.
- `createAudioPlayer` (not `new AudioPlayer()`) — `AudioPlayer` class not exported from `expo-audio` top-level index; `createAudioPlayer` is the correct imperative API (exported from `ExpoAudio.d.ts`).
- Lazy `require('expo-audio')` inside try-catch — consistent with codebase pattern for native modules (expo-secure-store, google-signin). Non-fatal if native module absent.
- `sfx` field in `ranks.config.ts` uses `'main-character'` but file is `main-char-up.mp3` — static map resolves this at tier index (tier 5 → `main-char-up.mp3`) without renaming either.

### Test Results
- `npx tsc --noEmit` → 0 errors | `npx jest --runInBand` → 98/98 pass

---

## Habit Tracker — UI Sound Effects (P1 + P2) COMPLETE (2026-06-04)

### What Was Built
- **`src/assets/sounds/`**: 5 new MP3s from `Docs/sound/` — `modal-open.mp3`, `modal-close.mp3`, `streak-milestone.mp3`, `treat-claim.mp3`, `error-invalid.mp3`. `chip-confirm.mp3` sourced from `level1.mp3` (placeholder — swap with spec file without code change).
- **`src/audio/audioEnabled.ts`** (new, created by hook): `setAudioEnabled(bool)` / `isAudioEnabled()` — module-level toggle for muting all UI sounds.
- **`src/audio/uiSounds.ts`** (new): Static `require()` map + `playOne(cue)` using `expo-audio`'s `createAudioPlayer` (same pattern as `rankSound.ts`). Exports: `cueChipConfirm`, `cueTreatClaim`, `cueStreakMilestone`, `cueModalOpen`, `cueModalClose`, `cueErrorInvalid`. Haptics bundled per spec timing. Guards `isAudioEnabled()`.
- **`DurationChips.tsx`**: `commit()` → `cueChipConfirm()` after existing Light Impact — sound at t=10ms.
- **`FundScreen.tsx`**: `handleEnjoy` success → `cueTreatClaim()` — Medium Impact t=0, sound t=50ms.
- **`TodayScreen.tsx`**: `showStreakToast()` → `cueStreakMilestone()` only when `[3, 7, 30].includes(newStreak)`.
- **`LogActivitySheet.tsx`**: `useEffect([visible])` → `cueModalOpen()` on open; `handleClose()` → `cueModalClose()` before animation.

### Key Decisions
- `expo-audio` `createAudioPlayer` used (not `expo-av`) — `expo-av` removed Day 19 (`ClassNotFoundException: LazyKType` on SDK 56).
- Haptics bundled inside cue functions (not caller-side), except `cueChipConfirm` which defers to caller's existing Light Impact.
- `[3, 7, 30].includes(newStreak)` guard — toast fires on every increment, sound only on milestone days per spec.
- `chip-confirm.mp3` = `level1.mp3` copy — placeholder; swap without code change.
- `CLEANUP_MS = 1100` — 700ms buffer over longest cue (400ms); consistent with `rankSound.ts`.

### Test Results (after all changes)
- `npx tsc --noEmit` → 0 errors | `npx jest --runInBand` → 98/98 pass

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
