# TODOS

## Open

### Wire PaywallScreen into navigation
`src/screens/PaywallScreen.tsx` exists and is polished (TouchableOpacity, a11y labels, CTA guard) but is not registered in `RootNavigator.tsx`. Needs: register the screen in the auth stack, decide trigger condition (free-trial expiry? specific SKU?), wire `onSubscribe`/`onRestore`/`onClose` callbacks to a subscription hook.

---

## Completed

### Badge metallic upgrade, Trophy Rank locked-coin bug, Challenge Detail redesign, rules copy (2026-07-08)
Four image/plan-driven items. Feature: rebuilt `Badge.tsx` per "Badge Metallic Upgrade Implementation Plan.md" — new 9-stop `TIER_COINS` ramps, layered coin render (ambient shadow, 5-stop ring gradient, 8 baked luster lobes standing in for the mock's conic-gradient + soft-light blend, bevel, recessed disc, emblem double-shadow emboss, gloss/hotspot/rim-light); used the plan's Option B (plain `react-native-svg`) since `@shopify/react-native-skia` isn't a dependency and introducing it solely for this wasn't justified. Bug fix: the Trophy Shelf's locked rank badges ("Lên hạng Rizz", "Aura Farmer") rendering as flat plain circles instead of metallic coins — root cause was the old locked-state overlay (`rgba(233,236,238,0.72)` circle painted over the whole coin), which washed every tier's color into the same flat gray regardless of tier; fixed by desaturating the tier's own ramp in place instead of overlaying a flat wash. Verified this was the actual and complete root cause (not a data bug) by confirming on-device that a fully-ranked test account shows both rank badges correctly unlocked and metallic. UI redesign: `ChallengeDetailScreen` now shows a "Đang chạy" running pill, a "còn N ngày" remaining-days pill, "Nhật ký N ngày"/"Before · After" section labels, and 🔥/🛟 stat icons; `ChallengeDayGrid`'s today-cell is now an outlined cell with 🔥, and reset/missed days show 💔 on a solid `danger` cell. Copy: `CHALLENGE_RULE_COPY` rewritten to match the reference rules card exactly. Self-review caught and fixed one real bug: the new "Nhật ký N ngày" label used `challenge.targetDays`, which would misreport "100 ngày" for a 100-day challenge even though the log grid always shows a fixed 30-cell sliding window — now uses `min(targetDays, GRID_CELL_COUNT)`. `tsc` clean, `jest` 216/216 green, all changes visually verified on the Android emulator including creating a live challenge.

**Flagging, not fixing (out of scope — belongs to the in-flight daily-reminder-toggle work from a different session):** creating a challenge with "Nhắc nhở hàng ngày" enabled throws an uncaught `Requiring unknown module` error from `expo-notifications/build/index.js` (Metro async-require failure on the dynamic `await import('expo-notifications')` in `scheduleChallengeReminder`). The challenge still gets created despite the red error screen. `useChallenge.ts`'s create/restart mutations call `scheduleChallengeReminder` unguarded (not inside the try/catch that wraps the DB insert) — the "Completed" entry below for 2026-07-08 (chip clipping pass) says this was already wrapped in try/catch, but the current working tree does not have that guard at either call site (`useChallenge.ts:499`, `:549`). Worth a follow-up pass.

### UI/UX fixes — chip clipping, task row alignment, challenge notification toggle, rank renames (2026-07-08)
Four user-reported/requested items. Text clipping: `AddActivitySheet`'s suggestion chips (e.g. "Học ngoại ngữ") had no `lineHeight` on `chipName`, clipping Vietnamese diacritics on some devices (reported on Xiaomi 14T); added `lineHeight: 18` matching `Typography.secondary`. Same root cause found in `TaskRow`'s name/meta text (reported as "scattered" icon alignment on Home) — added matching `lineHeight` there too; confirmed via emulator screenshot comparison against the reference (emulator's own font profile didn't reproduce the bug, but the missing-lineHeight pattern matched the confirmed chip bug exactly). Feature: added a "Nhắc nhở hàng ngày" daily-reminder toggle to `CreateChallengeScreen` (default on), backed by new `challenges.notifications_enabled`/`notification_id` columns (migration v14) and `scheduleChallengeReminder`/`cancelChallengeReminder` helpers in `utils/notifications.ts`; wired into create (schedule), delete (cancel), and restart (carry forward + reschedule). Localization: renamed all 7 base-ladder rank display names/quotes in `ranks.config.ts` + `i18n.ts` per user-supplied copy (English internal keys used for animation/audio lookups untouched). Self-review caught one real bug: notification-scheduling failures were unguarded and would have failed the whole create/restart mutation after the DB write already succeeded — wrapped in try/catch so scheduling is best-effort. `tsc` clean, `jest` 216/216 green, all four changes visually verified on the Android emulator.

### UI/content fixes — News duplicate title, rank rules copy, Trophy preview removal (2026-07-08)
User-reported polish pass on three screens: `UpdatesScreen` (News) rendered its "Có gì mới" title twice — once in the native nav header, once as an in-page heading — removed the redundant in-page title. `CHALLENGE_RULE_COPY.vi` rewritten for cleaner grammar (dropped an awkward arrow glyph and imprecise freeze-consumption phrasing). Removed the Trophy preview card/link from `RankScreen` since Trophy Shelf is already reachable from `ProfileScreen`; cleaned up the now-dead hooks (`useAllTimeStats`, `useChallengeDaysTotal`), components (`Badge`), and styles that only that section used. Review board (4 parallel specialist agents) found no P0/P1s; fixed the one trivial P2 (mark-all-read button now exposes `accessibilityState={{ disabled }}`). `tsc` clean, `jest` 216/216 green, visually verified on the Android emulator.

### Ship pre-landing review fixes (2026-07-04)
Data-migration specialist review of the full `feature/paywall-screen` diff found two real gaps: v8's `DELETE FROM task_types WHERE name = 'Exercise'` orphaned `activity_log` rows referencing it instead of clearing them first (fixed — nulls `task_type_id` before the delete), and ShareCard's share flow shipped with no Pro-gating despite the sharecard plan's own CEO review deciding a `useProStatus()` stub was required before ship (fixed — added the stub, gated `handleShare` behind it with a "coming soon" message). Also added regression test coverage for `resolveUserRow` (account dedup branching), `deleteAccount`/`resetProgress` (destructive-delete table completeness), and `challengeStreak`. `tsc` clean, `jest` 212/212 green at the time of these fixes.

### Impeccable audit + QA pass (2026-07-04)
Ran a full `/impeccable audit all` across all 16 screens and ~19 components (3 parallel sub-audits: a11y/theming, performance/responsive, anti-patterns/consistency). Score 15/20 (Good), no P0s, 11 P1s — all fixed: RankScreen countdown re-render churn, unbounded/unvirtualized news feed, News side-stripe anti-pattern, SignInScreen hardcoded/non-dark-mode logo, TaskRow/ProgressScreen/ChallengeDayGrid state-exposure a11y gaps, and remaining hardcoded-Vietnamese copy in RankInfoSheet/PaywallScreen/ShareCardModal. Plus quick P2 wins (touch targets, ProfileScreen safe-area). Verified live on the Android emulator (debug build); no regressions. Backlog for next pass: shared Button/BottomSheet primitive (root cause of modal-vocabulary and CTA-shape drift), `Opacity.disabled` token, off-brand confetti palette, dead files (`SubActivitySheet.tsx`, orphaned `Wordmark`). Full reports: `habit-tracker/.audit/impeccable-audit-2026-07-04.md`, `habit-tracker/.audit/qa-report-2026-07-04.md`.

### Trophy Shelf & Badge Detail (2026-07-04)
Shipped the achievements/badges feature from `Trophy Shelf Implementation Plan.md`, adapted to real app conventions rather than the plan's hypothetical stack (no shared `Chip`/`Card`/`Button` components, no `@gorhom/bottom-sheet`, no `useUserStats`/zustand store existed — these were verified absent and substituted with the app's actual per-screen `StyleSheet`/`useScreenCommons` pattern, plain RN `Modal`, and TanStack Query hooks). Nine badges (`src/config/achievements.ts`) compute earned/progress live from `useAllTimeStats`, `useRankData`, and a new `useChallengeDaysTotal` query — no persisted "earned" state, only the first-unlock date (new `achievement_unlocks` table, migration v11, written lazily on Trophy Shelf mount). New `TrophyShelfScreen` (grid + filters + counter) registered as a modal route, linked from a new row on `ProfileScreen`; `BadgeDetailModal` shows tier, description, earned date, and a share-badge button (reuses the existing `captureRef` + `expo-sharing` pattern). Deferred as follow-up, out of scope for this pass: confetti-style unlock celebration (would need hooking into every stat-mutating call site) and a dedicated branded share-card image (currently shares the badge view itself). `tsc` clean, `jest` 207/207 green, visually verified on the Android emulator (locked/earned/filter states).

