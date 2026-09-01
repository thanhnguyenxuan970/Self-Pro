# Changelog

## Unreleased

- Added migration 070 to restore `authenticated` execution of the `analytics_year_date(text)` helper used by the `activity_log` expression index, preventing `42501`/403 activity uploads while keeping direct `PUBLIC`/`anon` execution denied; the migration is applied to the linked Supabase project, and authenticated activity-log verification now passes 12/12 insert-read-delete cycles plus a re-login absence check, with anonymous reads denied.
- Home, Rank, and the personal Friends summary star totals now use the Analytics Year KPI: positive TASK stars from the current calendar year, respecting the account activity boundary; the achieved rank tier and Friends race ladder remain lifetime-based.
- Cold starts now re-probe an account-scoped blocked cloud restore after a transient offline failure, while uploads remain fail-closed and the manual Retry action keeps full reconciliation behavior.
- Interactive Google sign-in now skips full backup reconciliation for unblocked populated local accounts, retries durable restore blocks without publishing an unsafe account, and uses cutoff-aware, indexed bounded local presence probes; explicit account-recovery Retry remains the fail-closed reconciliation path. CAS recovery compares the same account-cutoff-filtered view on both local and cloud snapshots while preserving retained pre-boundary audit rows.
- Friends read RPCs now retry once after Supabase rejects an expired/invalid JWT, while mutations remain single-attempt to avoid duplicate writes; `PGRST301` is no longer mislabeled as a missing backend.
- Supabase diagnostics now use the live `public.users.user_email` column and document the expected anonymous-RLS, backup-CAS, and CLI-credential boundaries without changing user data.
- The Sky accent now uses a calmer cobalt blue across light and dark themes, with runtime contrast checks and emulator screenshots covering the selected accent and Analytics state.

## 2.0.3.l - 2026-09-01

- Fixed visible signed-in star totals in Rank/Global and Friends to use the local Analytics Year KPI shared with Home and Analytics; rival rows retain their own server-provided annual totals, while server rank metadata/order and cloud activity remain unchanged.
- Android native release metadata is 2.0.3.l (versionCode 79); the shared Expo/iOS version remains 2.0.3.
- Validation: TypeScript, 84 Jest suites/788 tests/1 snapshot, and 3 repeated focused star-consistency runs (31 tests each) passed. Data-preserving `adb install -r` plus emulator `emulator-5554` Home/Rank/Friends checks showed 356 local stars and 177 rival stars; cold relaunch stress kept the app alive with no app errors. Signed release AAB verification passed. AAB SHA-256: EF3A070F8FB33C255A2684BC415CA9307A6BCE912A86D32E3AB3F2E2C05126E0.

## 2.0.3.k - 2026-08-30

- Fixed Google sign-in failing for accounts with enough stored data that the cloud backup restore exceeded its timeout: the restore's Supabase session lease and account-sync gate are now released on timeout instead of stranding the sign-in flow and every retry behind them.
- Android native release metadata is 2.0.3.k (versionCode 78); the shared Expo/iOS version remains 2.0.3.
- Validation: TypeScript, 82 Jest suites/769 tests/1 snapshot passed. Signed release AAB verification passed. AAB SHA-256: 7440385007CB17C282F79C5341283B1E6B4F5EE8456AD382336EFFCB3E4730B8.

## 2.0.3.i - 2026-08-28

- Expected backup revision contention now returns a non-error CAS sentinel to avoid normal multi-device conflicts becoming Supabase `P0001` log failures; divergent payloads remain blocked and the legacy backup wrapper preserves its fail-closed conflict behavior.
- Android native release metadata is 2.0.3.i (versionCode 76); the shared Expo/iOS version remains 2.0.3.
- Validation: TypeScript, 81 Jest suites/763 tests/1 snapshot, 10 repeated CAS/recovery stress runs (110 targeted test passes), linked Supabase lint with pre-existing warnings only, migration dry-run, and signed release AAB verification passed. Authenticated Supabase E2E and live migration deployment remain pending dedicated authorization/test-account validation. AAB SHA-256: E7E971BA51F4E95E2547CA9431B98AC814C47FB9FDECD5F376FF359673F6DFF7.

## 2.0.3.h - 2026-08-27

- Fixed linked Challenge habits using the instant preset flow so logging the habit also appends the expected `activity_log` row and completes the day's Challenge progress; timed presets continue through the duration flow.
- Android native release metadata is 2.0.3.h (versionCode 75); the shared Expo/iOS version remains 2.0.3.
- Validation: TypeScript, 79 Jest suites/737 tests/1 snapshot, debug E2E across core, Challenge, Rewards, Rank, Friends, Calendar, Analytics, and reminders, 500-habit x 365-day local stress coverage, and signed dual-ABI release AAB/APK verification passed. Authenticated Supabase E2E remained blocked without a dedicated test account.

