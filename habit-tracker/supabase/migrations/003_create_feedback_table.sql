-- Migration: feedback table — "write-only mailbox" pattern
-- Apply via: Supabase Dashboard → SQL Editor → Run
--
-- Security model:
--   * Clients (anon OR authenticated) may only INSERT.
--   * No SELECT/UPDATE/DELETE grants → feedback can never be read or
--     tampered with from the app, even with the anon key extracted.
--   * Length CHECKs enforce limits server-side (client validation is UX only).
--   * Does NOT depend on a Supabase Auth session — works even when the
--     in-memory session has expired (unlike activity_log sync).

CREATE TABLE IF NOT EXISTS feedback (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_email  TEXT        CHECK (user_email IS NULL OR char_length(user_email) <= 320),
  type        TEXT        NOT NULL CHECK (type IN ('BUG', 'SUGGESTION', 'OTHER')),
  message     TEXT        NOT NULL CHECK (char_length(message) BETWEEN 3 AND 2000),
  app_version TEXT        CHECK (app_version IS NULL OR char_length(app_version) <= 32),
  device      TEXT        CHECK (device IS NULL OR char_length(device) <= 128),
  os_version  TEXT        CHECK (os_version IS NULL OR char_length(os_version) <= 64),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "insert only" ON feedback;
CREATE POLICY "insert only" ON feedback
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Write-only: grant INSERT, revoke everything else
REVOKE ALL    ON feedback FROM anon, authenticated;
GRANT  INSERT ON feedback TO   anon, authenticated;
