-- Keep leaderboard identity public but non-personal. Email remains an internal
-- join key for auth/current-user matching and is never part of the RPC result.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS leaderboard_public_id uuid;

UPDATE public.users
   SET leaderboard_public_id = gen_random_uuid()
 WHERE leaderboard_public_id IS NULL;

ALTER TABLE public.users
  ALTER COLUMN leaderboard_public_id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN leaderboard_public_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS users_leaderboard_public_id_idx
  ON public.users (leaderboard_public_id);

-- PostgreSQL cannot change a function's OUT parameter types with
-- CREATE OR REPLACE, so replace the old email-returning contract atomically.
DROP FUNCTION IF EXISTS public.get_global_leaderboard(integer);

CREATE FUNCTION public.get_global_leaderboard(p_limit integer DEFAULT 50)
RETURNS TABLE (player_id uuid, lifetime_stars real, rank bigint, is_current_user boolean)
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
           COALESCE(u.user_email = auth.email(), false) AS is_current_user
      FROM public.users AS u
  )
  SELECT r.player_id, r.lifetime_stars, r.rank, r.is_current_user
    FROM ranked AS r
   WHERE r.rank <= LEAST(GREATEST(COALESCE(p_limit, 50), 1), 50)
      OR r.is_current_user
   ORDER BY r.rank;
$$;

REVOKE ALL ON FUNCTION public.get_global_leaderboard(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_global_leaderboard(integer) TO authenticated;
