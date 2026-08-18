-- Companion to 036. Setting users.lifetime_stars alone will not hold:
-- sync_lifetime_stars() recomputes GREATEST(stored, SUM(positive stars_delta
-- in activity_log)) on every sync, so as long as activity_log itself sums
-- higher than the corrected value, the very next sync silently re-inflates it.
--
-- These two groups cannot have come from the real app for this account:
--   * kind = 'TASK' -- the app only ever writes kind 'GOOD' or 'BAD'
--     (see src/game/logTask.ts, src/config/constants.ts); nothing in the
--     codebase produces kind = 'TASK'.
--   * source = 'emulator_demo' -- this literal string does not exist
--     anywhere in the app's source; SOURCE_TASK ('TASK') and
--     SOURCE_DAILY_BONUS ('DAILY_BONUS') are the only sources the app emits.
-- Both were inserted directly (seed/demo script), not through real usage.
--
-- Removing them brings this account's activity-derived total from 1417 to
-- ~484 (still above the 252 set in 036 -- the remaining TASK/GOOD,
-- DAILY_BONUS, and CHALLENGE rows are shapes the real app could have
-- produced, so further trimming needs the account owner's confirmation,
-- not another data-shape guess).

DELETE FROM public.activity_log
WHERE user_email = 'thanhnguyenxuan970@gmail.com'
  AND (
    (source = 'TASK' AND kind = 'TASK')
    OR source = 'emulator_demo'
  );
