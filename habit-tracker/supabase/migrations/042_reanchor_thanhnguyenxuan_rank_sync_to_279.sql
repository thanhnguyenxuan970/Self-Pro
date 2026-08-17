-- Reconcile the confirmed 279-star local lifetime total with the protected
-- server mirror. The offset preserves the activity audit trail and lets
-- sync_lifetime_stars() continue to add future uploaded activity normally.
--
-- This is deliberately limited to the account owner who authorized the
-- repair. It aborts rather than overwriting any progress that arrived after
-- the live inspection that found 275 stored stars and an adjustment of -194.
DO $$
DECLARE
  activity_stars real;
BEGIN
  SELECT COALESCE(SUM(GREATEST(stars_delta, 0)), 0)::real
    INTO activity_stars
    FROM public.activity_log
   WHERE user_email = 'thanhnguyenxuan970@gmail.com';

  UPDATE public.users
     SET lifetime_stars_adjustment = 279 - activity_stars,
         lifetime_stars = 279
   WHERE user_email = 'thanhnguyenxuan970@gmail.com'
     AND lifetime_stars = 275
     AND lifetime_stars_adjustment = -194;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'thanhnguyenxuan rank state changed; review before applying 279-star reconciliation';
  END IF;
END;
$$;
