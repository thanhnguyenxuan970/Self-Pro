# Habit Tracker — Manual Testing Checklist

> Generated: 2026-05-29 | Build: Day 8 complete | 66/66 tests pass | TSC: 0 errors

---

## How to Use

- `[ ]` = needs device  `✓` = pass  `✗` = fail (note details)
- `[AUTO]` = verified by static analysis or test suite — no device needed
- Run device tests on real Android (native modules: expo-sqlite, expo-notifications, react-native-svg)
- Reset app state between session groups: clear AsyncStorage + wipe DB (reinstall or clear app data)

---

## Auto-Verified Summary (2026-05-29)

| Check | Result | Evidence |
|---|---|---|
| Jest test suite | ✓ 66/66 pass | `npx jest` |
| TypeScript | ✓ 0 errors | `npx tsc --noEmit` |
| MeScreen.tsx deleted | ✓ absent | file not found |
| submittingRef guards both tap paths | ✓ | LogActivitySheet.tsx:28,59 |
| spendingRef guards handleSpend | ✓ | FundScreen.tsx:63,69 |
| No nested Modal in LogActivitySheet | ✓ single Modal | only outer Modal present |
| TOCTOU: volatile reads inside withTransactionAsync | ✓ | useToday.ts:88-114 |
| Notification-first: scheduleHabitReminder before DB write | ✓ | ProfileScreen.tsx:160→161 |
| ALTER TABLE catch narrowed to 'duplicate column' | ✓ | migrations.ts:113-114 |
| streak_freezes table uses CREATE TABLE IF NOT EXISTS | ✓ | migrations.ts:163 |
| INSERT OR IGNORE + r.changes guard for tier unlocks | ✓ | useToday.ts:194,200 |
| getDb singleton (_dbPromise) | ✓ | client.ts:4-13 |
| useSpendFund: balance read inside withTransactionAsync | ✓ | useFund.ts:168-174 |
| AppInner pattern (single NavigationContainer) | ✓ | App.tsx:23,93 |
| AsyncStorage keys consistent across files | ✓ | useAuth.ts, SignInScreen, ProfileScreen |
| ON CONFLICT DO UPDATE omits streak_count | ✓ | useToday.ts:171-172 |
| BAD kind guard on bonusRow (logTask.ts) | ✓ | logTask.ts:49,77 |
| STREAK_FREEZE_COST = 10_000 | ✓ | constants.ts:15 |
| categories queryKey `['categories', userId]` | ✓ | useToday.ts:222 |
| FAB: tabBarButton + tabPress preventDefault | ✓ | RootNavigator.tsx:73,76 |

---

## 1. Authentication Flow

### 1.1 First Launch
- `[AUTO]` `habit_tracker_onboarded` key defined as `ONBOARDED_KEY` in `useAuth.ts` — consistent
- `[AUTO]` `habit_tracker_display_name` written in `SignInScreen.tsx:65` before `onSignIn()`
- [ ] App shows SignInScreen (no MainTabs) on fresh install
- [ ] Email + password fields visible and focusable
- [ ] Display name field visible and accepts input
- [ ] Keyboard does not cover CTA button (scroll or KeyboardAvoidingView)
- [ ] Submit with empty fields → no crash, graceful behavior
- [ ] Submit with only email filled → no crash
- [ ] Submit with valid inputs → navigates to OnboardingScreen

### 1.2 Onboarding
- [ ] Category grid renders all TEMPLATE_CATEGORIES
- [ ] Tapping category toggles selection (visual feedback)
- [ ] Can select 0 categories → tapping Start seeds nothing (or shows warning)
- [ ] Can select all categories
- [ ] Start button seeds selected template tasks to DB
- [ ] After start → navigates to MainTabs (Home tab active)
- [ ] `habit_tracker_onboarded = 'true'` written to AsyncStorage
- [ ] **DEFERRED BUG**: force-quit mid-seed → partial tasks visible, retry creates duplicates (no UNIQUE guard). Verify: no crash at minimum

### 1.3 Return Launch
- [ ] App with `habit_tracker_onboarded = 'true'` → goes directly to MainTabs, not SignIn
- [ ] Display name loads from AsyncStorage on ProfileScreen

