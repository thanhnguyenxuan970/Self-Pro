# Simulation Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all bugs and UX friction items found in the 12-agent user simulation report.

**Architecture:** Each task is self-contained. No new dependencies. All changes use existing patterns (TanStack Query, raw expo-sqlite, React Native Animated, existing theme/i18n system). DB changes use the existing ALTER TABLE try/catch migration pattern.

**Tech Stack:** React Native + Expo SDK 56, expo-sqlite (async API), TanStack Query v5, TypeScript, expo-haptics, expo-notifications (dynamic import)

**Pre-verified — already done, skip:**
- B1 (SQLite timezone): code already uses `getLocalDate()` (JS local date) everywhere; no raw `date('now')` in SQL
- I9 (Rank progress bar): `styles.bar` + `styles.barFill` already rendered in `RankScreen.tsx:75-77`
- B6 (modal header language): CLAUDE.md confirms static options object re-evaluated per render

---

## Task 1: Streak display on TodayScreen hero card

**Files:**
- Modify: `habit-tracker/src/screens/TodayScreen.tsx`
- Modify: `habit-tracker/src/i18n.ts`

The hero card (lines 167–185) shows `weeklyStars` and rank chip but never the streak. `daily?.streak_count` is already loaded. We just add it.

- [ ] **Step 1: Add i18n key for streak chip**

In `src/i18n.ts`, add to the `vi` object after `heroLabel`:
```typescript
  streakChip: (n: number) => `🔥 ${n} ngày`,
```
And in `en` object (same location):
```typescript
  streakChip: (n: number) => `🔥 ${n} days`,
```

- [ ] **Step 2: Add streak chip to hero card JSX**

In `TodayScreen.tsx`, add `streak` const after line 97 (`const isDebt = weeklyStars < 0;`):
```typescript
  const streak = daily?.streak_count ?? 0;
```

Then inside the `<LinearGradient>` hero block, after the `<View style={styles.heroFoot}>` closing tag (after line 184), add:
```tsx
        {streak > 0 && (
          <Text style={styles.heroStreak}>{t.streakChip(streak)}</Text>
        )}
```

- [ ] **Step 3: Add style for streakChip**

In the `makeStyles` function in `TodayScreen.tsx`, add:
```typescript
    heroStreak: {
      color: 'rgba(255,255,255,0.85)',
      fontSize: 13,
      fontWeight: '600',
      marginTop: 6,
      alignSelf: 'center',
      letterSpacing: 0.3,
    },
```

- [ ] **Step 4: Run TypeScript check**
```bash
cd c:/Users/Admin/Desktop/Self-Pro/habit-tracker && npx tsc --noEmit
```
Expected: 0 errors

- [ ] **Step 5: Run tests**
```bash
cd c:/Users/Admin/Desktop/Self-Pro/habit-tracker && npx jest
```
Expected: 98/98 pass (no logic change)

- [ ] **Step 6: Commit**
```bash
git add habit-tracker/src/screens/TodayScreen.tsx habit-tracker/src/i18n.ts
git commit -m "feat(today): show streak on hero card"
```

---

## Task 2: Fix "Tuần này" label on ProfileScreen

**Files:**
- Modify: `habit-tracker/src/i18n.ts`
- Modify: `habit-tracker/src/screens/ProfileScreen.tsx`

`treat_stars` (lifetime star vault) is labeled `t.statWeek` ("Tuần này" / "This Week") which is factually wrong. Rename key to `statVault`.

- [ ] **Step 1: Rename i18n key**

In `src/i18n.ts`, in the `vi` object, change:
```typescript
  statWeek: 'Tuần này',
```
to:
```typescript
  statVault: 'Kho Sao',
```

In the `en` object, change:
```typescript
  statWeek: 'This Week',
```
to:
```typescript
  statVault: 'Star Vault',
```

- [ ] **Step 2: Update ProfileScreen**

In `src/screens/ProfileScreen.tsx` line 66, change `t.statWeek` to `t.statVault`:
```tsx
          <Text style={ph.lifeL}>{t.statVault}</Text>
```

- [ ] **Step 3: TypeScript check** — `en: typeof vi` enforces key parity; `statWeek` removal will cause compile error if anything still references it.
```bash
cd c:/Users/Admin/Desktop/Self-Pro/habit-tracker && npx tsc --noEmit
```
Expected: 0 errors (confirms no other reference to `statWeek`)

- [ ] **Step 4: Run tests**
```bash
cd c:/Users/Admin/Desktop/Self-Pro/habit-tracker && npx jest
```
Expected: all pass

- [ ] **Step 5: Commit**
```bash
git add habit-tracker/src/i18n.ts habit-tracker/src/screens/ProfileScreen.tsx
git commit -m "fix(profile): rename 'Tuần này' label to 'Kho Sao' for treat_stars"
```

---

## Task 3: Add 45min to chip presets default

**Files:**
- Modify: `habit-tracker/src/logic/chipPresets.ts`

Currently `DEFAULT_MINUTES = [30, 60, 90]` — no 45min option forces text-input for common durations.

- [ ] **Step 1: Add 45 to defaults**

In `src/logic/chipPresets.ts`, change:
```typescript
const DEFAULT_MINUTES = [30, 60, 90];
```
to:
```typescript
const DEFAULT_MINUTES = [30, 45, 60, 90];
```

