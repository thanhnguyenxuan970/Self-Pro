# Analytics Year Stars Contract

## Goal

Every account-level star total shown in Home, Rank/Global, Friends, Profile, and Trophy Shelf uses the same Analytics Year KPI. The Global and Friends rankings must calculate that KPI server-side for every player; a client-side override for only the signed-in player is not acceptable.

## Canonical metric

For each account, Analytics Year stars are the sum of positive `activity_log.stars_delta` rows where `source = 'TASK'`, `local_date` is between the first day of the current calendar year and today, and the account's `activity_start_date` is respected when present. The metric is rounded down to a whole number for display.

## Boundaries

- `users.lifetime_stars`, `current_tier_id`, rewards, treat balances, and backup/recovery accounting remain internal lifetime/economy state unless separately changed by a future requirement.
- No account-specific numeric override is added to make a screenshot pass.
- The annual Global/Friends RPCs must return no emails or other private identity data.
- If the annual RPC is not deployed, the client must fail closed as unavailable instead of falling back to lifetime stars.
- Existing lifetime RPCs remain available for older released clients.
