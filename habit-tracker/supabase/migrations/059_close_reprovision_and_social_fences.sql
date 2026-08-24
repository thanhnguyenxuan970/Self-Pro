-- Close the remaining post-delete resurrection paths.
--
-- 1. Auth sign-in telemetry must not recreate an activity row after a
--    deletion tombstone exists.
-- 2. Destructive/profile RPCs must treat legacy email casing/whitespace as
--    the same account.
-- 3. SECURITY DEFINER friend writers must reject stale pre-delete JWTs.

CREATE OR REPLACE FUNCTION public.log_auth_signin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  signin_at timestamptz;
  signin_local_date text;
  signin_week_start text;
  next_local_id integer;
BEGIN
  IF EXISTS (
    SELECT 1
      FROM public.account_deletion_markers
     WHERE auth_user_id = NEW.id
  ) THEN
    RETURN NEW;
  END IF;

  signin_at := NEW.last_sign_in_at;
  IF NEW.email IS NULL OR signin_at IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.last_sign_in_at IS NOT DISTINCT FROM OLD.last_sign_in_at THEN
    RETURN NEW;
  END IF;

  signin_local_date := to_char((signin_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, 'YYYY-MM-DD');
  signin_week_start := to_char(date_trunc('week', signin_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, 'YYYY-MM-DD');

  SELECT COALESCE(MIN(local_id), 0) - 1
    INTO next_local_id
    FROM public.activity_log
   WHERE lower(btrim(user_email)) = lower(btrim(NEW.email))
     AND local_id < 0;

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
  PERFORM public.assert_account_write_allowed();
  caller_email := public.canonical_auth_email(caller_id);
  IF caller_id IS NULL OR caller_email IS NULL THEN
    RAISE EXCEPTION 'Authenticated user required';
  END IF;

  IF EXISTS (SELECT 1 FROM public.user_data_backups WHERE auth_user_id = caller_id) THEN
    UPDATE public.user_data_backups
       SET payload = payload || jsonb_build_object(
         'user', COALESCE(NULLIF(payload->'user', 'null'::jsonb), '{}'::jsonb) || jsonb_build_object(
           'carry_debt', 0,
           'treat_stars', 0,
           'treat_stars_lifetime', 0,
           'lifetime_stars', 0,
           'current_tier_id', NULL
         ),
         'activity_log', '[]'::jsonb,
         'daily_summary', '[]'::jsonb,
         'weekly_summary', '[]'::jsonb,
         'reward_unlocks', '[]'::jsonb,
         'fund_transactions', '[]'::jsonb,
         'streak_freezes', '[]'::jsonb,
         'treat_history', '[]'::jsonb,
         'challenges', '[]'::jsonb,
         'challenge_log', '[]'::jsonb,
         'challenge_days', '[]'::jsonb,
         'achievements', '[]'::jsonb,
         'milestone_stars', '[]'::jsonb,
         'boost_events', '[]'::jsonb
       ),
           revision = revision + 1,
           updated_at = now()
     WHERE auth_user_id = caller_id;
  ELSE
    INSERT INTO public.user_data_backups (auth_user_id, schema_version, payload, revision, updated_at)
    VALUES (
      caller_id,
      1,
      jsonb_build_object(
        'schema_version', 1,
        'user', jsonb_build_object(
          'carry_debt', 0,
          'treat_stars', 0,
          'treat_stars_lifetime', 0,
          'lifetime_stars', 0,
          'current_tier_id', NULL
        ),
        'categories', '[]'::jsonb,
        'task_types', '[]'::jsonb,
        'activity_log', '[]'::jsonb,
        'daily_summary', '[]'::jsonb,
        'weekly_summary', '[]'::jsonb,
        'reward_unlocks', '[]'::jsonb,
        'fund_transactions', '[]'::jsonb,
        'streak_freezes', '[]'::jsonb,
        'treats', '[]'::jsonb,
        'treat_history', '[]'::jsonb,
        'challenges', '[]'::jsonb,
        'challenge_log', '[]'::jsonb,
        'challenge_days', '[]'::jsonb,
        'achievements', '[]'::jsonb,
        'milestone_stars', '[]'::jsonb,
        'boost_events', '[]'::jsonb
      ),
      1,
      now()
    );
  END IF;

  DELETE FROM public.activity_log
   WHERE lower(btrim(user_email)) = lower(btrim(caller_email));
  DELETE FROM public.fund_transactions
   WHERE lower(btrim(user_email)) = lower(btrim(caller_email));
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
  IF caller_id IS NULL OR auth.email() IS NULL THEN
    RAISE EXCEPTION 'Authenticated user required';
  END IF;
  caller_email := public.canonical_auth_email(caller_id);
  IF caller_email IS NULL THEN
    RAISE EXCEPTION 'Authenticated user required';
  END IF;

  PERFORM public.assert_account_write_allowed();
  PERFORM 1 FROM auth.users WHERE id = caller_id FOR UPDATE;
  INSERT INTO public.account_deletion_markers (auth_user_id, deleted_at)
  VALUES (caller_id, clock_timestamp())
  ON CONFLICT (auth_user_id) DO UPDATE SET deleted_at = EXCLUDED.deleted_at;

  DELETE FROM public.friend_relationships
   WHERE caller_id IN (user_a_id, user_b_id);
  DELETE FROM public.friend_code_attempts WHERE auth_user_id = caller_id;
  DELETE FROM public.user_data_backups WHERE auth_user_id = caller_id;
  DELETE FROM public.activity_log
   WHERE lower(btrim(user_email)) = lower(btrim(caller_email));
  DELETE FROM public.fund_transactions
   WHERE lower(btrim(user_email)) = lower(btrim(caller_email));
  DELETE FROM public.users WHERE auth_user_id = caller_id;
END;
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
     WHERE lower(btrim(activity.user_email)) = lower(btrim(caller_email))
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
  caller_id uuid := auth.uid();
  caller_email text := public.canonical_auth_email(caller_id);
  activity_stars real;
  adjustment real;
  next_stars real;
BEGIN
  PERFORM public.assert_account_write_allowed();
  IF caller_id IS NULL OR caller_email IS NULL THEN
    RAISE EXCEPTION 'Authenticated user required';
  END IF;
  SELECT COALESCE(lifetime_stars_adjustment, 0)
    INTO adjustment
    FROM public.users
   WHERE auth_user_id = caller_id
   FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT COALESCE(SUM(GREATEST(stars_delta, 0)), 0)::real
    INTO activity_stars
    FROM public.activity_log
   WHERE lower(btrim(user_email)) = lower(btrim(caller_email));
  next_stars := GREATEST(0, activity_stars + COALESCE(adjustment, 0));
  UPDATE public.users
     SET lifetime_stars = next_stars
   WHERE auth_user_id = caller_id;
  RETURN next_stars;
END;
$$;

-- Pair locks are reached before every relationship mutation except the two
-- profile-code writers and the initial request rate-limit path. The explicit
-- assertions in those functions below close those remaining paths.
CREATE OR REPLACE FUNCTION public.friend_pair_lock(p_user_a uuid, p_user_b uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.assert_account_write_allowed();
  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      'friend-pair:' || least(p_user_a, p_user_b)::text || ':' || greatest(p_user_a, p_user_b)::text,
      0
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_or_create_my_friend_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_id uuid := auth.uid();
  stored_code text;
  candidate text;
  attempt integer;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authenticated user required';
  END IF;
  PERFORM public.assert_account_write_allowed();

  SELECT friend_code INTO stored_code
    FROM public.users
   WHERE auth_user_id = caller_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Authenticated profile required'; END IF;
  IF stored_code IS NOT NULL THEN RETURN stored_code; END IF;

  FOR attempt IN 1..20 LOOP
    candidate := public.generate_friend_code_candidate();
    BEGIN
      UPDATE public.users SET friend_code = candidate WHERE auth_user_id = caller_id;
      RETURN candidate;
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
  END LOOP;
  RAISE EXCEPTION 'Could not allocate a unique friend code';
END;
$$;

CREATE OR REPLACE FUNCTION public.rotate_my_friend_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_id uuid := auth.uid();
  previous_code text;
  candidate text;
  attempt integer;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authenticated user required';
  END IF;
  PERFORM public.assert_account_write_allowed();

  SELECT friend_code INTO previous_code
    FROM public.users
   WHERE auth_user_id = caller_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Authenticated profile required'; END IF;

  FOR attempt IN 1..20 LOOP
    candidate := public.generate_friend_code_candidate();
    CONTINUE WHEN candidate IS NOT DISTINCT FROM previous_code;
    BEGIN
      UPDATE public.users SET friend_code = candidate WHERE auth_user_id = caller_id;
      RETURN candidate;
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
  END LOOP;
  RAISE EXCEPTION 'Could not rotate to a unique friend code';
END;
$$;

CREATE OR REPLACE FUNCTION public.request_friend_by_code(p_code text)
RETURNS TABLE(status text, retry_after_seconds integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_id uuid := auth.uid();
  target_id uuid;
  normalized_code text;
  user_a uuid;
  user_b uuid;
  relationship public.friend_relationships%ROWTYPE;
  probe_count integer;
  success_count integer;
  caller_accepted integer;
  target_accepted integer;
  caller_outgoing integer;
  target_incoming integer;
BEGIN
  IF caller_id IS NULL THEN
    RETURN QUERY SELECT 'FORBIDDEN'::text, NULL::integer;
    RETURN;
  END IF;
  PERFORM public.assert_account_write_allowed();

  PERFORM pg_advisory_xact_lock(hashtextextended('friend-rate:' || caller_id::text, 0));
  DELETE FROM public.friend_code_attempts
   WHERE auth_user_id = caller_id
     AND attempted_at <= now() - interval '1 hour';

  SELECT count(*)::integer INTO probe_count
    FROM public.friend_code_attempts
   WHERE auth_user_id = caller_id
     AND kind = 'probe_failure'
     AND attempted_at > now() - interval '1 hour';
  IF probe_count >= 10 THEN
    RETURN QUERY SELECT 'RATE_LIMITED'::text,
      public.friend_retry_after_seconds(caller_id, 'probe_failure');
    RETURN;
  END IF;

  normalized_code := upper(btrim(COALESCE(p_code, '')));
  IF normalized_code !~ '^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$' THEN
    INSERT INTO public.friend_code_attempts (auth_user_id, kind)
    VALUES (caller_id, 'probe_failure');
    RETURN QUERY SELECT 'NOT_FOUND'::text, NULL::integer;
    RETURN;
  END IF;

  SELECT auth_user_id INTO target_id
    FROM public.users WHERE friend_code = normalized_code;
  IF target_id IS NULL THEN
    INSERT INTO public.friend_code_attempts (auth_user_id, kind)
    VALUES (caller_id, 'probe_failure');
    RETURN QUERY SELECT 'NOT_FOUND'::text, NULL::integer;
    RETURN;
  END IF;
  IF target_id = caller_id THEN
    RETURN QUERY SELECT 'SELF'::text, NULL::integer;
    RETURN;
  END IF;

  user_a := least(caller_id, target_id);
  user_b := greatest(caller_id, target_id);
  PERFORM public.friend_pair_lock(user_a, user_b);

  SELECT relation.* INTO relationship
    FROM public.friend_relationships AS relation
   WHERE relation.user_a_id = user_a
     AND relation.user_b_id = user_b
   FOR UPDATE;
  IF FOUND AND relationship.state = 'pending' AND relationship.expires_at <= now() THEN
    DELETE FROM public.friend_relationships WHERE id = relationship.id;
    relationship := NULL;
  END IF;
  IF relationship.id IS NOT NULL AND relationship.state = 'blocked' THEN
    INSERT INTO public.friend_code_attempts (auth_user_id, kind)
    VALUES (caller_id, 'probe_failure');
    RETURN QUERY SELECT 'NOT_FOUND'::text, NULL::integer;
    RETURN;
  END IF;
  IF relationship.id IS NOT NULL AND relationship.state = 'accepted' THEN
    RETURN QUERY SELECT 'ALREADY_FRIENDS'::text, NULL::integer;
    RETURN;
  END IF;
  IF relationship.id IS NOT NULL AND relationship.state = 'pending'
     AND relationship.requested_by = caller_id THEN
    RETURN QUERY SELECT 'ALREADY_PENDING'::text, NULL::integer;
    RETURN;
  END IF;

  SELECT count(*)::integer INTO success_count
    FROM public.friend_code_attempts
   WHERE auth_user_id = caller_id
     AND kind = 'relationship_created'
     AND attempted_at > now() - interval '1 hour';
  IF success_count >= 30 THEN
    RETURN QUERY SELECT 'RATE_LIMITED'::text,
      public.friend_retry_after_seconds(caller_id, 'relationship_created');
    RETURN;
  END IF;

  PERFORM public.friend_capacity_locks(caller_id, target_id);
  DELETE FROM public.friend_relationships AS relation
   WHERE relation.state = 'pending'
     AND relation.expires_at <= now()
     AND (caller_id IN (relation.user_a_id, relation.user_b_id)
          OR target_id IN (relation.user_a_id, relation.user_b_id));

  IF relationship.id IS NOT NULL AND relationship.state = 'pending' THEN
    SELECT count(*)::integer INTO caller_accepted
      FROM public.friend_relationships AS relation
     WHERE relation.state = 'accepted'
       AND caller_id IN (relation.user_a_id, relation.user_b_id);
    SELECT count(*)::integer INTO target_accepted
      FROM public.friend_relationships AS relation
     WHERE relation.state = 'accepted'
       AND target_id IN (relation.user_a_id, relation.user_b_id);
    IF caller_accepted >= 100 OR target_accepted >= 100 THEN
      RETURN QUERY SELECT 'FRIEND_LIMIT_REACHED'::text, NULL::integer;
      RETURN;
    END IF;
    UPDATE public.friend_relationships
       SET state = 'accepted', blocked_by = NULL, accepted_at = now(),
           expires_at = NULL, updated_at = now()
     WHERE id = relationship.id;
    INSERT INTO public.friend_code_attempts (auth_user_id, kind)
    VALUES (caller_id, 'relationship_created');
    RETURN QUERY SELECT 'ACCEPTED'::text, NULL::integer;
    RETURN;
  END IF;

  SELECT count(*)::integer INTO caller_outgoing
    FROM public.friend_relationships AS relation
   WHERE relation.state = 'pending' AND relation.requested_by = caller_id;
  SELECT count(*)::integer INTO target_incoming
    FROM public.friend_relationships AS relation
   WHERE relation.state = 'pending'
     AND relation.requested_by IS DISTINCT FROM target_id
     AND target_id IN (relation.user_a_id, relation.user_b_id);
  IF caller_outgoing >= 20 OR target_incoming >= 50 THEN
    RETURN QUERY SELECT 'PENDING_LIMIT_REACHED'::text, NULL::integer;
    RETURN;
  END IF;

  INSERT INTO public.friend_relationships (
    user_a_id, user_b_id, state, requested_by, expires_at
  ) VALUES (user_a, user_b, 'pending', caller_id, now() + interval '30 days');
  INSERT INTO public.friend_code_attempts (auth_user_id, kind)
  VALUES (caller_id, 'relationship_created');
  RETURN QUERY SELECT 'PENDING'::text, NULL::integer;
END;
$$;

REVOKE ALL ON FUNCTION public.log_auth_signin() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reset_my_progress() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_my_account_data() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_user_profile(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_user_profile_v2(integer, date, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_lifetime_stars() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.friend_pair_lock(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_or_create_my_friend_code() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rotate_my_friend_code() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.request_friend_by_code(text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.reset_my_progress() TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_my_account_data() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_user_profile(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_user_profile_v2(integer, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_lifetime_stars() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_or_create_my_friend_code() TO authenticated;
GRANT EXECUTE ON FUNCTION public.rotate_my_friend_code() TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_friend_by_code(text) TO authenticated;
