-- Keep the raw activity mirror for auditability, but give the confirmed
-- thanguyenxuan account an explicit real-activity boundary. Client backup,
-- restore, and read paths apply the same boundary before exposing history.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS activity_start_date date;

DO $$
DECLARE
  filtered_stars real;
BEGIN
  SELECT COALESCE(SUM(GREATEST(activity.stars_delta, 0)), 0)::real
    INTO filtered_stars
    FROM public.activity_log AS activity
   WHERE lower(btrim(activity.user_email)) = 'thanhnguyenxuan970@gmail.com'
     AND activity.local_date ~ '^\d{4}-\d{2}-\d{2}$'
     AND CASE
           WHEN activity.local_date ~ '^\d{4}-\d{2}-\d{2}$'
           THEN activity.local_date::date >= DATE '2026-07-06'
           ELSE false
         END;

  UPDATE public.users
     SET activity_start_date = DATE '2026-07-06',
         lifetime_stars_adjustment = 0,
         lifetime_stars = filtered_stars
   WHERE lower(btrim(user_email)) = 'thanhnguyenxuan970@gmail.com';
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_user_profile_v2(
  p_current_streak integer,
  p_last_active_local_date date,
  p_timezone text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_id uuid := auth.uid();
  caller_email text := public.canonical_auth_email(caller_id);
  account_start_date date := CASE
    WHEN lower(btrim(caller_email)) = 'thanhnguyenxuan970@gmail.com'
    THEN DATE '2026-07-06'
    ELSE NULL
  END;
  valid_start_date date;
  clean_name text;
  valid_timezone text;
  today_in_timezone date;
  derived_active_date date;
BEGIN
  PERFORM public.assert_account_write_allowed();
  IF caller_id IS NULL OR caller_email IS NULL THEN
    RAISE EXCEPTION 'Authenticated user required';
  END IF;

  SELECT activity_start_date
    INTO valid_start_date
    FROM public.users
   WHERE auth_user_id = caller_id;
  valid_start_date := COALESCE(valid_start_date, account_start_date);

  clean_name := public.google_identity_display_name(caller_id);
  SELECT timezone_name.name
    INTO valid_timezone
    FROM pg_timezone_names AS timezone_name
   WHERE timezone_name.name = btrim(COALESCE(p_timezone, ''))
   LIMIT 1;
  IF valid_timezone IS NOT NULL THEN
    today_in_timezone := (now() AT TIME ZONE valid_timezone)::date;
    SELECT max(CASE
                 WHEN activity.local_date ~ '^\d{4}-\d{2}-\d{2}$'
                 THEN activity.local_date::date
                 ELSE NULL
               END)
      INTO derived_active_date
      FROM public.activity_log AS activity
     WHERE lower(btrim(activity.user_email)) = lower(btrim(caller_email))
       AND (valid_start_date IS NULL OR CASE
         WHEN activity.local_date ~ '^\d{4}-\d{2}-\d{2}$'
         THEN activity.local_date::date >= valid_start_date
         ELSE false
       END)
       AND CASE
         WHEN activity.local_date ~ '^\d{4}-\d{2}-\d{2}$'
         THEN activity.local_date::date <= today_in_timezone
         ELSE false
       END;
  END IF;

  INSERT INTO public.users (
    user_email, auth_user_id, current_streak, display_name, timezone,
    last_active_local_date, activity_start_date
  ) VALUES (
    caller_email, caller_id, 0, clean_name, valid_timezone,
    derived_active_date, valid_start_date
  )
  ON CONFLICT (auth_user_id) DO UPDATE
     SET user_email = EXCLUDED.user_email,
         current_streak = EXCLUDED.current_streak,
         display_name = COALESCE(EXCLUDED.display_name, public.users.display_name),
         timezone = EXCLUDED.timezone,
         last_active_local_date = EXCLUDED.last_active_local_date,
         activity_start_date = COALESCE(public.users.activity_start_date, EXCLUDED.activity_start_date);
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_lifetime_stars()
RETURNS real
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_id uuid := auth.uid();
  caller_email text := public.canonical_auth_email(caller_id);
  valid_start_date date;
  activity_stars real;
  adjustment real;
  next_stars real;
BEGIN
  PERFORM public.assert_account_write_allowed();
  IF caller_id IS NULL OR caller_email IS NULL THEN
    RAISE EXCEPTION 'Authenticated user required';
  END IF;

  SELECT COALESCE(lifetime_stars_adjustment, 0), activity_start_date
    INTO adjustment, valid_start_date
    FROM public.users
   WHERE auth_user_id = caller_id
   FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  valid_start_date := COALESCE(
    valid_start_date,
    CASE
      WHEN lower(btrim(caller_email)) = 'thanhnguyenxuan970@gmail.com'
      THEN DATE '2026-07-06'
      ELSE NULL
    END
  );

  SELECT COALESCE(SUM(GREATEST(activity.stars_delta, 0)), 0)::real
    INTO activity_stars
    FROM public.activity_log AS activity
   WHERE lower(btrim(activity.user_email)) = lower(btrim(caller_email))
     AND (valid_start_date IS NULL OR CASE
       WHEN activity.local_date ~ '^\d{4}-\d{2}-\d{2}$'
       THEN activity.local_date::date >= valid_start_date
       ELSE false
     END);

  next_stars := GREATEST(0, activity_stars + COALESCE(adjustment, 0));
  UPDATE public.users
     SET lifetime_stars = next_stars
   WHERE auth_user_id = caller_id;
  RETURN next_stars;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_lifetime_stars() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_lifetime_stars() TO authenticated;