**Note:** implementation coincided with another concurrent agent session actively shipping an unrelated challenge-rewards/news-feed feature on the same branch, which briefly rewrote this feature's `useAchievements.ts` to depend on that session's in-flight `achievements`/`challenge_days` tables before that dependency was reverted back to this feature's own self-contained `achievement_unlocks`/`challenge_log` tables. Flagged to the user; see conversation for detail.

### Supabase auth sign-in logging + Android release build hardening (2026-07-04)
Shipped `supabase/migrations/007_log_auth_signins.sql` to mirror Supabase Auth sign-ins into remote `activity_log` as `LOGIN` rows, including a one-pass backfill for users missing their latest sign-in row. Android release bundling on Windows now keeps Gradle project parallelism off by default, and `habit-tracker/AGENTS.md` records the cache-corruption fixes for Expo/React Native native build artifacts during `bundleRelease`.

### Challenge feature — 7/21/30/66-day habit challenges (2026-07-04)
Shipped end-to-end: new `challenges` + `challenge_log` SQLite tables (migration v10, partial unique index enforces one active challenge), pure logic in `src/lib/challenge.ts` (ICT-pinned date math, progress/restart/rollover), TanStack Query hooks in `useChallenge.ts`, app-level midnight + foreground rollover trigger in `App.tsx`, challenge cleanup in account reset/delete flows, and ChallengeHub/CreateChallenge/ChallengeDetail screens reachable from the Today entry card. Share uses the existing `react-native-view-shot` + `expo-sharing` path, and the detail screen now uses a fixed 30-cell mini-calendar window. Visual verification passed on Android emulator in both VI and EN for Home entry, Hub, Create, Detail, and Settings language rows. `tsc` clean, `jest` 187/187 green.

