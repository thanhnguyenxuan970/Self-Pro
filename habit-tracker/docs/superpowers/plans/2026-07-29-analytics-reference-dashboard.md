# Analytics Reference Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the SQLite-backed Analytics dashboard match the supplied Week, Month, and Year phone references.

**Architecture:** Keep `ProgressScreen` as the range/header and activity-log owner. Keep `AnalyticsDashboardView` as the sole dashboard renderer, fed by the existing `buildAnalyticsDashboard` SQLite view model. Limit changes to presentation tokens/layout and any range-label data necessary to faithfully render the references.

**Tech Stack:** Expo SDK 56, React Native, TypeScript, expo-sqlite, TanStack Query, Jest.

## Global Constraints

- Do not add a chart dependency, API, table, or mock data.
- Preserve real `daily_summary.total_points` / `activity_log` aggregation, activity-log management, localization, 44-point range targets, and reduced-motion behavior.
- Preserve current dirty worktree changes; reconcile Analytics edits instead of overwriting or staging unrelated files.
- Keep Month daily, Year Jan--Dec monthly, and the fixed 25-point daily goal.

---

### Task 1: Lock the range data contract

**Files:**
- Modify: `__tests__/analyticsDashboard.test.ts`
- Modify: `src/analytics/dashboardModel.ts`

**Interfaces:**
- Consumes: `buildAnalyticsDashboard(daily, logs, range, today)`.
- Produces: `AnalyticsDashboard` with seven/partial-month/twelve bars, goal `25`, and SQLite-derived rhythm/composition totals.

- [ ] **Step 1: Add failing assertions for the reference range invariants**

```ts
expect(week.bars).toHaveLength(7);
expect(month.bars.map(bar => bar.label).filter(Boolean)).toEqual(['1', '8', '15', '22']);
expect(year.bars).toHaveLength(12);
expect(year.goal).toBe(25);
```

- [ ] **Step 2: Run the focused test to verify the assertion fails before a behavioral change**

Run: `npx.cmd jest __tests__/analyticsDashboard.test.ts --runInBand`

Expected: FAIL only if the current implementation violates one of the four explicit range invariants.

- [ ] **Step 3: Make the smallest model correction, only if Step 2 fails**

```ts
const currentDates = Array.from({ length: range === 'Y' ? 12 : count }, ...);
const labels = currentDates.map(date => range === 'M' ? (date.getDate() % 7 === 1 ? String(date.getDate()) : '') : ...);
```

Keep existing aggregation from `daily_summary` and `activity_log`; do not introduce a separate reference-data path.

- [ ] **Step 4: Run focused regression coverage**

Run: `npx.cmd jest __tests__/analyticsDashboard.test.ts --runInBand`

Expected: PASS.

- [ ] **Step 5: Commit only the model/test files if they changed**

```powershell
git add -- __tests__/analyticsDashboard.test.ts src/analytics/dashboardModel.ts
git commit -m "test(analytics): lock reference dashboard ranges"
```

### Task 2: Match the reference dashboard surface

**Files:**
- Modify: `src/config/theme.ts`
- Modify: `src/screens/ProgressScreen.tsx`
- Modify: `src/components/analytics/AnalyticsDashboardView.tsx`

**Interfaces:**
- Consumes: `AnalyticsDashboardView({ data, colors, isDark, language, range, reduceMotion, animationKey })`.
- Produces: the Volume, Consistency, Rhythm, and Composition cards with the selected range visual state.

- [ ] **Step 1: Add targeted renderer assertions where the project supports them; otherwise record the screenshot acceptance cases**

```ts
// Acceptance cases: selected tab is purple; cards are white on the black
// Analytics canvas; goal label remains readable above every bar; no text clips.
```

- [ ] **Step 2: Inspect the existing dirty diff before editing these shared files**

Run: `git diff -- src/config/theme.ts src/screens/ProgressScreen.tsx src/components/analytics/AnalyticsDashboardView.tsx`

Expected: preserve existing user edits and layer only the screenshot-matching changes on top.

- [ ] **Step 3: Apply the smallest styling changes in the existing renderer**

```tsx
<View style={[s.metrics, { marginBottom: 14 }]}>
  {metric(data.points, data.previousPoints, t.points)}
  {metric(data.stars, data.previousStars, t.stars)}
  {metric(data.daysAtGoal, data.previousDaysAtGoal, t.goal, `/${data.possibleDays}`)}
</View>
```

Use existing `colors`, `FontFamily`, and `Radii`; keep `goalText` with both `zIndex: 1` and `elevation: 1` so Android bars cannot paint over it. Match the references through spacing, white cards, purple visual accent, chart density, and typography — not fixed example numbers.

- [ ] **Step 4: Type-check and inspect the patch**

Run: `npx.cmd tsc --noEmit; git diff --check`

Expected: both exit successfully.

- [ ] **Step 5: Commit only the renderer/theme/screen files edited for the reference surface**

```powershell
git add -- src/config/theme.ts src/screens/ProgressScreen.tsx src/components/analytics/AnalyticsDashboardView.tsx
git commit -m "feat(analytics): match reference dashboard"
```

### Task 3: Android visual acceptance

**Files:**
- No source changes required unless acceptance fails.

**Interfaces:**
- Consumes: installed Android debug app and the Week/Month/Year range tabs.
- Produces: phone screenshots showing reference-consistent cards and readable chart annotations.

- [ ] **Step 1: Build/install and launch the current debug app**

```powershell
Set-Location android; .\gradlew.bat :app:installDebug --console=plain
adb devices
```

- [ ] **Step 2: Capture a current Analytics screenshot and derive tab coordinates from its UI tree**

```powershell
adb -s <serial> exec-out uiautomator dump /dev/tty > $env:TEMP\analytics-ui.xml
python C:\Users\Admin\.codex\skills\android-emulator-qa\scripts\ui_pick.py $env:TEMP\analytics-ui.xml "Month"
```

- [ ] **Step 3: Capture Week, Month, and Year after tapping UI-tree-derived centres**

```powershell
adb -s <serial> shell input tap <month-x> <month-y>
adb -s <serial> exec-out screencap -p > $env:TEMP\analytics-month.png
```

Repeat for Week and Year; compare black canvas, white cards, purple selection, goal-label layering, and no clipping against supplied references.

- [ ] **Step 4: Run full non-release verification**

Run: `npx.cmd jest --runInBand; npx.cmd tsc --noEmit; git diff --check`

Expected: all commands exit successfully.

- [ ] **Step 5: Commit an acceptance-only documentation update only if one is required by the project workflow**

```powershell
git status --short
```

Do not stage existing unrelated changes.
