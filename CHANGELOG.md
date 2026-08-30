# Changelog

All notable changes to this project are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)

## [Unreleased]

### Added
- **Native in-app review prompt**: after a user returns at least 24 hours after their first eligible activity, Habi makes one best-effort request through the platform review API per device; unavailable or failed review prompts never affect activity logging.

### Changed
- Removed user photo selection from Challenge Detail and share-card creation; existing challenge photos remain display-only.
- **Responsive onboarding and calendar surfaces**: tutorial coachmarks now size and reposition for narrow screens, enlarged font scales, safe-area insets, and the bottom tab bar; task/streak steps auto-scroll to and re-measure their live targets. Calendar's seven-column grid, month navigation, legend, and summary cards now use bounded flex layouts with responsive spacing and typography while preserving the phone-first portrait navigation.

### Fixed
- **Account activity boundary**: the confirmed thanguyenxuan account now starts counting real activity on 2026-07-06; earlier fake rows no longer inflate its heatmap, lifetime stars, rank, backup, restore, or sync.
- **Analytics Year star contract**: Home, Analytics, Rank, Global, Friends, Profile, Trophy, and Badge totals now use the same current-calendar-year positive TASK-star KPI; lifetime stars remain internal for tier/economy/recovery and are no longer a visible total.
- **Offline-safe recovery**: a temporary cloud-restore outage no longer replaces an already-populated local account with the recovery screen; fresh databases remain fail-closed until restore succeeds.
- **Recovery after reconnect**: the explicit account-recovery Retry now refreshes the Google-backed Supabase session before reconciling, so a stale in-memory session cannot keep returning the recovery screen after connectivity returns.
- **Backup CAS reconciliation**: an existing local snapshot now adopts a newer cloud revision only when the payloads match; divergent snapshots keep sync blocked instead of issuing repeated stale-revision writes.
- **Quiet backup contention**: expected multi-device revision mismatches now return a non-error CAS sentinel, so the client can run the same data-preserving reconciliation without recording normal contention as a Supabase `P0001`; legacy backup calls still fail closed.
- **Theme contrast**: accent, loading, selection, and celebration states now use semantic contrast-safe tokens across light and dark modes.
- **Android launcher icon**: synchronized the committed native launcher resources with Habi's green checkmark adaptive icon so installed Android builds no longer show the legacy blue A.
- **Google sign-in race hardening**: malformed identities and missing ID tokens now fail closed before local account mutation; same-account exchanges remain serialized with bounded duplicate-key/5xx retry, cancellation-fenced retries and queued exchanges, finite-expiry/email/Google-subject checks, one process-wide session lease for protected RPCs, canonical remote ownership keys with legacy local-email lookup preserved, cancellation-safe native restore, token-owned cleanup, atomic local user/category seeding, and localized failure copy.
- **Late auth cleanup fencing**: a timed-out Google/GoTrue exchange that completes after its caller has moved on now queues token cleanup behind the shared session lease, so it cannot interleave with another account's sign-in or sign-out.
- **Timezone-aware growth audit queries**: absolute timestamps and date calculations now use each user's validated profile timezone, with UTC fallback, instead of a fixed `Asia/Ho_Chi_Minh` timezone.
- **QA artifact privacy**: raw Android logcat files are no longer tracked; root `.audit/` log output is ignored to prevent device identifiers and internal runtime details from entering future pushes while keeping sanitized screenshot/XML evidence available.

## [2.0.3.h] - 2026-08-27

- Fixed linked Challenge habits using the instant preset flow so logging the habit also appends the expected `activity_log` row and completes the day's Challenge progress; timed presets continue through the duration flow.
- Android native release metadata is 2.0.3.h (versionCode 75); the shared Expo/iOS version remains 2.0.3.
- Validation: TypeScript, 79 Jest suites/737 tests/1 snapshot, debug E2E across core, Challenge, Rewards, Rank, Friends, Calendar, Analytics, and reminders, 500-habit x 365-day local stress coverage, and signed dual-ABI release AAB/APK verification passed. Authenticated Supabase E2E remained blocked without a dedicated test account.

## [2.0.3.0] - 2026-08-18

### Changed
- **Challenge Detail refactor**: extracted `ChallengeDetailScreen`'s inline handlers and render sections into a dedicated `useChallengeDetailActions` hook and `ChallengeDetailSections` component (no behavior change); removed the now-unused `CalendarIcons` component.
- **Analytics dashboard refactor**: split the monolithic `AnalyticsDashboardView` into focused sub-components (metrics row, chart, consistency rings, rhythm, composition) to keep each render function's complexity in check.
- **Dead-code cleanup**: de-exported several component prop-copy types and helper functions (`LeaderboardRowCopy`, `FriendRequestRowCopy`, `FriendRowCopy`, `OverflowMenuItem`, `STREAK_MILESTONES`, `formatDateAtOffset`) and an unused `FriendsUnavailableError.kind` field that had no external callers.

## [2.0.2.1] - 2026-08-18

### Fixed
- **Active challenge cleanup**: ongoing challenges created by mistake can now be deleted from Challenge Detail with a destructive confirmation; queued reminder cancellation and stale-reminder behavior are covered by regression tests.
- **Clean-install patching**: corrected the Expo native patch header so `patch-package` applies successfully on a fresh dependency install.

## [2.0.2] - 2026-08-18

### Added
- **D0 growth survey**: a one-time, skippable 6-question sheet (`SurveyD0Sheet`) shown ~800ms after a user's very first log, to diagnose retention/localization hypotheses; answers land in `public.feedback.answers` via the `feedback-submit` Edge Function.
- **Device-locale default**: new installs now default their display language from the device's own locale instead of always defaulting to Vietnamese; anyone who already picked a language in Settings is unaffected.

