-- Fix Security Advisor warnings without changing app behavior.
-- Keep the same ownership rules, but avoid permissive catch-all policies.

DROP POLICY IF EXISTS "own rows only" ON activity_log;
CREATE POLICY "activity_log_select_own"
  ON activity_log
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.email()) IS NOT NULL AND user_email = (SELECT auth.email()));

CREATE POLICY "activity_log_insert_own"
  ON activity_log
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.email()) IS NOT NULL AND user_email = (SELECT auth.email()));

CREATE POLICY "activity_log_update_own"
  ON activity_log
  FOR UPDATE
  TO authenticated
  USING ((SELECT auth.email()) IS NOT NULL AND user_email = (SELECT auth.email()))
  WITH CHECK ((SELECT auth.email()) IS NOT NULL AND user_email = (SELECT auth.email()));

CREATE POLICY "activity_log_delete_own"
  ON activity_log
  FOR DELETE
  TO authenticated
  USING ((SELECT auth.email()) IS NOT NULL AND user_email = (SELECT auth.email()));

DROP POLICY IF EXISTS "own rows only" ON fund_transactions;
CREATE POLICY "fund_transactions_select_own"
  ON fund_transactions
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.email()) IS NOT NULL AND user_email = (SELECT auth.email()));

CREATE POLICY "fund_transactions_insert_own"
  ON fund_transactions
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.email()) IS NOT NULL AND user_email = (SELECT auth.email()));

CREATE POLICY "fund_transactions_update_own"
  ON fund_transactions
  FOR UPDATE
  TO authenticated
  USING ((SELECT auth.email()) IS NOT NULL AND user_email = (SELECT auth.email()))
  WITH CHECK ((SELECT auth.email()) IS NOT NULL AND user_email = (SELECT auth.email()));

CREATE POLICY "fund_transactions_delete_own"
  ON fund_transactions
  FOR DELETE
  TO authenticated
  USING ((SELECT auth.email()) IS NOT NULL AND user_email = (SELECT auth.email()));

DROP POLICY IF EXISTS "insert only" ON feedback;
CREATE POLICY "feedback_insert_only"
  ON feedback
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    auth.role() IN ('anon', 'authenticated')
    AND (
      auth.role() = 'anon'
      OR user_email IS NULL
      OR user_email = (SELECT auth.email())
    )
  );
