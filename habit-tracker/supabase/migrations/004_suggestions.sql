-- Activity suggestions from users (roadmap signal). Insert-only from the app;
-- read them in the Supabase dashboard. Run in: Dashboard → SQL Editor.
CREATE TABLE IF NOT EXISTS suggestions (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_email  TEXT,
  text        TEXT NOT NULL,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE suggestions ENABLE ROW LEVEL SECURITY;

-- Authenticated users may only INSERT; nobody can read others' rows via the client.
DROP POLICY IF EXISTS "insert suggestions" ON suggestions;
CREATE POLICY "insert suggestions"
  ON suggestions
  FOR INSERT
  TO authenticated
  WITH CHECK (user_email IS NULL OR user_email = auth.email());