### Fixed
- **Lifetime rank sync**: rank sync now drains every pending activity batch and self-reconciles the signed-in account when the protected server total falls behind its local lifetime total; leaderboard rows remain server-derived.
- **Star inflation on uncheck**: unchecking a completed activity now correctly reverses the stars it previously earned.
- **Linked Daily/Challenge sync**: unchecking a Daily linked to a Challenge now syncs correctly instead of leaving the Challenge state stale.
- **D0 survey crash guard**: fixed a crash in the survey's locale lookup when `expo-localization` isn't natively linked (JS-only reload/OTA on an older binary).
- **Analytics Month view**: now renders the actual calendar month (day 1 through the last day, future days at 0) instead of a rolling 30-day window that always ended on today.
- **Dark mode contrast**: choice-card borders, the survey progress track, and the drag handle were nearly invisible (~1.1-1.6:1 contrast); now meet WCAG 1.4.11's 3:1 minimum for UI-component boundaries.

## [2.0.1.5] - 2026-08-13

### Fixed
- **Global leaderboard availability**: production now loads the real ranked-player list, and an unavailable backend no longer appears as a misleading local `#1` plus empty-board message.

## [2.0.1.4] - 2026-08-13

### Fixed
- **Analytics Month/Year charts**: point bars and x-axis labels now use horizontally scrollable fixed-width tracks instead of compressing every value into one phone viewport. The Month chart opens with today centered for immediate context.

## [2.0.1.3] - 2026-08-13

### Added
- **Themed toast notifications**: log/streak/error toasts now follow the app's light/dark surface, border, and typography tokens instead of the library's fixed white/black default.

### Fixed
- **Challenge statistic labels**: multiline totals now stay centered inside their statistic cards instead of wrapping against the left edge.
- **Startup auth hang**: a returning signed-in user could get stuck on the loading spinner indefinitely — the startup session restore now loads its native-module-adjacent dependency via `require()` instead of an async import, plus a 15s timeout around the silent Google sign-in call as defense-in-depth.
- **Feedback submissions**: the "Failed to send" error on every feedback submission is resolved — the missing server rate-limit migration and Edge Function deployment are now live.
- **Analytics readability**: Month-view chart x-axis day labels and the Volume card's POINTS/STARS/DAYS REACHED labels no longer shrink to an illegibly small, inconsistent size on narrow screens.
- **Leaderboard rank numbers**: no longer wrap to two lines.
- **Accessibility**: the "No timer" quick-log button now has a screen-reader label.

## [2.0.1.2] - 2026-08-12

### Fixed
- **Home heatmap**: removed the redundant chevron/date-stepper pill under the activity grid, which duplicated day navigation the grid itself already exposes. The screen-reader accessibility stepper on the grid is unaffected and remains the accessible path to per-day detail.

## [2.0.1.1] - 2026-08-12

### Added
- **Pseudonymous leaderboard neighborhood**: the global leaderboard now supports a bounded top-three plus current-user neighborhood view, with server-side rank data and profile provisioning migrations.
- **Human-readable anonymous competition**: leaderboard opponents now receive stable Vietnamese/English pseudonyms, and their current streak is shown as a privacy-safe sign of recent activity.
- **Localized release news**: added the bilingual Habi 2.0.0 in-app News migration.
- **Friends backend foundation**: added UUID-backed social identity, privacy-preserving friend requests, blocker-owned account management, friend dashboard ranking, rate limits, relationship caps, and race-safe transitions for the upcoming Friends experience.
- **Friends race ladder UI**: Rank now has a Global/Friends segment with its own pending-request badge; the Friends segment shows a tie-aware race ladder, incoming/outgoing requests, an Add Friend sheet (own code copy/share/rotate, six-character code entry, full RPC-result messaging), and confirmation sheets for remove/block/cancel/unblock. Added a Settings → Blocked Accounts screen. All states (loading, empty, error, backend-unavailable, stale-with-cache) are covered, matching the approved design mockup.
- **Challenge management**: active challenges can now be renamed or deleted directly from Challenge Detail with a destructive confirmation.

### Fixed
- **Concurrent challenges**: users can now activate multiple challenges, see each active challenge on the hub, log the selected challenge independently, and keep all active challenge rollovers in sync.
- **Theme contrast**: accent buttons, Analytics metrics, heatmap controls, and related text now use theme-aware, readable ink colors, including the green light-theme surface.
- **Account safety**: sign-in now resolves the local account before publishing session state and failed credential restoration no longer falls back to a local user.
- **Rank integrity**: deleting or undoing BAD activities no longer mints lifetime stars; reset/delete flows clear all rank-related local tables; challenge reward reversal is challenge-scoped.
- **Migration repair**: the lifetime-rank backfill is positive-only and safely retries incomplete repairs; migration coverage now includes idempotency and drift cases.
- **Responsive UI**: Home heatmap, Analytics, Calendar, Feedback, and Rank layouts preserve readability on narrow screens.
- **Reminder consistency**: deleting a challenge cancels its queued reminder only after the SQLite transaction commits, so a rollback cannot silently remove a still-valid reminder.
- **Heatmap touch accuracy**: compact day cells no longer expose overlapping touch regions that could select an adjacent date.
- **Green accent press state**: light-theme green's hover and press colors were identical, so pressing a green button never visibly changed color; they're now distinct shades.
- **Linked-challenge check-in**: checking in a challenge linked to a habit now resolves the exact habit by id instead of by name, so two habits with names that collide once accents/casing are stripped can no longer cause a check-in to be silently logged against the wrong one.
- **Duplicate habit names**: creating a habit now rejects a name that collides with an existing one after normalization, closing the same class of misattribution at its source rather than only in one entry point.
- **Challenge restart after archiving**: restarting a finished or failed challenge now refuses to proceed if its linked habit has since been archived, instead of silently creating a new active challenge that could never be checked off.
- **Feedback submissions**: removed image attachments from bug/feedback reports; submissions now go through a rate-limited server endpoint instead of a direct, client-throttled-only insert, and the send flow no longer hangs indefinitely if the network stalls.

