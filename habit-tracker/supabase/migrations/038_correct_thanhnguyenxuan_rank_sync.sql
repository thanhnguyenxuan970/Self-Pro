-- The activity mirror for this account contains 232 historical stars that
-- must not count toward lifetime rank. Keep the raw audit trail intact and
-- persist the narrow correction so subsequent client syncs still add new stars.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS lifetime_stars_adjustment real NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.sync_lifetime_stars()
RETURNS real
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_email text := auth.email();
  stored_stars real;
  activity_stars real;
  adjustment real;
  next_stars real;
BEGIN
  IF caller_email IS NULL THEN
    RAISE EXCEPTION 'Authenticated user required';
  END IF;

  SELECT lifetime_stars, lifetime_stars_adjustment
    INTO stored_stars, adjustment
    FROM public.users
   WHERE user_email = caller_email
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(SUM(GREATEST(stars_delta, 0)), 0)::real
    INTO activity_stars
    FROM public.activity_log
   WHERE user_email = caller_email;

  next_stars := GREATEST(
    COALESCE(stored_stars, 0),
    GREATEST(0, activity_stars + COALESCE(adjustment, 0))
  );
  UPDATE public.users
     SET lifetime_stars = next_stars
   WHERE user_email = caller_email;
  RETURN next_stars;
END;
$$;

UPDATE public.users
   SET lifetime_stars_adjustment = -232,
       lifetime_stars = 252
 WHERE user_email = 'thanhnguyenxuan970@gmail.com';
