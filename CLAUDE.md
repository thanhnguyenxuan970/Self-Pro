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
| `clang frontend command failed due to signal` during C++ Fabric codegen compile | NDK 27 / Clang 18 on Windows OOMs when compiling `Props_split_*.cpp` in parallel (C++20 + `-O2`) | `android.ndk.maxParallelBuildJobs=1` in `gradle.properties`; retry `bundleRelease` up to ~15× — each run caches more `.o` files until all compile |
| `ld.lld: error: duplicate symbol: facebook::react::RNS*Props` during link | Codegen emits both `Props.cpp` (monolithic 81KB) AND `Props_split_1-8.cpp`; `file(GLOB *.cpp)` in `react-native-screens` CMakeLists picks up all 9 → same symbols defined twice | In `node_modules/react-native-screens/android/src/main/jni/CMakeLists.txt`, add after the codegen glob: `file(GLOB LIB_CODEGEN_PROPS_SPLIT ... Props_split*.cpp)` / `if(LIB_CODEGEN_PROPS_SPLIT)` / `list(FILTER LIB_CODEGEN_SRCS EXCLUDE REGEX "Props\\.cpp$")` / `endif()` — then clean `.cxx` and rebuild |

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

## Habit Tracker — Be Vietnam Pro Typography (replaces Poppins) COMPLETE (2026-06-23)

### What Was Built
- **Root cause**: Poppins has no Vietnamese glyphs in any weight — cmap ends at U+017E (Latin Extended-A); misses ơ (U+01A1), ư (U+01B0), and all precomposed diacritics in U+1E00–U+1EFF. Every Vietnamese char fell back to Roboto → mixed metrics → "random bolding."
- **`App.tsx`**: Replaced `@expo-google-fonts/poppins` → `@expo-google-fonts/be-vietnam-pro` imports + `useFonts` call. Removed poppins from `package.json` + uninstalled.
- **`src/config/theme.ts`**: `FontFamily.*` constants → `BeVietnamPro_400Regular / 500Medium / 600SemiBold / 700Bold / 800ExtraBold`. All 18 screens/components auto-pick up via token.
- **`src/components/Wordmark.tsx`**: SVG hardcoded `fontFamily` → `"BeVietnamPro_500Medium"`.
- **`android/app/build.gradle`**: `versionCode 39 → 40`, `versionName "1.0.38" → "1.0.39"`. `app.json` synced.

### Key Decisions
- Be Vietnam Pro chosen over Poppins: geometrically identical, explicitly Vietnamese-designed (`vietnamese` subset in metadata), same weight range (100–900), same expo-google-fonts package pattern.
- Wordmark SVG `fontFamily` must match expo-font registered name exactly (`BeVietnamPro_500Medium`) — not CSS syntax.
- Visual verify Android-only (glyph coverage is native TTF concern; web/browser uses different fallback chain).

### Test Results
- `npx tsc --noEmit` → 0 errors | `npx jest --runInBand` → 109/109 pass | `.\gradlew.bat bundleRelease` → BUILD SUCCESSFUL (versionCode 40)

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

---

## Habit Tracker — Typography + Component Vocabulary Polish COMPLETE (2026-06-20)

### What Was Fixed
- **`src/config/theme.ts`**: `sectionLabel` token: `fontSize 11 → 12`, `fontFamily bold → semiBold`, removed `textTransform: 'uppercase'` and `letterSpacing: 0.8`. Labels now sentence-case at 12sp semiBold.
- **`src/screens/TodayScreen.tsx`**: `sectionLabel` style: same strip (uppercase/letterSpacing), `11bold → 12semiBold`.
- **`src/screens/AddActivitySheet.tsx`**: `suggestionsLabel`: same strip.
- **`src/screens/ProgressScreen.tsx`**: `sectionLabel`: same strip + color `C.primary → C.ink2` (labels should not use brand color).
- **`src/screens/RankScreen.tsx`**: `resetChipLabel` + `sectionLabel`: same strip.
- **`src/components/RankInfoSheet.tsx`**: `Pressable → TouchableOpacity` (import + 2 JSX sites).
- **`src/components/SubActivitySheet.tsx`**: `Pressable → TouchableOpacity` (import + 5 JSX sites).
- **`src/components/SuggestActivitySheet.tsx`**: `Pressable → TouchableOpacity` (import + 2 JSX sites).
- **`android/app/build.gradle`**: `versionCode 31 → 32`, `versionName "1.0.30" → "1.0.31"`. `app.json` synced.