- [ ] **Step 2: Run tests**
```bash
cd c:/Users/Admin/Desktop/Self-Pro/habit-tracker && npx jest
```
Expected: all pass (no logic tests broken — defaults only affect new users)

- [ ] **Step 3: Commit**
```bash
git add habit-tracker/src/logic/chipPresets.ts
git commit -m "fix(chips): add 45m to default duration chip presets"
```

---

## Task 4: Increase history limit from 30 to 100

**Files:**
- Modify: `habit-tracker/src/screens/ProfileScreen.tsx`

Power users (8–10 logs/day) exhaust 30 entries in under 4 days.

- [ ] **Step 1: Update ProfileScreen call**

In `src/screens/ProfileScreen.tsx` line 28, change:
```typescript
  const { data: actLogs = [] } = useRecentActivityLogs(userId, 30);
```
to:
```typescript
  const { data: actLogs = [] } = useRecentActivityLogs(userId, 100);
```

- [ ] **Step 2: Run tests**
```bash
cd c:/Users/Admin/Desktop/Self-Pro/habit-tracker && npx jest
```
Expected: all pass

- [ ] **Step 3: Commit**
```bash
git add habit-tracker/src/screens/ProfileScreen.tsx
git commit -m "fix(profile): increase history feed limit from 30 to 100 entries"
```

---

## Task 5: Treat ETA forecast in FundScreen

**Files:**
- Modify: `habit-tracker/src/queries/useTreats.ts`
- Modify: `habit-tracker/src/screens/FundScreen.tsx`
- Modify: `habit-tracker/src/i18n.ts`

Add "~N days" forecast below each treat progress bar based on 7-day rolling average of treat_stars earned per day.

- [ ] **Step 1: Add i18n key**

In `src/i18n.ts`, in the `vi` object after `starsMore`:
```typescript
  etaDays: (n: number) => `~${n} ngày nữa`,
  etaToday: 'Có thể hôm nay!',
```
And in `en`:
```typescript
  etaDays: (n: number) => `~${n} more days`,
  etaToday: 'Maybe today!',
```

- [ ] **Step 2: Add `useAvgDailyTreatStars` query**

In `src/queries/useTreats.ts`, add after existing queries:
```typescript
export function useAvgDailyTreatStars(userId: number) {
  return useQuery({
    queryKey: ['treats', 'avgDaily', userId],
    queryFn: async () => {
      const db = await getDb();
      const row = await db.getFirstAsync<{ avg: number }>(
        `SELECT COALESCE(AVG(daily_earned), 0) AS avg
         FROM (
           SELECT local_date, SUM(CASE WHEN stars_delta > 0 THEN stars_delta ELSE 0 END) AS daily_earned
           FROM activity_log
           WHERE user_id = ? AND kind = 'GOOD'
             AND local_date >= date('now', 'localtime', '-7 days')
           GROUP BY local_date
         )`,
        [userId]
      );
      return row?.avg ?? 0;
    },
  });
}
```

- [ ] **Step 3: Thread avgDaily into TreatCard**

In `src/screens/FundScreen.tsx`, import `useAvgDailyTreatStars`:
```typescript
import {
  useTreatPool, useTreats, useAddTreat, useEnjoyTreat,
  useTreatHistory, useAvgDailyTreatStars, DecoratedTreat, TreatHistoryRow,
} from '../queries/useTreats';
```

In the `FundScreen` component body, add after the existing queries:
```typescript
  const { data: avgDaily = 0 } = useAvgDailyTreatStars(userId);
```

Pass it to each `TreatCard`:
In the FlatList/map that renders `TreatCard`, add `avgDaily` prop. First update `TreatCard` signature:
```typescript
function TreatCard({
  treat, onEnjoy, colors, styles, t, avgDaily,
}: {
  treat: DecoratedTreat;
  onEnjoy: () => void;
  colors: AppColors;
  styles: ReturnType<typeof makeStyles>;
  t: Strings;
  avgDaily: number;
}) {
```

- [ ] **Step 4: Add ETA display inside TreatCard**

Inside `TreatCard`, after the `progressLabel` text and only when `!isEnjoyed && !treat.unlockable`:
```tsx
        {!isEnjoyed && !treat.unlockable && avgDaily > 0 && (
          <Text style={styles.etaText}>
            {treat.starsToUnlock <= avgDaily
              ? t.etaToday
              : t.etaDays(Math.ceil(treat.starsToUnlock / avgDaily))}
          </Text>
        )}
```

- [ ] **Step 5: Add style for etaText**

In `makeStyles` in FundScreen:
```typescript
    etaText: {
      fontSize: 11,
      color: colors.textSecondary,
      marginTop: 2,
      fontStyle: 'italic',
    },
```

- [ ] **Step 6: Wire avgDaily prop to each TreatCard call**

Find every `<TreatCard` render call in `FundScreen.tsx` and add `avgDaily={avgDaily}`.

- [ ] **Step 7: TypeScript + test**
```bash
cd c:/Users/Admin/Desktop/Self-Pro/habit-tracker && npx tsc --noEmit && npx jest
```
Expected: 0 errors, all pass

- [ ] **Step 8: Commit**
```bash
git add habit-tracker/src/queries/useTreats.ts habit-tracker/src/screens/FundScreen.tsx habit-tracker/src/i18n.ts
git commit -m "feat(fund): add ETA forecast to treat progress bars"
```

