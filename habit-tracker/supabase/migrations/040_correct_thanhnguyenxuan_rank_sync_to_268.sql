
-- Re-anchor the account-specific lifetime rank to the user-confirmed local
-- Rank total of 268. Derive the new offset from the live activity mirror so
-- sync_lifetime_stars() returns 268 now and advances one-for-one with future
-- legitimate activity without deleting the audit trail.
--
-- The stale-state guard prevents this correction from overwriting progress if
-- the account has already been synced or advanced since this migration was
-- prepared. In that case the migration must fail for deliberate review.
DO $$
DECLARE
  activity_stars real;
BEGIN
  -- Fresh databases do not contain this account-specific legacy profile.
  -- Treat that as a no-op; an existing profile must still satisfy the guarded
  -- state below or the migration must fail for deliberate review.
  IF NOT EXISTS (
    SELECT 1
      FROM public.users
     WHERE user_email = 'thanhnguyenxuan970@gmail.com'
  ) THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(GREATEST(stars_delta, 0)), 0)::real
    INTO activity_stars
    FROM public.activity_log
   WHERE user_email = 'thanhnguyenxuan970@gmail.com';

  UPDATE public.users
     SET lifetime_stars_adjustment = 268 - activity_stars,
         lifetime_stars = 268
   WHERE user_email = 'thanhnguyenxuan970@gmail.com'
     AND lifetime_stars = 256
     AND lifetime_stars_adjustment = -228;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'thanhnguyenxuan970 rank state changed; review before applying 268-star correction';
  END IF;
END;
$$;
