# Analytics Reference Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing Analytics dashboard match the supplied Week, Month, and Year reference while keeping every metric data-backed.

**Architecture:** Keep `ProgressScreen` as the owner and reuse `useAnalyticsDashboard`. Expand its pure view model with a dynamic goal and range labels, then make `AnalyticsDashboardView` render the supplied layout with native `Animated` fills. Activity-log management remains below the dashboard.

**Tech Stack:** React Native, TypeScript, expo-sqlite, TanStack Query, Jest, React Native Animated.

## Global Constraints

- Read only `daily_summary` and append-only `activity_log`; never write fixture data to SQLite.
- Goal is the maximum available daily `total_points`, or zero with no data.
- Respect the app language, theme, and `useReduceMotion()`.
- Do not add a chart or SVG dependency.

---

### Task 1: Correct dashboard range model

**Files:**
- Modify: `src/analytics/dashboardModel.ts`
- Modify: `__tests__/analyticsDashboard.test.ts`

**Interfaces:**
- `buildAnalyticsDashboard(daily, logs, range, today)` derives `goal` from all supplied daily rows.
- `AnalyticsDashboard` exposes `goal`, period-aware chart title/labels, and totals which reconcile to `bars`.

- [ ] **Step 1: Write failing dynamic-goal tests**

```ts
expect(result.goal).toBe(92);
expect(result.daysAtGoal).toBe(1);
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npx jest __tests__/analyticsDashboard.test.ts --runInBand`

- [ ] **Step 3: Implement the minimum model changes**

```ts
const goal = Math.max(0, ...daily.map(row => row.total_points));
```

Use this value for all goal comparisons; keep weekly/monthly daily bars and yearly monthly bars.

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `npx jest __tests__/analyticsDashboard.test.ts --runInBand`

### Task 2: Match the reference dashboard surface

**Files:**
- Modify: `src/components/analytics/AnalyticsDashboardView.tsx`
- Modify: `src/screens/ProgressScreen.tsx`

**Interfaces:**
- `AnalyticsDashboardView` receives `data`, `language`, `isDark`, `colors`, `reduceMotion`, and a changing `animationKey`.
- It renders Volume, paired chart, Consistency, Rhythm, and Composition in that order.

- [ ] **Step 1: Write a failing model assertion for the chart goal label**

```ts
expect(result.goal).toBe(92);
```

- [ ] **Step 2: Run the focused test and verify it fails before Task 1 implementation**

Run: `npx jest __tests__/analyticsDashboard.test.ts --runInBand`

- [ ] **Step 3: Render the minimal reference surface**

Use existing theme/font tokens and native `Animated` values for selected-tab, bar, and ring progress. Replace every hard-coded `50` in the dashboard view with `data.goal`; select Month/Year copy from `range`; render ring arcs with existing views rather than a new dependency.

- [ ] **Step 4: Run TypeScript and focused tests**

Run: `npx tsc --noEmit; npx jest __tests__/analyticsDashboard.test.ts --runInBand`

### Task 3: Android verification

**Files:**
- Test only; no source changes planned.

- [ ] **Step 1: Run full static suite**

Run: `npx jest --runInBand; git diff --check`

- [ ] **Step 2: Install and inspect Android build**

Run: `Set-Location android; .\gradlew.bat app:installDebug -PreactNativeArchitectures=x86_64`

Use emulator UI-tree coordinates to select Week, Month, and Year; capture screenshots in English and Vietnamese plus light and dark modes.

- [ ] **Step 3: Verify motion and cold starts**

Switch ranges rapidly five times, cold-start five times, and inspect crash logcat. Reduced Motion must show final states without movement.

- [ ] **Step 4: Commit focused source, tests, and approved docs**

Run: `git add src/analytics/dashboardModel.ts src/components/analytics/AnalyticsDashboardView.tsx src/screens/ProgressScreen.tsx __tests__/analyticsDashboard.test.ts docs/superpowers/specs/2026-07-28-analytics-dashboard-design.md docs/superpowers/plans/2026-07-28-analytics-reference-refresh.md; git commit -m "feat: refine analytics reference dashboard"`