### Changed
- **Leaderboard contract**: malformed and out-of-contract rows are normalized and bounded before rendering, while legacy RPC identity remains compatible.
- **Friends delivery planning**: added the reviewed product, backend, UI, and rollout plans for the Friends race-ladder work while keeping the superseded podium concept documented as non-authoritative.

## [2.0.1.0] - 2026-08-03

### Added
- **Multiplier boost experience**: persisted streak-milestone grants now support deadline-aware claiming, active countdown state, and an expiry summary.

### Fixed
- **Challenge reminders**: completed and failed challenges now cancel their queued daily reminders, including older terminal challenges.
- **Responsive Today navigation**: bottom-tab labels now adapt to narrow layouts without overlapping icons or truncating the central action.
- **Boost correctness**: backfill streak crossings create the same durable boost event as Today logging, and expired events cannot be claimed.
- **Theme and accessibility contrast**: badge celebration labels and dismissal controls now follow the selected theme with explicit screen-reader semantics.

### Changed
- **Compact heatmap layout**: the 53-week grid scales to narrow screens while keeping day hit areas non-overlapping.
- **Data/query cleanup**: removed obsolete boost hooks and a dead migration path; date-scoped activity queries reduce unnecessary local work.

## [2.0.0.0] - 2026-07-29

### Added
- **Lifetime rank & global leaderboard** (replaces the weekly-reset rank system): rank/tier state now lives on `users.lifetime_stars`/`current_tier_id` (migration v23, backfilled from `activity_log`) and never resets — `current_tier_id` is a high-water-mark that only advances, even if stars later drop. The leaderboard (`useLeaderboard.ts`) is now a single global ranking of every player sorted strictly by lifetime score (ties break on email), with no weekly or tier-band filtering. The Level-Up celebration now fires in real time off this lifetime rollup from every star-changing action (log, unlog, challenge reward, backfill, task archive/delete) and queues one celebration per tier crossed if a single action crosses several thresholds at once (`pendingLevelUpQueue.ts`). The old countdown-to-Monday-reset chip on the Rank screen is gone — there's nothing left to count down to
- **Tier 9 Cosmic**: extended the rank ladder to 2560 stars with its flat cosmic mascot, bilingual labels, and level-up presentation
- **Multiplier Boost**: a once-daily claimable star multiplier that applies to logs made within its claim window
- **Analytics dashboard**: a redesigned Progress screen analytics view with Week/Month/Year ranges, period totals, day-by-day charts, and streak-consistency rings
- **Daily reminders for Session/Week challenges**: challenge notifications now nudge you every day instead of a Monday-only ping

