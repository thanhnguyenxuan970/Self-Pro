# Backfill DB Write Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `backfillDay()` DB write layer — the transaction that inserts a backdated activity_log row, recomputes daily_summary + streak chain, and optionally updates weekly_stars.

**Architecture:** Single `useBackfill.ts` query hook following the `useLogTask` pattern — `db.withTransactionAsync`, `computeLogTaskRows` for point/star math, `computeStreakCounts` for streak chain. `countTowardRank: false` default (anti-gaming: streak preserved, rank stars unchanged). One new formatter utility (`getWeekStartFor`) to support arbitrary-date week computation.

**Tech Stack:** expo-sqlite (raw async API), TanStack Query v5 (`useMutation`), existing `src/game/backfill.ts`, `src/game/logTask.ts`, `src/utils/formatters.ts`

## Global Constraints

- Raw expo-sqlite only — no drizzle runtime. Use `db.runAsync`, `db.getAllAsync`, `db.getFirstAsync`, `db.withTransactionAsync`.
- All date strings are `YYYY-MM-DD` in device local time.
- Monday = week start (`dow === 0 ? 6 : dow - 1`).
- `is_backfill = 1` on every activity_log INSERT this feature makes.
- `countTowardRank` defaults to `false` — do NOT update `weekly_summary.weekly_stars` unless caller explicitly opts in.
- TSC must pass (`npx tsc --noEmit`), full jest suite must pass (`npx jest --runInBand`), `.\gradlew.bat bundleRelease` from `android/` must succeed.

---

### Task 1: Add `getWeekStartFor` formatter utility + test

**Files:**
- Modify: `src/utils/formatters.ts`
- Test: `__tests__/backfill.test.ts` (append — file already exists)

**Interfaces:**
- Produces: `getWeekStartFor(date: Date): string` — exported from formatters

- [ ] **Step 1: Append test for getWeekStartFor in `__tests__/backfill.test.ts`**

Add at the end of the file (after existing `computeStreakCounts` describe block):

```ts
import { getWeekStartFor } from '../src/utils/formatters';

describe('getWeekStartFor', () => {
  it('returns Monday of the week for a Wednesday', () => {
    // 2026-06-25 is a Thursday → Monday = 2026-06-22
    expect(getWeekStartFor(new Date('2026-06-25T12:00:00'))).toBe('2026-06-22');
  });
  it('returns same day for a Monday', () => {
    expect(getWeekStartFor(new Date('2026-06-22T12:00:00'))).toBe('2026-06-22');
  });
  it('returns previous Monday for a Sunday', () => {
    // 2026-06-28 is a Sunday → Monday = 2026-06-22
    expect(getWeekStartFor(new Date('2026-06-28T12:00:00'))).toBe('2026-06-22');
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```
npx jest --runInBand --testPathPattern="backfill"
```

Expected: FAIL — `getWeekStartFor is not a function` (or similar)

- [ ] **Step 3: Add `getWeekStartFor` to `src/utils/formatters.ts`**

Add after `getWeekStart()`:

```ts
/** YYYY-MM-DD for Monday of the week containing `date` */
export function getWeekStartFor(date: Date): string {
  const d = new Date(date);
  const dow = d.getDay();
  const diff = dow === 0 ? 6 : dow - 1;
  d.setDate(d.getDate() - diff);
  return toYMD(d);
}
```

- [ ] **Step 4: Run test to confirm it passes**

```
npx jest --runInBand --testPathPattern="backfill"
```

Expected: all 14 tests PASS (11 existing + 3 new)

- [ ] **Step 5: TSC check**

```
npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 6: Commit**

```
git add src/utils/formatters.ts __tests__/backfill.test.ts
git commit -m "feat(backfill): add getWeekStartFor formatter for arbitrary-date week lookup"
```

---

### Task 2: Create `useBackfill.ts` mutation with full DB write layer

**Files:**
- Create: `src/queries/useBackfill.ts`

**Interfaces:**
- Consumes:
  - `canBackfill(i: BackfillCheckInput): BackfillCheck` from `src/game/backfill.ts`
  - `computeStreakCounts(days: boolean[], priorStreak?: number): number[]` from `src/game/backfill.ts`
  - `computeLogTaskRows(input: ComputeInput): { activityRow, bonusRow }` from `src/game/logTask.ts`
  - `getLocalDate(): string`, `getWeekStart(): string`, `getWeekStartFor(date: Date): string`, `getLocalDateFor(date: Date): string` from `src/utils/formatters.ts`
  - `getDb()` from `src/db/client.ts`
  - `DAILY_BONUS_THRESHOLD`, `DAILY_BONUS_STARS` from `src/config/constants.ts`