### Design review + impeccable audit fixes (2026-07-03)
Emulator-based design review (hero rank chip cryptic "—" for no-rank state → reuses
`t.noRankTitle`) + code-level impeccable audit (ProgressScreen segment shadow duplicated
`Shadows.light` instead of using the token; SubActivitySheet/SuggestActivitySheet chips
and buttons missing `accessibilityRole`, SubActivitySheet still on the pre-fix tinted
backdrop `rgba(8,16,11,0.45)`; AddActivitySheet open/close transition was the one custom
`Animated` sheet in the app not gated on `useReduceMotion`). Commits: `6b7f165`, `8fe3022`,
`8975886`, `7f8d9fe`.

### Accessibility & i18n audit fixes (v1.0.49, 2026-07-02)
15-finding adversarial audit pass: radio group roles, animation cleanup (LevelUpCelebrationModal timeout ref, OnboardingScreen anim stop), contrast upgrades, touch target enlargements, ShareCardModal color token migration, i18n keys for SignIn + CalDOW, placeholder contrast fixes.

### Backfill check-in system (điểm danh bù)
Shipped in v0.1.0.0 (2026-06-25). Pure function guardrails, DB write layer, Calendar UI with BackfillSheet, streak recompute chain.

### Habi rebrand + Be Vietnam Pro typography
Shipped in v0.1.0.0 (2026-06-25). Full Vietnamese glyph coverage, mixed-metrics "random bolding" eliminated.

### WCAG AA accessibility pass
Shipped in v0.1.0.0 (2026-06-25). 12+ screens — contrast, roles, labels, reduceMotion gating.

### Rank system simplification
Shipped in v0.1.0.0 (2026-06-25). Removed VND rewards, demotion floor; 1-tier-per-week cap preserved.