### Key Decisions
- `textTransform: 'uppercase'` + `letterSpacing` removed from all sectionLabel sites — eyebrow pattern clichéd, fails accessibility at 11pt. 12sp semiBold sentence-case passes contrast without the kicker.
- `C.primary` on ProgressScreen sectionLabel was wrong — section labels use `C.ink2`; brand color reserved for interactive elements.
- `TouchableOpacity` is established convention (14+ files). `Pressable` in 3 new component files was inconsistency, not deliberate. Standardized.

### Test Results
- `npx tsc --noEmit` → 0 errors | `npx jest --runInBand` → 109/109 pass | `./gradlew bundleRelease` → BUILD SUCCESSFUL (versionCode 32)

---

## Habit Tracker — Accessibility + Typeset + Onboard Polish COMPLETE (2026-06-20)

### What Was Done
- **`src/config/i18n.ts` (vi + en)**: 13 uppercase section-label strings → sentence case (`sectionAppearance`, `sectionSound`, `sectionLanguage`, `sectionNotifications`, `sectionAccount`, `topHabits`, `activityLogSection`, `addActivitySuggestionsTitle`, `poolLabel`, `goalsSection`, `enjoyedSection`, `fundHistorySection`, `sectionFeedback`). `Typography.sectionLabel` already has no `textTransform` — strings were the last source of all-caps.
- **`src/screens/ProgressScreen.tsx`**: `statL` color `C.muted → C.ink2` — stat sub-labels pass 4.5:1 contrast at 11sp.
- **`src/screens/TodayScreen.tsx`**: Empty state CTA text wrapped in `primarySoft` pill chip with `primary` text + `semiBold` — stronger visual affordance toward FAB. `FabArrow` bounce loop now gated on `reduceMotion` prop.
- **`src/components/CalendarIcons.tsx`**: Dead `View` import + `const _view = View` alias removed (leftover from loop→entrance animation refactor in prior session).
- **Verified already done**: skeleton loading (TodayScreen + RankScreen), a11y labels on avatar/gear/dismiss/prev+next month/rankInfo, CalendarIcons entrance-only spring, OnboardingScreen + LevelUpCelebrationModal reduceMotion wired.

### Key Decisions
- Sentence-case strings + no `textTransform` in token = labels render correctly everywhere without per-screen fixes.
- Empty state pill CTA doesn't navigate (FAB is outside TodayScreen's component hierarchy); chip + bouncing arrow is the correct affordance.
- `reduceMotion` gating on FabArrow is consistent with all other looping animations in the app.

### Test Results
- `npx tsc --noEmit` → 0 errors | `./gradlew bundleRelease` → BUILD SUCCESSFUL (versionCode 31, UP-TO-DATE)

---

## Habit Tracker — Impeccable Audit Fixes (a11y + font tokens) COMPLETE (2026-06-20)

### Audit Score: 19/20 (Excellent)

### What Was Fixed
- **`src/components/Coachmark.tsx`**: Added `accessibilityRole="button"` + `accessibilityLabel` to all 3 tutorial navigation buttons (back, skip, next/done). Added `fontFamily: FontFamily.regular` to `body` style and `fontFamily: FontFamily.medium` to `skip` style — both were falling back to Roboto instead of Poppins.
- **`src/components/RankInfoSheet.tsx`**: `youtagText` `fontSize: 9.5 → 11` — 9.5sp unreadable on low-density Android displays; below platform minimum recommendation.
- **`src/components/LevelUpCelebrationModal.tsx`**: Added `accessibilityRole="button"` + `accessibilityLabel={t.levelUpDismiss}` to dismiss button (WCAG 4.1.2 Name, Role, Value).
- **`android/app/build.gradle`**: `versionCode 32 → 33`, `versionName "1.0.31" → "1.0.32"`. `app.json` synced.

