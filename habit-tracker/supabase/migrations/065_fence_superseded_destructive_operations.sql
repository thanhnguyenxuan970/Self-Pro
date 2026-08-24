-- Separate an explicit new destructive operation from a retry of an older
-- durable marker. The legacy cores remain private implementation details; the
-- public v2 wrappers reject a mismatched marker, while v3 can supersede it only
-- when the caller explicitly asks for a new operation.

ALTER FUNCTION public.reset_my_progress_v2(uuid)
  RENAME TO reset_my_progress_legacy_core;
ALTER FUNCTION public.delete_my_account_data_v2(uuid)
  RENAME TO delete_my_account_data_legacy_core;

REVOKE ALL ON FUNCTION public.reset_my_progress_legacy_core(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_my_account_data_legacy_core(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.reset_my_progress_v2(p_operation_id uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_id uuid := auth.uid();
  existing_operation_id uuid;
  existing_revision bigint;
BEGIN
  IF p_operation_id IS NULL THEN
    RAISE EXCEPTION 'Progress reset operation id required';
  END IF;
  PERFORM 1 FROM auth.users WHERE id = caller_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Authenticated user required';
  END IF;
  PERFORM public.assert_account_write_allowed();

  SELECT marker.operation_id, marker.applied_revision
    INTO existing_operation_id, existing_revision
    FROM public.account_progress_reset_markers AS marker
   WHERE marker.auth_user_id = caller_id
   FOR UPDATE;
  IF FOUND THEN
    IF existing_operation_id = p_operation_id THEN
      RETURN existing_revision;
    END IF;
    RAISE EXCEPTION 'Another progress reset operation is active';
  END IF;

  RETURN public.reset_my_progress_legacy_core(p_operation_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_my_progress_v3(
  p_operation_id uuid,
  p_supersede boolean
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_id uuid := auth.uid();
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
  RETURN public.reset_my_progress_v2(p_operation_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_my_progress()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.account_progress_reset_markers
     WHERE auth_user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Progress reset requires an updated app';
  END IF;
  PERFORM public.reset_my_progress_v3(extensions.gen_random_uuid(), false);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_my_account_data_v2(p_operation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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

  SELECT marker.operation_id
    INTO existing_operation_id
    FROM public.account_deletion_markers AS marker
   WHERE marker.auth_user_id = caller_id
   FOR UPDATE;
  IF FOUND THEN
    IF existing_operation_id = p_operation_id THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'Another account deletion operation is active';
  END IF;

  PERFORM public.delete_my_account_data_legacy_core(p_operation_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_my_account_data_v3(
  p_operation_id uuid,
  p_supersede boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_id uuid := auth.uid();
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
  PERFORM public.delete_my_account_data_v2(p_operation_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_my_account_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.account_deletion_markers
     WHERE auth_user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Account deletion requires an updated app';
  END IF;
  PERFORM public.delete_my_account_data_v3(extensions.gen_random_uuid(), false);
END;
$$;

REVOKE ALL ON FUNCTION public.reset_my_progress_v2(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reset_my_progress_v3(uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_my_account_data_v2(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_my_account_data_v3(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_my_progress_v2(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_my_progress_v3(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_my_account_data_v2(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_my_account_data_v3(uuid, boolean) TO authenticated;
