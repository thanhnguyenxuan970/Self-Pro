# User Simulation Report — Habit Tracker
**Date:** 2026-06-03 | **Agents:** 12 | **Persona:** High-discipline, 1% better/day

---

## The 12 Agents

| # | Name | Age | Profession | Daily Habit Pattern |
|---|------|-----|------------|---------------------|
| 1 | Minh | 24 | Software Engineer | Deep work (2h), exercise (45m), reading (30m) |
| 2 | Linh | 27 | UX Designer | Journaling (30m), meditation (20m), design sprints (90m) |
| 3 | Tuấn | 32 | Startup Founder | Logs between meetings, 4–5 tasks, time-starved |
| 4 | Mai | 22 | Medical Student | Study blocks (90m×3), exercise (30m), sleep tracking |
| 5 | Hưng | 29 | Personal Trainer | 6–8 logs/day: training, nutrition, client prep, sleep |
| 6 | Thảo | 23 | Content Creator | Filming (90m), editing (2h), idea journaling (20m) |
| 7 | Khoa | 34 | Product Manager | Morning/evening batch logs, heavy analytics user |
| 8 | Phương | 30 | Lawyer | Precise fixed-time logging, reliability-critical |
| 9 | Dũng | 26 | Data Scientist | Power user — all analytics features, pattern analysis |
| 10 | Hà | 21 | Athlete / Student | 2×/day training (60m each), study (120m), 9 logs/day |
| 11 | Nam | 31 | Freelance Dev | Night owl, irregular schedule, rigid personal habits |
| 12 | Thu | 25 | Wellness Coach | 10+ micro-habits/day, obsessive about detail/tracking |

---

## Simulated Daily Usage

### Agent 1 — Minh (Software Engineer)
**Morning routine:** Opens app at 6:30 AM. Logs "Đọc sách" (non-timed, single tap). Immediately long-presses LogActivitySheet to find "Deep Work" — opens timed task flow. Selects 120min chip (escape hatch → text input `120`). Logs.

**Friction found:**
- Types `120` every single day. No chip for 120min despite it being his most common duration.
- Accidentally taps "Đọc sách" twice (non-timed, no confirmation). Gets 2 log entries. Can't undo — has to bulk-delete.

---

### Agent 2 — Linh (UX Designer)
**Pattern:** Journals about her app experience daily. Logs meditation (20m chip = not available, closest is 30m). Always uses 30m chip but her actual session is 20m.

**Friction found:**
- Default chips [30, 60, 90] don't match her 20m meditation. After 30 days the system still shows [30, 60, 90] because `getChipPresets` ranks frequency+recency — but she always selects escape-hatch → types `20`. The text input route never registers as a "chip press" so frequency algo never learns her real preference.
- Wants to navigate to last week's analytics to compare progress. ProgressScreen only shows current period — no back arrow.

---

### Agent 3 — Tuấn (Startup Founder)
**Pattern:** Logs 4 tasks in a 2-min window between meetings. Speed is everything.

**Friction found:**
- LogActivitySheet scrolls through all tasks. No search/filter. With 15 task types created, he has to scroll past irrelevant ones every time.
- Accidentally taps wrong task while scrolling quickly. Non-timed task logs instantly. No undo.
- 5-star rank gate: brand new week, stars reset → "Chưa có rank" appears on RankScreen. Feels punishing after weeks of progress.

---

### Agent 4 — Mai (Medical Student)
**Pattern:** 3 deep study blocks per day. Each exactly 90min. Uses DurationChips heavily.

**Friction found:**
- **BUG:** After logging her third 90min block, `computeStars(90)` = 3★. But `treat_stars` balance shown in FundScreen includes all lifetime stars — she has no intuitive way to know how many she earned **today** vs total. No "today's earnings" display.
- Notification set to 22:00 for sleep reminder. But only 1 notification slot — can't set a 6:00 AM wake reminder too.

---

### Agent 5 — Hưng (Personal Trainer)
**Pattern:** 8 logs per day. Heavy user. Power-logs throughout day.