### Key Decisions
- Coachmark body/skip styles used no `fontFamily` — RN requires explicit `fontFamily` on every Text element when using custom fonts; no inheritance from parent unlike CSS.
- `youtagText` raised to 11sp (not 12sp) — the tag is a decorative chip ("You"), not body text. 11sp is readable and consistent with `lnumText` (also 11sp) in the same sheet.
- `accessibilityLabel` on tutorial Next/Done button set to the same string as button text (`t.tutNext` / `t.tutDone`) — screen reader announces "Tiếp →" as label, which is already descriptive.

### Test Results
- `npx tsc --noEmit` → 0 errors | `npx jest --runInBand` → 109/109 pass | `./gradlew bundleRelease` → BUILD SUCCESSFUL (versionCode 33)

---

## Habit Tracker — Rank A11y + Animation Easing Audit COMPLETE (2026-06-20)

### Audit Score: 14/20 → all findings fixed

### What Was Fixed
- **`src/components/RankMascot.tsx`**: Outer `Animated.View` gains `accessible + accessibilityRole="image" + accessibilityLabel={rank.name}` — screen readers now announce rank tier name. `playRankUp` easing: `Easing.back(2)` (bounce/overshoot, banned) → `Easing.out(Easing.cubic)` pop + `Easing.out(Easing.quad)` settle.
- **`src/components/RankInfoSheet.tsx`**: Close button `accessibilityRole="button" + accessibilityLabel="Đóng"` (WCAG 4.1.2). `ptSub` `C.muted → C.ink2` (contrast). Backdrop `rgba(8,16,11,0.45) → rgba(0,0,0,0.5)` (reliable scrim in both themes).
- **`src/screens/RankScreen.tsx`**: ❓ emoji `accessibilityLabel={t.noRankTitle}` (WCAG 1.1.1). `rankheroGlow importantForAccessibility="no"` (decorative). `rkB` `C.muted → C.ink2` (contrast).

### Key Decisions
- `Easing.back(2)` creates overshoot past target scale — feels bouncy, violates product register "no bounce" rule. `Easing.out(Easing.cubic)` achieves same energetic pop-in without overshoot.
- Backdrop from `rgba(8,16,11,0.45)` (tinted dark green) → `rgba(0,0,0,0.5)` — pure black at 50% gives consistent scrim regardless of theme; tinted near-black is arbitrary theming in a component that has no access to theme tokens.
- `C.muted` at 11.5sp fails 4.5:1 WCAG AA; `C.ink2` (already standard for sub-labels) passes without changing font size.

### Test Results
- `npx tsc --noEmit` → 0 errors | `./gradlew bundleRelease` → BUILD SUCCESSFUL

---

## Habit Tracker — i18n Fix + Exercise Cleanup + Habi Rebrand COMPLETE (2026-06-21)

### What Was Fixed / Built
- **`src/config/i18n.ts`**: Added 5 missing `tmpl*` keys to both `vi` and `en` — `tmplWork` ('Công việc'/'Work'), `tmplStudy` ('Học tập'/'Study'), `tmplFamily` ('Gia đình'/'Family'), `tmplRelationship` ('Quan hệ'/'Relationship'), `tmplSports` ('Thể thao'/'Sports'). These match the English-canonical names seeded by v5 migration. `TEMPLATE_NAME_TO_KEY` now maps stored English names to Vietnamese display via `resolveTaskDisplayName`.
- **`src/db/migrations.ts`**: Added v8 migration — `DELETE FROM task_types WHERE name = 'Exercise'`. Removes legacy Exercise entries seeded in pre-v5 builds. Idempotent (no-op if already absent).
- **`supabase/functions/feedback-email/index.ts`**: `'Habit Ring'` → `'Habi'` in `from` sender name and email `subject` line.
- **`android/app/build.gradle`**: `versionCode 34 → 35`, `versionName "1.0.33" → "1.0.34"`. `app.json` synced.

