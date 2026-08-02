-- Keep lifetime rank server-authoritative. The client may sync activity rows,
-- but it cannot write users.lifetime_stars or read the users table wholesale.

DROP POLICY IF EXISTS "leaderboard is readable" ON public.users;

REVOKE ALL ON TABLE public.users FROM authenticated;
GRANT SELECT (user_email, current_streak) ON TABLE public.users TO authenticated;
GRANT INSERT (user_email, current_streak) ON TABLE public.users TO authenticated;
GRANT UPDATE (current_streak) ON TABLE public.users TO authenticated;

CREATE INDEX IF NOT EXISTS users_lifetime_stars_email_idx
  ON public.users (lifetime_stars DESC, user_email ASC);

CREATE OR REPLACE FUNCTION public.sync_lifetime_stars()
RETURNS real
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_email text := auth.email();
  stored_stars real;
  event_stars real;
  next_stars real;
BEGIN
  IF caller_email IS NULL THEN
    RAISE EXCEPTION 'Authenticated user required';
  END IF;

  SELECT lifetime_stars
    INTO stored_stars
    FROM public.users
   WHERE user_email = caller_email
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(SUM(GREATEST(stars_delta, 0)), 0)::real
    INTO event_stars
    FROM public.activity_log
   WHERE user_email = caller_email;

  next_stars := GREATEST(COALESCE(stored_stars, 0), event_stars);
  UPDATE public.users
     SET lifetime_stars = next_stars
   WHERE user_email = caller_email;
  RETURN next_stars;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_global_leaderboard(p_limit integer DEFAULT 50)
RETURNS TABLE (user_email text, lifetime_stars real, rank bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH ranked AS (
    SELECT u.user_email,
           GREATEST(COALESCE(u.lifetime_stars, 0), 0)::real AS lifetime_stars,
           ROW_NUMBER() OVER (
             ORDER BY GREATEST(COALESCE(u.lifetime_stars, 0), 0) DESC,
                      u.user_email ASC
           ) AS rank
      FROM public.users AS u
  )
  SELECT r.user_email, r.lifetime_stars, r.rank
    FROM ranked AS r
   WHERE r.rank <= LEAST(GREATEST(COALESCE(p_limit, 50), 1), 50)
      OR r.user_email = auth.email()
   ORDER BY r.rank;
$$;

CREATE OR REPLACE FUNCTION public.reset_my_progress()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_email text := auth.email();
BEGIN
  IF caller_email IS NULL THEN
    RAISE EXCEPTION 'Authenticated user required';
  END IF;

  DELETE FROM public.activity_log WHERE user_email = caller_email;
  DELETE FROM public.fund_transactions WHERE user_email = caller_email;
  UPDATE public.users
     SET current_streak = 0,
         lifetime_stars = 0
   WHERE user_email = caller_email;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_my_account_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_email text := auth.email();
BEGIN
  IF caller_email IS NULL THEN
    RAISE EXCEPTION 'Authenticated user required';
  END IF;

  DELETE FROM public.activity_log WHERE user_email = caller_email;
  DELETE FROM public.fund_transactions WHERE user_email = caller_email;
  DELETE FROM public.users WHERE user_email = caller_email;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_lifetime_stars() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_global_leaderboard(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reset_my_progress() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_my_account_data() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_lifetime_stars() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_global_leaderboard(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_my_progress() TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_my_account_data() TO authenticated;