**Friction found:**
- After logging 8 tasks, ProfileScreen history shows only last 30 entries (`useRecentActivityLogs(userId, 30)`). With 8 logs/day, he can only see 3.7 days of history. Wants at least 60.
- No way to categorize tasks (categories removed in Day 23). He has 8 different habit types and they all appear flat in one unsorted list on TodayScreen.
- **BUG:** `streak_count` survives session via DB but doesn't survive device reinstall / new phone. He upgraded his phone in week 3 — streak reset to 1 despite 22-day streak.

---

### Agent 6 — Thảo (Content Creator)
**Pattern:** Irregular schedule, but logs the same 3 habits every day.

**Friction found:**
- "Log same as yesterday" doesn't exist. She taps the same 3 tasks every morning manually. After 30 days this is still 3 taps minimum, no shortcut.
- Dark mode toggle in Settings → requires restart. She switched language from VN to EN — some UI immediately updated (tab labels) but some screens still showed Vietnamese (Onboarding strings cached in component state). Felt broken.
- **BUG (Language partial update):** `SettingsContext` updates `lang` reactively, but `Stack.Screen options` objects in `AppStack` that don't re-evaluate via function-form stay stale until full re-mount. Modal header titles don't update on language change — they use the `options` static object pattern.

---

### Agent 7 — Khoa (Product Manager)
**Pattern:** Heavy ProgressScreen user. Analyzes weekly performance.

**Friction found:**
- Can't navigate to previous week in ProgressScreen. Only current period. Wants to compare "this week vs last week" — core PM habit.
- No export or share option for progress data.
- RankScreen shows tier descriptions but no "N stars to next tier" progress bar on hero card. He has to manually calculate from tier thresholds.

---

### Agent 8 — Phương (Lawyer)
**Pattern:** Logs precisely at 7:00, 12:30, 20:00. Values time-stamped accuracy.

**Friction found:**
- **BUG:** If she logs a task at 23:58 and one at 00:02, both should count toward separate days. `useTodayLoggedTaskIds` uses device date — but `daily_summary` uses SQLite `date('now')` which is UTC by default on some Android setups. Tasks logged at 23:58 local (+7 = 16:58 UTC) might land on different SQL date than device date.
- No confirmation before non-timed task logs. Strict person → accidental single-tap logs feel like data corruption.

---

### Agent 9 — Dũng (Data Scientist)
**Pattern:** Studies his own data obsessively. Uses every analytics feature.

**Friction found:**
- ProgressScreen "Ngày/Tuần/Tháng/Năm" — no way to access historical data beyond current period. For someone doing longitudinal self-analysis this is the #1 missing feature.
- `treat_stars` shown as "Tuần này" in ProfileScreen. He reads the label literally — thinks it's weekly stars. Discovers it's lifetime when he checks FundScreen. Label is misleading.
- **BUG (Cosmetic/Data):** `streak_count` column in DB is set on INSERT and never updated per-session. He noticed that after logging a task on day 22 of a streak, the log entry shows `streak_count=22` — correct. But after a 1-day miss and return, new log shows `streak_count=1`. The streak is never "healed" or "shown as broken then restarted" — it silently resets. No notification or acknowledgment.

---

### Agent 10 — Hà (Athlete / Student)
**Pattern:** 2-a-day training + 2 study blocks. 9 logs/day. Fast, efficient.

**Friction found:**
- TodayScreen task list is in creation order. Her most-used tasks are buried at the bottom (added later). Has to scroll every time.
- **BUG:** `getChipPresets` uses frequency+recency ranking. With 9 logs/day she's the power user it was designed for. But after analyzing: the query counts `activity_log` rows by `duration_min` to find top 3. If she logs both 60m and 90m across different task types, the presets aggregate across ALL tasks for a given user+task combo. **Expected:** per task-type chip personalization. **Actual:** Works correctly per `(userId, taskTypeId)`. No bug. Just confirmed working.
- But: "2h+" escape hatch button is labeled "2h+" — she routinely logs 75min and 80min. These don't fit [30,60,90] or "2h+" label intuitively.

