-- Forward-only correction for the account-specific rank anchor from 038.
-- The user's phone shows 256 lifetime stars while the deployed 038 anchor is
-- 252. Move the correction offset by exactly four stars so future syncs keep
-- the local lifetime total aligned without deleting the activity audit trail.
-- The stale-state predicates prevent this migration from overwriting newer
-- legitimate progress if it is applied after the account has advanced.
UPDATE public.users
   SET lifetime_stars_adjustment = -228,
       lifetime_stars = 256
 WHERE user_email = 'thanhnguyenxuan970@gmail.com'
   AND lifetime_stars = 252
   AND lifetime_stars_adjustment = -232;
