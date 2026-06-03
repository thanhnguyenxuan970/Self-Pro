-- Create users table for streak sync
-- Run in: Supabase Dashboard → SQL Editor
CREATE TABLE IF NOT EXISTS users (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_email    TEXT NOT NULL UNIQUE,
  current_streak INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own rows only" ON users
  USING (user_email = auth.email())
  WITH CHECK (user_email = auth.email());