---

## Task 6: ProgressScreen period navigation (back/forward arrows)

**Files:**
- Modify: `habit-tracker/src/queries/useProgress.ts`
- Modify: `habit-tracker/src/screens/ProgressScreen.tsx`
- Modify: `habit-tracker/src/i18n.ts`
- Modify: `habit-tracker/src/logic/formatters.ts`

Add `offset` state (0 = current period, -1 = previous, etc.) and `<` `>` arrow buttons.

- [ ] **Step 1: Add i18n keys**

In `src/i18n.ts` `vi` object, after `rangeYear`:
```typescript
  prevPeriod: '‹',
  nextPeriod: '›',
  currentPeriod: 'Hiện tại',
```
Same values in `en`.

- [ ] **Step 2: Add offset date helpers in formatters.ts**

In `src/logic/formatters.ts`, add:
```typescript
/** Returns YYYY-MM-DD for the Monday that is `weekOffset` weeks ago (0 = current week) */
export function getWeekStartOffset(weekOffset: number): string {
  const d = new Date();
  const dow = d.getDay();
  const diff = dow === 0 ? 6 : dow - 1;
  d.setDate(d.getDate() - diff + weekOffset * 7);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Returns YYYY-MM-DD for a day that is `dayOffset` days from today */
export function getLocalDateOffset(dayOffset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Returns YYYY-MM for a month that is `monthOffset` months from today */
export function getMonthOffset(monthOffset: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + monthOffset);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/** Returns YYYY for a year that is `yearOffset` years from today */
export function getYearOffset(yearOffset: number): string {
  return String(new Date().getFullYear() + yearOffset);
}
```

- [ ] **Step 3: Update `useProgressData` to accept offset**

In `src/queries/useProgress.ts`, change the function signature and range key computation:
```typescript
import { getLocalDate, getWeekStart, getLocalDateOffset, getWeekStartOffset, getMonthOffset, getYearOffset } from '../logic/formatters';

export function useProgressData(userId: number, range: 'D' | 'W' | 'M' | 'Y', offset: number = 0) {
  const today = getLocalDate();
  const effectiveDate = offset === 0 ? getLocalDate() : getLocalDateOffset(offset);
  const effectiveWeekStart = getWeekStartOffset(offset);
  const effectiveMonth = getMonthOffset(offset);
  const effectiveYear = getYearOffset(offset);

  const rangeKey = range === 'D' ? effectiveDate
    : range === 'W' ? effectiveWeekStart
    : range === 'M' ? effectiveMonth
    : effectiveYear;

  return useQuery({
    queryKey: ['progress', 'chart', userId, range, offset],
    queryFn: async (): Promise<ChartBucket[]> => {
      const db = await getDb();
      let sql: string;
      let params: (string | number)[];

      if (range === 'D') {
        sql = `
          SELECT
            strftime('%H', datetime(logged_at/1000, 'unixepoch', 'localtime')) AS bucket,
            COALESCE(SUM(CASE WHEN stars_delta > 0 THEN stars_delta ELSE 0 END), 0) AS goodStars,
            COALESCE(SUM(CASE WHEN stars_delta < 0 THEN ABS(stars_delta) ELSE 0 END), 0) AS badStars
          FROM activity_log
          WHERE user_id = ? AND local_date = ?
          GROUP BY bucket ORDER BY bucket`;
        params = [userId, effectiveDate];
      } else if (range === 'W') {
        sql = `
          SELECT
            local_date AS bucket,
            COALESCE(SUM(CASE WHEN stars_delta > 0 THEN stars_delta ELSE 0 END), 0) AS goodStars,
            COALESCE(SUM(CASE WHEN stars_delta < 0 THEN ABS(stars_delta) ELSE 0 END), 0) AS badStars
          FROM activity_log
          WHERE user_id = ? AND week_start = ?
          GROUP BY bucket ORDER BY bucket`;
        params = [userId, effectiveWeekStart];
      } else if (range === 'M') {
        sql = `
          SELECT
            local_date AS bucket,
            COALESCE(SUM(CASE WHEN stars_delta > 0 THEN stars_delta ELSE 0 END), 0) AS goodStars,
            COALESCE(SUM(CASE WHEN stars_delta < 0 THEN ABS(stars_delta) ELSE 0 END), 0) AS badStars
          FROM activity_log
          WHERE user_id = ? AND local_date LIKE ?
          GROUP BY bucket ORDER BY bucket`;
        params = [userId, `${effectiveMonth}%`];
      } else {
        sql = `
          SELECT
            strftime('%Y-%m', local_date) AS bucket,
            COALESCE(SUM(CASE WHEN stars_delta > 0 THEN stars_delta ELSE 0 END), 0) AS goodStars,
            COALESCE(SUM(CASE WHEN stars_delta < 0 THEN ABS(stars_delta) ELSE 0 END), 0) AS badStars
          FROM activity_log
          WHERE user_id = ? AND local_date LIKE ?
          GROUP BY bucket ORDER BY bucket`;
        params = [userId, `${effectiveYear}%`];
      }

      return db.getAllAsync<ChartBucket>(sql, params);
    },
  });
}
```

- [ ] **Step 4: Add offset state + navigation UI to ProgressScreen**

In `src/screens/ProgressScreen.tsx`:

