-- Store the local lifetime rank rollup for global ranking.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS lifetime_stars REAL NOT NULL DEFAULT 0;

UPDATE users
SET lifetime_stars = GREATEST(
  0,
  COALESCE((SELECT SUM(GREATEST(stars_delta, 0)) FROM activity_log WHERE activity_log.user_email = users.user_email), 0)
);