### Fixed
- **Log-duration screen could trap you**: the "how long?" picker shown every time you log a timed habit — the single most-used interaction in the app — ignored the Android back button/gesture entirely. Back now closes it, same as tapping Cancel
- **Several modals didn't extend under the status/nav bar**: the rank-up celebration, streak-milestone celebration, onboarding tooltips, heatmap detail sheets, and a couple of challenge dialogs showed a stray system-bar-colored seam at the top or bottom instead of rendering edge-to-edge
- **Sign Out button wasn't announced by screen readers**: it's now exposed as a proper button with a label
- **A couple of touch targets on Calendar and the accent-color picker** were slightly under the recommended 48dp minimum on Android; nudged both up
- **Real-time activity sync could push data across accounts on shared devices**: sync now scopes strictly to the signed-in user
- **Analytics consistency rings showed nothing**: the "this week / 30 days / all time" rings under CONSISTENCY had a percentage text style defined but never rendered — sighted users saw three bare circles. Now shows the actual percentage
- **Activity log header didn't match the redesigned Analytics dashboard above it**: a visible style seam between the new gold/uppercase section headers and the older log-history heading right below them
- **Weekly/session challenges — reminder now actually fires daily**: `scheduleChallengeReminder('weekly')` was scheduling a once-a-week Monday-only local notification, while both the notification body and the Create-challenge toggle copy implied a recurring daily nudge. Now both match the real daily behavior. Note: this is a plain unconditional daily reminder, not the pace-conditional "nudge only when falling behind" notification described in a still-open TODOS.md item — that remains unbuilt
- **Contrast, memoization, and accessibility sweep**: three full-tree audit passes fixed dozens of smaller issues across nearly every screen — dark-mode contrast regressions, missing accessibility labels/roles, unnecessary re-renders on the Today/Rank/Progress screens, and inconsistent Android keyboard/inset handling across sheets and modals
- **Rank-up celebration forced dark mode**: the full-screen level-up celebration always rendered with a near-black background and a hardcoded light-mode text color, regardless of your actual light/dark theme setting — light-mode users saw a jarring dark flash and mismatched text on every rank-up. Now follows your real theme
- **Feedback form's Send button could hide behind the keyboard**: on smaller phones, opening the keyboard while writing feedback could push the Send button off-screen with no way to reach it. The form now scrolls
- **Task checklist announced the wrong state while selecting for bulk delete**: TalkBack reported whether a task was *done*, not whether it was *selected*, while multi-selecting activity log entries or tasks — now announces the state you're actually acting on
- **Home heatmap and Analytics dashboard performance**: the heatmap's entrance animation dropped from up to 371 simultaneous animated cells to a bounded recent window; the Analytics dashboard no longer pulls a user's entire lifetime of activity logs into memory on every Week/Month/Year switch
- **Badge-unlock celebration and notification reminders ignored your language setting**: the badge-unlock popup always showed Vietnamese text, and daily reminders were hardcoded one language each (challenge reminders in Vietnamese, habit reminders in English) regardless of what you picked in Settings — all three now follow your real language
- **Two modals could clip content behind the keyboard or gesture bar**: the custom-duration picker on Today and the custom-duration input when creating a challenge could push their action button out of reach on small phones or gesture-nav devices — both now scroll and respect the bottom safe area, matching the earlier Feedback-form fix
- **Predictive Back was disabled app-wide**: the Android 13+ system back-gesture animation was explicitly turned off in the app config for the whole app; re-enabled
- **Rank-up label used a systemically illegible color**: the small colored label above the level-up mascot (and the star-total chip beside it) rendered several rank colors as body text against their own tinted background — computed contrast as low as ~1.8:1, failing even the minimum readability bar. Both now use a guaranteed-legible ink color; the rank mascot itself still carries the full brand color
- **Sign Out was styled like a destructive action**: it used the same red/error color as Delete Account and failed checks, even though signing out is routine and reversible. Now uses a neutral outline
- **Bottom sheets and dialogs would stretch full-width on tablets/foldables**: every modal in the app (add activity, feedback, backfill, custom duration, edit activity, share card, badge detail, and more) had no maximum width, so a wide screen would balloon the dialog edge-to-edge; all now cap at a readable width and stay centered
- **Two database aggregate queries did one round-trip per row**: the Trophy Shelf's "weeks you beat your target" count and a streak-recompute step after archiving a task each queried/wrote per-item in a loop instead of batching — both now do one query and, for the write, fire concurrently within the existing transaction
- **A few remaining unlabeled/undersized controls**: the activity-name and feedback-message text fields had no screen-reader label, the accent-color swatches announced raw English keys ("green", "rose"...) even in Vietnamese, and one challenge card's badge was under the 48dp touch-target minimum — all fixed
- **First tap on Home's task rows and the add-activity button now shows Android's native ripple feedback** instead of an iOS-style opacity fade, matching platform convention
- **The task edit button was unreachable by screen readers**: it sat nested inside the row's checkbox control, which TalkBack/VoiceOver treats as a single opaque element — the edit control never got its own stop. It's now reachable independently
- **Home heatmap taps could hit the wrong day**: enlarging the touch area around each tiny calendar cell (for a past accessibility fix) made adjacent cells' touch regions overlap, since the visual gap between cells is only 3px. Rebalanced so taps land on the cell you actually pressed
- **Four more modals could stretch full-width on tablets/foldables**: the heatmap's legend, scoring-guide, and day-detail sheets, plus the rank-tiers sheet, were missed by the earlier modal-width fix; now capped and centered like the rest
- **"Danger" red text was borderline illegible**: delete labels, the failed-reminder note, and a few other red text labels across the app computed to just under the WCAG AA contrast minimum (and further under it on their tinted pill backgrounds); darkened to a guaranteed-legible shade. Also stopped using that same error-red for "you have unread news" indicators, which read as a false alarm — they now use the app's accent color instead
- **A challenge-creation chip group announced itself inconsistently**: the "which habit does this track?" selector used a different screen-reader role than every other single-select chip group on the same screen; unified
- **A Challenge-scoped fix pass closed several smaller gaps**: the create-challenge custom-value sheet and the share sheet now respect reduced-motion, matching the rest of the app's dialogs; 8 touch targets across Challenge Detail, Challenge Hub, Create Challenge, and the share sheet were raised to the 48dp minimum; renaming a challenge that fails now shows a real error message instead of reusing a field label as the error text; and the rename dialog, custom-value sheet, and share sheet now correctly block screen readers from reaching background content while open
- **Text and icons on colored buttons could be nearly invisible depending on your chosen accent color**: white text/icons painted on an accent-colored button, and the accent color itself used as text on a plain background, both failed legibility contrast for most non-default accent colors (worst case, honey in dark mode, was close to unreadable). Every accent now computes its own guaranteed-legible ink color per light/dark theme, verified with real contrast math rather than assumed — this touches the "+" button, checkmarks, CTA buttons, badges, and stat numbers app-wide
- **Setting a custom activity duration outside the 30/45/60-minute presets had no path for screen-reader users**: the hour/minute picker relied on a quick double-tap gesture that TalkBack intercepts as "activate" rather than delivering to the app. It's now operable via swipe-to-adjust, and a small always-visible edit button opens the same numeric keyboard entry for anyone (not just screen-reader users) who finds the double-tap gesture hard to discover
- **A bad-habit's point deduction could be hard to read**: one red-text label on the task list had a slightly-too-faint shade that a sibling label two lines away had already been fixed to avoid
- **Nine more dialogs now respect Reduce Motion**: the backfill sheet, badge detail, edit-activity, feedback, three heatmap sheets, the rank-tiers sheet, and the duration picker previously ignored the system Reduce Motion setting for their open/close animation even though their inner content did
- **Deleting several habits at once now happens as one save**: multi-select delete on Home previously ran one database transaction per selected habit in sequence, causing a visible stutter proportional to how many you selected; now runs as a single batch
- **Calendar day cells are now properly announced to screen readers**: most days in the monthly calendar had no accessible label at all — TalkBack read a bare number with no indication of whether that day had logged activity
- **Rank-tier list rows and long-press challenge history rows read as several disconnected fragments to screen readers**: both now announce as one coherent line
- **Onboarding tutorial's dimmed backdrop was unintentionally darker than every other dialog's dim layer in the app**: now matches
- **Heatmap day-detail popup had two more contrast bugs the earlier accent sweep missed**: the dismiss button's text was invisible in dark mode, and the "+N ★" stars number was nearly unreadable in light mode — both used the reward-gold color directly as text instead of a legible variant. Fixed
- **Badge-unlock celebration hid the badge you just earned from screen readers**: the entire popup was wrapped in a single "Close" control, so TalkBack/VoiceOver announced only "Close, button" and never the badge's name, tier, or description before it auto-dismissed. Restructured so the content is independently reachable, with an explicit Next/Dismiss control for the rare-tier takeover
- **Daily reminders' time picker silently did nothing on iOS**: tapping "add reminder" opened no picker and showed no error (Android-only code with no fallback). iOS now gets its own picker
- **Onboarding tutorial's Next/Skip/Back buttons were under Android's touch-target minimum**: raised to 48dp
- **Two sheets could stack on top of each other on Android**: opening "Add activity" from inside the missed-day backfill flow rendered two overlapping dialogs with no guaranteed order, a known Android limitation of nesting one dialog inside another; the backfill sheet now steps aside while the nested one is open
- **Challenges screen had no real back button**: it disabled the system header entirely and relied on a small custom arrow, leaving no back affordance at all below Android 14's predictive-back gesture. Now uses the same native header/back button as every other screen
- **Add-activity sheet rested as a centered floating dialog despite animating in from the bottom**: now rests as a proper bottom sheet, matching every other sheet in the app
- **Tab bar hid its labels too aggressively on narrower phones**: lowered the width cutoff
- **A couple of "log" buttons lost their screen-reader label while showing a loading spinner**: fixed
- **Feedback form's dimmed backdrop couldn't be tapped to dismiss** despite looking like every other dismissible sheet in the app; fixed
- **A row in the activity log had no screen-reader role outside multi-select mode**: TalkBack announced it as inert even though long-pressing it does something; fixed
- **Activity log's row cap lowered from 50 to 30** to reduce how many rows mount at once on budget Android hardware

