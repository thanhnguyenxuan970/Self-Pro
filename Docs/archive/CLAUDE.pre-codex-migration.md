# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Collaboration Rules

- **When waiting on user action**: If you asked the user to do something manually (e.g. run a command, update a file, check a device, confirm a result), STOP. Do not proceed, do not do next steps, do not speculate. Wait for user to reply before continuing.

## Autonomy

When given a "fix a bug" or "find and ship" goal, proactively locate the bug yourself — do not stop to ask the user what to fix. Complete everything that can be automated. If a step requires user-only action (Firebase Console, Google Cloud key revocation, Play Store upload, GitHub auth, or any browser login/console access), state it once clearly as a numbered checklist and stop — do not loop retrying.

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

- **Habit Tracker** — Gamified habit tracking React Native app. v0.1.0.0 shipped (2026-06-26).

### Key project docs

| File | Purpose |
|------|---------|
| `CHANGELOG.md` | Release notes — what shipped in each version |
| `TODOS.md` | Open and completed work items |
| `PRODUCT.md` | Product register, users, design principles |
| `VERSION` | Current semver (`0.1.0.0`) |
| `habit-tracker/AUDIT.md` | Security/correctness audit findings and status |
| `Docs/habit_tracker_schema.md` | Schema DDL |
| `Docs/habit_tracker_ui_architecture.md` | UI spec |

---

## Dev Process (process.md)

All implementation tasks follow the 6-phase loop defined in `process.md`. Run phases in order — never skip:

| Phase | Action | Skill/file |
|---|---|---|
| 1 — VALIDATE PLAN | Check plan for gaps before touching code | `check_plan` skill → `check_plan.md` |
| 2 — IMPLEMENT | Write code | — |
| 3 — VERIFY CODE | Review-fix-optimize loop until clean | `check_code` skill → `check_code.md` |
| 4 — REVIEW & FIX | Final review with [$ponytail:ponytail-review](C:\\Users\\Admin\\.codex\\plugins\\cache\\ponytail\\ponytail\\4.8.4\\skills\\ponytail-review\\SKILL.md) | Ponytail review skill |
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

