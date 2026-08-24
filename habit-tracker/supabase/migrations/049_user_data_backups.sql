-- Persist the local account snapshot that released clients never mirrored.
-- The existing activity_log mirror is intentionally retained for leaderboard
-- compatibility, but it cannot restore task definitions, Challenges, or local
-- rollups after SQLite is removed by an Android uninstall.

CREATE TABLE IF NOT EXISTS public.user_data_backups (
  auth_user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  schema_version integer NOT NULL CHECK (schema_version > 0),
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_data_backups ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.user_data_backups FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.save_my_data_backup(
  p_schema_version integer,
  p_payload jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_id uuid := auth.uid();
BEGIN
  IF caller_id IS NULL OR auth.email() IS NULL THEN
    RAISE EXCEPTION 'Authenticated user required';
  END IF;
  IF p_schema_version IS NULL OR p_schema_version < 1 THEN
    RAISE EXCEPTION 'Invalid backup schema version';
  END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'Invalid backup payload';
  END IF;
  -- A habit history is expected to be small. This prevents a compromised
  -- client from turning one account row into an unbounded JSON sink.
  IF octet_length(p_payload::text) > 5242880 THEN
    RAISE EXCEPTION 'Backup payload is too large';
  END IF;

  INSERT INTO public.user_data_backups (auth_user_id, schema_version, payload, updated_at)
  VALUES (caller_id, p_schema_version, p_payload, now())
  ON CONFLICT (auth_user_id) DO UPDATE
     SET schema_version = EXCLUDED.schema_version,
         payload = EXCLUDED.payload,
         updated_at = EXCLUDED.updated_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_my_data_backup()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_id uuid := auth.uid();
  backup_payload jsonb;
BEGIN
  IF caller_id IS NULL OR auth.email() IS NULL THEN
    RAISE EXCEPTION 'Authenticated user required';
  END IF;

  SELECT payload
    INTO backup_payload
    FROM public.user_data_backups
   WHERE auth_user_id = caller_id;
  RETURN backup_payload;
END;
$$;

-- Reset progress must invalidate the snapshot before local rows are cleared;
-- otherwise a crash between those two steps could resurrect intentionally
-- reset history on the next reinstall.
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

  DELETE FROM public.user_data_backups WHERE auth_user_id = caller_id;
  DELETE FROM public.activity_log WHERE user_email = caller_email;
  DELETE FROM public.fund_transactions WHERE user_email = caller_email;
  UPDATE public.users
     SET current_streak = 0,
         lifetime_stars = 0,
         last_active_local_date = NULL
   WHERE auth_user_id = caller_id;
END;
$$;

-- Account deletion must remove the backup while auth.uid() is still valid.
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
  DELETE FROM public.user_data_backups WHERE auth_user_id = caller_id;
  DELETE FROM public.activity_log WHERE user_email = caller_email;
  DELETE FROM public.fund_transactions WHERE user_email = caller_email;
  DELETE FROM public.users WHERE auth_user_id = caller_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_my_data_backup(integer, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.restore_my_data_backup() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reset_my_progress() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_my_account_data() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.save_my_data_backup(integer, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_my_data_backup() TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_my_progress() TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_my_account_data() TO authenticated;
