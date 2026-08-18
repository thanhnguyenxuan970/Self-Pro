-- Keep social identity canonical even when a caller presents an older JWT.
-- Competitive streak stays disabled until activity writes use a server-authoritative
-- ledger; the current activity_log INSERT policy is intentionally user-writable.

CREATE OR REPLACE FUNCTION public.canonical_auth_email(p_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT account.email
    FROM auth.users AS account
   WHERE account.id = p_user_id
$$;

CREATE OR REPLACE FUNCTION public.google_identity_display_name(p_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.sanitize_friend_display_name(
           COALESCE(identity.identity_data ->> 'full_name', identity.identity_data ->> 'name')
         )
    FROM auth.identities AS identity
   WHERE identity.user_id = p_user_id
     AND identity.provider = 'google'
   ORDER BY identity.last_sign_in_at DESC NULLS LAST,
            identity.updated_at DESC,
            identity.created_at DESC
   LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.sync_user_profile(p_current_streak integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_id uuid := auth.uid();
  caller_email text;
BEGIN
  caller_email := public.canonical_auth_email(caller_id);
  IF caller_id IS NULL OR caller_email IS NULL THEN
    RAISE EXCEPTION 'Authenticated user required';
  END IF;

  INSERT INTO public.users (user_email, auth_user_id, current_streak)
  VALUES (caller_email, caller_id, 0)
  ON CONFLICT (auth_user_id) DO UPDATE
     SET user_email = EXCLUDED.user_email,
         current_streak = EXCLUDED.current_streak;
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
  caller_email text;
  clean_name text;
  valid_timezone text;
  today_in_timezone date;
  derived_active_date date;
BEGIN
  caller_email := public.canonical_auth_email(caller_id);
  IF caller_id IS NULL OR caller_email IS NULL THEN
    RAISE EXCEPTION 'Authenticated user required';
  END IF;

  clean_name := public.google_identity_display_name(caller_id);

  SELECT timezone_name.name
    INTO valid_timezone
    FROM pg_timezone_names AS timezone_name
   WHERE timezone_name.name = btrim(COALESCE(p_timezone, ''))
   LIMIT 1;

  IF valid_timezone IS NOT NULL THEN
    today_in_timezone := (now() AT TIME ZONE valid_timezone)::date;
    SELECT max(activity.local_date::date)
      INTO derived_active_date
      FROM public.activity_log AS activity
     WHERE activity.user_email = caller_email
       AND activity.local_date ~ '^\d{4}-\d{2}-\d{2}$'
       AND activity.local_date::date <= today_in_timezone;
  END IF;
  INSERT INTO public.users (
    user_email,
    auth_user_id,
    current_streak,
    display_name,
    timezone,
    last_active_local_date
  ) VALUES (
    caller_email,
    caller_id,
    0,
    clean_name,
    valid_timezone,
    derived_active_date
  )
  ON CONFLICT (auth_user_id) DO UPDATE
     SET user_email = EXCLUDED.user_email,
         current_streak = EXCLUDED.current_streak,
         display_name = COALESCE(EXCLUDED.display_name, public.users.display_name),
         timezone = EXCLUDED.timezone,
         last_active_local_date = EXCLUDED.last_active_local_date;
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_my_progress()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_id uuid := auth.uid();
  caller_email text;
BEGIN
  caller_email := public.canonical_auth_email(caller_id);
  IF caller_id IS NULL OR caller_email IS NULL THEN
    RAISE EXCEPTION 'Authenticated user required';
  END IF;

  DELETE FROM public.activity_log WHERE user_email = caller_email;
  DELETE FROM public.fund_transactions WHERE user_email = caller_email;
  UPDATE public.users
     SET current_streak = 0,
         lifetime_stars = 0,
         last_active_local_date = NULL
   WHERE auth_user_id = caller_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_my_account_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_id uuid := auth.uid();
  caller_email text;
BEGIN
  caller_email := public.canonical_auth_email(caller_id);
  IF caller_id IS NULL OR caller_email IS NULL THEN
    RAISE EXCEPTION 'Authenticated user required';
  END IF;

  DELETE FROM public.friend_code_attempts WHERE auth_user_id = caller_id;
  DELETE FROM public.activity_log WHERE user_email = caller_email;
  DELETE FROM public.fund_transactions WHERE user_email = caller_email;
  DELETE FROM public.users WHERE auth_user_id = caller_id;
END;
$$;

REVOKE ALL ON FUNCTION public.canonical_auth_email(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.google_identity_display_name(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_user_profile(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_user_profile_v2(integer, date, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reset_my_progress() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_my_account_data() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.sync_user_profile(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_user_profile_v2(integer, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_my_progress() TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_my_account_data() TO authenticated;
