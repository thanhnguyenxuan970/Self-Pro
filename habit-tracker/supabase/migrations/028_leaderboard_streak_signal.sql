-- Add the ladder's "signs of life" signal: each row's current streak.
--
-- Rationale: a row showing only a frozen star total reads as seeded data. A
-- streak is the one number that can only be produced by a person showing up
-- repeatedly, so it is what makes an anonymous row read as a real competitor.
--
-- Data source: `public.users.current_streak`, which the client already syncs
-- via `sync_user_profile` (migration 021). No new table, no new sync path.
--
-- Privacy: this does widen what a caller learns about other players — from
-- "pseudonym + lifetime total" to "pseudonym + lifetime total + how many
-- consecutive days they have logged". It stays coarse (a single integer), it
-- stays attached to `leaderboard_public_id` rather than to any identity, and
-- it is the same behavioural class as `lifetime_stars`, which is already
-- exposed. It is NOT tied to a name, email, avatar, or anything the user typed,
-- so this remains outside the user-generated-content surface.
--
-- Unlike 026 this changes the OUT parameters, and PostgreSQL cannot alter a
-- function's result columns with CREATE OR REPLACE — hence the explicit DROP.
-- Already-released clients read named keys off the returned JSON objects, so
-- the extra `current_streak` key is additive and does not break them.

DROP FUNCTION IF EXISTS public.get_global_leaderboard_v2(integer);

CREATE FUNCTION public.get_global_leaderboard_v2(p_limit integer DEFAULT 50)
RETURNS TABLE (player_id uuid, lifetime_stars real, rank bigint, is_current_user boolean, current_streak integer)
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
           COALESCE(u.user_email = auth.email(), false) AS is_current_user,
           GREATEST(COALESCE(u.current_streak, 0), 0)::integer AS current_streak
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
  SELECT r.player_id, r.lifetime_stars, r.rank, r.is_current_user, r.current_streak
    FROM ranked AS r
   WHERE r.rank <= LEAST(GREATEST(COALESCE(p_limit, 50), 1), 50)
      OR r.is_current_user
      OR r.rank BETWEEN (SELECT c.rank FROM caller AS c) - 5
                    AND (SELECT c.rank FROM caller AS c) + 5
   ORDER BY r.rank;
$$;

REVOKE ALL ON FUNCTION public.get_global_leaderboard_v2(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_global_leaderboard_v2(integer) TO authenticated;