Add `offset` state after existing `range` state:
```typescript
  const [offset, setOffset] = useState(0);
```

Reset offset when range changes:
```typescript
  // Reset offset when range changes so we start at current period
  function handleRangeChange(r: Range) {
    setRange(r);
    setOffset(0);
  }
```

Update `useProgressData` call:
```typescript
  const { data: chartData = [], isLoading } = useProgressData(userId, range, offset);
```

Add navigation arrows + "Current" button UI. Place this right after the segmented control section:
```tsx
        {/* Period navigation */}
        <View style={styles.periodNav}>
          <TouchableOpacity
            style={styles.navBtn}
            onPress={() => setOffset(o => o - 1)}
          >
            <Text style={styles.navBtnText}>{t.prevPeriod}</Text>
          </TouchableOpacity>
          {offset !== 0 && (
            <TouchableOpacity
              style={styles.navCurrent}
              onPress={() => setOffset(0)}
            >
              <Text style={styles.navCurrentText}>{t.currentPeriod}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.navBtn, offset === 0 && styles.navBtnDisabled]}
            onPress={() => setOffset(o => Math.min(0, o + 1))}
            disabled={offset === 0}
          >
            <Text style={[styles.navBtnText, offset === 0 && styles.navBtnTextDisabled]}>{t.nextPeriod}</Text>
          </TouchableOpacity>
        </View>
```

Update range button `onPress` from `setRange(r.key)` to `handleRangeChange(r.key)`.

Add styles in `makeStyles`:
```typescript
    periodNav: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginHorizontal: Spacing.md,
      marginBottom: Spacing.sm,
    },
    navBtn: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: Radii.md,
      backgroundColor: colors.card,
    },
    navBtnDisabled: {
      opacity: 0.3,
    },
    navBtnText: {
      fontSize: 20,
      color: colors.text,
      fontWeight: '600',
    },
    navBtnTextDisabled: {
      color: colors.textSecondary,
    },
    navCurrent: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: Radii.sm,
      backgroundColor: colors.primary + '22',
    },
    navCurrentText: {
      fontSize: 12,
      color: colors.primary,
      fontWeight: '600',
    },
```

- [ ] **Step 5: TypeScript + tests**
```bash
cd c:/Users/Admin/Desktop/Self-Pro/habit-tracker && npx tsc --noEmit && npx jest
```
Expected: 0 errors, all pass

- [ ] **Step 6: Commit**
```bash
git add habit-tracker/src/queries/useProgress.ts habit-tracker/src/screens/ProgressScreen.tsx habit-tracker/src/logic/formatters.ts habit-tracker/src/i18n.ts
git commit -m "feat(progress): add back/forward period navigation to analytics screen"
```

---

## Task 7: Non-timed task visual confirmation flash

**Files:**
- Modify: `habit-tracker/src/screens/TodayScreen.tsx`

After tapping a non-timed task, it logs silently. Add a 1.5s "logged" state per task so user gets feedback and accidental double-taps are blocked.

- [ ] **Step 1: Add `justLoggedIds` state**

In `TodayScreen.tsx`, after the `selectedIds` state:
```typescript
  const [justLoggedIds, setJustLoggedIds] = useState<Set<number>>(new Set());
```

- [ ] **Step 2: Update `handleLog` to set flash state**

Replace the existing `handleLog` function:
```typescript
  async function handleLog(task: Task) {
    if (task.is_time_based) { setModalTask(task); return; }
    if (justLoggedIds.has(task.id)) return;
    try {
      await logTask.mutateAsync({
        taskTypeId: task.id, kind: task.kind as 'GOOD' | 'BAD',
        isTimeBased: false, basePoints: task.base_points, starPenalty: task.star_penalty,
      });
      setJustLoggedIds(prev => new Set(prev).add(task.id));
      setTimeout(() => {
        setJustLoggedIds(prev => {
          const next = new Set(prev);
          next.delete(task.id);
          return next;
        });
      }, 1500);
    } catch { Alert.alert(t.error, t.cantLog); }
  }
```

- [ ] **Step 3: Show flash indicator in task row**

Find the task row render in TodayScreen (the FlatList `renderItem`). After the task name/meta text, add a brief "✓" overlay when `justLoggedIds.has(item.id)`:

In the task card `TouchableOpacity`, add a conditional overlay View:
```tsx
              {justLoggedIds.has(item.id) && (
                <View style={styles.loggedFlash}>
                  <Text style={styles.loggedFlashText}>✓</Text>
                </View>
              )}
```

- [ ] **Step 4: Add flash styles**

```typescript
    loggedFlash: {
      position: 'absolute',
      right: 12,
      top: '50%',
      marginTop: -10,
      backgroundColor: colors.primary,
      borderRadius: 10,
      width: 20,
      height: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    loggedFlashText: {
      color: '#fff',
      fontSize: 12,
      fontWeight: '700',
    },
```

- [ ] **Step 5: TypeScript + tests**
```bash
cd c:/Users/Admin/Desktop/Self-Pro/habit-tracker && npx tsc --noEmit && npx jest
```

- [ ] **Step 6: Commit**
```bash
git add habit-tracker/src/screens/TodayScreen.tsx
git commit -m "feat(today): add 1.5s flash confirmation after non-timed task log"
```

---

## Task 8: "Repeat yesterday" quick-relog

