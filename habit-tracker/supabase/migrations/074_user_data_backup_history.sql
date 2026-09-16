-- Keep an immutable, account-scoped history of the latest cloud snapshots.
-- The latest row remains for compatibility; history is retained for 30
-- revisions and is pruned only after the retention window is exceeded.
CREATE TABLE IF NOT EXISTS public.user_data_backup_history (
  auth_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Revision 0 is the pre-history snapshot created by the earlier backup
  -- migration. It must be retained when this history table is introduced.
  revision bigint NOT NULL CHECK (revision >= 0),
  schema_version integer NOT NULL CHECK (schema_version > 0),
  payload jsonb NOT NULL,
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{32}$'),
  captured_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (auth_user_id, revision)
);

CREATE INDEX IF NOT EXISTS user_data_backup_history_captured_at_idx
  ON public.user_data_backup_history (auth_user_id, captured_at DESC);

ALTER TABLE public.user_data_backup_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.user_data_backup_history FROM PUBLIC, anon, authenticated;

-- Preserve the snapshot that already exists before this migration. Without
-- this seed, the first post-cutover save would replace the only old copy
-- before history had recorded it.
INSERT INTO public.user_data_backup_history
  (auth_user_id, revision, schema_version, payload, payload_hash, captured_at)
SELECT backup.auth_user_id,
       backup.revision,
       backup.schema_version,
       backup.payload,
       md5(backup.payload::text),
       backup.updated_at
  FROM public.user_data_backups AS backup
 WHERE backup.revision >= 0
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.save_my_data_backup_v2(
  p_schema_version integer,
  p_payload jsonb,
  p_expected_revision bigint
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  caller_id uuid := auth.uid();
  current_revision bigint;
  next_revision bigint;
BEGIN
  PERFORM 1 FROM auth.users WHERE id = caller_id FOR UPDATE;
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

  SELECT revision
    INTO current_revision
    FROM public.user_data_backups
   WHERE auth_user_id = caller_id
   FOR UPDATE;
  current_revision := COALESCE(current_revision, 0);

  IF p_expected_revision <> current_revision THEN
    RETURN -1;
  END IF;

  next_revision := current_revision + 1;
  INSERT INTO public.user_data_backup_history
    (auth_user_id, revision, schema_version, payload, payload_hash)
  VALUES
    (caller_id, next_revision, p_schema_version, p_payload, md5(p_payload::text));

  INSERT INTO public.user_data_backups
    (auth_user_id, schema_version, payload, revision, updated_at)
  VALUES (caller_id, p_schema_version, p_payload, next_revision, now())
  ON CONFLICT (auth_user_id) DO UPDATE
     SET schema_version = EXCLUDED.schema_version,
         payload = EXCLUDED.payload,
         revision = EXCLUDED.revision,
         updated_at = EXCLUDED.updated_at;

  DELETE FROM public.user_data_backup_history
   WHERE auth_user_id = caller_id
     AND revision < next_revision - 29;
  RETURN next_revision;
END;
$function$;

CREATE OR REPLACE FUNCTION public.list_my_data_backup_history(p_limit integer)
RETURNS TABLE (
  revision bigint,
  schema_version integer,
  payload_hash text,
  captured_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
  SELECT h.revision, h.schema_version, h.payload_hash, h.captured_at
    FROM public.user_data_backup_history h
   WHERE h.auth_user_id = auth.uid()
   ORDER BY h.revision DESC
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 30), 1), 100);
$function$;

CREATE OR REPLACE FUNCTION public.restore_my_data_backup_revision(p_revision bigint)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  caller_id uuid := auth.uid();
  result jsonb;
BEGIN
  PERFORM public.assert_account_write_allowed();
  IF p_revision IS NULL OR p_revision < 0 THEN
    RAISE EXCEPTION 'Invalid backup revision';
  END IF;

  SELECT jsonb_build_object(
    'payload', h.payload,
    'revision', h.revision,
    'schema_version', h.schema_version,
    'payload_hash', h.payload_hash,
    'captured_at', h.captured_at
  )
    INTO result
    FROM public.user_data_backup_history h
   WHERE h.auth_user_id = caller_id
     AND h.revision = p_revision;
  RETURN result;
END;
$function$;

