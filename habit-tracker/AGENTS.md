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
- Native Google error diagnostics are opt-in and may expose only a short validated error code; never surface arbitrary native error text.

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
- Supabase auth is configured with `persistSession: false` and `autoRefreshToken: false`; do not re-enable startup refresh without addressing offline DNS behavior. Keep Google token exchange and protected RPCs behind the shared session lease, validate access-token expiry plus email/Google subject ownership, and release canceled native-auth work before starting another account operation.
- A populated account may advance a stale backup CAS revision only when its cutoff-filtered local payload matches the cloud payload; divergent snapshots remain restore-blocked rather than overwriting either side.
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
| `Unrecognized flag: --query in command supabase db query` | Supabase CLI v2.107 accepts SQL as a positional argument rather than a `--query` flag | Use `supabase db query --linked --output json "SELECT ..."`; check `supabase db query --help` before scripting |
| `duplicate key value violates unique constraint "users_email_partial_key"` or HTTP `500` from `/auth/v1/token` | Concurrent Google ID-token sign-ins, redundant fresh-session exchange, or a transient GoTrue auth exchange failure | Reuse a verified fresh same-account session, share one in-flight exchange only for the same token/subject, serialize session-changing work with protected RPCs, retry one bounded auth 5xx/insert race, evict canceled startup gates, clean up only an exchange-owned session token, seed local user/categories atomically, and surface non-race auth failures before publishing local auth state |
| `Account recovery is paused to protect your data` repeats after Retry | A transient restore failure can leave both the account-scoped marker and the in-memory Supabase session stale; clearing the marker before the restore owns the account gate also allowed a queued upload race | Explicit Retry force-refreshes the Google-backed session inside the protected restore; clear only the current account's marker while holding its gate, re-mark on failure or cancellation before release, and re-check it in queued uploads |
| `Backup revision conflict: expected 15, current 25` | A local CAS revision is stale relative to a newer cloud snapshot, often after another session/device writes first; comparing a cutoff-filtered local snapshot with an older raw cloud snapshot can also create a false divergence | Keep the account behind the restore/reconciliation gate; compare the same account-cutoff-filtered view on both snapshots, use indexed bounded local presence probes, preserve retained pre-boundary audit rows, and never clear SQLite or overwrite the cloud snapshot to force a match |
| `42501: permission denied for function account_write_allowed` / `403 POST /rest/v1/activity_log` | RLS write policies invoked the account fence as `authenticated`, but migrations revoked its `EXECUTE` privilege from that role | Apply migration 066: keep `PUBLIC`/`anon` denied and grant `EXECUTE` on `public.account_write_allowed()` to `authenticated`; verify with `has_function_privilege` and an authenticated activity upsert |
| `42501: permission denied for function analytics_year_date` / `403 POST /rest/v1/activity_log` | Migration 069 revoked the expression-index helper from `authenticated`, so activity-log index maintenance failed under the request role | Apply migration 070: keep direct `PUBLIC`/`anon` execution denied and grant `EXECUTE` only to `authenticated`; verify the privilege, index, and authenticated activity upsert |
| `42703: column "action" does not exist` / `42883: function jsonb_object_keys(json) does not exist` | Auth-audit SQL assumed a direct `action` column and a JSONB payload, but the live `auth.audit_log_entries` schema exposes `payload` as `json` | Cast `payload::jsonb` for key enumeration and read `action`/`provider` from `payload`; this is diagnostic-only and needs no app migration |
| `42703: column "policydef"`, `"row_security"`, `"signature"`, or `i.indexrelname` does not exist` | PostgreSQL catalog/view columns were inferred from another tool or version | Use the read-only queries in `../Docs/supabase_diagnostics.sql`: `pg_policies.qual`/`with_check`, `pg_class.relrowsecurity`, derived function identity arguments, `pg_indexes.indexname`, or `pg_stat_user_indexes.indexrelname` |
| `42809: "array_agg" is an aggregate function` | `pg_get_functiondef` was called for an aggregate routine | Filter `pg_proc.prokind = 'f'` for function definitions; inspect aggregates separately with `prokind = 'a'` |
| `08006: could not receive data from client: Connection reset by peer` | The database client or network connection closed unexpectedly | Re-run the read-only query from a healthy authenticated connection; do not treat it as an app data-write failure |
| `ReactHost ... Tried to access onWindowFocusChange while context is not ready` | Android cold start delivers a window-focus callback before the bridgeless JS context is initialized | Wait for the bundle to initialize; treat it as non-fatal only when no `FATAL EXCEPTION`, `ReactNativeJS` error, redbox, or bundle-load failure follows |
| `INSTALL_FAILED_UPDATE_INCOMPATIBLE` for `com.habitring.app` | The installed debug APK and the release APK have different signing certificates | Keep the debug install for data-preserving QA, or use a matching release-signed install; do not uninstall or clear app data unless reset is explicitly authorized |

## Shared References

- Product intent: `../PRODUCT.md`
- Open work: `../TODOS.md`
- Release history: `../CHANGELOG.md`
- Schema: `../Docs/habit_tracker_schema.md`
- UI architecture: `../Docs/habit_tracker_ui_architecture.md`
- Security/correctness findings: `AUDIT.md`