---

### Agent 11 — Nam (Freelance Developer)
**Pattern:** Logs at 11 PM, 1 AM, 2 AM. Night owl rhythm.

**Friction found:**
- **BUG (Timezone/Date boundary):** SQLite `date('now')` returns UTC. At 1 AM Vietnam time (UTC+7 = 6 PM previous UTC day), `date('now')` returns yesterday's date. `useTodayLoggedTaskIds` uses JS `new Date().toISOString().slice(0,10)` (device local date). Both should return same date at 1 AM local, but if SQLite is UTC and JS is local, daily query and `today_date` column in `activity_log` diverge after midnight UTC (7 PM Vietnam time onward). His logs at 8 PM - 11 PM local land in correct JS date but wrong SQLite `date('now')` partition.
- Notification at 22:00 fires when he's in the middle of a coding session. Can't customize per-day or snooze.

---

### Agent 12 — Thu (Wellness Coach)
**Pattern:** 10 micro-habits. Obsessive tracker. Uses FundScreen/TreatsScreen daily.

**Friction found:**
- No treat ETA. She earned 847★ lifetime. Her top treat costs 1000★. She can't see "at current pace, X more days." Has to do mental math.
- **BUG:** `canEnjoyTreat` checks `user.treat_stars >= treat.cost`. The "Enjoy" button shows based on this. But if she double-taps the Enjoy button before `enjoyingRef` guard kicks in, and the first mutation is mid-flight, a second `mutate()` call is queued (not blocked) because `enjoyingRef.current = true` is set in the handler synchronously — but TanStack `mutate` is async. If `enjoy` fires twice before the first `onSuccess` runs, `enjoyingRef` catches the second tap correctly since it's set synchronously. **Actually fine** — `enjoyingRef` is a sync ref, second tap sees `true`. No actual double-spend bug. Confirmed safe.
- BUT: No optimistic UI on treat enjoy. She taps Enjoy, gets an Alert confirm, taps OK — then 300-500ms of nothing before star balance updates. Feels laggy.

---

## Consolidated Report

---

### BUGS / ERRORS

#### B1 — SQLite UTC vs Device Local Timezone Mismatch (SEVERITY: HIGH)
**Affected agents:** 8 (Phương), 11 (Nam)
**Symptom:** `date('now')` in SQLite is UTC. JS `new Date().toISOString().slice(0,10)` uses local device date. For users in UTC+7 (Vietnam), all logs made between 00:00–06:59 local time land in SQLite on the "previous day" by UTC reckoning. `useTodayLoggedTaskIds` and `daily_summary` partitions diverge.
**Affected code:** All raw SQL queries using `date('now')` — `src/queries/useTasks.ts`, `src/db/queries/progress.ts`
**Fix:** Replace `date('now')` with `date('now', 'localtime')` in all SQLite queries. One-line change across ~8 query locations.

#### B2 — Streak Lost on Device Reinstall / New Phone (SEVERITY: HIGH)
**Affected agents:** 5 (Hưng)
**Symptom:** `streak_count` is set on INSERT in `activity_log`, never synced to Supabase (sync only covers `activity_log` rows, not computed streak state). New device = new DB = streak_count starts at 1.
**Affected code:** `src/services/syncService.ts` — `syncActivity` upserts rows but streak is recomputed from scratch on new device.
**Fix:** Include `streak_count` in Supabase `activity_log` sync payload. Already present in the row spread — just needs to not be excluded.

