# Changelog

All notable changes to this project are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)

## [Unreleased] - 2026-08-03

### Added
- **Multiplier boost experience**: persisted streak-milestone grants now support deadline-aware claiming, active countdown state, and an expiry summary.

### Fixed
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
