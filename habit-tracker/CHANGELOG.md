# Changelog

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
