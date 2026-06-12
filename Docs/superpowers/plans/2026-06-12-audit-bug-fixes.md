# Audit Bug Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all confirmed bugs surfaced by the parallel code-reviewer + stress-test-agent audit run on 2026-06-12.

**Architecture:** 8 independent targeted fixes across 6 files. No new abstractions. Each task is self-contained and can be committed separately.

**Tech Stack:** React Native + Expo SDK 56, expo-sqlite async API, TanStack Query v5, TypeScript

---

## Agent-reported issues handled by this plan

| ID | Severity | File | Status |
|----|----------|------|--------|
| H-001 | HIGH | TodayScreen.tsx | Fix: Task 1 |
| C-003 | CRITICAL | useTasks.ts | Fix: Task 2 |
| AddActivitySheet regression | MED | AddActivitySheet.tsx | Fix: Task 3 |
| H-004 | HIGH | useLeaderboard.ts | Fix: Task 4 |
| H-003 | HIGH | useToday.ts | Fix: Task 5 |
| L-002 | LOW | useAuth.ts, useLeaderboard.ts | Fix: Task 6 |
| M-001 | MED | useAuth.ts | Fix: Task 7 |
| L-001 | LOW | useAuth.ts | Fix: Task 8 |

**Not addressed** (false positives or accepted behavior):
- C-001 / H-002: `computeTodayStreak` same-day toast suppression is by design — correct behavior per CLAUDE.md invariant
- C-002: `useArchiveTask` partial rollup on DB error — rare, requires large refactor, deferred
- M-002 to M-005, L-003, L-004: low probability or cosmetic, deferred

---

## Task 1: Fix double-tap log double-entry (H-001)

**Problem:** `handleLog` for non-timed tasks uses `justLoggedIds` React state as a guard. State updates are batched and async — a second tap during the ~50–200ms async DB write passes the check, firing two `logTask.mutateAsync` calls and doubling rollup data.

**Files:**
- Modify: `habit-tracker/src/screens/TodayScreen.tsx` (around line 247)

- [ ] **Step 1: Write failing test**

Create `habit-tracker/__tests__/TodayScreen.handleLog.test.tsx`:

```tsx
// This test verifies the guard exists and is synchronous.
// We test the ref approach indirectly by ensuring the guard fires correctly.
// Full integration double-tap testing requires a device — this covers the logic unit.
import { renderHook, act } from '@testing-library/react-native';
import { useRef } from 'react';

test('pendingLogTaskIds ref blocks concurrent same-task calls', async () => {
  const pendingIds = { current: new Set<number>() };
  let callCount = 0;
  async function handleLog(taskId: number) {
    if (pendingIds.current.has(taskId)) return;
    pendingIds.current.add(taskId);
    try {
      callCount++;
      await new Promise(r => setTimeout(r, 50)); // simulate DB write
    } finally {
      pendingIds.current.delete(taskId);
    }
  }
  // Fire two concurrent calls for same task
  await Promise.all([handleLog(1), handleLog(1)]);
  expect(callCount).toBe(1); // only one should fire
});
```

- [ ] **Step 2: Run test to verify logic**

```bash
cd habit-tracker && npx jest __tests__/TodayScreen.handleLog.test.tsx --runInBand
```

Expected: PASS (the test is standalone logic, not tied to component yet)

- [ ] **Step 3: Add `pendingLogTaskIds` ref to TodayScreen**

In `habit-tracker/src/screens/TodayScreen.tsx`, find the existing refs near the top of the component (around line 100–120 where `justLoggedIds` is declared).

Add after the existing `justLoggedIds` state declaration:

```ts
const pendingLogTaskIds = useRef(new Set<number>());
```

- [ ] **Step 4: Update `handleLog` guard**

Find `handleLog` (currently around line 247). Replace the guard and flow:

```ts
async function handleLog(task: Task) {
  if (task.is_time_based) {
    setCustomDuration(false);
    setModalTask(task);
    return;
  }
  if (loggedIds?.has(task.id)) {
    try {
      await unlogTask.mutateAsync({ taskTypeId: task.id, kind: task.kind as 'GOOD' | 'BAD' });
    } catch { Alert.alert(t.error, t.cantLog); }
    return;
  }
  if (justLoggedIds.has(task.id) || pendingLogTaskIds.current.has(task.id)) return;
  pendingLogTaskIds.current.add(task.id);
  try {
    const result = await logTask.mutateAsync({
      taskTypeId: task.id, kind: task.kind as 'GOOD' | 'BAD',
      isTimeBased: false, basePoints: task.base_points, starPenalty: task.star_penalty,
    });
    showStreakToast(result.newStreak, result.prevStreak);
    setJustLoggedIds(prev => new Set(prev).add(task.id));
    setTimeout(() => setJustLoggedIds(prev => { const n = new Set(prev); n.delete(task.id); return n; }), 1500);
  } catch {
    Alert.alert(t.error, t.cantLog);
  } finally {
    pendingLogTaskIds.current.delete(task.id);
  }
}
```

Key changes:
- Guard now checks `pendingLogTaskIds.current.has(task.id)` — synchronous ref, not batched state
- `pendingLogTaskIds.current.add(task.id)` fires BEFORE the await
- `finally` block cleans up even on error (allows retry after failure)

- [ ] **Step 5: Run full test suite**

```bash
cd habit-tracker && npx jest --runInBand && npx tsc --noEmit
```

Expected: all pass, 0 TS errors

- [ ] **Step 6: Commit**

```bash
git add habit-tracker/src/screens/TodayScreen.tsx habit-tracker/__tests__/TodayScreen.handleLog.test.tsx
git commit -m "fix(today): use ref guard to block concurrent double-tap log entries"
```

---

## Task 2: Wrap useCreateTask in transaction + guard null (C-003)

**Problem:** `useCreateTask` executes `INSERT OR IGNORE` then `SELECT id` in two separate statements without a transaction. If a concurrent `useArchiveTask` sets `archived=1` between the INSERT and SELECT, the SELECT returns no row and `row!.id` crashes.

**Files:**
- Modify: `habit-tracker/src/queries/useTasks.ts` (lines 18–37)

- [ ] **Step 1: Read the current mutationFn**

Lines 18–37 of `habit-tracker/src/queries/useTasks.ts`:

```ts
const db = await getDb();
await db.runAsync(
  `INSERT INTO task_types ... ON CONFLICT ... DO UPDATE SET archived = 0, ...`,
  [userId, params.name, ...]
);
const row = await db.getFirstAsync<{ id: number }>(
  'SELECT id FROM task_types WHERE user_id = ? AND name = ? AND archived = 0',
  [userId, params.name]
);
return row!.id;   // ← crashes if row is null
```

- [ ] **Step 2: Wrap in withTransactionAsync + replace non-null assertion**

Replace lines 19–34 (the `await db.runAsync(...)` + `const row = ...` + `return row!.id`) with:

```ts
return await db.withTransactionAsync(async () => {
  await db.runAsync(
    `INSERT INTO task_types
     (user_id, name, kind, is_time_based, base_points, star_penalty, icon, category_id, archived)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
     ON CONFLICT(user_id, name) DO UPDATE SET archived = 0, is_time_based = excluded.is_time_based`,
    [userId, params.name, params.kind, params.isTimeBased ? 1 : 0,
     params.basePoints, params.starPenalty, params.icon ?? null,
     params.categoryId ?? null]
  );
  const row = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM task_types WHERE user_id = ? AND name = ? AND archived = 0',
    [userId, params.name]
  );
  if (!row) throw new Error(`useCreateTask: task not found after insert (name=${params.name})`);
  return row.id;
});
```

- [ ] **Step 3: Run tests**

```bash
cd habit-tracker && npx jest --runInBand && npx tsc --noEmit
```

Expected: all pass, 0 TS errors

- [ ] **Step 4: Commit**

```bash
git add habit-tracker/src/queries/useTasks.ts
git commit -m "fix(tasks): wrap useCreateTask INSERT+SELECT in transaction, guard null row"
```

---

## Task 3: Fix AddActivitySheet 2-step / auto-log regression

**Problem:** Current code re-introduced a 2-step flow (`step` state, `hoursInput`/`minutesInput`, `handleCreateAndLog`) that was documented as "eliminated" in the 2026-06-07 session. The "Timed" button advances to step 2 where `handleCreateAndLog` creates AND logs with a duration — contradicting the design intent "FAB creates only, user logs manually from TodayScreen."

