# Local QA sandbox

The QA sandbox is an emulator/debug-build fixture account for testing Habi screens, layouts, accessibility, and error/edge states without creating or changing a real account.

## Contract

- Available only when `__DEV__` is true. The release build hides the entry point and rejects the reserved identity.
- The sign-in screen shows **Open local QA sandbox** in a debug build.
- The identity is reserved as `qa-sandbox-local-v1` / `qa-sandbox@local.habi`; it is never sent to Google or Supabase.
- Supabase transport is blocked while the sandbox is active. Friends, News, and feedback network queries remain disabled. Rank uses a deterministic in-memory board with 20 fake rivals plus the local QA row, so QA can inspect the leaderboard UI without reading or writing the live leaderboard.
- The fake leaderboard is generated from the sandbox's current local star total and is never inserted into SQLite, sent to Supabase, or visible to real users.
- Fixtures are stored temporarily in the emulator's local SQLite database so the normal screens can render them. The app purges and reseeds the reserved rows on every restart; QA sign-out and delete-account also purge them.
- The fixture includes long history, current-day activity, gaps, GOOD/BAD activity, daily bonuses, challenges in active/done/failed states, rewards, treats, achievements, fund history, streak freezes, and a boost.

## Validation

From `habit-tracker`:

```powershell
npx.cmd tsc --noEmit
npx.cmd jest --runInBand
git diff --check
```

For emulator validation, preserve the existing app data and install the compatible debug APK with `adb install -r`. Do not uninstall or clear app data. Capture a fresh screenshot and UI hierarchy before using coordinates, then verify the QA banner, Home, Analytics, Rank, Calendar, Profile, restart/reseed, and sign-out/purge flows.

The sandbox is a local fixture harness, not a staging account. It must not be enabled in release builds or used as evidence of authenticated Supabase behavior.