#### B3 — DurationChip Text Input Duration Never Learns User Preference (SEVERITY: MEDIUM)
**Affected agents:** 2 (Linh), 10 (Hà)
**Symptom:** `getChipPresets` ranks chip values by frequency of chip-press events recorded in `activity_log.duration_min`. But when user uses the text-input escape hatch (e.g. types `20` or `75`), the duration IS logged correctly — however these values never surface as chips because `getChipPresets` SQL groups by `duration_min` across all entries. The algorithm should work, but users who exclusively use text input (never tap a chip) never get personalized chips.
**Root cause:** The chip preset query works correctly for values that were ever tapped as chips. The bug is UX: users who always type their duration never see personalized chips, but the algorithm would personalize correctly if they used chips. Gap: no chip option for common non-standard durations (20m, 45m, 75m).
**Fix:** Add 45m to default fallback chips `[30, 45, 60, 90]`. Consider adding one custom chip slot per task type.

#### B4 — `streak_count` Never Shown as Broken/Reset to User (SEVERITY: MEDIUM)
**Affected agents:** 9 (Dũng)
**Symptom:** When streak breaks (missed day), next log silently writes `streak_count=1`. No UI acknowledgment. Disciplined users rely on streak visibility as core motivation — a silent reset is demoralizing and confusing.
**Fix:** On TodayScreen, show streak count on hero card. When new log has `streak_count=1` and previous was `>1`, trigger a "streak reset" toast/notification.

#### B5 — `treat_stars` Labeled "Tuần này" (SEVERITY: LOW — Cosmetic/Data Confusion)
**Affected agents:** 9 (Dũng), 12 (Thu)
**Symptom:** ProfileScreen shows `treat_stars` (lifetime accumulated) under label "Tuần này" (This Week). Documented as "cosmetic per user spec" but misleads systematic users into thinking this is a weekly figure.
**Affected code:** `src/screens/ProfileScreen.tsx` — stat label.
**Fix:** Rename label to "Kho Sao" (Star Vault) or "Tổng Sao" (Total Stars) to match what the value actually represents.

#### B6 — Language Change Doesn't Update Modal Header Titles Live (SEVERITY: LOW)
**Affected agents:** 6 (Thảo)
**Symptom:** `AppStack` `Stack.Screen` options use static object `options={{ headerTitle: t.screenProfile }}`. After language switch in SettingsContext, `t` changes — but if the screen is already mounted, React Navigation holds the old options object. Headers stay in old language until stack re-mounts.
**Affected code:** `src/navigation/RootNavigator.tsx` — `AppStack` Stack.Screen options.
**Fix:** Change `options={{ headerTitle: t.screenProfile }}` to `options={() => ({ headerTitle: t.screenProfile })}` (function form) so React Navigation re-evaluates on each render.

---

### CONFLICTS / UX FRICTION

#### UX1 — No Non-Timed Task Confirmation (CRITICAL for discipline-first users)
**Affected agents:** 1 (Minh), 3 (Tuấn), 8 (Phương)
**Problem:** Non-timed tasks log on single tap in LogActivitySheet. Accidental taps create unwanted log entries. Only recovery is long-press → bulk delete flow (3+ steps).
**Recommendation:** Add 500ms haptic + brief visual confirmation state ("✓ Đã ghi!") before committing non-timed log. Or: add swipe-to-undo on the TodayScreen task row within 10 seconds.

#### UX2 — No Historical Period Navigation in ProgressScreen
**Affected agents:** 2 (Linh), 7 (Khoa), 9 (Dũng)
**Problem:** ProgressScreen segmented control (Ngày/Tuần/Tháng/Năm) always shows **current** period. Can't navigate to previous week/month. Core feature for disciplined reviewers doing weekly retrospectives.
**Recommendation:** Add `<` `>` navigation arrows beside the segmented control. Tap back to view previous period. Keep current period as default.

#### UX3 — Task List Has No Ordering / Prioritization
**Affected agents:** 3 (Tuấn), 5 (Hưng), 10 (Hà)
**Problem:** TodayScreen task list is in creation order. Power users with 8–15 tasks scroll past rarely-used tasks every session. No way to pin favorites or reorder.
**Recommendation:** Long-press to enter reorder mode (drag handles). Persist order per user in DB. Quick win: sort incomplete tasks above completed ones automatically.

