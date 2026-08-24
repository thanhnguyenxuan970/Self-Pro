-- Apply the deletion tombstone to legacy leaderboard writes as well as the
-- newer snapshot RPCs. This protects users while older app versions are still
-- in the wild.

CREATE OR REPLACE FUNCTION public.assert_account_write_allowed()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_id uuid := auth.uid();
  issued_at timestamptz;
  raw_iat text;
BEGIN
  IF caller_id IS NULL OR auth.email() IS NULL THEN
    RAISE EXCEPTION 'Authenticated user required';
  END IF;
  PERFORM 1 FROM auth.users WHERE id = caller_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Authenticated user required';
  END IF;
  raw_iat := NULLIF(auth.jwt()->>'iat', '');
  IF raw_iat IS NULL THEN
    RAISE EXCEPTION 'Authenticated token issue time required';
  END IF;
  BEGIN
    issued_at := to_timestamp(raw_iat::double precision);
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'Authenticated token issue time required';
  END;
  IF issued_at IS NULL THEN
    RAISE EXCEPTION 'Authenticated token issue time required';
  END IF;
  DELETE FROM public.account_deletion_markers
   WHERE auth_user_id = caller_id
     AND issued_at > deleted_at;
  IF EXISTS (
    SELECT 1 FROM public.account_deletion_markers
     WHERE auth_user_id = caller_id AND deleted_at >= issued_at
  ) THEN
    RAISE EXCEPTION 'Account was deleted; sign in again';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.account_write_allowed()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_id uuid := auth.uid();
  issued_at timestamptz;
  raw_iat text;
BEGIN
  IF caller_id IS NULL OR auth.email() IS NULL THEN RETURN false; END IF;
  raw_iat := NULLIF(auth.jwt()->>'iat', '');
  IF raw_iat IS NULL THEN RETURN false; END IF;
  BEGIN
    issued_at := to_timestamp(raw_iat::double precision);
  EXCEPTION WHEN others THEN
    RETURN false;
  END;
  IF issued_at IS NULL THEN RETURN false; END IF;
  PERFORM 1 FROM auth.users WHERE id = caller_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  DELETE FROM public.account_deletion_markers
   WHERE auth_user_id = caller_id
     AND issued_at > deleted_at;
  RETURN NOT EXISTS (
    SELECT 1 FROM public.account_deletion_markers
     WHERE auth_user_id = caller_id AND deleted_at >= issued_at
  );
END;
$$;

DROP POLICY IF EXISTS "own rows only" ON public.activity_log;
DROP POLICY IF EXISTS "activity_log_select_own" ON public.activity_log;
DROP POLICY IF EXISTS "activity_log_insert_own" ON public.activity_log;
DROP POLICY IF EXISTS "activity_log_update_own" ON public.activity_log;
DROP POLICY IF EXISTS "activity_log_delete_own" ON public.activity_log;
CREATE POLICY "activity_log_select_own"
  ON public.activity_log FOR SELECT TO authenticated
  USING ((SELECT auth.email()) IS NOT NULL AND user_email = (SELECT auth.email()));
CREATE POLICY "activity_log_insert_own"
  ON public.activity_log FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.email()) IS NOT NULL
              AND user_email = (SELECT auth.email())
              AND public.account_write_allowed());
CREATE POLICY "activity_log_update_own"
  ON public.activity_log FOR UPDATE TO authenticated
  USING ((SELECT auth.email()) IS NOT NULL
         AND user_email = (SELECT auth.email())
         AND public.account_write_allowed())
  WITH CHECK ((SELECT auth.email()) IS NOT NULL
              AND user_email = (SELECT auth.email())
              AND public.account_write_allowed());
CREATE POLICY "activity_log_delete_own"
  ON public.activity_log FOR DELETE TO authenticated
  USING ((SELECT auth.email()) IS NOT NULL
         AND user_email = (SELECT auth.email())
         AND public.account_write_allowed());

