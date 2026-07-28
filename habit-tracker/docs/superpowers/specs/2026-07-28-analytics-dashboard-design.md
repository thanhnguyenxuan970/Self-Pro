# Analytics dashboard redesign

## Goal

Replace the Analytics dashboard with the provided dark-dashboard layout while
keeping activity-log management below it.

## Visual contract

- Header: `Analytics`, range subtitle, and Week / Month / Year segmented tabs.
- Volume: Points, Stars, and Days at goal; each shows the selected range and
  comparison with the preceding equivalent range.
- Chart: paired bars for current versus previous range, daily for Week,
  weekly for Month, and monthly for Year. The current series is yellow and the
  comparison is muted. The goal line, labels, and summary follow the reference.
- Consistency: three rings for this week, 30 days, and all time.
- Rhythm: weekday distribution plus hourly distribution.
- Composition: habit rows with share, log count, and week-over-week change.
- Theme: both light and dark palettes use the same hierarchy and layout. The
  app must respect the user's theme setting rather than force light mode.
- Vietnamese and English text follows the app language setting. English month
  labels use Jan-Dec; Vietnamese labels use T1-T12.

## Data and QA fixture

Production data is aggregated from local SQLite: `daily_summary` supplies
points and active days; `activity_log` supplies stars, logs, hours, and habit
composition. Values must reconcile with the plotted bars.

`EXPO_PUBLIC_ANALYTICS_DEMO=1` enables a development-only fixture with the
reference's stress-case distribution. It never runs in production and does not
write to SQLite.

## Boundaries

`ProgressScreen` remains the owner. Add a focused dashboard query/model and
small visual components only when they reduce the screen's existing density.
Do not change Home heatmap, rewards, rank calculations, or activity-log write
logic.

## Verification

- Unit-test aggregation, range padding, comparison deltas, localization, and
  demo-fixture isolation.
- TypeScript, Jest, and diff check pass.
- Android emulator: rapid range switching, cold starts, English/Vietnamese,
  and light/dark screenshots with no crash.