---

## 2. Today Screen (Home Tab)

### 2.1 Task List
- [ ] Tasks seeded from onboarding visible on Today tab
- [ ] Default Exercise task always visible
- [ ] Each task row shows name, category chip, kind badge (GOOD/BAD)
- [ ] Category filter chips render horizontally at top
- [ ] Tapping "All" chip shows all tasks
- [ ] Tapping a category chip filters list to that category only
- [ ] No tasks in a category → empty state (not crash)
- [ ] Chip scroll works when many categories present

### 2.2 Task Already Logged Today
- [ ] Logging a task marks it complete visually (checkmark / dim)
- [ ] Completed task still visible (not hidden)
- [ ] Tapping a completed task → no double-log or crash

### 2.3 Avatar Navigation
- [ ] Avatar in header tappable
- [ ] Tapping avatar opens ProfileScreen as modal
- [ ] Display name shown in avatar area (matches AsyncStorage value)
- [ ] Dismissing profile modal returns to Today

---

## 3. Log Activity Sheet (FAB)

### 3.1 Basic Flow
- `[AUTO]` FAB uses `tabBarButton` + `tabPress: e.preventDefault()` — no accidental screen nav
- [ ] Center FAB renders between Fund and Rank tabs
- [ ] Tapping FAB opens LogActivitySheet (bottom sheet modal)
- [ ] Task list in sheet matches available tasks
- [ ] Category filter chips work in sheet
- [ ] Selecting a GOOD task with no duration prompt → log button enabled
- [ ] Tapping log → success toast fires, sheet closes, Today list updates
- [ ] Toast appears during sheet slide-down animation (not after)

### 3.2 Duration Prompt
- `[AUTO]` LogActivitySheet has exactly 1 `Modal` (outer); duration sub-prompt is absolute-positioned `View` — no nested Modal
- [ ] Tasks requiring duration (`needsDurationPrompt=true`) show duration sub-prompt
- [ ] Duration input accepts numeric only
- [ ] Confirming duration → logs activity with duration, sheet closes
- [ ] Cancelling duration sub-prompt → returns to task list (no log submitted)
- [ ] Duration sub-prompt visible on all Android versions (no z-index compounding)

### 3.3 Double-Tap Guard
- `[AUTO]` `submittingRef` guards direct-tap path (LogActivitySheet.tsx:28) AND duration-confirm path (line 59) — both set before async, cleared in `.finally()`
- [ ] Rapid double-tap of log button → only ONE log written (verify on device)
- [ ] Rapid double-tap via duration confirm path → also guarded (verify on device)

### 3.4 BAD Task Logging
- `[AUTO]` `kind === 'GOOD'` guard at logTask.ts:49 (points path) and :77 (bonusRow) — BAD tasks never trigger daily bonus
- [ ] BAD task logged → fund NOT credited for completion (verify on device)
- [ ] BAD task logged → streak still updates (activity = today)
- [ ] Stars still increment for BAD task

---

## 4. Progress / Analytics Screen

### 4.1 Range Toggle
- [ ] D / W / M / Y toggle buttons all selectable
- [ ] Toggle switches chart data correctly
- [ ] Range label below toggle matches selected range (e.g. "May 26–Jun 1")
- [ ] `getRangeLabel` week: Sunday maps to correct ISO week (Sunday=6 offset) — 4 unit tests pass, verify visually

### 4.2 Charts
- [ ] Day view: bar/line chart for today's activity
- [ ] Week view: 7-day chart (Monday–Sunday)
- [ ] Month view: current month days
- [ ] Year view: 12-month chart
- [ ] Chart renders with 0 data (empty state, no crash)
- [ ] Chart renders with 1 data point (no crash)
- [ ] Chart renders with 365 data points (no crash)
- [ ] `victory-native@^36` renders SVG correctly (not Skia)

### 4.3 Stat Strip
- [ ] Streak count correct (0 on first day, increments on consecutive logs)
- [ ] Stars to next tier shown correctly
- [ ] At max tier: "MAX" shown, no crash from starsToNext=0