#### UX4 — Single Notification Slot Insufficient for Multi-Habit Routines
**Affected agents:** 4 (Mai), 11 (Nam)
**Problem:** SettingsScreen allows only one notification time. Multi-habit users have morning, midday, and evening habit clusters.
**Recommendation:** Allow up to 3 notification time slots with optional labels (e.g. "Sáng", "Chiều", "Tối").

#### UX5 — No Streak Visibility on Hero Card
**Affected agents:** 5 (Hưng), 6 (Thảo), 12 (Thu)
**Problem:** `streak_count` exists in DB and is correctly computed on each INSERT, but is never surfaced in the UI. Streaks are the #1 motivational primitive for disciplined habit trackers.
**Recommendation:** Add current streak to TodayScreen hero card alongside stars/rank. Example: `🔥 22 ngày | ⭐ 145★`.

#### UX6 — No "Repeat Yesterday" / Quick-Relog Feature
**Affected agents:** 6 (Thảo), 11 (Nam)
**Problem:** Disciplined users log the same tasks daily. No shortcut exists. Each session requires tapping the same 3–5 tasks through LogActivitySheet.
**Recommendation:** "Lặp lại hôm qua" button on TodayScreen (or in LogActivitySheet) that pre-fills yesterday's tasks for one-tap confirm.

#### UX7 — No Progress-to-Next-Tier on RankScreen Hero
**Affected agents:** 3 (Tuấn), 7 (Khoa)
**Problem:** Hero card shows current rank but no progress bar toward next tier. User must mentally calculate `current_stars - tier_threshold`. GOATED tier is 320★ — users don't know their distance.
**Recommendation:** Add a thin progress bar below rank badge: `[████░░] 145/200★ → Sigma`. Already have `STAR_POINTS` thresholds in `ranks.config.ts`.

#### UX8 — History Feed Capped at 30 Entries
**Affected agents:** 5 (Hưng), 9 (Dũng)
**Problem:** `useRecentActivityLogs(userId, 30)` is hardcoded. Power users logging 8–10 habits/day exhaust 30 entries in 3–4 days. ProfileScreen history becomes useless for weekly review.
**Recommendation:** Implement pagination or "Load more" button. Or increase default to 100. Query is cheap (indexed by `user_id + logged_at`).

#### UX9 — No Treat Star ETA
**Affected agents:** 12 (Thu)
**Problem:** FundScreen shows treat progress bars but no forecast. Disciplined users planning their reward schedule need "X more days at current pace."
**Recommendation:** Compute `avg_daily_treat_stars` from last 7 days of activity. Show "~N ngày nữa" below each treat progress bar. Pure read-only derivation, no schema change.

#### UX10 — Dark Mode Requires Restart
**Affected agents:** 6 (Thảo)
**Problem:** `useDarkMode` toggle updates `SettingsContext` state and AsyncStorage but the actual theme (if connected to styles) doesn't re-render because style objects are created at module load time. Documented as "acceptable MVP" but breaks trust for new users exploring settings.
**Recommendation:** Move all color constants through a `useTheme()` hook that reads from `SettingsContext`. Higher effort but proper solution. Short-term: Add "(yêu cầu khởi động lại)" note clearly visible near the toggle.

---

### IMPROVEMENTS

#### I1 — Streak Display + Streak Recovery Notification
Streak is the single highest-ROI motivational feature not yet surfaced. Show `🔥 N ngày` on hero card. Send push notification when streak breaks ("Chuỗi của bạn đã kết thúc. Ngày mới, bắt đầu lại!"). Use `expo-notifications` (already in codebase).

#### I2 — ProgressScreen Period Navigation
Back/forward arrows for Ngày/Tuần/Tháng/Năm views. State: `{ mode: 'week', offset: -1 }` where offset 0 = current, -1 = previous. Query already fetches by date range — just parameterize the range start.

#### I3 — Task Reorder + Auto-sort Incomplete-First
Drag-to-reorder with `react-native-draggable-flatlist` (or manual long-press + up/down arrows for simpler implementation). Store `sort_order` per task_type row. Auto-sort: incomplete tasks float to top — zero DB change, pure FlatList `data` sort in component.

