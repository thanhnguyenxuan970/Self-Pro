-- A revision mismatch is expected multi-device contention, not a database
-- failure. Return a negative sentinel so the app can run its existing
-- data-preserving reconciliation without recording a P0001 error in logs.
-- The return type stays bigint so mixed-version v2 clients remain compatible:
-- older clients reject the negative revision and fail closed before legacy
-- writes. The legacy void wrapper below preserves its historical exception
-- behavior for clients that still call save_my_data_backup directly.

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
  result_revision bigint;
BEGIN
  result_revision := public.save_my_data_backup_v2(p_schema_version, p_payload, 0);
  IF result_revision = -1 THEN
    RAISE EXCEPTION 'Backup revision conflict';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.save_my_data_backup_v2(integer, jsonb, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.save_my_data_backup(integer, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_my_data_backup_v2(integer, jsonb, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_my_data_backup(integer, jsonb) TO authenticated;
