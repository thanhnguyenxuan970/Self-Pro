-- Legacy tables store email ownership. Compare case-insensitively and with
-- surrounding whitespace trimmed so a casing-only Google email change cannot
-- strand an account or bypass the same ownership boundary.

DROP POLICY IF EXISTS "activity_log_select_own" ON public.activity_log;
DROP POLICY IF EXISTS "activity_log_insert_own" ON public.activity_log;
DROP POLICY IF EXISTS "activity_log_update_own" ON public.activity_log;
DROP POLICY IF EXISTS "activity_log_delete_own" ON public.activity_log;
CREATE POLICY "activity_log_select_own"
  ON public.activity_log FOR SELECT TO authenticated
  USING (lower(btrim(user_email)) = lower(btrim((SELECT auth.email()))));
CREATE POLICY "activity_log_insert_own"
  ON public.activity_log FOR INSERT TO authenticated
  WITH CHECK (lower(btrim(user_email)) = lower(btrim((SELECT auth.email())))
              AND public.account_write_allowed());
CREATE POLICY "activity_log_update_own"
  ON public.activity_log FOR UPDATE TO authenticated
  USING (lower(btrim(user_email)) = lower(btrim((SELECT auth.email())))
         AND public.account_write_allowed())
  WITH CHECK (lower(btrim(user_email)) = lower(btrim((SELECT auth.email())))
              AND public.account_write_allowed());
CREATE POLICY "activity_log_delete_own"
  ON public.activity_log FOR DELETE TO authenticated
  USING (lower(btrim(user_email)) = lower(btrim((SELECT auth.email())))
         AND public.account_write_allowed());

DROP POLICY IF EXISTS "fund_transactions_select_own" ON public.fund_transactions;
DROP POLICY IF EXISTS "fund_transactions_insert_own" ON public.fund_transactions;
DROP POLICY IF EXISTS "fund_transactions_update_own" ON public.fund_transactions;
DROP POLICY IF EXISTS "fund_transactions_delete_own" ON public.fund_transactions;
CREATE POLICY "fund_transactions_select_own"
  ON public.fund_transactions FOR SELECT TO authenticated
  USING (lower(btrim(user_email)) = lower(btrim((SELECT auth.email()))));
CREATE POLICY "fund_transactions_insert_own"
  ON public.fund_transactions FOR INSERT TO authenticated
  WITH CHECK (lower(btrim(user_email)) = lower(btrim((SELECT auth.email())))
              AND public.account_write_allowed());
CREATE POLICY "fund_transactions_update_own"
  ON public.fund_transactions FOR UPDATE TO authenticated
  USING (lower(btrim(user_email)) = lower(btrim((SELECT auth.email())))
         AND public.account_write_allowed())
  WITH CHECK (lower(btrim(user_email)) = lower(btrim((SELECT auth.email())))
              AND public.account_write_allowed());
CREATE POLICY "fund_transactions_delete_own"
  ON public.fund_transactions FOR DELETE TO authenticated
  USING (lower(btrim(user_email)) = lower(btrim((SELECT auth.email())))
         AND public.account_write_allowed());

DROP POLICY IF EXISTS "users_select_own" ON public.users;
DROP POLICY IF EXISTS "users_insert_own" ON public.users;
DROP POLICY IF EXISTS "users_update_own" ON public.users;
DROP POLICY IF EXISTS "users_delete_own" ON public.users;
CREATE POLICY "users_select_own"
  ON public.users FOR SELECT TO authenticated
  USING (lower(btrim(user_email)) = lower(btrim((SELECT auth.email())))
         AND public.account_write_allowed());
CREATE POLICY "users_insert_own"
  ON public.users FOR INSERT TO authenticated
  WITH CHECK (lower(btrim(user_email)) = lower(btrim((SELECT auth.email())))
              AND public.account_write_allowed());
CREATE POLICY "users_update_own"
  ON public.users FOR UPDATE TO authenticated
  USING (lower(btrim(user_email)) = lower(btrim((SELECT auth.email())))
         AND public.account_write_allowed())
  WITH CHECK (lower(btrim(user_email)) = lower(btrim((SELECT auth.email())))
              AND public.account_write_allowed());
CREATE POLICY "users_delete_own"
  ON public.users FOR DELETE TO authenticated
  USING (lower(btrim(user_email)) = lower(btrim((SELECT auth.email())))
         AND public.account_write_allowed());

DROP POLICY IF EXISTS "insert suggestions" ON public.suggestions;
CREATE POLICY "insert suggestions"
  ON public.suggestions FOR INSERT TO authenticated
  WITH CHECK (public.account_write_allowed()
              AND (user_email IS NULL
                   OR lower(btrim(user_email)) = lower(btrim((SELECT auth.email())))));
