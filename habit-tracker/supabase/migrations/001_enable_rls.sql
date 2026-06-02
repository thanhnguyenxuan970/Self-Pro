-- ============================================================
-- Migration: Enable Row Level Security on all user-data tables
-- Apply via: Supabase Dashboard → SQL Editor → Run
--
-- PREREQUISITE: Enable Google Auth in Supabase Dashboard:
--   Authentication → Providers → Google → enable + add Client ID/Secret
--   The app calls supabase.auth.signInWithIdToken() after Google Sign-In,
--   which establishes a Supabase session that auth.email() can verify.
-- ============================================================

-- Step 1: Enable RLS (idempotent)
ALTER TABLE activity_log      ENABLE ROW LEVEL SECURITY;
ALTER TABLE fund_transactions ENABLE ROW LEVEL SECURITY;

-- Step 2: Row policies — users can only access their own rows
--   auth.email() returns the email from the Supabase JWT established
--   by supabase.auth.signInWithIdToken({ provider: 'google', token: idToken })
--   DROP IF EXISTS makes this safe to re-run.

DROP POLICY IF EXISTS "own rows only" ON activity_log;
CREATE POLICY "own rows only"
  ON activity_log
  FOR ALL
  USING      (user_email = auth.email())
  WITH CHECK (user_email = auth.email());

DROP POLICY IF EXISTS "own rows only" ON fund_transactions;
CREATE POLICY "own rows only"
  ON fund_transactions
  FOR ALL
  USING      (user_email = auth.email())
  WITH CHECK (user_email = auth.email());

-- Step 3 (optional but recommended): restrict anon role to authenticated only
-- REVOKE ALL ON activity_log      FROM anon;
-- REVOKE ALL ON fund_transactions FROM anon;
-- GRANT  ALL ON activity_log      TO authenticated;
-- GRANT  ALL ON fund_transactions TO authenticated;