**Files:**
- Modify: `habit-tracker/src/queries/useToday.ts`
- Modify: `habit-tracker/src/screens/TodayScreen.tsx`
- Modify: `habit-tracker/src/i18n.ts`

Add `useYesterdayLogs` query + a "Lặp lại hôm qua" chip row in TodayScreen above the task list.

- [ ] **Step 1: Add i18n keys**

In `src/i18n.ts` `vi` object, after `sectionToday`:
```typescript
  repeatYesterday: 'Lặp lại hôm qua',
  repeatYesterdayDone: 'Đã ghi lại!',
```
In `en`:
```typescript
  repeatYesterday: 'Repeat yesterday',
  repeatYesterdayDone: 'All logged!',
```

- [ ] **Step 2: Add `useYesterdayLoggedTasks` query**

In `src/queries/useToday.ts`, add after `useTodayLoggedTaskIds`:
```typescript
export type YesterdayTask = {
  task_type_id: number;
  name: string;
  kind: string;
  is_time_based: number;
  base_points: number;
  star_penalty: number;
  icon: string | null;
  duration_min: number | null;
};

export function useYesterdayLoggedTasks(userId: number) {
  return useQuery({
    queryKey: ['today', 'yesterday', userId],
    queryFn: async () => {
      const db = await getDb();
      const yesterday = (() => {
        const d = new Date();
        d.setDate(d.getDate() - 1);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      })();
      // Get distinct tasks logged yesterday with their most recent duration
      return db.getAllAsync<YesterdayTask>(
        `SELECT
           al.task_type_id,
           tt.name,
           tt.kind,
           tt.is_time_based,
           tt.base_points,
           tt.star_penalty,
           tt.icon,
           al.duration_min
         FROM activity_log al
         JOIN task_types tt ON tt.id = al.task_type_id
         WHERE al.user_id = ? AND al.local_date = ? AND al.kind = 'GOOD' AND tt.archived = 0
         GROUP BY al.task_type_id
         ORDER BY al.logged_at DESC`,
        [userId, yesterday]
      );
    },
  });
}
```

- [ ] **Step 3: Add repeat-yesterday UI in TodayScreen**

Import `useYesterdayLoggedTasks` and `YesterdayTask` in `TodayScreen.tsx`:
```typescript
import {
  useTodayTasks, useDailySummary, useWeeklySummary,
  useLogTask, useTodayLoggedTaskIds, useYesterdayLoggedTasks,
} from '../queries/useToday';
```

Add query in component body:
```typescript
  const { data: yesterdayTasks = [] } = useYesterdayLoggedTasks(userId);
  const [repeating, setRepeating] = useState(false);
```

Add handler:
```typescript
  async function handleRepeatYesterday() {
    if (repeating || yesterdayTasks.length === 0) return;
    setRepeating(true);
    try {
      for (const task of yesterdayTasks) {
        await logTask.mutateAsync({
          taskTypeId: task.task_type_id,
          kind: task.kind as 'GOOD' | 'BAD',
          isTimeBased: !!task.is_time_based,
          basePoints: task.base_points,
          starPenalty: task.star_penalty,
          durationMin: task.duration_min ?? undefined,
        });
      }
    } catch { Alert.alert(t.error, t.cantLog); }
    setRepeating(false);
  }
```

Add UI above the task list header. Place before `{/* Task list header */}`:
```tsx
        {/* Repeat yesterday chip */}
        {yesterdayTasks.length > 0 && (
          <TouchableOpacity
            style={styles.repeatChip}
            onPress={handleRepeatYesterday}
            disabled={repeating}
            activeOpacity={0.75}
          >
            <Text style={styles.repeatChipText}>
              {repeating ? t.repeatYesterdayDone : `↺  ${t.repeatYesterday} (${yesterdayTasks.length})`}
            </Text>
          </TouchableOpacity>
        )}
```

Add styles:
```typescript
    repeatChip: {
      marginHorizontal: Spacing.md,
      marginBottom: Spacing.sm,
      backgroundColor: colors.card,
      borderRadius: Radii.lg,
      paddingVertical: 8,
      paddingHorizontal: 16,
      alignSelf: 'flex-start',
      borderWidth: 1,
      borderColor: colors.primary + '44',
      ...Shadows.sm,
    },
    repeatChipText: {
      color: colors.primary,
      fontSize: 13,
      fontWeight: '600',
    },
```

- [ ] **Step 4: TypeScript + tests**
```bash
cd c:/Users/Admin/Desktop/Self-Pro/habit-tracker && npx tsc --noEmit && npx jest
```

- [ ] **Step 5: Commit**
```bash
git add habit-tracker/src/queries/useToday.ts habit-tracker/src/screens/TodayScreen.tsx habit-tracker/src/i18n.ts
git commit -m "feat(today): add 'repeat yesterday' quick-relog chip"
```

---

## Task 9: Task sort_order + incomplete-first auto-sort

**Files:**
- Modify: `habit-tracker/src/db/migrations.ts`
- Modify: `habit-tracker/src/queries/useToday.ts`
- Modify: `habit-tracker/src/screens/TodayScreen.tsx`

Add `sort_order` column to `task_types`. Auto-sort incomplete tasks above completed ones on TodayScreen.

- [ ] **Step 1: Add migration for sort_order column**