DROP POLICY IF EXISTS "own rows only" ON public.fund_transactions;
DROP POLICY IF EXISTS "fund_transactions_select_own" ON public.fund_transactions;
DROP POLICY IF EXISTS "fund_transactions_insert_own" ON public.fund_transactions;
DROP POLICY IF EXISTS "fund_transactions_update_own" ON public.fund_transactions;
DROP POLICY IF EXISTS "fund_transactions_delete_own" ON public.fund_transactions;
CREATE POLICY "fund_transactions_select_own"
  ON public.fund_transactions FOR SELECT TO authenticated
  USING ((SELECT auth.email()) IS NOT NULL AND user_email = (SELECT auth.email()));
CREATE POLICY "fund_transactions_insert_own"
  ON public.fund_transactions FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.email()) IS NOT NULL
              AND user_email = (SELECT auth.email())
              AND public.account_write_allowed());
CREATE POLICY "fund_transactions_update_own"
  ON public.fund_transactions FOR UPDATE TO authenticated
  USING ((SELECT auth.email()) IS NOT NULL
         AND user_email = (SELECT auth.email())
         AND public.account_write_allowed())
  WITH CHECK ((SELECT auth.email()) IS NOT NULL
              AND user_email = (SELECT auth.email())
              AND public.account_write_allowed());
CREATE POLICY "fund_transactions_delete_own"
  ON public.fund_transactions FOR DELETE TO authenticated
  USING ((SELECT auth.email()) IS NOT NULL
         AND user_email = (SELECT auth.email())
         AND public.account_write_allowed());

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
  PERFORM public.assert_account_write_allowed();
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
  PERFORM public.assert_account_write_allowed();
  caller_email := public.canonical_auth_email(caller_id);
  IF caller_id IS NULL OR caller_email IS NULL THEN
    RAISE EXCEPTION 'Authenticated user required';
  END IF;
  clean_name := public.google_identity_display_name(caller_id);
  SELECT timezone_name.name INTO valid_timezone
    FROM pg_timezone_names AS timezone_name
   WHERE timezone_name.name = btrim(COALESCE(p_timezone, ''))
   LIMIT 1;
  IF valid_timezone IS NOT NULL THEN
    today_in_timezone := (now() AT TIME ZONE valid_timezone)::date;
    SELECT max(activity.local_date::date) INTO derived_active_date
      FROM public.activity_log AS activity
     WHERE activity.user_email = caller_email
       AND activity.local_date ~ '^\d{4}-\d{2}-\d{2}$'
       AND activity.local_date::date <= today_in_timezone;
  END IF;
  INSERT INTO public.users (
    user_email, auth_user_id, current_streak, display_name, timezone, last_active_local_date
  ) VALUES (
    caller_email, caller_id, 0, clean_name, valid_timezone, derived_active_date
  )
  ON CONFLICT (auth_user_id) DO UPDATE
     SET user_email = EXCLUDED.user_email,
         current_streak = EXCLUDED.current_streak,
         display_name = COALESCE(EXCLUDED.display_name, public.users.display_name),
         timezone = EXCLUDED.timezone,
         last_active_local_date = EXCLUDED.last_active_local_date;
END;
$$;

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
  PERFORM public.assert_account_write_allowed();
  IF caller_email IS NULL THEN RAISE EXCEPTION 'Authenticated user required'; END IF;
  SELECT COALESCE(lifetime_stars_adjustment, 0) INTO adjustment
    FROM public.users WHERE user_email = caller_email FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT COALESCE(SUM(GREATEST(stars_delta, 0)), 0)::real INTO activity_stars
    FROM public.activity_log WHERE user_email = caller_email;
  next_stars := GREATEST(0, activity_stars + COALESCE(adjustment, 0));
  UPDATE public.users SET lifetime_stars = next_stars WHERE user_email = caller_email;
  RETURN next_stars;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_account_write_allowed() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.account_write_allowed() FROM PUBLIC, anon, authenticated;
