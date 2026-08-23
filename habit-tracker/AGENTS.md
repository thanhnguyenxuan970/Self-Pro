# Habi Habit Tracker

These instructions apply inside `habit-tracker/` and extend the repository-root `AGENTS.md`.

## Project

Habi is a gamified habit-tracking React Native app. The stack is Expo SDK 56, React Native, TypeScript, expo-sqlite async APIs, raw runtime SQL with drizzle types, TanStack Query v5, React Navigation v6, `@sentry/react-native` for crash reporting, Jest, and ts-jest.

Before changing Expo behavior, consult the exact SDK 56 documentation at `https://docs.expo.dev/versions/v56.0.0/`.

## Commands

Run from `habit-tracker/` unless noted:

```powershell
npx tsc --noEmit
npx jest --runInBand
npx expo start --clear
npx expo run:android
Set-Location android; .\gradlew.bat bundleRelease
```

Use `EXPO_METRO_MAX_WORKERS=1` for release bundling when Node 24 triggers Metro worker crashes. Android native compilation is intentionally constrained by `android.ndk.maxParallelBuildJobs=1`, and Gradle project parallelism stays off in `android/gradle.properties`, because parallel Expo/React Native release builds can corrupt generated native metadata on Windows.

## Architecture

- `activity_log` is append-only and is the source of truth.
- `daily_summary` and `weekly_summary` are derived rollups.
- Runtime database access uses raw expo-sqlite calls: `runAsync`, `getAllAsync`, and `getFirstAsync`.
- `getDb()` returns a singleton Promise.
- Normal log writes use `withTransactionAsync`.
- Backfill writes use `withExclusiveTransactionAsync` to prevent quota races.
- Normal logs set `streak_count` on insert. `recomputeStreakChain` is the documented backfill exception that updates later summary rows.
- TanStack Query owns local asynchronous data. Log mutations invalidate `today`, `week`, `progress`, and `calendar` queries.
- Rank is lifetime, not weekly: `users.lifetime_stars` tracks the current activity-derived total and reverses an unchecked activity; `current_tier_id` is the high-water rank and never demotes. `weekly_summary.weekly_stars` remains a derived chart/share-card rollup; its legacy tier-carry columns and `reward_unlocks` table are retained for existing local databases but no runtime rank logic writes or reads them.

## Navigation And Auth

- Main tabs: Home, Calendar, center add FAB, Analytics, Rank.
- The center FAB opens `AddActivitySheet`; verify live routing instead of trusting component names.
- `ProfileScreen` opens from the avatar.
- Auth gate: `googleUser !== null && isOnboarded` enters the app; otherwise show sign-in/onboarding.
- Google user data lives in expo-secure-store under `habit_tracker_google_user`.
- `parseGoogleUser` must validate email, name, and photo.
- Keep Google Sign-In imports inside runtime `require(...)` calls. Static imports and async Metro chunks have caused native-module failures.
- Android Google Sign-In reads its client configuration from `google-services.json`; do not add `androidClientId` to `GoogleSignin.configure()`.

## UI Rules

- Follow `PRODUCT.md` and `Docs/habit_tracker_ui_architecture.md`.
- Use theme colors and `FontFamily` tokens; avoid hardcoded visual values when a semantic token exists.
- Use Be Vietnam Pro font tokens so Vietnamese glyph metrics remain consistent.
- Keep text inside constrained layouts with `numberOfLines`, bounded inputs, or responsive layout as appropriate.
- Maintain at least 44-point touch targets through visible size, padding, or non-overlapping hit slop.
- Respect reduced-motion settings for looping, entrance, and celebratory animation.
- Use established `TouchableOpacity` conventions unless another interaction primitive is required.
- After every UI change, use the `emulator` skill and inspect a screenshot of the actual screen.

## Metro And Emulator

For runtime, Metro, or “Unable to load script” failures, invoke `metro-fix` before deeper diagnosis. The required baseline is:

1. `adb reverse tcp:8081 tcp:8081`
2. Clear Metro cache and restart the bundler.
3. Restart the app.
4. Verify the relevant error count is zero.

Use the `emulator` skill before any adb tap or swipe so coordinates are computed from the current screenshot.

## Database And Security

