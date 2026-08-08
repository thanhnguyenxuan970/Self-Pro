-- Return the caller's rank neighbourhood (their rank ±5) alongside the top 50.
--
-- Rationale: the top 50 are unreachable for a typical user, so the global
-- ladder gives them nothing to compare against. The neighbourhood shows the
-- players immediately above and below them, which is the only comparison that
-- can plausibly change behaviour.
--
-- Privacy posture is unchanged from 022/023/024: this still exposes only the
-- server-assigned `leaderboard_public_id` pseudonym, lifetime stars, and rank.
-- No email, no display name, no user-generated content. The only widening is
-- that a caller now sees up to 10 additional pseudonymous rows adjacent to
-- their own, which is the same class of data the top 50 already exposes.
--
-- Signature and OUT parameters are deliberately identical to 023 so this is a
-- true CREATE OR REPLACE: adding a `p_neighbors` argument would create an
-- overload rather than replace the function, and PostgREST could not then
-- resolve a call that passes only `p_limit`.
--
-- `get_global_leaderboard` (the legacy, pre-v2 RPC) is intentionally NOT given
-- a neighbourhood. Already-released clients render its rows as one flat list
-- and would draw non-contiguous ranks as if they were consecutive.

CREATE OR REPLACE FUNCTION public.get_global_leaderboard_v2(p_limit integer DEFAULT 50)
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
  ),
  caller AS (
    SELECT r.rank AS rank
      FROM ranked AS r
     WHERE r.is_current_user
     LIMIT 1
  )
  -- When the caller has no row in public.users the `caller` CTE is empty, both
  -- scalar subqueries evaluate to NULL, the BETWEEN yields NULL, and the
  -- neighbourhood predicate is simply never true — top 50 only, as before.
  SELECT r.player_id, r.lifetime_stars, r.rank, r.is_current_user
    FROM ranked AS r
   WHERE r.rank <= LEAST(GREATEST(COALESCE(p_limit, 50), 1), 50)
      OR r.is_current_user
      OR r.rank BETWEEN (SELECT c.rank FROM caller AS c) - 5
                    AND (SELECT c.rank FROM caller AS c) + 5
   ORDER BY r.rank;
$$;

REVOKE ALL ON FUNCTION public.get_global_leaderboard_v2(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_global_leaderboard_v2(integer) TO authenticated;