-- The app uses the idempotent v3 reset RPC. Capture both sides of that
-- operation here; the no-argument wrapper below remains safe for old clients.
CREATE OR REPLACE FUNCTION public.reset_my_progress_v3(
  p_operation_id uuid,
  p_supersede boolean
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  caller_id uuid := auth.uid();
  existing_operation_id uuid;
  current_revision bigint;
  current_schema_version integer;
  current_payload jsonb;
  existing_applied_revision bigint;
  applied_revision bigint;
  post_revision bigint;
  post_schema_version integer;
  post_payload jsonb;
BEGIN
  IF p_operation_id IS NULL THEN
    RAISE EXCEPTION 'Progress reset operation id required';
  END IF;
  PERFORM 1 FROM auth.users WHERE id = caller_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Authenticated user required';
  END IF;
  PERFORM public.assert_account_write_allowed();

  IF COALESCE(p_supersede, false) THEN
    DELETE FROM public.account_progress_reset_markers
     WHERE auth_user_id = caller_id
       AND operation_id <> p_operation_id;
  END IF;

  SELECT operation_id
    INTO existing_operation_id
    FROM public.account_progress_reset_markers
   WHERE auth_user_id = caller_id
   FOR UPDATE;
  IF existing_operation_id IS NOT NULL AND existing_operation_id <> p_operation_id THEN
    RAISE EXCEPTION 'Another progress reset operation is active';
  END IF;
  IF existing_operation_id = p_operation_id THEN
    SELECT marker.applied_revision
      INTO existing_applied_revision
      FROM public.account_progress_reset_markers AS marker
     WHERE marker.auth_user_id = caller_id;
    RETURN existing_applied_revision;
  END IF;

  SELECT revision, schema_version, payload
    INTO current_revision, current_schema_version, current_payload
    FROM public.user_data_backups
   WHERE auth_user_id = caller_id
   FOR UPDATE;
  IF current_payload IS NOT NULL THEN
    INSERT INTO public.user_data_backup_history
      (auth_user_id, revision, schema_version, payload, payload_hash)
    VALUES
      (caller_id, current_revision, current_schema_version,
       current_payload, md5(current_payload::text))
    ON CONFLICT DO NOTHING;
  END IF;

  applied_revision := public.reset_my_progress_v2(p_operation_id);

  SELECT revision, schema_version, payload
    INTO post_revision, post_schema_version, post_payload
    FROM public.user_data_backups
   WHERE auth_user_id = caller_id;
  IF post_payload IS NOT NULL THEN
    INSERT INTO public.user_data_backup_history
      (auth_user_id, revision, schema_version, payload, payload_hash)
    VALUES
      (caller_id, post_revision, post_schema_version,
       post_payload, md5(post_payload::text))
    ON CONFLICT DO NOTHING;

    DELETE FROM public.user_data_backup_history
     WHERE auth_user_id = caller_id
       AND revision < post_revision - 29;
  END IF;
  RETURN applied_revision;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reset_my_progress()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.account_progress_reset_markers
     WHERE auth_user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Progress reset requires an updated app';
  END IF;
  PERFORM public.reset_my_progress_v3(extensions.gen_random_uuid(), false);
END;
$function$;

-- Keep the immutable history aligned with the idempotent account-deletion
-- path used by the app. The legacy core performs the data purge; this wrapper
-- removes only the same account's retained snapshots after it succeeds.
CREATE OR REPLACE FUNCTION public.delete_my_account_data_v3(
  p_operation_id uuid,
  p_supersede boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  caller_id uuid := auth.uid();
  existing_operation_id uuid;
BEGIN
  IF p_operation_id IS NULL THEN
    RAISE EXCEPTION 'Account deletion operation id required';
  END IF;
  PERFORM 1 FROM auth.users WHERE id = caller_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Authenticated user required';
  END IF;
  PERFORM public.assert_account_write_allowed();

  IF COALESCE(p_supersede, false) THEN
    DELETE FROM public.account_deletion_markers
     WHERE auth_user_id = caller_id
       AND operation_id <> p_operation_id;
  END IF;

  SELECT operation_id
    INTO existing_operation_id
    FROM public.account_deletion_markers
   WHERE auth_user_id = caller_id
   FOR UPDATE;
  IF existing_operation_id IS NOT NULL AND existing_operation_id <> p_operation_id THEN
    RAISE EXCEPTION 'Another account deletion operation is active';
  END IF;

  PERFORM public.delete_my_account_data_v2(p_operation_id);
  DELETE FROM public.user_data_backup_history WHERE auth_user_id = caller_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_my_account_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.account_deletion_markers
     WHERE auth_user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Account deletion requires an updated app';
  END IF;
  PERFORM public.delete_my_account_data_v3(extensions.gen_random_uuid(), false);
END;
$function$;

REVOKE ALL ON FUNCTION public.list_my_data_backup_history(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.restore_my_data_backup_revision(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_data_backup_history(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_my_data_backup_revision(bigint) TO authenticated;