### Key Decisions
- Root cause of English task names on Home/Analytics: v5 migration seeds 'Work'/'Study'/'Family'/'Relationship'/'Sports' in English, but those strings had no `tmpl*` key → `TEMPLATE_NAME_TO_KEY.get()` returned undefined → `resolveTaskDisplayName` fell back to stored name. Fix: add tmpl keys so English stored names resolve to current UI language. No DB migration needed.
- `tmplStudy` ('Học tập') distinct from existing `tmplStudying` ('Ôn bài') — correctly models "general study" vs "exam review".
- `tmplGym` intentionally kept as 'Gym'/'Gym' (exception per user requirement).
- 'Habit Ring' only appeared in Supabase Edge Function email headers — 2 occurrences, no UI impact.

### Test Results (initial)
- `npx tsc --noEmit` → 0 errors | `npx jest --runInBand` → 109/109 pass | `./gradlew bundleRelease` → BUILD SUCCESSFUL (versionCode 35)

### Follow-up: 'MAX' hardcoded string fix
- **`src/screens/ProgressScreen.tsx`** L309: `'MAX'` → `t.rankMaxed`. Shown in "Đến hạng kế" stat cell when user is at max rank.
- **`src/config/i18n.ts`**: Added `rankMaxed` → vi: 'Tối đa', en: 'MAX'.
- After fix: `npx tsc --noEmit` → 0 errors | `npx jest --runInBand` → 109/109 pass | `./gradlew bundleRelease` → BUILD SUCCESSFUL

---

## Habit Tracker — Tutorial A11y Audit Fixes COMPLETE (2026-06-21)

### Audit Score: 16/20 → all findings fixed

### What Was Fixed
- **`src/components/Coachmark.tsx`**: Full audit pass — 6 findings resolved:
  - Body text `C.muted → C.ink2`: light-mode contrast 4.16:1 → 8.53:1 (WCAG AA pass)
  - Skip/back text `C.faint → C.ink2`: light-mode 2.22:1 → 8.53:1, dark-mode 2.80:1 → 8.25:1 (both pass)
  - Arrow glyphs stripped from `accessibilityLabel` via `.replace(/^[←→]\s*/, '')` / `.replace(/\s*[←→]$/, '')` — screen readers no longer announce "left-pointing arrow Quay lại"
  - SVG overlay `rgba(8,16,11,0.76)` → `rgba(0,0,0,0.76)` — neutral scrim (consistent with RankInfoSheet fix from prior session)
  - `animationType="fade"` → `animationType={reduceMotion ? 'none' : 'fade'}` — respects system reduceMotion (consistent with all other animations in app)
  - `TIP_H = 160` hardcoded in position calc → `measuredTipH` state via `onLayout` — correct positioning at large font scales
  - `accessibilityLiveRegion="polite"` on tip View — step changes announced to screen reader
  - Progress dots container `accessible + accessibilityLabel="\${index+1} / \${total}"` — step position readable by screen reader
  - Imported `useReduceMotion`, `useState`, `LayoutChangeEvent`
- **`android/app/build.gradle`**: `versionCode 36 → 37`, `versionName "1.0.35" → "1.0.36"`. `app.json` synced.

### Key Decisions
- `C.ink2` chosen over `C.muted` for body AND skip/back text — `C.muted` at 13sp still fails 4.5:1 in light mode (4.16:1). `C.ink2` clears with 8.5:1 headroom while remaining visually secondary to `C.inkDark` title.
- `measuredTipH` initialized to `TIP_H=160` (estimate), updated via `onLayout` — tip positions correctly on re-render; brief flicker only occurs when actual height diverges (large font scale), acceptable tradeoff.
- Arrow glyph stripping done inline on `accessibilityLabel` prop (not in i18n) — visual button text keeps arrows as intended affordance; only a11y label is sanitized.
- `rgba(0,0,0,0.76)` overlay: tinted dark-green was inherited from early dark-mode palette work, not intentional coachmark design. Neutral black is correct for a blocking overlay in both themes.

### Test Results
- `npx tsc --noEmit` → 0 errors | `npx jest --runInBand` → 109/109 pass | `./gradlew bundleRelease` → BUILD SUCCESSFUL (versionCode 37)

---

## Habit Tracker — RankInfoSheet Contrast Audit Fixes COMPLETE (2026-06-21)

### Audit Score: 15/20 → non-PaywallScreen P2 findings fixed