### 4.4 All-Time Stats Strip
- [ ] Total tasks logged shown
- [ ] Total days active shown
- [ ] Best streak shown
- [ ] Stats load without blocking (parallel Promise.all)
- [ ] Stats strip visible on small screens (ScrollView wrap)

---

## 5. Fund Screen

### 5.1 Balance Display
- [ ] Balance shows correct VND total
- [ ] Balance updates after logging a GOOD task (tier bonus credited)
- [ ] Balance updates after logging enough for daily bonus (50 stars threshold)

### 5.2 Ledger
- [ ] Transaction list sorted descending by date
- [ ] Each row: source label, amount, date
- [ ] SOURCE_TASK, SOURCE_DAILY_BONUS, SOURCE_PENALTY display correct labels
- [ ] Empty ledger → empty state (not crash)
- [ ] Long ledger scrolls without crash

### 5.3 Withdrawal (Spend)
- `[AUTO]` `spendingRef` guards `handleSpend` (FundScreen.tsx:63,69) — set before async, cleared in `.finally()`
- `[AUTO]` `useSpendFund` reads balance inside `withTransactionAsync` and throws `INSUFFICIENT_FUNDS` if underfunded (useFund.ts:168-174)
- [ ] Spend button opens withdrawal modal
- [ ] Amount input: numbers only
- [ ] Amount > balance → INSUFFICIENT_FUNDS error shown, no DB write
- [ ] Amount = 0 → rejected
- [ ] Amount = exact balance → succeeds, balance → 0
- [ ] Rapid double-tap of confirm → 1 withdrawal written (verify on device)
- [ ] DB error during spend → Alert shown, balance unchanged

### 5.4 Streak Freeze Card
- `[AUTO]` `STREAK_FREEZE_COST = 10_000` in constants.ts:15
- [ ] Card shows current eligibility state
- [ ] Ineligible states shown correctly:
  - Already logged activity today (HAS_ACTIVITY)
  - Already have a freeze (ALREADY_FROZEN)
  - No active streak (NO_STREAK)
  - Balance < 10,000 VND (INSUFFICIENT_FUNDS)
- [ ] Eligible state: purchase button active, shows cost (10,000 VND)
- [ ] Purchasing freeze: balance deducted, `streak_freezes` row inserted, synthetic `daily_summary` row inserted
- [ ] After freeze purchase: next day without logging still increments streak (not resets)
- [ ] `useStreakFreezeEligibility` cache invalidates at midnight (yesterday/dayBefore in queryKey)

---

## 6. Rank Screen

### 6.1 Tier Ladder
- [ ] All 8 tiers rendered
- [ ] Current tier highlighted
- [ ] Locked tiers visually distinct from unlocked
- [ ] Progress bar toward next tier accurate
- [ ] At tier 8 (max): progress bar shows MAX, no crash — 2 boundary unit tests pass, verify visually

### 6.2 Weekly History
- [ ] Weekly history section visible, shows current week
- [ ] Monday–Sunday boundary correct
- [ ] Past weeks show finalized=1 data

### 6.3 Tier Unlock
- `[AUTO]` `INSERT OR IGNORE` into `reward_unlocks` + `r.changes > 0` guard prevents duplicate deposits (useToday.ts:194,200)
- [ ] Unlocking a new tier → fund deposit fires exactly once (verify on device)

---

## 7. Profile Screen (Modal)

### 7.1 Task CRUD
- [ ] Task list visible with all user tasks
- [ ] Create task: name + kind (GOOD/BAD) + category required
- [ ] `starPenalty` field visible ONLY when kind=BAD
- [ ] Switching kind GOOD→BAD after entering penalty value → no error
- [ ] Create saves task, closes modal, list refreshes
- [ ] Edit opens modal with pre-filled values, save updates
- [ ] Archive: Alert confirms; `mutateAsync().catch()` surfaces errors
- [ ] Archived task disappears from Today + LogActivity lists
- [ ] Categories section: visible, archive works, updates filter chips