- Parameterize values in SQL; never interpolate user input.
- Keep multi-step invariants inside one transaction.
- Treat `google-services.json`, `.env*`, keystores, certificates, OAuth IDs, and API keys as sensitive.
- Supabase auth is configured with `persistSession: false` and `autoRefreshToken: false`; do not re-enable startup refresh without addressing offline DNS behavior.
- `ALTER TABLE ADD COLUMN` migrations require try/catch because SQLite lacks `IF NOT EXISTS` for this operation.

## Crash Reporting

- `App.tsx` guards `Sentry.init` behind `EXPO_PUBLIC_SENTRY_DSN`; unset, it is a hard no-op (no account/project exists yet — see TODOS.md). Init failures are caught so a monitoring feature can never crash the thing it monitors.
- `beforeSend` strips `event.user.email`/`google_sub`; `beforeBreadcrumb` strips query strings off request URLs (Supabase REST calls filter by email in the query string). Preserve both scrubs if you touch this block.

## Tests And Shipping

- Add focused tests for changed logic and broaden coverage for shared contracts or cross-module flows.
- The normal ship gate is TypeScript, Jest, code review, relevant Android/UI verification, documentation updates, then commit.
- Do not bump Android/app versions for ordinary local changes unless the task is explicitly a release or the repository workflow requires a version bump.
- Do not claim a release build passed unless `bundleRelease` completed successfully.

## Known Errors & Fixes

| Error | Cause | Fix |
|-------|-------|-----|
| `No implementation class specified for plugin 'com.facebook.react.rootproject'` | Corrupted `@react-native/gradle-plugin` JAR or Gradle transform cache left the plugin descriptor full of NUL bytes | Rebuild `node_modules/@react-native/gradle-plugin` with `gradlew :react-native-gradle-plugin:jar --rerun-tasks`, stop Gradle, then clear the affected transform cache and rerun the build |
| `MalformedJsonException` during `:expo-modules-core:configureCMakeRelWithDebInfo[arm64-v8a]` or duplicate-class failure in `:expo:bundleLibRuntimeToDirRelease` | Corrupted generated native/build output under `node_modules/expo-modules-core/android/.cxx` or `node_modules/expo/android/build` after interrupted Windows release builds | Delete the affected generated module build directories, keep `org.gradle.parallel=false`, and rerun `bundleRelease` |
| Expo notification request replay fails TypeScript input checks | `getAllScheduledNotificationsAsync()` returns output content/trigger types broader than `scheduleNotificationAsync()` input types | Rebuild the fallback request from the supported input fields and narrow date triggers before rescheduling |
| `42710: constraint "leaderboard_snapshots_user_email_fkey" already exists` | Migration 046 re-added a fixed-name FK without handling an FK already created by migration 045 | Match and drop the fixed-name or legacy email FK before recreating it with both cascade actions |
| `28P01: password authentication failed for user "cli_login_postgres"` | A Supabase CLI/direct database login used a rejected credential | Re-authenticate or refresh the CLI/database credential; this is not repaired in app SQL or client code |
| `duplicate key value violates unique constraint "users_email_partial_key"` | Concurrent Google ID-token sign-ins attempted to provision the same Supabase Auth email | Share one in-flight token exchange, retry one transient insert race, and surface non-race auth failures before publishing local auth state |
| `42703: column "action" does not exist` / `42883: function jsonb_object_keys(json) does not exist` | Auth-audit SQL assumed a direct `action` column and a JSONB payload, but the live `auth.audit_log_entries` schema exposes `payload` as `json` | Cast `payload::jsonb` for key enumeration and read `action`/`provider` from `payload`; this is diagnostic-only and needs no app migration |
| `ReactHost ... Tried to access onWindowFocusChange while context is not ready` | Android cold start delivers a window-focus callback before the bridgeless JS context is initialized | Wait for the bundle to initialize; treat it as non-fatal only when no `FATAL EXCEPTION`, `ReactNativeJS` error, redbox, or bundle-load failure follows |

## Shared References

- Product intent: `../PRODUCT.md`
- Open work: `../TODOS.md`
- Release history: `../CHANGELOG.md`
- Schema: `../Docs/habit_tracker_schema.md`
- UI architecture: `../Docs/habit_tracker_ui_architecture.md`
- Security/correctness findings: `AUDIT.md`
