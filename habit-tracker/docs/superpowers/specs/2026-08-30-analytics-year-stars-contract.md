# Analytics Year Stars Contract

## Goal

Every account-level star total shown in Home, Rank/Global, Friends, Profile, and Trophy Shelf uses the same Analytics Year KPI. Global and Friends rival rows use their server-calculated annual KPI; the signed-in row's visible total uses the local Analytics Year KPI so it remains consistent with Home and Analytics.

## Canonical metric

For each account, Analytics Year stars are the sum of positive `activity_log.stars_delta` rows where `source = 'TASK'`, `local_date` is between the first day of the current calendar year and today, and the account's `activity_start_date` is respected when present. The metric is rounded down to a whole number for display.

## Boundaries

- `users.lifetime_stars`, `current_tier_id`, rewards, treat balances, and backup/recovery accounting remain internal lifetime/economy state unless separately changed by a future requirement.
- No account-specific display correction mutates activity, rank metadata, or cloud data.
- The annual Global/Friends RPCs must return no emails or other private identity data.
- If the annual RPC is not deployed, the client must fail closed as unavailable instead of falling back to lifetime stars.
- Existing lifetime RPCs remain available for older released clients.

## Follow-up display correction (2026-09-01)

The live annual RPC can include historical or other-device activity that is not
present in the current local Analytics Year database. For the signed-in account,
the visible Global and Friends star field therefore follows the local Analytics
Year KPI used by Home and Analytics; rival rows retain their own server-provided
annual totals, and server rank metadata/order remain unchanged. No cloud rows are
deleted or rewritten by this display correction.