### 7.2 Notification Settings
- `[AUTO]` `scheduleHabitReminder` called at ProfileScreen.tsx:160, `setNotifTimeMutation.mutateAsync` at :161 — native-first order confirmed
- [ ] Saving valid time (e.g. "08:30") → native schedules, DB writes, toast shown
- [ ] Invalid time (e.g. "25:99") → `parseNotificationTime` rejects BEFORE `cancelAllScheduledNotificationsAsync` — existing schedule preserved
- [ ] If native throws → DB NOT written, user can retry
- [ ] **DEFERRED BUG**: permission denied at OS → `scheduleHabitReminder` succeeds silently, notification never fires. Verify: no crash, no misleading success UI

### 7.3 Display Name
- `[AUTO]` `ProfileScreen.tsx:71` reads `habit_tracker_display_name`; `SignInScreen.tsx:65` writes it — keys match
- [ ] Name shown matches what was entered at SignIn
- [ ] staleTime: Infinity — no refetch flicker on every modal open

---

## 8. Streak Logic

### 8.1 Normal Streak
- [ ] Day 1 first log → streak = 1
- [ ] Day 2 consecutive log → streak = 2
- [ ] Skip a day → streak resets to 1 on next log
- `[AUTO]` `ON CONFLICT DO UPDATE` SQL omits `streak_count` column — set once on INSERT, never overwritten (useToday.ts:171)

### 8.2 TOCTOU Fix
- `[AUTO]` `withTransactionAsync` at useToday.ts:88 wraps all volatile reads (`daily`, `yesterdayRow`, `alreadyUnlocked`, `weeklyRow`)
- [ ] Rapid FAB double-tap → one fund credit, not two (verify on device)

### 8.3 Streak Freeze Interaction
- [ ] Freeze purchased Day N, no log Day N+1 → Day N+2 log reads synthetic row, streak continues

---

## 9. Weekly Reset

### 9.1 Reset Detection
- `[AUTO]` `shouldShowWeekResetToast` pure fn — 3 unit tests pass
- [ ] `last_seen_week_start` column present after fresh install
- [ ] App launch on new Monday → reset toast shown once
- [ ] App launch same week → no toast
- [ ] Multi-week gap → single SQL call finalizes all past weeks (no per-week loop)

### 9.2 Toast Timing
- [ ] Toast visible after launch on reset day (setTimeout 500ms after dbReady)

---

## 10. Database / Migrations

### 10.1 Fresh Install
- `[AUTO]` `streak_freezes` table present (`CREATE TABLE IF NOT EXISTS`, migrations.ts:163)
- [ ] All tables created on first launch (verify via SQLite browser or log)
- [ ] Seed data: user_id=1, 8 tiers, Exercise task, 5 categories

### 10.2 Upgrade (Existing DB)
- `[AUTO]` ALTER TABLE catch narrowed: `if (!e?.message?.includes('duplicate column')) throw e` (migrations.ts:113-114) — real errors propagate
- `[AUTO]` `streak_freezes` uses `CREATE TABLE IF NOT EXISTS` — idempotent
- [ ] Re-run migrations on existing DB → no crash, no duplicate data

### 10.3 Singleton Pattern
- `[AUTO]` `_dbPromise` set once, returned on all subsequent `getDb()` calls (client.ts:4-13) — no race-constructed double DB
- [ ] App.tsx awaits getDb() before mounting navigator — verify no "DB not ready" on first interaction

---

## 11. Navigation

### 11.1 Tab Structure
- `[AUTO]` FAB slot uses `tabBarButton` (renders FABButton) + `tabPress: e.preventDefault()` (RootNavigator.tsx:73,76) — no screen nav
- `[AUTO]` `AppInner` defined at App.tsx:23, used at :93 — single NavigationContainer
- [ ] 5 tabs render correctly: Home, Analytics, [FAB], Fund, Rank
- [ ] All tabs accessible and return correct screens

### 11.2 Modal Navigation
- [ ] ProfileScreen opens as modal, back swipe dismisses it
- [ ] No double NavigationContainer error in console

---

## 12. Cross-Cutting / Stress Scenarios