### Changed
- **Internal cleanup**: removed dead code, a duplicated helper, and a circular module dependency in the health/rank tracking layer; no user-facing behavior change
- **Challenge card, day grid, and progress ring no longer re-render needlessly**: memoized the three components and stabilized the one callback prop passed into them; no user-facing behavior change
- **Analytics dashboard no longer re-renders on unrelated screen interactions**: memoized; no user-facing behavior change
- **One more redundant per-row database round-trip batched into a single query**, closing the last spot a previous optimization pass missed; no user-facing behavior change
- **Removed 16 unused style declarations** left over from earlier redesigns across six files; no user-facing behavior change
- **Home heatmap no longer re-renders on unrelated Today-screen updates**: memoized; no user-facing behavior change
- **Four more components' style objects were rebuilt on every render instead of once per theme/prop change**: memoized; no user-facing behavior change
- **Analytics dashboard's translation lookup was rebuilt on every render**: memoized; no user-facing behavior change

## [1.1.4] - 2026-07-16

### Added
- **Xem tiến bộ rõ hơn**: chạm vào một ngày trên heatmap để xem chi tiết, đồng thời chú giải sao hằng ngày và điểm thưởng nay dễ hiểu hơn.
- **Thử thách dễ theo dõi hơn**: làm mới danh sách thử thách và màn tạo thử thách, giữ nút ghi nhận luôn trong tầm tay.

### Fixed
- **Trải nghiệm ổn định hơn**: sửa cách tính số ngày còn lại của thử thách, cải thiện khả năng đọc, vùng chạm và hỗ trợ trình đọc màn hình trên các màn chính.

### Added
- **Trophy coin — metallic upgrade**: `Badge.tsx` rebuilt with a layered coin render (ambient shadow, 5-stop ring gradient, baked 8-lobe luster, bevel edge, recessed disc, emblem emboss, gloss/hotspot/rim-light) per the updated `TIER_COINS` 9-stop ramps in `badgeTiers.ts`; plain `react-native-svg` (no new Skia dependency, since none was already in use)
- **Challenge Detail — redesigned layout**: added a "Đang chạy" running-status pill next to the title, a "còn N ngày" remaining-days pill under the progress ring, "Nhật ký N ngày" / "Before · After" section labels, and 🔥/🛟 icons on the streak/freeze stat cards
- **Challenge creation — daily reminder toggle**: `CreateChallengeScreen` now has a "Nhắc nhở hàng ngày" switch (default on) that schedules a local daily notification for the new challenge via `expo-notifications`; the notification is cancelled on delete and the preference/notification carry forward on restart. New `challenges.notifications_enabled`/`notification_id` columns (migration v14)

### Changed
- **Rank/leaderboard copy**: "PEERS IN YOUR RANK" → "GLOBAL LEADERBOARD" ("BẢNG XẾP HẠNG TOÀN CẦU"); leaderboard empty-state copy no longer references a weekly reset. Removed the Monday reset countdown chip and its "Week Reset! 🎉" toast on app open (both described a mechanic that no longer exists)
- **Rank names**: relabeled all 7 base-ladder tiers' Vietnamese display names and quotes (e.g. Delulu → "Nhứt", GOATED → "Vượt Mức Pickleball") in `ranks.config.ts`/`i18n.ts`; the English internal keys used for animation/audio lookups are unchanged
- **Challenge day grid**: the "today" cell is now an outlined (not filled) cell with a 🔥 icon, and a missed/reset day now shows 💔 on a solid `danger` cell instead of a plain ✕ on a soft tint, matching the rest of the log grid's iconography