## 2.0.3.g - 2026-08-26

- The confirmed thanguyenxuan account now treats 2026-07-06 as the start of real activity: earlier fake rows stay available for audit but no longer inflate the heatmap, lifetime stars, rank, backup, restore, or sync.
- The signed-in user's leaderboard stars now use the same cutoff-filtered total shown on Home, while rank position and other players remain server-derived.
- A temporary cloud-restore outage no longer replaces an already-populated local account with the recovery screen; fresh or seeded databases remain fail-closed until restore succeeds.
- Accent, loading, selection, and celebration states now use the semantic contrast-safe theme tokens across light and dark modes.
- Android native release metadata is 2.0.3.g (versionCode 74); the shared Expo/iOS version remains 2.0.3.
- Validation: TypeScript, 79 Jest suites/719 tests/1 snapshot, Supabase migration dry-run, signed release AAB/APK, and the data-preserving emulator Home/Rank flow passed. AAB SHA-256: 3633CD6082FA187CFD5BE3EA015511E89325ECDFA948C4AB74640D41A32E88F3.

## 2.0.3.f - 2026-08-26

- Heatmap date cells are now tappable again and open the selected day's card with its date, stars, and points, including zero-activity days.
- Android native release metadata is 2.0.3.f (versionCode 73); the shared Expo/iOS version remains 2.0.3.
- Validation: TypeScript, 76 Jest suites/709 tests/1 snapshot, and the signed release AAB passed; emulator stress covered a populated day (+21 stars, 50/50 points), an empty day (+0 stars, 0/25 points), card dismissal, and relaunch/retry recovery. The AAB contains `com.habitring.app` version `2.0.3.f` (versionCode 73).

## 2.0.3.e - 2026-08-25

- Habit and Challenge mutations now await the authenticated cloud-backup attempt before their mutation callback completes, so closing or reinstalling immediately after a change cannot race the backup snapshot; challenge rollover and completion use one serialized sync instead of duplicate fire-and-forget uploads.
- Android native release metadata is 2.0.3.e (versionCode 72); the shared Expo/iOS version remains 2.0.3.
- Validation: TypeScript, 76 Jest suites/709 tests/1 snapshot, debug Metro reload on `emulator-5554` with 69 active days/260 stars/heatmap retained, and signed `bundleRelease`/`assembleRelease` passed. AAB SHA-256: `AF5B969FD4E40409EC89F90C484E37CA4782820D1728DC89CE486E8FD4271CDA`.

## 2.0.3.d - 2026-08-25

- Reinstall recovery now falls back to the authenticated legacy activity mirror when a ranked cloud snapshot has no history, rebuilds heatmap/summary data without reattaching stale task ids, remaps cross-account SQLite id collisions, and reconciles the server-derived lifetime rank before the next upload.
- Android native release metadata is 2.0.3.d (versionCode 71); the shared Expo/iOS version remains 2.0.3.
- Validation: TypeScript, 76 Jest suites/707 tests/1 snapshot, and the signed release AAB passed; the AAB contains `com.habitring.app` version `2.0.3.d` (versionCode 71). Data-preserving debug recovery on `emulator-5554` retained heatmap, 69 active days, and 260 stars; the arm64 release AAB was not installed over the x86_64 debug emulator.

## 2.0.3.c - 2026-08-25

- Google subject changes for the same verified email now reuse the existing local account instead of creating a second empty account.
- Account restore remains fail-closed until the snapshot completes; rank progress without activity history is rejected instead of being uploaded as an empty reinstall snapshot.
- Added regression coverage for subject migration, empty legacy restore with remote stars, inconsistent cloud snapshots, and retry/upload ordering. Android native release metadata is 2.0.3.c (versionCode 70); the shared Expo/iOS version remains 2.0.3.

## 2.0.3.b - 2026-08-25

