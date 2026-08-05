-- Keep the original RPC shape for already-released clients while removing
-- other users' emails. New clients use the versioned, typed RPC below.
DROP FUNCTION IF EXISTS public.get_global_leaderboard(integer);

CREATE FUNCTION public.get_global_leaderboard(p_limit integer DEFAULT 50)
RETURNS TABLE (user_email text, lifetime_stars real, rank bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH ranked AS (
    SELECT u.leaderboard_public_id,
           u.user_email,
           COALESCE(u.user_email = auth.email(), false) AS is_current_user,
           GREATEST(COALESCE(u.lifetime_stars, 0), 0)::real AS lifetime_stars,
           ROW_NUMBER() OVER (
             ORDER BY GREATEST(COALESCE(u.lifetime_stars, 0), 0) DESC,
                      u.user_email ASC
           ) AS rank
      FROM public.users AS u
  )
  SELECT CASE
           WHEN r.is_current_user THEN r.user_email
           ELSE format('player-%s', substr(replace(r.leaderboard_public_id::text, '-', ''), 1, 8))
         END,
         r.lifetime_stars,
         r.rank
    FROM ranked AS r
   WHERE r.rank <= LEAST(GREATEST(COALESCE(p_limit, 50), 1), 50)
      OR r.is_current_user
   ORDER BY r.rank;
$$;

CREATE FUNCTION public.get_global_leaderboard_v2(p_limit integer DEFAULT 50)
RETURNS TABLE (player_id uuid, lifetime_stars real, rank bigint, is_current_user boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH ranked AS (
    SELECT u.leaderboard_public_id AS player_id,
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
REVOKE ALL ON FUNCTION public.get_global_leaderboard_v2(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_global_leaderboard(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_global_leaderboard_v2(integer) TO authenticated;
