-- A process can die after the remote delete commits but before local SQLite
-- is purged. Treat a stale-token retry for an existing tombstone as an
-- idempotent completion of that same remote half. A fresh token still passes
-- the normal fence and can intentionally start a new deletion.

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

  IF NOT public.account_write_allowed() THEN
    IF EXISTS (
      SELECT 1 FROM public.account_deletion_markers
       WHERE auth_user_id = caller_id
    ) THEN
      RETURN;
    END IF;
    PERFORM public.assert_account_write_allowed();
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

REVOKE ALL ON FUNCTION public.delete_my_account_data() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_my_account_data() TO authenticated;
