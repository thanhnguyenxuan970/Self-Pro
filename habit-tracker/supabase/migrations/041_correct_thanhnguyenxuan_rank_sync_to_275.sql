
-- Re-anchor the account-specific lifetime rank to the user's current local
-- total of 275. Derive the offset from the live activity mirror so the
-- existing sync_lifetime_stars() path advances with future positive activity
-- instead of treating 275 as a permanent ceiling.
--
-- Abort if the live state changed since this correction was prepared; never
-- overwrite newer progress or a different correction without review.
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
     SET lifetime_stars_adjustment = 275 - activity_stars,
         lifetime_stars = 275
   WHERE user_email = 'thanhnguyenxuan970@gmail.com'
     AND lifetime_stars = 268
     AND lifetime_stars_adjustment = -201;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'thanhnguyenxuan rank state changed; review before applying 275-star correction';
  END IF;
END;
$$;
