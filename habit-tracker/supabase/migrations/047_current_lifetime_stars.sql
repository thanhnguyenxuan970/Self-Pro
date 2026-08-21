-- Keep the public lifetime total aligned with the current activity mirror.
-- `current_tier_id` remains the local high-water rank; `lifetime_stars` is the
-- current activity-derived balance and must decrease when an activity is
-- intentionally deleted or unchecked.
CREATE OR REPLACE FUNCTION public.sync_lifetime_stars()
RETURNS real
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_email text := auth.email();
  activity_stars real;
  adjustment real;
  next_stars real;
BEGIN
  IF caller_email IS NULL THEN
    RAISE EXCEPTION 'Authenticated user required';
  END IF;

  SELECT COALESCE(lifetime_stars_adjustment, 0)
    INTO adjustment
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

  next_stars := GREATEST(0, activity_stars + COALESCE(adjustment, 0));
  UPDATE public.users
     SET lifetime_stars = next_stars
   WHERE user_email = caller_email;
  RETURN next_stars;
END;
$$;
