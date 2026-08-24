-- Keep the SECURITY DEFINER telemetry trigger pinned away from caller-created
-- temporary objects while retaining access to auth.users fields.

CREATE OR REPLACE FUNCTION public.log_auth_signin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  signin_at timestamptz;
  signin_local_date text;
  signin_week_start text;
  next_local_id integer;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.account_deletion_markers WHERE auth_user_id = NEW.id
  ) THEN
    RETURN NEW;
  END IF;
  signin_at := NEW.last_sign_in_at;
  IF NEW.email IS NULL OR signin_at IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.last_sign_in_at IS NOT DISTINCT FROM OLD.last_sign_in_at THEN
    RETURN NEW;
  END IF;
  signin_local_date := to_char((signin_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, 'YYYY-MM-DD');
  signin_week_start := to_char(date_trunc('week', signin_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, 'YYYY-MM-DD');
  SELECT COALESCE(MIN(local_id), 0) - 1 INTO next_local_id
    FROM public.activity_log
   WHERE lower(btrim(user_email)) = lower(btrim(NEW.email)) AND local_id < 0;
  INSERT INTO public.activity_log (
    user_email, local_id, user_id, task_type_id, kind, duration_min,
    points_earned, stars_delta, source, logged_at, local_date, week_start, note
  ) VALUES (
    NEW.email, next_local_id, NULL, NULL, 'LOGIN', NULL, 0, 0, 'LOGIN',
    FLOOR(EXTRACT(EPOCH FROM signin_at) * 1000)::bigint,
    signin_local_date, signin_week_start, 'Supabase auth sign-in'
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'log_auth_signin failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.log_auth_signin() FROM PUBLIC, anon, authenticated;
