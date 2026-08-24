-- Qualify the applied revision column so PL/pgSQL cannot confuse it with the
-- function's return variable.

CREATE OR REPLACE FUNCTION public.reset_my_progress_v2(p_operation_id uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_id uuid := auth.uid();
  caller_email text;
  existing_operation_id uuid;
  current_revision bigint;
  applied_revision bigint;
  current_payload jsonb;
BEGIN
  IF p_operation_id IS NULL THEN
    RAISE EXCEPTION 'Progress reset operation id required';
  END IF;
  PERFORM 1 FROM auth.users WHERE id = caller_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Authenticated user required';
  END IF;
  PERFORM public.assert_account_write_allowed();
  caller_email := public.canonical_auth_email(caller_id);
  IF caller_email IS NULL THEN
    RAISE EXCEPTION 'Authenticated user required';
  END IF;

  SELECT marker.operation_id
    INTO existing_operation_id
    FROM public.account_progress_reset_markers AS marker
   WHERE marker.auth_user_id = caller_id
   FOR UPDATE;
  IF FOUND AND existing_operation_id = p_operation_id THEN
    SELECT marker.applied_revision
      INTO applied_revision
      FROM public.account_progress_reset_markers AS marker
     WHERE marker.auth_user_id = caller_id;
    RETURN applied_revision;
  END IF;

  SELECT backup.revision, backup.payload
    INTO current_revision, current_payload
    FROM public.user_data_backups AS backup
   WHERE backup.auth_user_id = caller_id
   FOR UPDATE;
  current_revision := COALESCE(current_revision, 0);
  applied_revision := current_revision + 1;

  IF current_payload IS NULL THEN
    INSERT INTO public.user_data_backups (
      auth_user_id, schema_version, payload, revision, updated_at
    ) VALUES (
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
      applied_revision,
      now()
    );
  ELSE
    UPDATE public.user_data_backups
       SET payload = current_payload || jsonb_build_object(
         'user', COALESCE(NULLIF(current_payload->'user', 'null'::jsonb), '{}'::jsonb) || jsonb_build_object(
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
           revision = applied_revision,
           updated_at = now()
     WHERE auth_user_id = caller_id;
  END IF;

  INSERT INTO public.account_progress_reset_markers (
    auth_user_id, operation_id, applied_revision, reset_at
  ) VALUES (caller_id, p_operation_id, applied_revision, clock_timestamp())
  ON CONFLICT (auth_user_id) DO UPDATE
     SET operation_id = EXCLUDED.operation_id,
         applied_revision = EXCLUDED.applied_revision,
         reset_at = EXCLUDED.reset_at;

  DELETE FROM public.activity_log
   WHERE lower(btrim(user_email)) = lower(btrim(caller_email));
  DELETE FROM public.fund_transactions
   WHERE lower(btrim(user_email)) = lower(btrim(caller_email));
  UPDATE public.users
     SET current_streak = 0,
         lifetime_stars = 0,
         last_active_local_date = NULL
   WHERE auth_user_id = caller_id;

  RETURN applied_revision;
END;
$$;
