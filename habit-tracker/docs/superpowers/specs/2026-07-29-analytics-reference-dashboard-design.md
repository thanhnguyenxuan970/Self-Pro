# Analytics reference dashboard

## Goal

Match the supplied phone references for the Analytics dashboard while retaining
the existing activity-log management surface and real local SQLite data.

## Scope

- Keep the black Analytics canvas, white cards, purple selected state, and
  three-part KPI card.
- Preserve Week, Month, and Year ranges: seven daily bars with previous-week
  comparison, current-month daily bars, and Jan--Dec monthly bars.
- Present Volume, Consistency, Rhythm, and Composition in the reference order.
- Use existing dashboard query/model data; no new database tables, chart
  packages, or mock values.
- Retain localization, 44-point tab targets, and reduced-motion behavior.

## Implementation boundary

`ProgressScreen` owns the header, selected range, background, and activity log.
`AnalyticsDashboardView` is the shared visual renderer. `dashboardModel.ts`
continues to provide the existing SQLite-derived range data. Styling and
small display-model corrections stay in those existing files only.

## Verification

Run focused analytics tests, TypeScript, and diff checks. Build/install the
Android debug app, inspect Week, Month, and Year screenshots on an emulator,
and confirm the goal label remains above chart bars.
