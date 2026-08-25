# Changelog

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