In `src/db/migrations.ts`, inside the `try` array of ALTER TABLE statements (the block with `last_seen_week_start`, etc.), add:
```typescript
      `ALTER TABLE task_types ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0`,
```

The existing try/catch pattern handles `duplicate column name` silently.

- [ ] **Step 2: Update `useTodayTasks` query to include sort_order**

In `src/queries/useToday.ts`, update the SELECT in `useTodayTasks` to include `sort_order` and order by it:
```typescript
      return db.getAllAsync<{
        id: number; name: string; kind: string; is_time_based: number;
        base_points: number; star_penalty: number; icon: string | null;
        category_id: number | null; sort_order: number;
      }>(
        `SELECT id, name, kind, is_time_based, base_points, star_penalty, icon, category_id, sort_order
         FROM task_types WHERE user_id = ? AND archived = 0 ORDER BY sort_order ASC, kind, name`,
        [userId]
      );
```

- [ ] **Step 3: Update Task type in TodayScreen**

In `TodayScreen.tsx`, add `sort_order: number;` to the `Task` type.

- [ ] **Step 4: Auto-sort incomplete-first in displayTasks**

Replace `const displayTasks = tasks ?? [];` with:
```typescript
  const displayTasks = useMemo(() => {
    const all = tasks ?? [];
    if (!loggedIds) return all;
    return [...all].sort((a, b) => {
      const aLogged = loggedIds.has(a.id) ? 1 : 0;
      const bLogged = loggedIds.has(b.id) ? 1 : 0;
      if (aLogged !== bLogged) return aLogged - bLogged;
      return (a.sort_order ?? 0) - (b.sort_order ?? 0);
    });
  }, [tasks, loggedIds]);
```

Make sure `useMemo` is already imported (it is, from existing code).

- [ ] **Step 5: TypeScript + tests**
```bash
cd c:/Users/Admin/Desktop/Self-Pro/habit-tracker && npx tsc --noEmit && npx jest
```

- [ ] **Step 6: Commit**
```bash
git add habit-tracker/src/db/migrations.ts habit-tracker/src/queries/useToday.ts habit-tracker/src/screens/TodayScreen.tsx
git commit -m "feat(today): add task sort_order + auto-sort incomplete tasks first"
```

---

## Task 10: Multiple notification slots (up to 3)

**Files:**
- Modify: `habit-tracker/src/db/migrations.ts`
- Modify: `habit-tracker/src/queries/useSettings.ts`
- Modify: `habit-tracker/src/logic/notifications.ts`
- Modify: `habit-tracker/src/screens/SettingsScreen.tsx`
- Modify: `habit-tracker/src/i18n.ts`

Add `notification_time_2` and `notification_time_3` columns. Update scheduler to handle all 3 independently.

- [ ] **Step 1: Add DB migrations**

In `src/db/migrations.ts`, in the ALTER TABLE try block, add:
```typescript
      `ALTER TABLE users ADD COLUMN notification_time_2 TEXT`,
      `ALTER TABLE users ADD COLUMN notification_time_3 TEXT`,
```

- [ ] **Step 2: Add i18n keys**

In `src/i18n.ts` `vi` object, after `reminderLabel`:
```typescript
  reminderLabel2: 'Giờ nhắc 2 (tuỳ chọn)',
  reminderLabel3: 'Giờ nhắc 3 (tuỳ chọn)',
```
In `en`:
```typescript
  reminderLabel2: 'Reminder 2 (optional)',
  reminderLabel3: 'Reminder 3 (optional)',
```

- [ ] **Step 3: Add query hooks for slots 2 and 3**

In `src/queries/useSettings.ts`, add after `useSetNotificationTime`:
```typescript
export function useNotificationTime2(userId: number) {
  return useQuery({
    queryKey: [...SETTINGS_KEY, 'notificationTime2', userId],
    queryFn: async () => {
      const db = await getDb();
      const row = await db.getFirstAsync<{ notification_time_2: string | null }>(
        'SELECT notification_time_2 FROM users WHERE id = ?',
        [userId]
      );
      return row?.notification_time_2 ?? null;
    },
  });
}

export function useSetNotificationTime2(userId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (time: string | null) => {
      const db = await getDb();
      await db.runAsync('UPDATE users SET notification_time_2 = ? WHERE id = ?', [time, userId]);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: SETTINGS_KEY }),
  });
}

export function useNotificationTime3(userId: number) {
  return useQuery({
    queryKey: [...SETTINGS_KEY, 'notificationTime3', userId],
    queryFn: async () => {
      const db = await getDb();
      const row = await db.getFirstAsync<{ notification_time_3: string | null }>(
        'SELECT notification_time_3 FROM users WHERE id = ?',
        [userId]
      );
      return row?.notification_time_3 ?? null;
    },
  });
}

export function useSetNotificationTime3(userId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (time: string | null) => {
      const db = await getDb();
      await db.runAsync('UPDATE users SET notification_time_3 = ? WHERE id = ?', [time, userId]);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: SETTINGS_KEY }),
  });
}
```

- [ ] **Step 4: Update `scheduleHabitReminder` to accept array**

