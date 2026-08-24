-- Close the remaining direct legacy write paths after account deletion.

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

  -- A token that predates an existing deletion marker may not delete or
  -- mutate the account again. A newly issued token is intentionally allowed
  -- to start a new deletion operation.
  PERFORM public.assert_account_write_allowed();
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

DROP POLICY IF EXISTS "own rows only" ON public.users;
DROP POLICY IF EXISTS "leaderboard is readable" ON public.users;
DROP POLICY IF EXISTS "users_select_own" ON public.users;
DROP POLICY IF EXISTS "users_insert_own" ON public.users;
DROP POLICY IF EXISTS "users_update_own" ON public.users;
DROP POLICY IF EXISTS "users_delete_own" ON public.users;
CREATE POLICY "users_select_own"
  ON public.users FOR SELECT TO authenticated
  USING (user_email = (SELECT auth.email()) AND public.account_write_allowed());
CREATE POLICY "users_insert_own"
  ON public.users FOR INSERT TO authenticated
  WITH CHECK (user_email = (SELECT auth.email()) AND public.account_write_allowed());
CREATE POLICY "users_update_own"
  ON public.users FOR UPDATE TO authenticated
  USING (user_email = (SELECT auth.email()) AND public.account_write_allowed())
  WITH CHECK (user_email = (SELECT auth.email()) AND public.account_write_allowed());
CREATE POLICY "users_delete_own"
  ON public.users FOR DELETE TO authenticated
  USING (user_email = (SELECT auth.email()) AND public.account_write_allowed());

DROP POLICY IF EXISTS "insert suggestions" ON public.suggestions;
CREATE POLICY "insert suggestions"
  ON public.suggestions FOR INSERT TO authenticated
  WITH CHECK (public.account_write_allowed()
              AND (user_email IS NULL OR user_email = (SELECT auth.email())));

REVOKE ALL ON FUNCTION public.delete_my_account_data() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_my_account_data() TO authenticated;