- Challenge "today" now follows the device-local calendar consistently with activity logs, including non-ICT evening boundaries; Android native release metadata is 2.0.3.b (versionCode 69), while the shared Expo/iOS version remains 2.0.3.
- Google sign-in recovery now ignores negative LOGIN telemetry rows in the legacy activity fallback and allows a verified fresh sign-in to retry an account-scoped blocked restore after reinstall.
- Supabase auth-audit diagnostics now match the live schema (`payload` is `json`, with `action` and `provider` read from that payload); no app or migration change was required.
- Added a read-only `Docs/supabase_diagnostics.sql` catalog checklist with corrected queries for the reported `42703`/`42809` introspection errors and documented credential (`28P01`) and transport (`08006`) boundaries.
- Google/Supabase sign-in now skips redundant exchanges for a fresh same-account session, serializes direct and background ID-token exchanges, retries one transient auth-user race or HTTP 5xx exchange failure, verifies the returned email, and fails closed instead of publishing a local account after remote auth failure.
- Account recovery Retry now clears only the signed-in account's restore-block marker while holding its per-account sync gate; a repeated failure or cancellation re-blocks the account before queued uploads can run.
- Supabase migration 066 restores `authenticated` execution of the account-write RLS predicate while keeping direct `PUBLIC`/`anon` execution denied, fixing `42501`/403 activity-log uploads.
- Google accounts now use an authenticated, account-scoped Supabase snapshot to restore local tasks, activity, heatmap rollups, Challenges, rewards, and rank state before any post-reinstall upload; older activity mirrors remain a heatmap fallback, snapshot writes use revision compare-and-swap, cross-account SQLite collisions fail closed, and interrupted reset/delete flows cannot resurrect old data.
- Challenge reminders now re-arm deterministic Expo notification IDs after Android force-stop, and denied notification permission clears the persisted reminder token for retry.
- Unified Analytics Week, Month, and Year bar rendering while preserving dense-range horizontal scrolling and accessibility context.
- Fixed completed/selected task rows escaping the rounded Today card; removed the full-row shrink animation and respect reduced-motion settings.
- Lifetime rank totals now render as whole stars, and normal account sync reconciles the current Supabase-derived total into local SQLite so Rank and the authenticated leaderboard stay aligned.
- Unchecking, Progress deletion, and task archiving now reverse positive lifetime stars locally while preserving the achieved high-water tier; auth-scoped Challenge notification work is serialized across sign-out.
- Rank fallback states no longer present a local-only user as a fabricated champion, and the Global/Friends controls meet the 44px touch-target contract.
- Validation status: TypeScript and 76 Jest suites/690 tests pass; the fresh signed release AAB contains `com.habitring.app` version `2.0.3.b` (versionCode 69), and a data-preserving Android 2.0.3.b debug install plus authenticated Home/cold-start recovery pass on `emulator-5554`. The release-signed app was not installed over the existing debug-signed app because Android rejects the certificate mismatch; no uninstall or data reset was performed.

## 2.0.2 - 2026-08-18

- Rank sync now drains every pending activity batch and self-reconciles the signed-in account when the protected server total falls behind its local lifetime total; leaderboard rows remain server-derived rather than being overridden in the UI.
- Reconciled the authorized account `thanhnguyenxuan970@gmail.com` to 279 lifetime stars with a durable server-side adjustment that continues to advance from uploaded activity.
- Added a one-time D0 growth survey (`SurveyD0Sheet`) shown once, ~800ms after a user's very first log, to diagnose retention/localization hypotheses; answers land in `public.feedback.answers` (migration 044) via the `feedback-submit` Edge Function. Always skippable, never re-shown once seen.
- New installs now default their display language from the device's own locale (`expo-localization`) instead of always defaulting to Vietnamese; anyone who has already picked a language in Settings is unaffected.
- Fixed lifetime-star inflation: unchecking a completed activity now correctly reverses the stars it previously earned.
- Fixed linked Daily unchecks not syncing back to their Challenge.
- Fixed a crash on the D0 survey's locale lookup when `expo-localization` isn't natively linked (JS-only reload/OTA on an older binary).
- Fixed Analytics' Month view to render the actual calendar month (day 1 through the last day, future days at 0) instead of a rolling 30-day window that always ended on today.
- Fixed dark mode: choice-card borders, the survey progress track, and the drag handle were nearly invisible (~1.1-1.6:1 contrast); now meet WCAG 1.4.11's 3:1 minimum for UI-component boundaries.

## 2.0.1.5 - 2026-08-13

- Sửa bảng xếp hạng toàn cầu sau cập nhật: hiển thị đúng người chơi có dữ liệu thật và không còn hiển thị thứ hạng `#1` giả khi backend chưa sẵn sàng.

## 2.0.1.4 - 2026-08-13

- Sửa đồng bộ sao lifetime trên bảng xếp hạng: hiệu chỉnh lịch sử được giữ bền qua các lần sync.
- Analytics đếm ngày có hoạt động trực tiếp từ activity log cho Volume và Consistency.

## 1.1.5 - 2026-07-17

- Mở khóa và xem lại mascot của các rank đã vượt qua; rank chưa đạt vẫn khóa.
- Làm mới màn chúc mừng thăng hạng và hướng dẫn rank, gọn hơn và dễ đọc hơn.
- Cải thiện độ ổn định của rank theo tuần và thao tác backfill hoạt động.