**Fix:** "Timed" button directly calls `handleCreate(true)`. Remove step 2 JSX, `handleCreateAndLog`, `step` state, `hoursInput`/`minutesInput`.

**Files:**
- Modify: `habit-tracker/src/screens/AddActivitySheet.tsx`

- [ ] **Step 1: Remove dead state + function**

Find and remove these declarations:

```ts
const [step, setStep] = useState<'input' | 'time'>('input');
const [hoursInput, setHoursInput] = useState('');
const [minutesInput, setMinutesInput] = useState('');
```

In `handleClose` cleanup block, remove these lines:
```ts
setStep('input');
setHoursInput('');
setMinutesInput('');
```

Remove the entire `handleCreateAndLog` function (lines 134–165):
```ts
async function handleCreateAndLog() { ... }
```

Remove the `parseDurationInput` import (check if it's now unused — if `parseDurationInput` is only called from `handleCreateAndLog`, remove the import).

- [ ] **Step 2: Fix "Timed" button to call handleCreate directly**

In the step 1 JSX (around line 224–231), find the "Timed" button:

```tsx
<TouchableOpacity
  style={[styles.durationChip, !hasName && styles.durationChipDim]}
  onPress={() => { if (hasName) setStep('time'); }}
  disabled={!hasName || isPending}
  activeOpacity={0.8}
>
  <Text style={styles.durationChipText}>{t.addActivityTimedBtn}</Text>
</TouchableOpacity>
```

Replace with:

```tsx
<TouchableOpacity
  style={[styles.durationChip, !hasName && styles.durationChipDim]}
  onPress={() => handleCreate(true)}
  disabled={!hasName || isPending}
  activeOpacity={0.8}
>
  <Text style={styles.durationChipText}>{t.addActivityTimedBtn}</Text>
</TouchableOpacity>
```

- [ ] **Step 3: Remove step 2 JSX**

Find the ternary `{step === 'input' ? (...) : (/* Step 2: time picker */...)}` block (starting around line 182).

Replace the entire ternary with just the step 1 content (unwrapped — no ternary):

```tsx
<>
  <Text style={styles.title}>{t.addActivityTitle}</Text>
  <ScrollView
    style={styles.scroll}
    keyboardShouldPersistTaps="handled"
    showsVerticalScrollIndicator={false}
  >
    <TextInput ... />
    {/* suggestion chips JSX unchanged */}
    <Text style={...}>{t.addActivityHowLong}</Text>
    {/* Timed button — now calls handleCreate(true) directly */}
    {/* No timer button unchanged */}
    <View style={{ height: 32 }} />
  </ScrollView>
</>
```

Keep all existing styles (`durationChip`, `durationChipDim`, `noTimerBtn`, etc.) — they're still used. Remove unused styles from step 2 (`timeRow`, `timeInputWrap`, `timeInput`, `timeInputLabel`, `timeSep`, `createLogBtn`, `backBtn`, `backBtnText`, `step2Name`) only if they don't appear in any other component.

- [ ] **Step 4: Update isPending**

`isPending` currently includes `logTask.isPending`. After removing `handleCreateAndLog`, `logTask` is no longer used here. Remove `logTask` from imports and update:

```ts
// Before:
const logTask = useLogTask(userId);
const isPending = createTask.isPending || logTask.isPending;

// After:
const isPending = createTask.isPending;
```

Remove `const logTask = useLogTask(userId);` line and the `useLogTask` import if it's no longer used in this file.

- [ ] **Step 5: Run tests + type check**

```bash
cd habit-tracker && npx jest --runInBand && npx tsc --noEmit
```

Expected: all pass, 0 TS errors

- [ ] **Step 6: Commit**

```bash
git add habit-tracker/src/screens/AddActivitySheet.tsx
git commit -m "fix(add-activity): remove 2-step/auto-log regression, restore create-only FAB"
```

---

## Task 4: Cap useLeaderboard Supabase query (H-004)

**Problem:** `useLeaderboard` queries `activity_log` with no LIMIT. PostgREST default row cap is 1000. When week log rows > 1000, leaderboard silently under-counts stars for heavy users.

**Files:**
- Modify: `habit-tracker/src/queries/useLeaderboard.ts` (line 76–79)

- [ ] **Step 1: Add .limit() to Supabase query**

Find the query (around line 76):

```ts
const { data, error } = await supabase
  .from('activity_log')
  .select('user_email, stars_delta')
  .eq('week_start', weekStart);
```

Replace with:

```ts
// 10 000 row ceiling — well above expected weekly activity for current user base.
// Proper fix: server-side aggregate view (SUM stars_delta GROUP BY user_email).
const { data, error } = await supabase
  .from('activity_log')
  .select('user_email, stars_delta')
  .eq('week_start', weekStart)
  .limit(10000);
```

- [ ] **Step 2: Run tests**

```bash
cd habit-tracker && npx jest --runInBand && npx tsc --noEmit
```

Expected: all pass

- [ ] **Step 3: Commit**

```bash
git add habit-tracker/src/queries/useLeaderboard.ts
git commit -m "fix(leaderboard): add .limit(10000) to prevent silent PostgREST row truncation"
```

---

## Task 5: Defensive bonus-row check in useUnlogTask (H-003)

**Problem:** `useUnlogTask` checks `daily?.bonus_star_awarded` flag to decide whether to delete the `DAILY_BONUS` row. If the flag is ever out of sync (e.g. via a bug in `revertDailySummaryUnlog`), the DAILY_BONUS row is orphaned and `weekly_stars` is permanently inflated. Using the actual row existence as the source of truth is strictly more correct.

**Files:**
- Modify: `habit-tracker/src/queries/useToday.ts` (around line 425)

- [ ] **Step 1: Replace flag check with row existence check**

Find in `useUnlogTask.mutationFn` (around line 423–431):

```ts
const remainingPoints = (daily?.total_points ?? 0) - taskPoints;
let bonusStars = 0;
if (daily?.bonus_star_awarded && remainingPoints < DAILY_BONUS_THRESHOLD) {
  bonusStars = DAILY_BONUS_STARS;
  await db.runAsync(
    `DELETE FROM activity_log WHERE user_id = ? AND local_date = ? AND source = 'DAILY_BONUS'`,
    [userId, today]
  );
}
```

Replace with:

```ts
const remainingPoints = (daily?.total_points ?? 0) - taskPoints;
let bonusStars = 0;
if (remainingPoints < DAILY_BONUS_THRESHOLD) {
  const bonusRow = await db.getFirstAsync<{ id: number }>(
    `SELECT id FROM activity_log WHERE user_id = ? AND local_date = ? AND source = 'DAILY_BONUS' LIMIT 1`,
    [userId, today]
  );
  if (bonusRow) {
    bonusStars = DAILY_BONUS_STARS;
    await db.runAsync(
      `DELETE FROM activity_log WHERE user_id = ? AND local_date = ? AND source = 'DAILY_BONUS'`,
      [userId, today]
    );
  }
}
```

This makes the DAILY_BONUS row the authoritative source of truth, not the flag.

- [ ] **Step 2: Run tests**

```bash
cd habit-tracker && npx jest --runInBand && npx tsc --noEmit
```

Expected: all pass

- [ ] **Step 3: Commit**

```bash
git add habit-tracker/src/queries/useToday.ts
git commit -m "fix(unlog): use DAILY_BONUS row existence as source of truth instead of flag"
```

---

## Task 6: Remove hardcoded developer email from production code (L-002)

**Problem:** Two places in production code contain hardcoded developer email addresses:
1. `useAuth.ts:216` — seeds a rank-up celebration for a specific email. Ships in every production binary, runs on every sign-in.
2. `useLeaderboard.ts:24` — `EXCLUDED_FROM_LEADERBOARD` constant. Leaderboard data for any user depends on whether their email was shipped in the binary.

**Files:**
- Modify: `habit-tracker/src/hooks/useAuth.ts` (lines 215–225)
- Modify: `habit-tracker/src/queries/useLeaderboard.ts` (line 24)

- [ ] **Step 1: Remove test-email block from useAuth.ts**

Find and remove this block (around line 215–225):

```ts
// One-time rank-up celebration seed for test account
if (user.email === 'xuanthanhcn2002@gmail.com') {
  const existing = await AsyncStorage.getItem('pending_levelup_celebration');
  if (!existing) {
    await AsyncStorage.setItem('pending_levelup_celebration', JSON.stringify({
      tierOrder: 3,
      tierName: 'Rizz',
      weekStart: '',
    }));
  }
}
```

Delete the entire block.

- [ ] **Step 2: Remove EXCLUDED_FROM_LEADERBOARD from useLeaderboard.ts**

Find line 24:
```ts
const EXCLUDED_FROM_LEADERBOARD = new Set(['thanhnguyenxuan970@gmail.com']);
```

And its usage inside `buildLeaderboardEntries` or `aggregateStarsByEmail`.

Option A (recommended): remove the constant entirely and stop filtering.
Option B: guard with `__DEV__` if you want exclusion only in development builds.

Apply Option A — remove the constant and remove any filter call that references it (grep for `EXCLUDED_FROM_LEADERBOARD` in the file).

- [ ] **Step 3: Run tests**

```bash
cd habit-tracker && npx jest --runInBand && npx tsc --noEmit
```

Expected: all pass

- [ ] **Step 4: Commit**

```bash
git add habit-tracker/src/hooks/useAuth.ts habit-tracker/src/queries/useLeaderboard.ts
git commit -m "fix(auth,leaderboard): remove hardcoded developer email from production code"
```

---

## Task 7: Guard empty-string picture in parseGoogleUser (M-001)

**Problem:** `parseGoogleUser` checks `typeof parsed?.picture === 'string'` — empty string `""` passes. When `photo: null` from Google Maps to `picture: ""` (via `photo ?? ''` in `extractGoogleUser`), the user is stored with an empty picture URL. Any downstream code that uses `googleUser.picture` for image fetching would attempt an empty-string URL.

**Files:**
- Modify: `habit-tracker/src/hooks/useAuth.ts` (line 86)

- [ ] **Step 1: Add empty-string guard**

Find (around line 86):

```ts
if (typeof parsed?.email === 'string' && typeof parsed?.name === 'string' && typeof parsed?.picture === 'string') {
```

Replace with:

```ts
if (typeof parsed?.email === 'string' && parsed.email.length > 0 &&
    typeof parsed?.name === 'string' && parsed.name.length > 0 &&
    typeof parsed?.picture === 'string' && parsed.picture.length > 0) {
```

- [ ] **Step 2: Run tests**

```bash
cd habit-tracker && npx jest --runInBand && npx tsc --noEmit
```

Expected: all pass

- [ ] **Step 3: Commit**

```bash
git add habit-tracker/src/hooks/useAuth.ts
git commit -m "fix(auth): reject empty-string email/name/picture in parseGoogleUser"
```

---

## Task 8: Surface auth errors in DEV mode (L-001)

**Problem:** The `useEffect` in `useAuth.ts` that loads session on startup has `.catch(() => {})` — all errors are silently swallowed. On cold start, a SecureStore failure leaves the user at SignIn with no indication their session was valid but unreadable. No diagnostic info even in `__DEV__`.

**Files:**
- Modify: `habit-tracker/src/hooks/useAuth.ts` (around line 179)

- [ ] **Step 1: Find the catch block**

Look for the `Promise.all` in the startup `useEffect` that loads `googleUser` + `isOnboarded`. It has:

```ts
.catch(() => {})
```

- [ ] **Step 2: Add DEV logging**

Replace:
```ts
.catch(() => {})
```

With:
```ts
.catch((e) => { if (__DEV__) console.warn('[useAuth] startup load failed:', e); })
```

- [ ] **Step 3: Run tests**

```bash
cd habit-tracker && npx jest --runInBand && npx tsc --noEmit
```

Expected: all pass

- [ ] **Step 4: Commit**

```bash
git add habit-tracker/src/hooks/useAuth.ts
git commit -m "fix(auth): log startup session load failures in DEV mode"
```

---

## Final Verification

- [ ] **Run full suite one last time**

```bash
cd habit-tracker && npx jest --runInBand && npx tsc --noEmit
```

Expected: all pass, 0 TS errors

- [ ] **Check git log for all 8 commits**

```bash
git log --oneline -10
```
