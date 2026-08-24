-- Make the account snapshot a compare-and-swap resource. A second device must
-- first read the current revision before it can replace the snapshot, so a
-- stale reinstall cannot silently erase newer habits or history.

ALTER TABLE public.user_data_backups
  ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.account_deletion_markers (
  auth_user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  deleted_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.account_deletion_markers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.account_deletion_markers FROM PUBLIC, anon, authenticated;

-- A deleted account may be provisioned again only after Google issues a fresh
-- Supabase JWT. A queued request carrying the pre-delete JWT cannot recreate a
-- snapshot, even if it arrives after the delete RPC has completed.
CREATE OR REPLACE FUNCTION public.assert_account_write_allowed()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_id uuid := auth.uid();
  issued_at timestamptz;
BEGIN
  IF caller_id IS NULL OR auth.email() IS NULL THEN
    RAISE EXCEPTION 'Authenticated user required';
  END IF;

  BEGIN
    issued_at := to_timestamp((auth.jwt()->>'iat')::double precision);
  EXCEPTION WHEN others THEN
    issued_at := '-infinity'::timestamptz;
  END;

  DELETE FROM public.account_deletion_markers
   WHERE auth_user_id = caller_id
     AND issued_at > deleted_at;

  IF EXISTS (
    SELECT 1
      FROM public.account_deletion_markers
     WHERE auth_user_id = caller_id
       AND deleted_at >= issued_at
  ) THEN
    RAISE EXCEPTION 'Account was deleted; sign in again';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_my_data_backup_v2(
  p_schema_version integer,
  p_payload jsonb,
  p_expected_revision bigint
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_id uuid := auth.uid();
  current_revision bigint;
  next_revision bigint;
BEGIN
  PERFORM public.assert_account_write_allowed();
  IF p_schema_version IS NULL OR p_schema_version < 1 THEN
    RAISE EXCEPTION 'Invalid backup schema version';
  END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'Invalid backup payload';
  END IF;
  IF p_expected_revision IS NULL OR p_expected_revision < 0 THEN
    RAISE EXCEPTION 'Invalid backup revision';
  END IF;
  IF octet_length(p_payload::text) > 5242880 THEN
    RAISE EXCEPTION 'Backup payload is too large';
  END IF;

  -- auth.users is the stable per-account lock, including when no snapshot row
  -- exists yet. This closes the absent-row race between two first writers.
  PERFORM 1 FROM auth.users WHERE id = caller_id FOR UPDATE;
  SELECT revision
    INTO current_revision
    FROM public.user_data_backups
   WHERE auth_user_id = caller_id
   FOR UPDATE;
  current_revision := COALESCE(current_revision, 0);

  IF p_expected_revision <> current_revision THEN
    RAISE EXCEPTION 'Backup revision conflict: expected %, current %', p_expected_revision, current_revision;
  END IF;

  next_revision := current_revision + 1;
  INSERT INTO public.user_data_backups (auth_user_id, schema_version, payload, revision, updated_at)
  VALUES (caller_id, p_schema_version, p_payload, next_revision, now())
  ON CONFLICT (auth_user_id) DO UPDATE
     SET schema_version = EXCLUDED.schema_version,
         payload = EXCLUDED.payload,
         revision = EXCLUDED.revision,
         updated_at = EXCLUDED.updated_at;
  RETURN next_revision;
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_my_data_backup_v2()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_id uuid := auth.uid();
  backup_payload jsonb;
  backup_revision bigint;
BEGIN
  PERFORM public.assert_account_write_allowed();

  SELECT payload, revision
    INTO backup_payload, backup_revision
    FROM public.user_data_backups
   WHERE auth_user_id = caller_id;
  RETURN jsonb_build_object(
    'payload', backup_payload,
    'revision', COALESCE(backup_revision, 0)
  );
END;
$$;

-- Preserve compatibility for a briefly mixed-version fleet, but make the old
-- writer fail rather than perform an unconditional last-writer-wins update.
CREATE OR REPLACE FUNCTION public.save_my_data_backup(
  p_schema_version integer,
  p_payload jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.save_my_data_backup_v2(p_schema_version, p_payload, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_my_data_backup()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_id uuid := auth.uid();
  backup_payload jsonb;
BEGIN
  PERFORM public.assert_account_write_allowed();
  SELECT payload
    INTO backup_payload
    FROM public.user_data_backups
   WHERE auth_user_id = caller_id;
  RETURN backup_payload;
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
  IF caller_email IS NULL THEN
    RAISE EXCEPTION 'Authenticated user required';
  END IF;

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
  IF caller_id IS NULL OR auth.email() IS NULL THEN
    RAISE EXCEPTION 'Authenticated user required';
  END IF;
  caller_email := public.canonical_auth_email(caller_id);
  IF caller_email IS NULL THEN
    RAISE EXCEPTION 'Authenticated user required';
  END IF;

  -- Write the fence first. Any queued pre-delete JWT is rejected by the
  -- backup RPCs even if it runs after the deletes below.
  PERFORM 1 FROM auth.users WHERE id = caller_id FOR UPDATE;
  INSERT INTO public.account_deletion_markers (auth_user_id, deleted_at)
  VALUES (caller_id, clock_timestamp())
  ON CONFLICT (auth_user_id) DO UPDATE SET deleted_at = EXCLUDED.deleted_at;

  DELETE FROM public.friend_code_attempts WHERE auth_user_id = caller_id;
  DELETE FROM public.user_data_backups WHERE auth_user_id = caller_id;
  DELETE FROM public.activity_log WHERE user_email = caller_email;
  DELETE FROM public.fund_transactions WHERE user_email = caller_email;
  DELETE FROM public.users WHERE auth_user_id = caller_id;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_account_write_allowed() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.save_my_data_backup_v2(integer, jsonb, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.restore_my_data_backup_v2() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.save_my_data_backup(integer, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.restore_my_data_backup() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reset_my_progress() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_my_account_data() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.save_my_data_backup_v2(integer, jsonb, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_my_data_backup_v2() TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_my_data_backup(integer, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_my_data_backup() TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_my_progress() TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_my_account_data() TO authenticated;
