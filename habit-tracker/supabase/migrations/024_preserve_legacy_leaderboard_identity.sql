-- Keep legacy clients able to identify the signed-in user without exposing
-- other users' email addresses. This replaces the 023 implementation for
-- databases where that migration has already been applied.
CREATE OR REPLACE FUNCTION public.get_global_leaderboard(p_limit integer DEFAULT 50)
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

REVOKE ALL ON FUNCTION public.get_global_leaderboard(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_global_leaderboard(integer) TO authenticated;
