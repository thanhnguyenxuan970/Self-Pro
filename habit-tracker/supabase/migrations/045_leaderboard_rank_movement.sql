-- 7-day rank movement ("▲/▼ N" column). No historical leaderboard data exists
-- server-side (public.users only ever holds each player's *current* rollup),
-- and this project has no pg_cron or other scheduled-job infrastructure.
--
-- Rather than introduce cron infra sight-unseen (this Supabase project's plan
-- tier is not known to support it), snapshots are captured opportunistically:
-- every time a signed-in user's client loads the leaderboard, it also asks the
-- server to record that user's *own* current rank. That rank is computed live
-- against every other user's current standing, so it is a true historical
-- fact for that instant — this does not require snapshotting every user at
-- once, only whoever happens to open the Rank screen.
--
-- Cold start: a user with no snapshot at least 5 days old has no comparison
-- point yet, so their movement is NULL ("no data"), never a fabricated 0.
-- Privacy posture is unchanged from 022/026/028: still only pseudonym +
-- lifetime stars + rank (+ streak) class of data, no email, no identity.

CREATE TABLE IF NOT EXISTS public.leaderboard_snapshots (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_email     TEXT NOT NULL REFERENCES public.users(user_email) ON DELETE CASCADE ON UPDATE CASCADE,
  rank           BIGINT NOT NULL,
  lifetime_stars REAL NOT NULL,
  captured_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS leaderboard_snapshots_lookup_idx
  ON public.leaderboard_snapshots (user_email, captured_at DESC);

ALTER TABLE public.leaderboard_snapshots ENABLE ROW LEVEL SECURITY;
-- Same posture as `users` since migration 021: no direct table grants at all.
-- Every read/write goes through a SECURITY DEFINER function below.
REVOKE ALL ON TABLE public.leaderboard_snapshots FROM PUBLIC, anon, authenticated;

-- Records the caller's own current rank. Throttled to roughly once per day
-- per user so repeatedly opening the Rank screen does not spam rows.
CREATE OR REPLACE FUNCTION public.record_leaderboard_snapshot()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_email text := auth.email();
  caller_rank bigint;
  caller_stars real;
BEGIN
  IF caller_email IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.leaderboard_snapshots
     WHERE user_email = caller_email
       AND captured_at > now() - interval '20 hours'
  ) THEN
    RETURN;
  END IF;

  SELECT r.rank, r.lifetime_stars
    INTO caller_rank, caller_stars
    FROM (
      SELECT u.user_email,
             GREATEST(COALESCE(u.lifetime_stars, 0), 0)::real AS lifetime_stars,
             ROW_NUMBER() OVER (
               ORDER BY GREATEST(COALESCE(u.lifetime_stars, 0), 0) DESC,
                        u.user_email ASC
             ) AS rank
        FROM public.users AS u
    ) AS r
   WHERE r.user_email = caller_email;

  IF caller_rank IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.leaderboard_snapshots (user_email, rank, lifetime_stars)
  VALUES (caller_email, caller_rank, caller_stars);
END;
$$;

REVOKE ALL ON FUNCTION public.record_leaderboard_snapshot() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_leaderboard_snapshot() TO authenticated;

-- PostgreSQL cannot add OUT parameters with CREATE OR REPLACE, hence the
-- explicit DROP (same reasoning as migration 028).
DROP FUNCTION IF EXISTS public.get_global_leaderboard_v2(integer);

CREATE FUNCTION public.get_global_leaderboard_v2(p_limit integer DEFAULT 50)
RETURNS TABLE (
  player_id uuid,
  lifetime_stars real,
  rank bigint,
  is_current_user boolean,
  current_streak integer,
  rank_delta_7d integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH ranked AS (
    SELECT u.leaderboard_public_id AS player_id,
           u.user_email,
           GREATEST(COALESCE(u.lifetime_stars, 0), 0)::real AS lifetime_stars,
           ROW_NUMBER() OVER (
             ORDER BY GREATEST(COALESCE(u.lifetime_stars, 0), 0) DESC,
                      u.user_email ASC
           ) AS rank,
           COALESCE(u.user_email = auth.email(), false) AS is_current_user,
           GREATEST(COALESCE(u.current_streak, 0), 0)::integer AS current_streak
      FROM public.users AS u
  ),
  caller AS (
    SELECT r.rank AS rank
      FROM ranked AS r
     WHERE r.is_current_user
     LIMIT 1
  ),
  scoped AS (
    SELECT r.player_id, r.user_email, r.lifetime_stars, r.rank, r.is_current_user, r.current_streak
      FROM ranked AS r
     WHERE r.rank <= LEAST(GREATEST(COALESCE(p_limit, 50), 1), 50)
        OR r.is_current_user
        OR r.rank BETWEEN (SELECT c.rank FROM caller AS c) - 5
                      AND (SELECT c.rank FROM caller AS c) + 5
  )
  -- The closest snapshot to "7 days ago" within a [5, 9] day tolerance window
  -- — snapshots are opportunistic, not a precise daily cadence, so an exact
  -- 7-day-old row will rarely exist. No snapshot in range => NULL, not 0.
  SELECT s.player_id, s.lifetime_stars, s.rank, s.is_current_user, s.current_streak,
         snap.old_rank - s.rank AS rank_delta_7d
    FROM scoped AS s
    LEFT JOIN LATERAL (
      SELECT ls.rank AS old_rank
        FROM public.leaderboard_snapshots AS ls
       WHERE ls.user_email = s.user_email
         AND ls.captured_at BETWEEN now() - interval '9 days' AND now() - interval '5 days'
       ORDER BY abs(extract(epoch FROM ls.captured_at - (now() - interval '7 days')))
       LIMIT 1
    ) AS snap ON true
   ORDER BY s.rank;
$$;

REVOKE ALL ON FUNCTION public.get_global_leaderboard_v2(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_global_leaderboard_v2(integer) TO authenticated;
