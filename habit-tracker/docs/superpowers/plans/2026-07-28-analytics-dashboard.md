# Analytics Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Analytics dashboard with the reference's data-backed Volume, paired chart, Consistency, Rhythm, and Composition surfaces.

**Architecture:** Keep `ProgressScreen` as the screen owner. `useAnalyticsDashboard` returns one range-aware SQLite view model; presentational dashboard sections render it with existing theme and translation hooks. A development-only fixture replaces the query result only when the explicit Expo variable is enabled.

**Tech Stack:** React Native, TypeScript, expo-sqlite, TanStack Query, Jest, React Native Animated.

## Global Constraints

- Production reads `daily_summary` and append-only `activity_log`; no dashboard mock writes to SQLite.
- The dashboard respects the existing user theme and language settings.
- `EXPO_PUBLIC_ANALYTICS_DEMO=1` is development-only.
- Preserve the activity-log management surface below the dashboard.

---

### Task 1: Dashboard aggregation and fixture

**Files:**
- Create: `src/analytics/dashboardModel.ts`
- Modify: `src/queries/useProgress.ts`
- Test: `__tests__/analyticsDashboard.test.ts`

**Interfaces:**
- Produces `AnalyticsDashboard`, `buildAnalyticsDashboard(rows, range)`, and `useAnalyticsDashboard(userId, range)`.
- `AnalyticsDashboard` contains volume totals/deltas, paired chart buckets, consistency values, weekday/hour distributions, and composition rows.

- [ ] Write failing model tests for current/previous totals, seven paired week buckets, weekday/hour aggregation, and composition delta.
- [ ] Run `npx jest __tests__/analyticsDashboard.test.ts --runInBand`; expect failure because the model does not exist.
- [ ] Implement pure range/padding/aggregation helpers in `dashboardModel.ts` and one parameterized SQLite query hook in `useProgress.ts`.
- [ ] Add a static fixture returned only when `__DEV__ && process.env.EXPO_PUBLIC_ANALYTICS_DEMO === '1'`.
- [ ] Run the focused test; expect pass.

### Task 2: Reference dashboard UI

**Files:**
- Create: `src/components/analytics/AnalyticsDashboard.tsx`
- Modify: `src/screens/ProgressScreen.tsx`, `src/config/i18n.ts`, `app.json`
- Test: `__tests__/localization.test.ts`

**Interfaces:**
- Consumes `AnalyticsDashboard`, `AppColors`, translations, reduced-motion flag, and selected range.
- Renders Volume cards, paired chart, consistency rings, rhythm bars, and composition rows.

- [ ] Add failing localization expectations for dashboard labels in English and Vietnamese.
- [ ] Replace the existing Analytics summary/chart section with `AnalyticsDashboard`; leave `ActivityLogSection` unchanged below it.
- [ ] Use fixed-size SVG/View rings and proportional bars; animate only bar/ring fills when reduced motion is off.
- [ ] Set `userInterfaceStyle` to `automatic` so existing `useTheme()` palettes can render both themes.
- [ ] Run focused localization and dashboard tests; expect pass.

### Task 3: Verification and ship gate

**Files:**
- Modify: `docs/superpowers/specs/2026-07-28-analytics-dashboard-design.md` only if final behavior differs.

- [ ] Run `npx tsc --noEmit`, `npx jest --runInBand`, and `git diff --check`.
- [ ] Build/install x86_64 debug APK, enable the demo fixture, and compare Week, Month, Year with the reference.
- [ ] Repeat interaction under English/Vietnamese and light/dark; rapidly switch all three ranges and cold-start the app five times.
- [ ] Capture screenshots and inspect logcat for React Native/native crashes.
- [ ] Commit only the dashboard, tests, localization, config, and approved documentation.
