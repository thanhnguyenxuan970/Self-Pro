-- Product/news feed shown from the Home bell icon. Read-only from the app;
-- add rows from Supabase dashboard or migrations without shipping a new app build.
CREATE TABLE IF NOT EXISTS news (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  version     TEXT NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  tag         TEXT,
  image       TEXT,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_news_published_at ON news (published_at DESC);

ALTER TABLE news ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public read news" ON news;
CREATE POLICY "public read news"
  ON news
  FOR SELECT
  TO anon, authenticated
  USING (true);

REVOKE ALL ON news FROM anon;
REVOKE ALL ON news FROM authenticated;
GRANT SELECT ON news TO anon, authenticated;