### Fixed
- **Leaderboard showed zero entries above the first tier**: `useLeaderboard.ts` capped every player's stars at 5 before comparing against real tier thresholds (e.g. 40/80 for a mid tier), so the comparison could never pass for anyone above tier 1. Root cause traced to a leftover one-time data-fix migration (`v7`, "cap weekly_stars to 5") whose cap logic had been copy-pasted into live query code. Fixed as part of the leaderboard rewrite above (global sort has no tier-band comparison to break)
- **Leaderboard could show a fabricated "#1 in the world"**: the empty-leaderboard fallback used a hardcoded `rank: 1` for the current user, which was safe when "empty" meant "no peers in my tier band this week" but would falsely claim first place on a loading state or fetch error once the board went global. Now distinguishes loading / error / confirmed-empty states explicitly
- **Challenge-completion rewards never triggered the rank-up celebration**: `useChallenge.ts`'s reward path updated rank state through its own separate code path and had no reference to the celebration trigger at all, so completing a challenge that crossed a rank tier updated the tier silently with no Level-Up modal. Now goes through the same lifetime rollup + celebration queue as every other star-earning action
- **News screen — duplicate title**: `UpdatesScreen` rendered the same "Có gì mới"/"What's New" title twice (once in the native nav header, once as an in-page heading); removed the redundant in-page title, keeping the unread-count subtitle and mark-all-read button
- **Trophy Shelf — locked badges rendering as flat gray circles**: the old locked-state overlay was a large near-opaque circle painted over the whole coin, washing out every tier's metal color into the same flat gray disc regardless of tier (most visible on the "Rank" filter's locked badges). Locked coins now render the tier's own ramp desaturated in place, so the metal color still reads through
- **Rank screen — challenge rules copy**: rewrote the `CHALLENGE_RULE_COPY` string (VI/EN) to "Làm liên tục mỗi ngày. Lỡ 1 ngày = reset. Bạn có N phao cứu (freeze/bù)." — shorter, matches the in-app rules card mock, and reads correctly against the existing streak/freeze logic (a missed day only resets the challenge once freezes run out)
- **Rank screen — Trophy preview removed**: dropped the Trophy preview card/link from `RankScreen` (redundant with the dedicated Trophy Shelf entry already on `ProfileScreen`), along with its now-unused data hooks, styles, and imports
- **Accessibility — News mark-all-read button**: now exposes `accessibilityState={{ disabled }}` so screen readers correctly announce the button as inactive when there are no unread items
- **Text clipping — Add Activity suggestion chips**: `chipName` text (e.g. "Học ngoại ngữ") had no explicit `lineHeight`, causing Vietnamese diacritics to clip on some devices (reported on Xiaomi 14T); added `lineHeight: 18` matching the app's `Typography.secondary` convention
- **Home screen — task row icon alignment**: `TaskRow` name/meta text lacked explicit `lineHeight`, causing inconsistent row heights and icon placement on devices with different font-scaling behavior; added `lineHeight` to match `Typography` conventions
- **Home screen — dead animated hero block**: `TodayScreen` retained a `display:'none'` hero card whose 4 animation hooks (rank-bounce, streak-pulse, progress-bar spring, hero-reward) still ran on every log action; removed the dead block, hooks, and styles, and reattached the "streak" onboarding coachmark target to the live `HomeHeatmap` streak pill (its previous target lived inside the hidden block, so that tutorial step measured nothing)
- **Rank screen — gold text contrast**: `starGold` used as text color on light backgrounds (weekly star chip, leaderboard #1-#3 rank number, `ChallengeCard`'s strict badge) failed WCAG AA (~1.9:1 in light mode); added a dedicated `starGoldText` token, darker in light mode and unchanged in dark, and applied it wherever the color renders as text rather than a fill
- **Onboarding — Android back gesture**: the hardware back button/gesture on the setup step exited onboarding instead of returning to the welcome step; added a `hardwareBackPress` handler
- **Challenge detail — dropdown menu**: the "⋯" edit/delete menu was a plain absolutely-positioned view with no backdrop or outside-tap dismissal; now a proper `Modal` with a pressable backdrop, matching the app's other overlay patterns
- **Modal scrim consistency**: seven modals/sheets (`TodayScreen`, `AddActivitySheet`, `BackfillSheet`, `EditActivityModal`, `ChallengeDetailScreen`, `FeedbackSheet`, `ShareCardModal`) used ad hoc `rgba(0,0,0,…)` overlays instead of the theme's `colors.scrim` token; consolidated onto the token
- **Touch targets**: raised several sub-44/48dp targets to the house minimum — `TrophyShelfScreen` filter chips, `ProgressScreen` filter/action chips, `OnboardingScreen` language/gender buttons and back link, `FeedbackSheet` type chips and cancel link, `ShareCardModal` close button, `HomeHeatmap` day-cell hit-slop (previously overlapping adjacent cells)
- **Accessibility labels**: `SettingsScreen`'s Feedback and Delete-Account rows now expose `accessibilityRole`/`accessibilityLabel`; decorative emoji icons across Settings are hidden from the accessibility tree; `UpdatesScreen` announces unread state in its label instead of relying on a color-only dot; `ShareCardModal`'s share CTA announces the Pro-locked state; `ChallengeDetailScreen`'s rename field now has a label
- **i18n gaps**: moved hardcoded Vietnamese strings in `ProgressScreen` (peak-points label, rank-up-in-N-stars, empty-state encouragement), `HomeHeatmap` (day-of-week rail), and `LevelUpCelebrationModal` ("Tiếp tục" CTA) into `i18n.ts`
- **LevelUpCelebrationModal — hardcoded palette**: the rank-up celebration's CTA and star chip were hardcoded to the default green/gold, ignoring the user's selected accent color; now sourced from `useTheme()`
- **Performance**: memoized `ProfileScreen`'s trophy-status computation (previously recomputed 10 achievement checks and re-rendered 3 badge SVGs on every unrelated re-render); capped `useChallengeHistory`'s query at 50 rows (previously unbounded)
- **CreateChallengeScreen — photo picker consistency**: the before-photo control was a text-only "📷 Add photo" link; now reuses the same `PhotoSlot` thumbnail component `ChallengeDetailScreen` uses for the same concept
- **CalendarScreen — bottom inset**: the month summary could sit under the Android nav bar on gesture-nav devices; now accounts for the safe-area bottom inset
- **ShareCard — text overflow**: tier name and percentile text could overflow the fixed-width card on long strings; added `numberOfLines`/`flexShrink` guards
- **Dead code**: removed `ChallengeDetailScreen`'s unused "done"/"failed" hero styles left over from an earlier redesign pass

## [1.2.0.0] - 2026-07-09

### Added
- **Linked-challenge completion thresholds**: `CreateChallengeScreen` now has a "Ngưỡng hoàn thành" section (shown once a habit is picked) to require a minimum logged duration and/or minimum log count per day before a linked challenge counts that day as done — previously any log on the linked habit counted, regardless of length
- **Linked-challenge "Ghi ngay" CTA**: `ChallengeDetailScreen` now shows a hint explaining which habit auto-completes the challenge (plus its threshold, if set) and a "Ghi ngay" button that opens the log sheet with that habit pre-filled and locked, so tapping it always logs against the right habit — previously the generic log button did nothing for linked challenges, which looked broken
- **Clock-rollback detection**: activity logs are now flagged if their timestamp is implausibly earlier than when they actually reached the server, and flagged logs are excluded from linked-challenge/streak completion — a best-effort anti-cheat net, not full prevention (see TODOS.md for the known gap)
- **Crash reporting**: first Sentry integration in the app — inactive until a DSN is configured, silently no-ops if init fails, and scrubs email/URL query strings before anything is sent

### Fixed
- **Sync payload leak**: a local-only anti-cheat column was being pushed to Supabase on every sync (would have broken sync for everyone); excluded from the sync payload
- **Account-deletion email in crash reports**: Sentry's automatic network breadcrumbs would have captured the plaintext email used to filter the account-deletion API call; request URLs are now stripped of query strings before capture

## [1.1.0.0] - 2026-07-04

### Added
- **Rank ladder extension**: added two new tiers (Final Boss, Ascended) on top of the existing 7-tier ladder, with bilingual (EN/VI) rank names, new mascot sound cues, share-card percentile support, and a matching migration (v13) for the `tiers` table
- **Trophy Shelf**: new achievements/badges screen reachable from Profile, with a Badge Detail sheet. Nine badges computed live from existing stats (best streak, total challenge days, weekly rank tier) via `src/lib/achievements.ts` — no separate reward economy, just a display of milestones already tracked. First-unlock date persisted in a new `achievement_unlocks` SQLite table (migration v11). Share badge reuses the existing `react-native-view-shot` + `expo-sharing` pattern
- **Test coverage**: regression tests for `resolveUserRow`'s account-dedup branching (OIDC sub match, legacy email migration, anonymous-row claim, new-user insert), for `deleteAccount`'s destructive delete completeness (asserts every per-user-id table is purged), and for `challengeStreak`
- **Challenge system**: shipped 7/21/30/66-day habit challenges with `ChallengeHub`, `CreateChallenge`, and `ChallengeDetail`, backed by new `challenges` and `challenge_log` SQLite tables plus a one-active-challenge partial unique index
- **Challenge share cards**: ChallengeDetail now renders an off-screen share template and exports it through the existing `react-native-view-shot` + `expo-sharing` flow, with optional before/after photos
- **Supabase auth sign-in logging**: new `007_log_auth_signins.sql` trigger writes auth sign-ins into remote `activity_log` as `LOGIN` rows and backfills the latest known sign-in per account when missing

### Fixed
- **Data integrity — legacy task type removal**: the migration that drops the seeded 'Exercise' task type now nulls out `activity_log.task_type_id` references first instead of hard-deleting the row out from under them, so historical log entries no longer silently vanish from top-activities/share-card views
- **ShareCard Pro-gating**: sharing achievement cards now checks a `useProStatus()` stub (currently always `false`) and shows a "coming soon" message instead of performing the real capture+share — closes a gap where the feature would have shipped fully unlocked ahead of the paywall/RevenueCat wiring
- **Android release build stability on Windows**: release bundling now keeps Gradle project parallelism off, avoiding corrupted Expo/React Native generated native metadata during `bundleRelease`
- **Challenge rollover**: active challenges now run rollover at app start, every midnight in `Asia/Ho_Chi_Minh`, and on foreground resume; account reset/delete also clears challenge rows
- **Challenge detail layout**: the mini-calendar now renders as a fixed 30-cell window, matching the shipped brief across short and long challenge durations
- **Accessibility — radio groups**: added `accessibilityRole="radiogroup"` to parent views wrapping language selector (SettingsScreen) and duration chips (BackfillSheet); screen readers now correctly announce grouped radio choices
- **Accessibility — i18n**: SignInScreen button, tagline, and hint text now use `t.*` keys (supports EN/VI); CalendarScreen day-of-week labels read from `t.calDow` (previously hardcoded `['M','T','W','T','F','S','S']`)
- **Animation cleanup**: `LevelUpCelebrationModal` burst `setTimeout` now stored in a ref and cleared on unmount/hide, preventing leaked timers when `reduceMotion` changes; `reduceMotion` added to effect deps. `OnboardingScreen` step-transition `Animated.parallel` now stopped on unmount
- **Contrast**: `ProfileScreen` sub-label, `ProgressScreen` empty-state text upgraded `C.muted → C.ink2` (WCAG AA)
- **Touch targets**: TodayScreen gear button `padding 6 → 11` (44pt); week-selector pill `paddingVertical 5 → 10`; BackfillSheet duration chips `paddingVertical 9 → 16` (48pt)
- **Color tokens**: `ShareCardModal` before/after picker border and label colors use `C.primary` / `C.muted` (removed hardcoded `#35D68B`); share CTA background uses `C.primary`; arrow/hint text `C.faint → C.muted`; `ActivityIndicator` uses `colors.white`; `BackfillSheet` CTA text uses `colors.white`
- **ShareCard**: removed `textTransform: 'uppercase'` from `habitSectionLabel` (matches app-wide section label convention)
- **PaywallScreen**: close button `accessibilityLabel` reads from `t.close` (was hardcoded `"Đóng"`)
- **Placeholder contrast**: `TodayScreen` and `OnboardingScreen` birth-year `TextInput` `placeholderTextColor` changed from `colors.faint` to `colors.muted`
- **Performance — RankScreen**: weekly reset countdown extracted into a memoized leaf component so its 1s tick no longer re-renders the leaderboard/history lists and mascot animation
- **Performance — News feed**: `UpdatesScreen` now renders via `FlatList` instead of `ScrollView`+`.map`, virtualizing what was an unbounded, ever-growing list
- **Anti-pattern — News feed**: replaced the colored side-stripe "unread" indicator with a dot next to the title, matching the existing unread-dot convention used elsewhere in the app
- **Theming — SignInScreen**: logo mark and loading spinner now use theme tokens (`colors.primary`/`primarySoft`/`starGold`/`primaryPress`) instead of hardcoded hex, so the sign-in screen now supports dark mode and the accent picker
- **Accessibility — TaskRow**: done/selected state now exposed via `accessibilityState` (`checked`/`selected`), not just a visual checkmark; edit-icon touch target enlarged to 44pt
- **Accessibility — ProgressScreen**: points chart now exposes a text summary (`accessibilityLabel`) of good/bad-habit totals for screen readers
- **Accessibility — ChallengeDayGrid**: day-cell state (done/freeze/reset) no longer conveyed by color alone — added ✓/🧊/✕ glyphs and a per-cell `accessibilityLabel`
- **Accessibility — SettingsScreen**: removed nested `TouchableOpacity` in reminder rows (ambiguous hit-testing); dark-mode and sound switches now carry `accessibilityLabel`
- **i18n — RankInfoSheet, PaywallScreen, ShareCardModal**: all remaining hardcoded Vietnamese strings (rank explainer copy, paywall plans/CTAs/fine print, Pro-feature share alert) now route through `t.*` translation keys
- **Layout — ProfileScreen**: wrapped in `SafeAreaView edges={['bottom']}`, matching the safe-area convention used by every other modal-stack screen

---

## [0.1.0.0] - 2026-06-26

### Added
- **Backfill check-in ("điểm danh bù")** — tap any empty day in the current week on the Calendar to log a missed activity; streak automatically reconnects. Up to 2 backfills/week, guarded by 6-layer eligibility check (future date, today, out-of-week, day already has activity, streak freeze, quota exceeded)
- **Full onboarding flow** — 2-step branded hero screen with benefit cards, language flag switcher, gender/birth-year setup form, and an animated rank mascot that breathes throughout
- **Interactive tutorial** — 6-step Coachmark walkthrough on first launch; text switches language live when the user changes settings mid-tutorial
- **Edit activity** — tap ✏️ on any task row in the Home screen to rename or change its default duration
- **Auto-translate custom activity names** — names entered in Vietnamese are automatically translated to English for storage via a Supabase Edge Function (Claude Haiku)
- **Honey accent color** — new amber/gold accent option in appearance settings; the picker auto-discovers new accents at runtime, so future colors require no code change
- **Calendar SVG badges** — flame icons mark streak milestones, star icons mark personal best days; animated entrance on calendar load
- **Accent color picker + Wordmark** component in Settings screen
- **Rank info sheet** — tap ❓ on the Rank screen to view the full 8-tier rank ladder
- Browser prototype UI kit for design review (`ui_kits/habi-app/`)

### Changed
- App renamed to **Habi** (was "Habit Ring") across all UI strings and email sender name
- **Typography** replaced Poppins with Be Vietnam Pro — full Vietnamese glyph coverage at every weight; mixed-metrics "random bolding" eliminated
- **Rank system simplified** — removed VND reward amounts; demotion floor removed so any inactive week demotes exactly 1 tier; 1-tier-per-week promotion cap preserved
- **Section labels** now sentence-case 12sp semiBold (removed uppercase eyebrow pattern that failed accessibility at 11pt)
- All interactive elements standardized to `TouchableOpacity` (Pressable replaced in 3 component files)
- Skill routing rules added to `CLAUDE.md` for gstack workflow automation (contributor tooling)

### Fixed
- **WCAG AA contrast** on 12+ screens: section labels, rank info text, coachmark body/skip/back buttons, stat sub-labels, calendar day-of-week labels
- **Accessibility**: `accessibilityRole`/`accessibilityLabel` on tutorial nav buttons, rank mascot, level-up dismiss, calendar nav arrows; `reduceMotion` gating on all looping animations; `accessibilityLiveRegion` on tutorial step changes
- Google Sign-In: set `persistSession: false` + `autoRefreshToken: false` to prevent DNS failure on startup; removed deprecated `androidClientId` from `GoogleSignin.configure()`; fixed DEVELOPER_ERROR (google-services.json OAuth client entry)
- Android build: NDK 27 Clang ICE workaround (`android.ndk.maxParallelBuildJobs=1`); Metro `EXPO_METRO_MAX_WORKERS=1` for Node 24 V8 JIT crash; duplicate Props symbol fix in react-native-screens CMakeLists
- DurationModal: keyboard occlusion and keystroke lag on Android
- Tutorial race condition: moved `useSafeAreaInsets` above Modal boundary in Coachmark
- i18n: Vietnamese template task names resolved correctly (Work/Study/Family/Relationship/Sports seeded in English now map to Vietnamese display); hardcoded `MAX` stat text in ProgressScreen translated
- Loading state on TodayScreen now uses dark background (no white flash)
- Touch targets: AccentPicker color swatches and Calendar month nav arrows now meet 44pt minimum
- **Backfill race condition** — quota/dayHasActivity/freeze guards now run inside `withExclusiveTransactionAsync`; concurrent double-taps can no longer bypass the weekly quota
- **Honey accent revert** — accent validator derives valid set from `Object.keys(ACCENTS)` at runtime; new accents no longer silently fall back to default
- **Translation timeout** — Edge Function catches `AbortError` and returns original name instead of HTTP 500
- **Task name display** — `resolveTaskDisplayName` unified to one shared util across all call sites; `?? name` fallback added against missing i18n keys
- PaywallScreen CTA disabled during subscription processing to prevent double-tap

### Removed
- Exercise template task (removed via v8 DB migration — replaced by Sports template)
- VND reward amounts from rank unlock events