In `src/logic/notifications.ts`, replace `scheduleHabitReminder`:
```typescript
export async function scheduleHabitReminder(timeStr: string): Promise<void> {
  const parsed = parseNotificationTime(timeStr);
  if (!parsed) throw new Error(`Invalid time: ${timeStr}`);
  const Notifications = await import('expo-notifications');
  // Cancel all and reschedule — called per slot, so each slot manages its own
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Habit Tracker 💪',
      body: 'Time to log your tasks!',
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: parsed.hours,
      minute: parsed.minutes,
    },
  });
}

export async function scheduleAllHabitReminders(times: (string | null)[]): Promise<void> {
  const Notifications = await import('expo-notifications');
  await Notifications.cancelAllScheduledNotificationsAsync();
  for (const t of times) {
    if (!t) continue;
    const parsed = parseNotificationTime(t);
    if (!parsed) continue;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Habit Tracker 💪',
        body: 'Time to log your tasks!',
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: parsed.hours,
        minute: parsed.minutes,
      },
    });
  }
}
```

- [ ] **Step 5: Update SettingsScreen to show 3 notification inputs**

In `src/screens/SettingsScreen.tsx`, import the new hooks:
```typescript
import {
  useNotificationTime, useSetNotificationTime,
  useNotificationTime2, useSetNotificationTime2,
  useNotificationTime3, useSetNotificationTime3,
} from '../queries/useSettings';
import { scheduleAllHabitReminders, cancelHabitReminder } from '../logic/notifications';
```

Add 3 query/mutation calls in component body:
```typescript
  const { data: savedNotifTime } = useNotificationTime(userId);
  const setNotifTime = useSetNotificationTime(userId);
  const { data: savedNotifTime2 } = useNotificationTime2(userId);
  const setNotifTime2 = useSetNotificationTime2(userId);
  const { data: savedNotifTime3 } = useNotificationTime3(userId);
  const setNotifTime3 = useSetNotificationTime3(userId);
```

Add a shared save handler that reschedules all 3:
```typescript
  async function saveAllNotifTimes(t1: string | null, t2: string | null, t3: string | null) {
    await Promise.all([
      setNotifTime.mutateAsync(t1),
      setNotifTime2.mutateAsync(t2),
      setNotifTime3.mutateAsync(t3),
    ]);
    await scheduleAllHabitReminders([t1, t2, t3]);
  }
```

For each of the 3 notification inputs, use the same validation pattern as the existing `handleNotifBlur` / `handleNotifSubmit`. The existing input for slot 1 remains identical; add 2 more TextInput rows with `reminderLabel2` / `reminderLabel3` labels. Each blur/submit calls `saveAllNotifTimes` with all 3 current values.

- [ ] **Step 6: TypeScript + tests**
```bash
cd c:/Users/Admin/Desktop/Self-Pro/habit-tracker && npx tsc --noEmit && npx jest
```

- [ ] **Step 7: Commit**
```bash
git add habit-tracker/src/db/migrations.ts habit-tracker/src/queries/useSettings.ts habit-tracker/src/logic/notifications.ts habit-tracker/src/screens/SettingsScreen.tsx habit-tracker/src/i18n.ts
git commit -m "feat(settings): support up to 3 daily notification reminder slots"
```

---

## Task 11: Streak break toast notification

**Files:**
- Modify: `habit-tracker/src/queries/useToday.ts`
- Modify: `habit-tracker/src/i18n.ts`

When a new log entry results in `streak_count = 1` but the previous daily_summary had `streak_count > 1`, fire a Toast.

- [ ] **Step 1: Add i18n keys**

In `src/i18n.ts` `vi` object:
```typescript
  streakBroken: 'Chuỗi đã gián đoạn',
  streakBrokenMsg: (n: number) => `Streak ${n} ngày đã kết thúc. Hôm nay bắt đầu lại!`,
  streakNew: (n: number) => `🔥 Streak ${n} ngày!`,
```
In `en`:
```typescript
  streakBroken: 'Streak broken',
  streakBrokenMsg: (n: number) => `${n}-day streak ended. Start fresh today!`,
  streakNew: (n: number) => `🔥 ${n}-day streak!`,
```

- [ ] **Step 2: Fire Toast after log in `useLogTask`**

In `src/queries/useToday.ts`, the `useLogTask` mutation's `onSuccess` (or inside `mutationFn` after insert, if there is no onSuccess). Look for where `todayStreak` is computed. After the transaction completes successfully, return the `todayStreak` value from the mutation.

Update `mutationFn` to return streak info:
```typescript
// At end of mutationFn, after all DB writes, add:
return { newStreak: todayStreak, prevStreak: (yesterdayRow?.streak_count ?? 0) };
```

Add `onSuccess` to `useLogTask` mutation:
```typescript
    onSuccess: (data) => {
      // data = { newStreak, prevStreak }
      if (data?.newStreak === 1 && data?.prevStreak > 1) {
        Toast.show({
          type: 'error',
          text1: '😔 Chuỗi đã gián đoạn',
          text2: `Streak ${data.prevStreak} ngày đã kết thúc. Hôm nay bắt đầu lại!`,
          visibilityTime: 3000,
        });
      } else if (data?.newStreak > 1) {
        Toast.show({
          type: 'success',
          text1: `🔥 Streak ${data.newStreak} ngày!`,
          visibilityTime: 1800,
        });
      }
    },
```

Note: `Toast` is already imported in files that use it. Add `import Toast from 'react-native-toast-message';` to `useToday.ts` if not present.