#### I4 — "Lặp lại hôm qua" Quick-Relog
Query yesterday's logged `task_type_id` set. Render as a horizontal chip row at top of LogActivitySheet: "Hôm qua: [Exercise] [Deep Work] [Reading] → Lặp lại tất cả?". One-tap logs all with same durations. Massive friction reduction for consistent users.

#### I5 — Add 45m as Default Chip + Allow Custom Pin
Change fallback chips from `[30, 60, 90]` to `[30, 45, 60, 90]` (4 chips). Allow per-task "pin this duration" by long-pressing a chip. Pinned chips override frequency-based presets.

#### I6 — Treat Star ETA Forecast
`SELECT AVG(treat_stars_earned) FROM daily_summary WHERE user_id=? AND week_start >= date('now','-7 days')` gives 7-day avg. Display `Math.ceil((treat.cost - treat.accumulated_stars) / avg_daily)` as "~N ngày" below progress bar. Add `treat_stars_earned` to `daily_summary` if not present, or derive from `activity_log` sum.

#### I7 — Multiple Notification Slots (up to 3)
Schema: add `notif_time_2 TEXT`, `notif_time_3 TEXT` to users table (same pattern as `notif_time`). SettingsScreen: render 3 `TextInput` rows with +/- add/remove. Each slot schedules independently via `expo-notifications`.

#### I8 — Fix SQLite Timezone (`date('now')` → `date('now', 'localtime')`)
One-line fix, ~8 files. Prevents data partitioning bugs for all users in UTC+7. Search: `date('now')` in `src/db/` and `src/queries/`.

#### I9 — Rank Progress Bar on Hero Card
`ranks.config.ts` already has `STAR_POINTS` thresholds. In RankScreen, compute `starsToNext = nextTier.minStars - currentStars`. Render `<ProgressBar value={currentStars/nextTier.minStars}/>` with "N★ → [Next Tier Name]" label. Zero new data fetching.

#### I10 — Streak Sync to Supabase
Add `max_streak` and `current_streak` to the `users` row synced to Supabase. On new device sign-in, restore streak state from remote. Requires adding 2 columns to Supabase `users` table and syncing on each login + on each streak update.

#### I11 — History Pagination or Larger Default
Increase `useRecentActivityLogs(userId, 30)` default to `100`, or add `loadMore` pagination. Index on `(user_id, logged_at DESC)` already exists. No schema change.

#### I12 — Weekly Summary Push Notification
Every Monday morning: "Tuần mới! Bạn đã kiếm được N★ tuần trước. Mục tiêu tuần này?" — timed to fire after the weekly star reset. Builds anticipation for the reset and primes users to re-engage.

---

## Priority Matrix

| Priority | Item | Effort | Impact |
|----------|------|--------|--------|
| P0 | B1: Fix `date('now', 'localtime')` in SQLite | XS | High — data integrity |
| P0 | UX5 + I1: Streak on hero card | S | Very High — core motivation |
| P1 | UX2 + I2: ProgressScreen period navigation | M | High — weekly review |
| P1 | UX6 + I4: "Repeat yesterday" quick-log | M | High — daily friction |
| P1 | I9: Rank progress bar to next tier | S | High — progression clarity |
| P2 | UX1: Non-timed task confirmation / undo | S | Medium — accident prevention |
| P2 | UX3 + I3: Task reorder + incomplete-first sort | M | Medium — power users |
| P2 | I6: Treat ETA forecast | S | Medium — planning |
| P3 | B2 + I10: Streak sync to Supabase | M | Medium — device migration |
| P3 | UX4 + I7: Multiple notification slots | M | Medium — routine support |
| P3 | B5: Fix "Tuần này" label | XS | Low — data clarity |
| P3 | B6: Modal headers live language update | XS | Low — polish |
| P3 | UX8 + I11: History pagination | S | Medium — power users |

---

*Simulated by: 12 synthetic agents | App version: Day 21 build (2026-06-03) | All bugs traced to actual codebase*
