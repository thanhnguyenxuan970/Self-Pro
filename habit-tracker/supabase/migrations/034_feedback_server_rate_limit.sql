-- Close the feedback spam hole: direct anon INSERT had no server-side rate
-- limit (only a client-side AsyncStorage cooldown, trivially bypassed by
-- calling PostgREST directly with the public anon key). Each row also fans
-- out to an email via the feedback-email webhook, so an unthrottled flood
-- can exhaust the Resend free-tier quota (100/day).
--
-- Fix: revoke anon/authenticated INSERT on the table entirely. All writes
-- now go through the feedback-submit Edge Function, which runs with the
-- service-role key (bypasses RLS) and enforces a per-IP cooldown + daily cap
-- using the new ip_hash column below before inserting.
--
-- Apply via: Supabase Dashboard → SQL Editor → Run
-- Then deploy: supabase functions deploy feedback-submit --no-verify-jwt

ALTER TABLE feedback ADD COLUMN IF NOT EXISTS ip_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_feedback_ip_hash_created_at
  ON feedback (ip_hash, created_at);

DROP POLICY IF EXISTS "insert only" ON feedback;
DROP POLICY IF EXISTS "feedback_insert_only" ON feedback;

REVOKE INSERT ON feedback FROM anon, authenticated;
-- feedback stays write-only even for the service role's callers: no
-- SELECT/UPDATE/DELETE grants existed before and none are added now. The
-- service-role key used by the Edge Function bypasses RLS/grants entirely,
-- which is exactly why the rate-limit check must live server-side in that
-- function rather than in a client-reachable policy.