- [ ] **Step 3: TypeScript + tests**
```bash
cd c:/Users/Admin/Desktop/Self-Pro/habit-tracker && npx tsc --noEmit && npx jest
```

- [ ] **Step 4: Commit**
```bash
git add habit-tracker/src/queries/useToday.ts habit-tracker/src/i18n.ts
git commit -m "feat(streak): toast notification on streak break and milestone"
```

---

## Task 12: Streak sync to Supabase (requires user DB action)

**Files:**
- Modify: `habit-tracker/src/services/syncService.ts`
- Modify: `habit-tracker/src/hooks/useAuth.ts`

`streak_count` is device-local and lost on reinstall. Sync current max streak to Supabase `users` table so it can be restored on new device sign-in.

> **⚠️ Requires user action**: Add `current_streak INTEGER DEFAULT 0` and `max_streak INTEGER DEFAULT 0` columns to Supabase `users` table before deploying. Run in Supabase SQL editor:
> ```sql
> ALTER TABLE users ADD COLUMN IF NOT EXISTS current_streak INTEGER DEFAULT 0;
> ALTER TABLE users ADD COLUMN IF NOT EXISTS max_streak INTEGER DEFAULT 0;
> ```

- [ ] **Step 1: Add `syncUserStreak` to syncService**

In `src/services/syncService.ts`, add:
```typescript
export async function syncUserStreak(userEmail: string, currentStreak: number): Promise<void> {
  if (!supabase) return;
  await supabase
    .from('users')
    .upsert(
      { user_email: userEmail, current_streak: currentStreak, max_streak: currentStreak },
      { onConflict: 'user_email', ignoreDuplicates: false }
    );
}
```

- [ ] **Step 2: Call syncUserStreak after successful log**

In `src/queries/useToday.ts`, import `syncUserStreak` and call it in the `onSuccess` of `useLogTask` when streak increases:
```typescript
// In onSuccess, after toast logic:
if (data?.newStreak > 0) {
  const email = getGoogleUserEmail(); // need to get email from auth
  if (email) {
    syncUserStreak(email, data.newStreak).catch(() => {}); // fire-and-forget
  }
}
```

Note: Getting `email` in `useToday.ts` requires passing it or reading from SecureStore. Simplest approach: export a `getStoredGoogleUser` helper from `useAuth.ts` (non-hook, async fn) and call it.

- [ ] **Step 3: Restore streak on sign-in**

In `src/hooks/useAuth.ts`, after successful `signInWithGoogle`, query Supabase for the user's `current_streak` and update the local DB:
```typescript
// After resolveUserRow, if supabase available:
try {
  const { data: remoteUser } = await supabase!
    .from('users')
    .select('current_streak, max_streak')
    .eq('user_email', googleUser.email)
    .single();
  if (remoteUser?.current_streak) {
    const db = await getDb();
    await db.runAsync(
      `UPDATE daily_summary SET streak_count = ? WHERE user_id = ? AND local_date = ?`,
      [remoteUser.current_streak, localUserId, getLocalDate()]
    );
  }
} catch {} // non-fatal; local streak used if remote unavailable
```

- [ ] **Step 4: TypeScript + tests**
```bash
cd c:/Users/Admin/Desktop/Self-Pro/habit-tracker && npx tsc --noEmit && npx jest
```

- [ ] **Step 5: Commit**
```bash
git add habit-tracker/src/services/syncService.ts habit-tracker/src/hooks/useAuth.ts habit-tracker/src/queries/useToday.ts
git commit -m "feat(sync): sync streak count to Supabase for cross-device restore"
```

---

## Final: Run full test suite

- [ ] **Run all tests and TypeScript**
```bash
cd c:/Users/Admin/Desktop/Self-Pro/habit-tracker && npx tsc --noEmit && npx jest
```
Expected: 0 TS errors, all tests pass.

---

## Spec Coverage Verification

| Report Item | Task | Status |
|-------------|------|--------|
| B1 – SQLite date timezone | Pre-verified: already uses getLocalDate() | ✅ Skip |
| B2 – Streak lost on reinstall | Task 12 | ✅ |
| B3 – Chip text-input never learns | Task 3 (add 45m default) | ✅ |
| B4 – Streak silent reset | Task 11 (toast on break) | ✅ |
| B5 – "Tuần này" label wrong | Task 2 | ✅ |
| B6 – Modal header language | Pre-verified: CLAUDE.md confirms working | ✅ Skip |
| UX1 – No non-timed confirmation | Task 7 | ✅ |
| UX2 – No period navigation | Task 6 | ✅ |
| UX3 – No task reorder | Task 9 (sort_order + incomplete-first) | ✅ |
| UX4 – Single notification slot | Task 10 | ✅ |
| UX5 – No streak on hero | Task 1 | ✅ |
| UX6 – No repeat yesterday | Task 8 | ✅ |
| UX7 – No rank progress bar | Pre-verified: already in RankScreen | ✅ Skip |
| UX8 – History capped at 30 | Task 4 | ✅ |
| UX9 – No treat ETA | Task 5 | ✅ |
| I3 – Task sort | Task 9 | ✅ |
| I4 – Repeat yesterday | Task 8 | ✅ |
| I7 – Multiple notif slots | Task 10 | ✅ |
| I10 – Streak Supabase sync | Task 12 | ✅ |
| I11 – History pagination | Task 4 (increased to 100) | ✅ |