**Status:** v0.1.0.0 SHIPPED (2026-06-26). Code lives at `c:\Users\Admin\Desktop\Self-Pro\habit-tracker\`.

**Stack:** React Native + Expo SDK 56 + expo-sqlite (async API) + drizzle-orm (types only, raw SQL for runtime) + TanStack Query v5 + React Navigation v6 bottom tabs + Jest 30 + ts-jest 29 + @react-native-google-signin v13+

**Data model:** append-only `activity_log` as source of truth; derived rollups via `daily_summary` / `weekly_summary`.

**Navigation:** 5 bottom tabs + center FAB — Home (🏠), Calendar (🗓), [+FAB], Analytics (📊), Rank (🏆). ProfileScreen accessed via avatar tap (modal). Auth gate: `googleUser !== null && isOnboarded` → AppStack; else → SignIn → Onboarding. PaywallScreen exists (`src/screens/PaywallScreen.tsx`) but is not yet wired into RootNavigator — tracked as open work. BackfillSheet opens as a bottom-sheet from Calendar day tap (eligible empty days only).

**State:** TanStack Query over local DB; each log mutation invalidates `today`, `week`, `progress`, `calendar` queries.

**Rank system:** 8-tier Gen Z rank ladder. Weekly reset Monday 00:00 user-local. Promotes 1 tier max per week; demotes 1 tier on inactive weeks.

### Key Decisions (condensed)
- `drizzle-orm` types-only; all runtime queries raw expo-sqlite (`db.runAsync`, `db.getAllAsync`, `db.getFirstAsync`). `getDb()` singleton Promise.
- All DB writes in `useLogTask` inside `db.withTransactionAsync`; backfill writes use `db.withExclusiveTransactionAsync` (race-condition guard). `jest.config.js` uses `transform` (not `globals`).
- `streak_count` set on INSERT for normal logs; `recomputeStreakChain` in `useBackfill.ts` issues `UPDATE daily_summary SET streak_count` for all days from the backfilled date to today (the exception to write-once). `victory-native@^36` pinned (v40+ requires Skia).
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

## Metro / Bundle Debugging

Before diagnosing runtime or "Unable to load script" errors, always: (1) `adb reverse tcp:8081 tcp:8081`, (2) clear Metro cache, (3) restart the app, then verify error count is actually 0 before declaring the fix complete. Codified as the `metro-fix` skill (`.claude/skills/metro-fix/SKILL.md`) — invoke it instead of re-deriving these steps.

## Verification (UI Changes)

After any UI change, visually verify on the emulator via screenshot before claiming success. Confirm you are editing the live component (e.g. the FAB opens `AddActivitySheet`, not `LogActivitySheet`) — do not trust file names alone. Use the `verify-ui` skill for the full start-emulator → screenshot → confirm loop.

## Ship Pipeline

Ship flow: `tsc` (0 errors) → `jest` (all passing) → code review → update docs → auto-commit with a descriptive message. Always run the full pipeline before considering a task shipped — see the `ship` skill.

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

---

## Habit Tracker — Rank System Simplification COMPLETE (2026-06-25)

### What Was Changed
- **`src/game/tierUnlocks.ts`**: Removed `reward_amount`/`reward_currency` from `TierRow`, `NewUnlock`, and `computeTierUnlocks` return value.
- **`src/game/tierLookup.ts`**: Removed `reward_amount` from `Tier` type.
- **`src/queries/useRank.ts`**: Removed `reward_amount` from local type + SELECT query.
- **`src/queries/useToday.ts`**: Removed demotion floor logic (`floorTier`, `treat_stars_lifetime` DB query, floor check) from `getCarryOverTierId`. `handleTierUnlocks` INSERT into `reward_unlocks` now passes `reward_amount=0` (field still NOT NULL in schema — cannot drop column in SQLite).
- **`__tests__/tierUnlocks.test.ts`**: Removed `reward_amount`/`reward_currency` from test fixtures.
- **`android/app/build.gradle`**: `versionCode 42 → 43`, `versionName "1.0.41" → "1.0.42"`. `app.json` synced.

### Key Decisions
- `reward_unlocks` INSERT kept (reward_amount=0) — table still gates "max 1 rank-up per week" via `alreadyUnlockedTierIds`. Removing the INSERT broke the 1-tier-per-week cap (caught in check_code). Schema column stays to satisfy NOT NULL constraint.
- Demotion floor removed outright — any inactive week now always demotes 1 tier with no lifetime-stars protection.
- 1-tier-per-week cap was already correct in `computeTierUnlocks` (`alreadyUnlockedTierIds.length > 0 → []`); no logic change needed.

### Test Results
- `npx tsc --noEmit` → 0 errors | `npx jest --runInBand` → 111/111 pass | `.\gradlew.bat bundleRelease` → BUILD SUCCESSFUL (versionCode 43)

---

## Habit Tracker — Backfill Check-in (điểm danh bù) COMPLETE (2026-06-25)

### What Was Built
- **`src/game/backfill.ts`**: Pure function `canBackfill` — 6-layer deny-reason check (FUTURE, TODAY, NOT_CURRENT_WEEK, DAY_NOT_EMPTY, HAS_FREEZE, QUOTA_EXCEEDED). `WEEKLY_BACKFILL_QUOTA = 2`. Returns `{ allowed, denyReason }`.
- **`src/queries/useBackfill.ts`**: `backfillDay()` DB write — inserts into `activity_log` with `is_backfill = 1`, runs `recomputeStreakChain` for all days from backfill date to today (streak reconnect), enforces quota + guards inside `db.withExclusiveTransactionAsync` to prevent double-tap race.
- **`src/queries/useBackfillStatus.ts`**: Reads `backfills_used` count for the current week, feeds into CalendarScreen eligibility map.
- **`src/components/BackfillSheet.tsx`**: Bottom-sheet task picker with duration options; opens from CalendarScreen on eligible empty-day tap.
- **`src/db/migrations.ts`**: v9 migration — `ALTER TABLE activity_log ADD COLUMN is_backfill INTEGER NOT NULL DEFAULT 0` + `CREATE INDEX IF NOT EXISTS idx_activity_backfill`.

### Key Decisions
- `db.withExclusiveTransactionAsync` (not `withTransactionAsync`) chosen for the backfill write path — exclusive lock prevents two concurrent taps from both passing the quota check before either commits.
- `recomputeStreakChain` writes `UPDATE daily_summary SET streak_count` — this is the documented exception to the "streak_count never overwritten" invariant (normal logs still set once on INSERT only).
- Pre-check in `canBackfill` runs before the transaction for UX (show deny reason before modal); all guards are re-verified atomically inside `runBackfillTx`.

### Test Results
- `npx tsc --noEmit` → 0 errors | `npx jest --runInBand` → 111/111 pass | `.\gradlew.bat bundleRelease` → BUILD SUCCESSFUL (versionCode 47)

---

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore
- Author a backlog-ready spec/issue → invoke /spec


# CLAUDE.md

Guidance for Claude Code when working in this repository. Keep this file short and authoritative: rules here should be hard to infer from code or easy to get wrong.

## Conventions

The source of truth for code naming, i18n glossary, and Chinese product voice is:

- `apps/docs/content/docs/developers/conventions.mdx`
- `apps/docs/content/docs/developers/conventions.zh.mdx`

Read it before editing translations in `packages/views/locales/`, naming routes/packages/files/DB columns/types, or writing Chinese UI/docs copy. Do not rely on `packages/views/locales/glossary.md`; it is only a redirect stub.

## Project Shape

Multica is an AI-native task management platform for small teams, with agents as first-class assignees that can own issues, comment, and change status.

- `server/`: Go backend, Chi router, sqlc, gorilla/websocket.
- `apps/web/`: Next.js App Router.
- `apps/desktop/`: Electron desktop app.
- `apps/mobile/`: Expo / React Native iOS app. Read `apps/mobile/CLAUDE.md` before touching it.
- `packages/core/`: headless business logic, API client, React Query hooks, Zustand stores.
- `packages/ui/`: atomic UI components only.
- `packages/views/`: shared business pages/components for web and desktop.
- `packages/tsconfig/`: shared TypeScript config.

Shared packages export raw `.ts` / `.tsx` and are compiled by consuming apps. Dependency direction is `views -> core + ui`; `core` and `ui` must stay independent.

## State Rules

Keep server state and client state separate.

- TanStack Query owns server state: issues, users, workspaces, inbox, agents, members, and anything fetched from the API.
- Zustand owns client state: selected workspace, filters, drafts, modals, tab layout, and navigation history.
- Shared Zustand stores live in `packages/core/`, never in `packages/views/` or app directories.
- React Context is for platform plumbing only, such as `WorkspaceIdProvider` and `NavigationProvider`.
- Only auth/workspace stores may call `api.*` directly. Other server interaction belongs in queries/mutations.
- Workspace-scoped query keys must include `wsId`.
- Mutations should be optimistic by default: patch locally, send request, roll back on failure, invalidate on settle.
- WebSocket events invalidate or patch Query cache; they never write directly to Zustand stores.
- Persist durable preferences/drafts/layout. Do not persist server data or ephemeral UI state.
- Zustand selectors must return stable references. Do not return freshly allocated objects/arrays from selectors without shallow comparison.
- Hooks that need workspace context should accept `wsId`; do not call `useWorkspaceId()` internally unless the hook is guaranteed to run under the provider.

## Package Boundaries

These are hard constraints:

- `packages/core/`: no `react-dom`, `localStorage` (use `StorageAdapter`), `process.env`, or UI libraries.
- `packages/ui/`: no `@multica/core` imports and no business logic.
- `packages/views/`: no `next/*`, no `react-router-dom`, no stores. Use `NavigationAdapter`, `useNavigation()`, and `<AppLink>`.
- `apps/web/platform/`: only place for Next.js navigation/platform APIs.
- `apps/desktop/src/renderer/src/platform/`: only place for `react-router-dom` navigation wiring.
- Every workspace under `apps/` and `packages/` must declare directly imported external packages in its own `package.json`.
- Shared dependencies use `catalog:` from `pnpm-workspace.yaml`; `apps/mobile/` pins Expo/React Native related versions directly.

## Sharing Rules

Web and desktop share business logic, hooks, stores, components, and views through `packages/core/`, `packages/ui/`, and `packages/views/`.

If the same logic exists in both web and desktop, extract it unless it depends on platform APIs:

1. Next.js, Electron, or router APIs stay in the app/platform layer.
2. Headless logic belongs in `packages/core/`.
3. Shared UI or business views belong in `packages/views/`.
4. Shared primitives belong in `packages/ui/`.

Mobile is independent. It may import types and pure functions from `@multica/core`, with `import type` for types, but owns its UI, state, hooks, providers, i18n, React version, build pipeline, and release cadence.

## Commands

Use the repo scripts as the source of truth. Common commands:

```bash
make dev              # auto-setup and start the app
make start            # start backend + frontend
make stop             # stop app processes for this checkout
make server           # run Go server only
make daemon           # run local daemon
make test             # Go tests
make sqlc             # regenerate sqlc code after SQL changes
pnpm install
pnpm dev:web
pnpm dev:desktop
pnpm build
pnpm typecheck
pnpm lint
pnpm test             # TS/Vitest tests through Turborepo
pnpm exec playwright test
pnpm ui:add badge     # shadcn/Base UI component into packages/ui
```

Worktrees share one PostgreSQL container and get isolated DB names/ports via `.env.worktree`. `make dev` auto-detects this. For manual setup use `make worktree-env`, `make setup-worktree`, and `make start-worktree`. `pnpm dev:desktop` additionally self-isolates per worktree (its own renderer port + app name) automatically, independent of `.env.worktree`.

CI runs Node 22, Go 1.26.1, and a `pgvector/pgvector:pg17` PostgreSQL service.

## Coding Rules

- TypeScript strict mode is enabled; keep types explicit.
- Go follows standard conventions: `gofmt`, `go vet`, checked errors.
- Code comments must be English.
- Prefer existing patterns/components over new parallel abstractions.
- Avoid broad refactors unless required by the task.
- For internal, non-boundary code, do not add compatibility layers, fallback paths, dual writes, legacy adapters, or temporary shims unless explicitly requested.
- API boundaries are different: installed desktop clients can talk to newer backends, so response parsing must follow the API compatibility rules below.
- If a flow or API is being replaced and the product is not live, prefer removing the old path instead of preserving both.
- New global pre-workspace routes must be a single word (`/login`, `/inbox`) or `/{noun}/{verb}` (`/workspaces/new`). Do not add hyphenated root routes like `/new-workspace`.
- Reserved slugs live in `server/internal/handler/reserved_slugs.json`. Edit it, run `pnpm generate:reserved-slugs`, and commit the generated `packages/core/paths/reserved-slugs.ts`.
- When changing CLI commands/flags, API fields, or product behavior documented by built-in skills under `server/internal/service/builtin_skills/*`, update the relevant `SKILL.md` and `references/*-source-map.md` in the same PR.

## API Compatibility

Frontend code must survive backend response drift, especially in installed desktop builds.

- Parse API JSON with `parseWithFallback` in `packages/core/api/schema.ts` and a zod schema. Do not cast network JSON to `T`.
- Endpoint responses consumed by UI logic must pass through a schema before returning.
- Downstream UI should optional-chain and default fields defensively.
- Prefer explicit boolean checks (`=== true`) over truthy/falsy checks on server fields.
- Do not pin critical affordances to one backend boolean; combine signals when possible.
- Server-driven enum switches need a `default` branch.
- When adding or changing an endpoint, add/update the schema and include a malformed-response test.

## Backend UUID Rules

In `server/internal/handler/`, always know where a UUID came from before using it in write queries.

- Resource path params that may be UUIDs or human-readable IDs must be resolved through loaders such as `loadIssueForUser`, `loadSkillForUser`, `loadAgentForUser`, or `requireDaemonRuntimeAccess`; subsequent writes use the resolved `entity.ID`.
- Pure UUID inputs from request boundaries use `parseUUIDOrBadRequest(w, s, fieldName)` and return immediately on `ok=false`.
- Trusted UUID round-trips from sqlc results or test fixtures use `parseUUID(s)`, which panics on invalid input.
- Outside handlers, `util.ParseUUID(s) (pgtype.UUID, error)` is the safe variant; always check the error.

## Web/Desktop Features

When adding a shared page or feature for web and desktop:

1. Put the page/component in `packages/views/<domain>/`.
2. Add platform wiring in both `apps/web/app/` and the desktop router, unless the desktop flow is a transition overlay.
3. Use `useNavigation().push()` or `<AppLink>` in shared code.
4. Use shared guards/providers such as `DashboardGuard` from `packages/views/layout/`.
5. Keep platform-only UI in the app or inject it through props/slots.
6. Hooks that need workspace context should accept `wsId`.

CSS for web/desktop is shared from `packages/ui/styles/`. Use semantic tokens such as `bg-background` and `text-muted-foreground`; avoid hardcoded Tailwind colors and duplicated base styles.

## Desktop Rules

Desktop routing has three categories:

- Session routes: workspace-scoped tab destinations such as `/:slug/issues`.
- Transition flows: pre-workspace one-shot actions such as create workspace or accept invite. These are `WindowOverlay` state, not routes.
- Error/stale states: stale workspace tabs should auto-heal by dropping stale tab groups, not render desktop error pages.

More desktop constraints:

- New pre-workspace desktop flows register a `WindowOverlay` type in `stores/window-overlay-store.ts`; do not add them to `routes.tsx`.
- `setCurrentWorkspace(slug, uuid)` from `@multica/core/platform` is the active workspace source of truth.
- Code that leaves workspace context must call `setCurrentWorkspace(null, null)` explicitly.
- Leave/delete workspace flow order: read cached destination, clear current workspace, navigate, then run the mutation.
- Cross-workspace navigation must go through the navigation adapter so it can call `switchWorkspace(slug, targetPath)`.
- Full-window desktop views outside the dashboard shell must mount `<DragStrip />` from `@multica/views/platform` as the first flex child. Interactive controls in the top 48px need `WebkitAppRegion: "no-drag"`.

## Mobile Rules

Read `apps/mobile/CLAUDE.md` before touching `apps/mobile/`. It contains the mandatory pre-flight process, import limits, parity rules, tech stack, UI rules, data helpers, realtime strategy, and mobile release flow.

Root-level reminders:

- Mobile shares only `@multica/core` types and pure functions.
- Mobile must match web/desktop product semantics: counts, permissions, enums/transitions, and data identity.
- Mobile may differ in UI/interaction when the phone context requires it.

## UI Rules

- Prefer shadcn/Base UI components over custom implementations. Add them with `pnpm ui:add <component>` from the repo root.
- Use design tokens and semantic classes; avoid hardcoded colors.
- Do not introduce extra local state unless the design requires it.
- Handle overflow, long text, scrolling, alignment, and spacing deliberately.
- If a component is identical between web and desktop, it belongs in a shared package.

## Testing

Tests follow the code:

| What is tested | Location |
| --- | --- |
| Shared business logic, stores, queries, hooks | `packages/core/*.test.ts` |
| Shared UI components, pages, forms, modals | `packages/views/*.test.tsx` |
| Platform wiring such as cookies, redirects, search params | `apps/web/*.test.tsx` or `apps/desktop/` |
| End-to-end flows | `e2e/*.spec.ts` |
| Backend | `server/` Go tests |

Rules:

- Never test shared component behavior in an app test file.
- `packages/views/` tests must not mock `next/*` or `react-router-dom`.
- Mock `@multica/core` stores with the Zustand callable-store shape (`selectorFn` plus `getState`).
- Mock `@multica/core/api` for API calls.
- E2E tests should use `TestApiClient` for setup/teardown.
- Prefer writing the failing test in the correct package before implementation when the change is behavioral.

## Verification

For code changes, run the narrowest useful checks while iterating, then run broader verification when risk justifies it or when asked.

Useful checks:

```bash
pnpm typecheck
pnpm test
make test
pnpm exec playwright test
make check
```

Do not claim verification passed unless you ran it. If you skip checks because the change is docs-only or the user asked not to run them, say so.

## Commits and Releases

- Commits should be atomic and use conventional prefixes: `feat(scope)`, `fix(scope)`, `refactor(scope)`, `docs`, `test(scope)`, `chore(scope)`.
- A production deployment requires a CLI release tag on `main`: create `v0.x.x`, push it, and let `release.yml` publish binaries and the Homebrew tap.
- Bump patch by default unless the user specifies a version.

## Domain Reminders

- All queries filter by `workspace_id`; membership gates access; `X-Workspace-ID` selects the workspace.
- Issue assignees are polymorphic: `assignee_type` plus `assignee_id` can reference a member or an agent.


Add as a new ## Metro / Bundle Debugging section near your debugging/troubleshooting notes.\n\n## Metro / Bundle Debugging
Before diagnosing runtime or 'Unable to load script' errors, always: (1) run `adb reverse tcp:8081 tcp:8081`, (2) clear the Metro cache, (3) restart the app, then verify errors are actually 0 before declaring the fix complete.
Add under a ## Verification section, or extend your existing ship workflow notes.\n\n## Verification
After any UI change, visually verify on the emulator via screenshot before claiming success. Confirm you are editing the live component (e.g. the FAB opens AddActivitySheet, not LogActivitySheet) — do not trust file names alone.
Add as a ## Autonomy section near the top of CLAUDE.md.\n\n## Autonomy
When given a 'fix a bug' or 'find and ship' goal, proactively locate the bug yourself — do not stop to ask the user what to fix. If a step requires user-only action (Firebase Console, Google Cloud key revocation, Play Store upload, GitHub auth), state it once clearly and stop; do not loop retrying.
Add as a ## Ship Pipeline section referencing your ship skill.\n\n## Ship Pipeline
The ship flow is: tsc (0 errors) -> jest (all passing) -> code review -> update docs -> auto-commit with a descriptive message. Always run the full pipeline before considering a task shipped.
