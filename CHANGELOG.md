# Changelog

All notable changes to this project are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)

## [Unreleased]

### Added
- **Trophy coin — metallic upgrade**: `Badge.tsx` rebuilt with a layered coin render (ambient shadow, 5-stop ring gradient, baked 8-lobe luster, bevel edge, recessed disc, emblem emboss, gloss/hotspot/rim-light) per the updated `TIER_COINS` 9-stop ramps in `badgeTiers.ts`; plain `react-native-svg` (no new Skia dependency, since none was already in use)
- **Challenge Detail — redesigned layout**: added a "Đang chạy" running-status pill next to the title, a "còn N ngày" remaining-days pill under the progress ring, "Nhật ký N ngày" / "Before · After" section labels, and 🔥/🛟 icons on the streak/freeze stat cards
- **Challenge creation — daily reminder toggle**: `CreateChallengeScreen` now has a "Nhắc nhở hàng ngày" switch (default on) that schedules a local daily notification for the new challenge via `expo-notifications`; the notification is cancelled on delete and the preference/notification carry forward on restart. New `challenges.notifications_enabled`/`notification_id` columns (migration v14)

### Changed
- **Rank names**: relabeled all 7 base-ladder tiers' Vietnamese display names and quotes (e.g. Delulu → "Nhứt", GOATED → "Vượt Mức Pickleball") in `ranks.config.ts`/`i18n.ts`; the English internal keys used for animation/audio lookups are unchanged
- **Challenge day grid**: the "today" cell is now an outlined (not filled) cell with a 🔥 icon, and a missed/reset day now shows 💔 on a solid `danger` cell instead of a plain ✕ on a soft tint, matching the rest of the log grid's iconography

### Fixed
- **News screen — duplicate title**: `UpdatesScreen` rendered the same "Có gì mới"/"What's New" title twice (once in the native nav header, once as an in-page heading); removed the redundant in-page title, keeping the unread-count subtitle and mark-all-read button
- **Trophy Shelf — locked badges rendering as flat gray circles**: the old locked-state overlay was a large near-opaque circle painted over the whole coin, washing out every tier's metal color into the same flat gray disc regardless of tier (most visible on the "Rank" filter's locked badges). Locked coins now render the tier's own ramp desaturated in place, so the metal color still reads through
- **Rank screen — challenge rules copy**: rewrote the `CHALLENGE_RULE_COPY` string (VI/EN) to "Làm liên tục mỗi ngày. Lỡ 1 ngày = reset. Bạn có N phao cứu (freeze/bù)." — shorter, matches the in-app rules card mock, and reads correctly against the existing streak/freeze logic (a missed day only resets the challenge once freezes run out)
- **Rank screen — Trophy preview removed**: dropped the Trophy preview card/link from `RankScreen` (redundant with the dedicated Trophy Shelf entry already on `ProfileScreen`), along with its now-unused data hooks, styles, and imports
- **Accessibility — News mark-all-read button**: now exposes `accessibilityState={{ disabled }}` so screen readers correctly announce the button as inactive when there are no unread items
- **Text clipping — Add Activity suggestion chips**: `chipName` text (e.g. "Học ngoại ngữ") had no explicit `lineHeight`, causing Vietnamese diacritics to clip on some devices (reported on Xiaomi 14T); added `lineHeight: 18` matching the app's `Typography.secondary` convention
- **Home screen — task row icon alignment**: `TaskRow` name/meta text lacked explicit `lineHeight`, causing inconsistent row heights and icon placement on devices with different font-scaling behavior; added `lineHeight` to match `Typography` conventions

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