### What Was Fixed
- **`src/components/RankInfoSheet.tsx`**: 4 fixes from `/impeccable audit all` P2 findings:
  - `ptSub` added `fontFamily: FontFamily.regular` — no fontFamily = Roboto fallback despite Poppins being loaded.
  - `lnumText` `C.muted → C.ink2` — 11sp on `C.surface3` (#ECEEEC) was ~4.08:1, below WCAG AA 4.5:1.
  - `lstar` `C.muted → C.ink2` — 12.5sp muted ~4.38:1 fails 4.5:1 threshold.
  - `close` `C.faint → C.muted` — 17sp bold at 2.34:1 failed even WCAG 3:1 large-text minimum; C.muted gives ~4.38:1.
- **`android/app/build.gradle`**: `versionCode 38 → 39`, `versionName "1.0.37" → "1.0.38"`. `app.json` synced.

### Key Decisions
- `C.muted` (not `C.ink2`) for `close` button — keeps ✕ visually secondary to title while clearing contrast threshold; `C.ink2` would over-emphasise a dismiss affordance.
- RankInfoSheet is a native Modal — Playwright/Expo web visual-verify skipped; contrast changes verified via calculation and TSC clean build.
- PaywallScreen audit findings (P1s) intentionally deferred — separate `/impeccable harden PaywallScreen` task.

### Test Results
- `npx tsc --noEmit` → 0 errors | `./gradlew bundleRelease` → BUILD SUCCESSFUL (versionCode 39)
- **PRODUCT.md created** — required by `/impeccable` skill; unblocks all future audit/craft/polish commands.

---

## Habit Tracker — 7-Feature Sprint COMPLETE (2026-06-21)

### What Was Built / Fixed
- **Rank Season Reset**: `useToday.ts` `weekly_summary` INSERT sets `current_tier_id = (SELECT id FROM tiers WHERE tier_order = 1 LIMIT 1)`. ON CONFLICT excludes `current_tier_id` — preserves earned rank; new weeks start at Delulu.
- **Double-tap undo (>1h timed)**: `TodayScreen.handleLog` — `is_time_based && totalDurations >= 60` → calls `unlogTask` instead of DurationModal.
- **Edit button**: `TaskRow` `onEdit?: () => void` + ✏️ (rightCol, fontSize 14). `EditActivityModal` (new) — name + duration inputs, fade modal. `useUpdateTaskName` in `useTasks.ts` invalidates `today`, `week`, `progress`, `calendar`.
- **Auto-translate custom activities**: `AddActivitySheet` calls `supabase.functions.invoke('translate-name')`. `supabase/functions/translate-name/index.ts` — Deno Edge Function → Claude Haiku (`claude-haiku-4-5-20251001`). `setTranslating` in `try/finally`.
- **Honey accent**: `accents.ts` `AccentKey` + `honey` palette (swatch `#F59E0B`). Auto-renders in `AccentPicker` via `Object.keys(ACCENTS)`.
- **Sign-in permanent green**: `const GREEN = ACCENTS.green.light` in `SignInScreen`. Title + ActivityIndicator use `GREEN.primary` regardless of accent setting.
- **Habi rebrand**: `SignInScreen` title → `'Habi'`.

### Key Decisions
- ON CONFLICT in `weekly_summary` INSERT deliberately omits `current_tier_id` — existing rows keep earned rank; only fresh-week rows get Delulu default.
- `translate-name` Edge Function deploy: `supabase functions deploy translate-name --no-verify-jwt`. Requires `ANTHROPIC_API_KEY` secret in Supabase Dashboard.
- `bundleRelease` must use `.\gradlew.bat` (PowerShell) not `./gradlew` (bash) — bash on Windows picks VS Code JRE (no jlink) despite `org.gradle.java.home` in gradle.properties.

### Test Results
- `npx tsc --noEmit` → 0 errors | `npx jest --runInBand` → 109/109 pass | `.\gradlew.bat bundleRelease` → BUILD SUCCESSFUL (versionCode 39)

### Action Required
- Deploy Edge Function: `supabase functions deploy translate-name --no-verify-jwt`
- Add `ANTHROPIC_API_KEY` in Supabase Dashboard → Edge Functions → Secrets