- Produces:
  - `useBackfillDay(userId: number)` — TanStack `useMutation` hook
  - Mutation params: `BackfillDayParams` (see implementation below)
  - Mutation returns: `{ newStreak: number }` — streak_count of today after recompute

No unit test for the hook itself (DB-touching). Logic correctness is covered by `backfill.ts` tests. TSC + build serve as the integration check.

- [ ] **Step 1: Create `src/queries/useBackfill.ts`**

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getDb } from '../db/client';
import { canBackfill, computeStreakCounts } from '../game/backfill';
import { computeLogTaskRows } from '../game/logTask';
import { getLocalDate, getLocalDateFor, getWeekStart, getWeekStartFor } from '../utils/formatters';
import { DAILY_BONUS_THRESHOLD, DAILY_BONUS_STARS } from '../config/constants';
import type { SQLiteDatabase } from 'expo-sqlite';

export type BackfillDayParams = {
  date: string;              // 'YYYY-MM-DD' — the missed day to backfill
  taskTypeId: number;
  kind: 'GOOD' | 'BAD';
  isTimeBased: boolean;
  basePoints: number;
  starPenalty: number;
  durationMin?: number;
  countTowardRank?: boolean; // default false — anti-gaming
};

/** Generate all YYYY-MM-DD dates from `from` to `to` inclusive. */
function dateRange(from: string, to: string): string[] {
  const dates: string[] = [];
  const cur = new Date(from + 'T12:00:00');
  const end = new Date(to + 'T12:00:00');
  while (cur <= end) {
    dates.push(getLocalDateFor(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

/** Subtract one day from a YYYY-MM-DD string. */
function prevDay(date: string): string {
  const d = new Date(date + 'T12:00:00');
  d.setDate(d.getDate() - 1);
  return getLocalDateFor(d);
}

async function recomputeStreakChain(
  db: SQLiteDatabase,
  userId: number,
  fromDate: string,
  toDate: string,
): Promise<number> {
  // priorStreak = streak_count of the day before fromDate
  const prior = await db.getFirstAsync<{ streak_count: number }>(
    `SELECT streak_count FROM daily_summary WHERE user_id = ? AND local_date = ?`,
    [userId, prevDay(fromDate)],
  );
  const priorStreak = prior?.streak_count ?? 0;

  const range = dateRange(fromDate, toDate);

  // Fetch all daily_summary rows in range
  const rows = await db.getAllAsync<{ local_date: string; total_points: number }>(
    `SELECT local_date, total_points FROM daily_summary
     WHERE user_id = ? AND local_date >= ? AND local_date <= ?`,
    [userId, fromDate, toDate],
  );
  const pointsByDate = new Map(rows.map(r => [r.local_date, r.total_points]));

  const daysActive = range.map(d => (pointsByDate.get(d) ?? 0) > 0);
  const streakCounts = computeStreakCounts(daysActive, priorStreak);

  for (let i = 0; i < range.length; i++) {
    const d = range[i];
    if (pointsByDate.has(d)) {
      await db.runAsync(
        `UPDATE daily_summary SET streak_count = ? WHERE user_id = ? AND local_date = ?`,
        [streakCounts[i], userId, d],
      );
    }
  }

  // Return today's streak (last element if toDate === today, else query)
  return streakCounts[streakCounts.length - 1] ?? 0;
}

export function useBackfillDay(userId: number) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (params: BackfillDayParams): Promise<{ newStreak: number }> => {
      const db = await getDb();
      const today = getLocalDate();
      const currentWeekStart = getWeekStart();
      const backfillDate = params.date;
      const backfillWeekStart = getWeekStartFor(new Date(backfillDate + 'T12:00:00'));

      // 1. Count quota used this week (outside transaction — read-only snapshot is fine)
      const quotaRow = await db.getFirstAsync<{ n: number }>(
        `SELECT COUNT(DISTINCT local_date) AS n
         FROM activity_log
         WHERE user_id = ? AND week_start = ? AND is_backfill = 1`,
        [userId, currentWeekStart],
      );
      const backfillsUsedThisWeek = quotaRow?.n ?? 0;

      // 2. Check whether date has any existing activity
      const existingRow = await db.getFirstAsync<{ n: number }>(
        `SELECT COUNT(*) AS n FROM daily_summary
         WHERE user_id = ? AND local_date = ? AND total_points > 0`,
        [userId, backfillDate],
      );
      const dayHasActivity = (existingRow?.n ?? 0) > 0;

      // 3. Check streak freeze
      const freezeRow = await db.getFirstAsync<{ id: number }>(
        `SELECT id FROM streak_freezes WHERE user_id = ? AND local_date = ?`,
        [userId, backfillDate],
      );
      const hasStreakFreeze = !!freezeRow;

      // 4. Run guardrail
      const check = canBackfill({
        date: backfillDate,
        today,
        weekStartOfDate: backfillWeekStart,
        currentWeekStart,
        dayHasActivity,
        backfillsUsedThisWeek,
        hasStreakFreeze,
      });
      if (!check.allowed) {
        throw new Error(check.reason);
      }

      let newStreak = 0;

      // 5. Write transaction
      await db.withTransactionAsync(async () => {
        const now = new Date();
        const nowMs = now.getTime();

        const existingDaily = await db.getFirstAsync<{ total_points: number; bonus_star_awarded: number }>(
          `SELECT total_points, bonus_star_awarded FROM daily_summary
           WHERE user_id = ? AND local_date = ?`,
          [userId, backfillDate],
        );

        const { activityRow, bonusRow } = computeLogTaskRows({
          userId,
          taskTypeId: params.taskTypeId,
          kind: params.kind,
          isTimeBased: params.isTimeBased,
          basePoints: params.basePoints,
          starPenalty: params.starPenalty,
          durationMin: params.durationMin,
          currentDayPoints: existingDaily?.total_points ?? 0,
          bonusAlreadyAwarded: !!existingDaily?.bonus_star_awarded,
          loggedAt: now,
          localDate: backfillDate,
          weekStart: backfillWeekStart,
        });

        const totalStarsDelta = activityRow.stars_delta + (bonusRow?.stars_delta ?? 0);

        // 5a. Insert activity_log with is_backfill = 1
        const insertSql = `INSERT INTO activity_log
          (user_id, task_type_id, kind, duration_min, points_earned, stars_delta,
           source, logged_at, local_date, week_start, is_backfill)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`;
        await db.runAsync(insertSql, [
          activityRow.user_id, activityRow.task_type_id, activityRow.kind,
          activityRow.duration_min, activityRow.points_earned, activityRow.stars_delta,
          activityRow.source, nowMs, backfillDate, backfillWeekStart,
        ]);
        if (bonusRow) {
          await db.runAsync(insertSql, [
            bonusRow.user_id, bonusRow.task_type_id, bonusRow.kind,
            bonusRow.duration_min, bonusRow.points_earned, bonusRow.stars_delta,
            bonusRow.source, nowMs, backfillDate, backfillWeekStart,
          ]);
        }

        // 5b. Upsert daily_summary for backfill date
        const newDayPoints = (existingDaily?.total_points ?? 0) + activityRow.points_earned;
        await db.runAsync(
          `INSERT INTO daily_summary (user_id, local_date, total_points, bonus_star_awarded, streak_count)
           VALUES (?, ?, ?, ?, 0)
           ON CONFLICT(user_id, local_date) DO UPDATE SET
             total_points = total_points + ?,
             bonus_star_awarded = CASE WHEN ? THEN 1 ELSE bonus_star_awarded END`,
          [userId, backfillDate, newDayPoints, bonusRow ? 1 : 0,
           activityRow.points_earned, bonusRow ? 1 : 0],
        );

        // 5c. Recompute streak chain: backfillDate → today
        newStreak = await recomputeStreakChain(db, userId, backfillDate, today);

        // 5d. Optionally update weekly_summary (only if countTowardRank = true)
        if (params.countTowardRank === true) {
          await db.runAsync(
            `INSERT INTO weekly_summary (user_id, week_start, total_points, weekly_stars, peak_stars, current_tier_id)
             VALUES (?, ?, ?, ?, ?, (SELECT current_tier_id FROM weekly_summary WHERE user_id = ? AND week_start = ?))
             ON CONFLICT(user_id, week_start) DO UPDATE SET
               total_points = total_points + ?,
               weekly_stars = weekly_stars + ?,
               peak_stars = MAX(peak_stars, weekly_stars + ?)`,
            [userId, currentWeekStart, activityRow.points_earned, totalStarsDelta,
             Math.max(0, totalStarsDelta), userId, currentWeekStart,
             activityRow.points_earned, totalStarsDelta, totalStarsDelta],
          );
        }
      });

      return { newStreak };
    },

    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['today'] });
      qc.invalidateQueries({ queryKey: ['week'] });
      qc.invalidateQueries({ queryKey: ['progress'] });
      qc.invalidateQueries({ queryKey: ['calendar'] });
    },

    onError: (err) => {
      // Caller should check err.message for BackfillDenyReason (e.g. 'QUOTA_EXCEEDED')
    },
  });
}
```

- [ ] **Step 2: TSC check**

```
npx tsc --noEmit
```

Expected: 0 errors. Fix any type errors before continuing.

- [ ] **Step 3: Full jest suite**

```
npx jest --runInBand
```

Expected: all 14 tests PASS (no regressions).

- [ ] **Step 4: Build**

From `android/` directory:
```
.\gradlew.bat bundleRelease
```

Expected: `BUILD SUCCESSFUL`

- [ ] **Step 5: Bump version**

In `android/app/build.gradle`: `versionCode 44 → 45`, `versionName "1.0.43" → "1.0.44"`
In `app.json`: `"version": "1.0.44"`

- [ ] **Step 6: Commit**

```
git add src/queries/useBackfill.ts android/app/build.gradle app.json
git commit -m "feat(backfill): add backfillDay() DB write layer — insert, streak recompute, quota guard"
```

---

## Self-Review

**Spec coverage:**
- §1 migration (is_backfill column + index) → done in prior commit ✅
- §2 canBackfill guardrail → called in mutationFn step 4 ✅
- §3 quota count query → step 1 of mutationFn ✅
- §4a INSERT with is_backfill=1 → step 5a ✅
- §4b daily_summary upsert → step 5b ✅
- §4c streak chain recompute → step 5c via `recomputeStreakChain` ✅
- §4d weekly_summary (conditional) → step 5d with `countTowardRank` gate ✅
- §5 streak recompute algorithm → `recomputeStreakChain` + `computeStreakCounts` ✅
- §6 rank stars update → gated behind `countTowardRank: false` default ✅
- §7 HAS_FREEZE check → `hasStreakFreeze` queried from `streak_freezes` ✅
- §11.6 anti-gaming → `countTowardRank` defaults false ✅

**Gaps:** None — UI (§9 step 3) and notification (§9 step 4) are next tasks, not in scope here.

---

<!-- /autoplan restore point: /c/Users/Admin/.gstack/projects/thanhnguyenxuan970-Self-Pro/feature-paywall-screen-autoplan-restore-20260625-213848.md -->

## Decision Audit Trail

| # | Phase | Decision | Classification | Principle | Rationale | Rejected |
|---|-------|----------|----------------|-----------|-----------|---------|
| 1 | CEO | Mode: SELECTIVE EXPANSION | Mechanical | P3 | Feature enhancement on existing system | EXPANSION |
| 2 | CEO | Implementation approach: Hook-per-write | Mechanical | P1+P4+P5 | DRY reuse of useLogTask pattern, transactional integrity | Inline UI, server-side |
| 3 | CEO | Recovery notification: DEFERRED | Mechanical | P3 | Outside blast radius of DB layer plan | — |
| 4 | CEO | Prior-week grace window | Taste | — | Product design choice — surface at gate | — |
| 5 | CEO | Raise quota 2→3 | Taste | — | Product decision — surface at gate | — |
| 6 | CEO | Analytics tracking: DEFERRED | Mechanical | P3 | Future analytics task | — |
| 7 | CEO | countTowardRank=true test: DEFERRED | Mechanical | P3 | Requires expo-sqlite DB mock setup | — |
| 8 | CEO | FUTURE/TODAY guardrail covers recomputeStreakChain edge | Mechanical | P5 | canBackfill() gates all invalid date inputs | — |
| 9 | CEO | DAILY_BONUS import removal: correct | Mechanical | P4 | computeLogTaskRows handles bonus internally | — |
| 10 | CEO | ['backfill'] invalidation addition: correct | Mechanical | P1 | Invalidates BackfillSheet query cache on success | — |
| 11 | Eng | Quota TOCTOU race | Taste | — | Low probability in RN JS single-thread — surface at gate | — |
| 12 | Eng | weekly_summary NULL current_tier_id | Taste | — | Near-zero impact (nullable col, countTowardRank=false default) — surface at gate | — |
| 13 | Eng | onError logging gap | Mechanical | P5 | Add console.warn for DB errors — implementation note | — |
| 14 | Eng | recomputeStreakChain untestable | Mechanical | P3 | Known gap per plan; hook-level tests require DB mock | — |

## GSTACK REVIEW REPORT

| Phase | Runs | Status | Findings |
|-------|------|--------|---------|
| CEO | Claude subagent | clean | 5 (2 taste, 3 deferred) |
| Design | skipped | n/a | no UI scope |
| Eng | Claude subagent | issues_open | 5 (2 taste, 1 P2, 2 P3) |
| DX | skipped | n/a | no developer-facing scope |

**Codex:** [codex-unavailable] — binary not found, Claude subagent only  
**Model:** [subagent-only]

**VERDICT:** Plan is architecturally sound. Implementation matches plan (with improvements). 2 taste decisions to resolve at gate. No critical blockers.

Cross-phase themes:
- **weekly_summary NULL current_tier_id** flagged in both CEO (temporal interrogation) and Eng (code quality). High-confidence signal. Fix is 1 line: COALESCE.
- **Quota rationale** raised by CEO subagent (arbitrary) and Eng (TOCTOU). Related — if quota is loosened, TOCTOU risk increases proportionally.

NO UNRESOLVED DECISIONS
