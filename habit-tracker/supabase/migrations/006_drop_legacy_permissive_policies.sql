-- Remove legacy permissive policies that were created manually before
-- migrations were tracked in supabase_migrations.

DROP POLICY IF EXISTS "users own data" ON activity_log;
DROP POLICY IF EXISTS "users own data" ON fund_transactions;