### 12.1 Rapid Interactions
- `[AUTO]` Code-level guards confirmed: submittingRef (both paths), spendingRef, INSERT OR IGNORE tier unlock
- [ ] Tap FAB 10× quickly → 1 sheet opens
- [ ] Tap Submit 5× quickly in LogActivitySheet → 1 log written
- [ ] Tap Spend 5× quickly in FundScreen → 1 withdrawal
- [ ] Log tier-unlock task repeatedly same session → 1 deposit

### 12.2 Empty / Zero State
- [ ] No tasks created → Today empty state (not crash)
- [ ] No logs ever → Progress charts render with 0 data
- [ ] Balance = 0, spend attempt → INSUFFICIENT_FUNDS shown
- [ ] Balance = 0, streak freeze attempt → INSUFFICIENT_FUNDS shown
- [ ] Streak = 0, freeze attempt → NO_STREAK shown

### 12.3 Large Data
- [ ] 50+ tasks → list scrolls without layout crash
- [ ] 365 daily_summary rows → Year chart renders without timeout
- [ ] 500+ fund_transactions rows → ledger scrolls without jank
- [ ] 8/8 tiers unlocked → MAX states correct everywhere

### 12.4 Date Boundary
- [ ] Log at 23:59, reopen at 00:01 → new day detected, streak correct
- [ ] Streak freeze cache: queryKey includes yesterday/dayBefore → invalidates at midnight
- [ ] Week toggle on Sunday → correct ISO week label (not off-by-one)

### 12.5 Offline / Backgrounded
- [ ] App backgrounded 30+ min, foregrounded → functional (no stale DB lock)
- [ ] Kill mid-transaction (log task) → DB consistent on reopen (withTransactionAsync rollback)
- [ ] Kill mid-onboarding seed → partial tasks visible, no crash

### 12.6 AsyncStorage Failures
- [ ] AsyncStorage read fails on launch → shows SignIn (safe default, `.catch(() => {})` in useAuth)
- [ ] AsyncStorage write fails on SignIn → no crash
- [ ] AsyncStorage cleared externally → fresh-launch flow triggered

### 12.7 Permission Edge Cases
- [ ] Notification permission denied → no crash in App.tsx (result discarded)
- [ ] `cancelAllScheduledNotificationsAsync` NOT called on invalid time input — verify existing schedule preserved

### 12.8 Category Consistency
- `[AUTO]` `useCategories` queryKey `['categories', userId]` (useToday.ts:222) — separate from task mutation invalidation keys
- [ ] Archive category → filter chips + task picker both update
- [ ] Task assigned to archived category → task still visible

### 12.9 Fund Transaction Atomicity
- `[AUTO]` `useSpendFund` wraps in `withTransactionAsync`, reads balance inside, throws before INSERT if insufficient (useFund.ts:168-174)
- [ ] Two simultaneous withdrawals → only one succeeds (verify on device)
- [ ] Streak freeze: all 3 writes atomic — verify via kill + reopen

---

## 13. Visual / UI Checks

- [ ] Sage green theme consistent across all 5 tabs
- [ ] Category chips in task modal: no collapse in horizontal ScrollView (`flex: 0` override)
- [ ] Toast renders above all modals (App root mount)
- [ ] Long task names don't overflow row layout
- [ ] Long display names don't overflow header
- [ ] VND amounts formatted correctly (`formatVND`)
- [ ] Streak freeze cost shows "10,000 VND" (not raw 10000)
- [ ] ProgressScreen all-time stats visible on small screens (ScrollView)

---

## 14. Known Deferred Issues (Verify Not Regressed)

| Issue | Location | Status | Expected Behavior |
|---|---|---|---|
| Onboarding serial seed partial failure | `OnboardingScreen.handleStart` | `[ ]` needs device | Partial tasks visible; no crash; retry creates duplicates |
| Notification permission denied silent | `App.tsx requestPermissionsAsync` | `[ ]` needs device | No crash; no misleading success UI |
| Nested Modal Android z-index | `LogActivitySheet` | `[AUTO] ✓` fixed — only 1 Modal present | Duration sub-prompt uses absolute View |
| TOCTOU volatile reads | `useToday.ts useLogTask` | `[AUTO] ✓` fixed — all reads inside transaction | Cannot double-credit concurrently |
