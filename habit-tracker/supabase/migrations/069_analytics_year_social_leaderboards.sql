-- Server-authoritative social views for the Analytics Year KPI.
--
-- The older leaderboard and friend RPCs remain unchanged for released clients.
-- These functions deliberately calculate the annual value for every profile in
-- the same query, so the client cannot patch only the signed-in user's number.
-- No email or auth identity is returned to the caller.

CREATE OR REPLACE FUNCTION public.analytics_year_date(p_local_date text)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
STRICT
AS $function$
DECLARE
  parsed date;
BEGIN
  IF p_local_date !~ '^\d{4}-\d{2}-\d{2}$' THEN
    RETURN NULL;
  END IF;

  parsed := to_date(p_local_date, 'YYYY-MM-DD');
  IF to_char(parsed, 'YYYY-MM-DD') <> p_local_date THEN
    RETURN NULL;
  END IF;
  RETURN parsed;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$function$;

CREATE INDEX IF NOT EXISTS activity_log_analytics_year_email_valid_date_idx
  ON public.activity_log (lower(btrim(user_email)), public.analytics_year_date(local_date))
  WHERE source = 'TASK';

CREATE OR REPLACE FUNCTION public.get_global_year_leaderboard_v1(p_limit integer DEFAULT 50)
RETURNS TABLE (
  player_id uuid,
  year_stars real,
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
  WITH profile_dates AS (
    SELECT profile.leaderboard_public_id AS player_id,
           profile.user_email,
           profile.current_streak,
           profile.auth_user_id,
           profile.activity_start_date,
           CASE
             WHEN profile_timezone.name IS NULL THEN CURRENT_DATE
             ELSE (now() AT TIME ZONE profile_timezone.name)::date
           END AS today
      FROM public.users AS profile
      LEFT JOIN LATERAL (
        SELECT timezone_name.name
          FROM pg_timezone_names AS timezone_name
         WHERE timezone_name.name = NULLIF(btrim(profile.timezone), '')
         LIMIT 1
      ) AS profile_timezone ON TRUE
  ),
  profile_bounds AS (
    SELECT profile_dates.*,
           make_date(EXTRACT(YEAR FROM profile_dates.today)::integer, 1, 1) AS year_start
      FROM profile_dates
  ),
  scored AS (
    SELECT u.player_id,
           u.user_email,
           GREATEST(
             FLOOR(COALESCE(SUM(CASE
               WHEN activity.stars_delta > 0 THEN activity.stars_delta
               ELSE 0
             END), 0)),
             0
           )::real AS year_stars,
           GREATEST(COALESCE(u.current_streak, 0), 0)::integer AS current_streak,
           COALESCE(u.auth_user_id = auth.uid(), false) AS is_current_user
      FROM profile_bounds AS u
      LEFT JOIN public.activity_log AS activity
        ON lower(btrim(activity.user_email)) = lower(btrim(u.user_email))
       AND activity.source = 'TASK'
       AND public.analytics_year_date(activity.local_date) >= GREATEST(u.year_start, COALESCE(u.activity_start_date, u.year_start))
       AND public.analytics_year_date(activity.local_date) <= u.today
     GROUP BY u.player_id,
              u.user_email,
              u.current_streak,
              u.auth_user_id,
              u.activity_start_date,
              u.year_start,
              u.today
  ),
  ranked AS (
    SELECT scored.*,
           ROW_NUMBER() OVER (
             ORDER BY scored.year_stars DESC,
                      scored.user_email ASC,
                      scored.player_id ASC
           ) AS rank
      FROM scored
  ),
  caller AS (
    SELECT ranked.rank
      FROM ranked
     WHERE ranked.is_current_user
     LIMIT 1
  )
  SELECT ranked.player_id,
         ranked.year_stars,
         ranked.rank,
         ranked.is_current_user,
         ranked.current_streak,
         NULL::integer AS rank_delta_7d
    FROM ranked
   WHERE ranked.rank <= LEAST(GREATEST(COALESCE(p_limit, 50), 1), 50)
      OR ranked.is_current_user
      OR ranked.rank BETWEEN (SELECT caller.rank FROM caller) - 5
                         AND (SELECT caller.rank FROM caller) + 5
   ORDER BY ranked.rank;
$$;

CREATE OR REPLACE FUNCTION public.get_my_year_friend_dashboard()
RETURNS TABLE (
  relationship_id uuid,
  section text,
  player_id uuid,
  display_name text,
  effective_streak integer,
  year_stars real,
  friend_rank bigint,
  is_current_user boolean,
  created_at timestamptz,
  expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_id uuid := auth.uid();
BEGIN
  IF caller_id IS NULL THEN
    RETURN;
  END IF;

  DELETE FROM public.friend_relationships AS relation
   WHERE relation.state = 'pending'
     AND relation.expires_at <= now()
     AND caller_id IN (relation.user_a_id, relation.user_b_id);

  RETURN QUERY
  WITH accepted_circle AS (
    SELECT relation.id AS relationship_id,
           relation.created_at,
           CASE
             WHEN relation.user_a_id = caller_id THEN relation.user_b_id
             ELSE relation.user_a_id
           END AS member_id
      FROM public.friend_relationships AS relation
     WHERE relation.state = 'accepted'
       AND caller_id IN (relation.user_a_id, relation.user_b_id)
  ),
  accepted_members AS (
    SELECT NULL::uuid AS relationship_id,
           NULL::timestamptz AS relationship_created_at,
           profile.auth_user_id,
           profile.leaderboard_public_id,
           profile.display_name,
           profile.timezone,
           profile.last_active_local_date,
           profile.current_streak,
           profile.user_email,
           profile.activity_start_date
      FROM public.users AS profile
     WHERE profile.auth_user_id = caller_id
    UNION ALL
    SELECT circle.relationship_id,
           circle.created_at,
           profile.auth_user_id,
           profile.leaderboard_public_id,
           profile.display_name,
           profile.timezone,
           profile.last_active_local_date,
           profile.current_streak,
           profile.user_email,
           profile.activity_start_date
      FROM accepted_circle AS circle
      JOIN public.users AS profile
        ON profile.auth_user_id = circle.member_id
  ),
  member_dates AS (
    SELECT member.*,
           member_timezone.name AS valid_timezone,
           CASE
             WHEN member_timezone.name IS NULL THEN CURRENT_DATE
             ELSE (now() AT TIME ZONE member_timezone.name)::date
           END AS today
      FROM accepted_members AS member
      LEFT JOIN LATERAL (
        SELECT timezone_name.name
          FROM pg_timezone_names AS timezone_name
         WHERE timezone_name.name = NULLIF(btrim(member.timezone), '')
         LIMIT 1
      ) AS member_timezone ON TRUE
  ),
  member_bounds AS (
    SELECT member_dates.*,
           make_date(EXTRACT(YEAR FROM member_dates.today)::integer, 1, 1) AS year_start
      FROM member_dates
  ),
  member_year_scores AS (
    SELECT member.auth_user_id,
           GREATEST(
             FLOOR(COALESCE(SUM(CASE
               WHEN activity.stars_delta > 0 THEN activity.stars_delta
               ELSE 0
             END), 0)),
             0
           )::real AS year_stars
      FROM member_bounds AS member
      LEFT JOIN public.activity_log AS activity
        ON lower(btrim(activity.user_email)) = lower(btrim(member.user_email))
       AND activity.source = 'TASK'
       AND public.analytics_year_date(activity.local_date) >= GREATEST(member.year_start, COALESCE(member.activity_start_date, member.year_start))
       AND public.analytics_year_date(activity.local_date) <= member.today
     GROUP BY member.auth_user_id,
              member.user_email,
              member.activity_start_date,
              member.year_start,
              member.today
  ),
  freshness_gated AS (
    SELECT member.relationship_id,
           member.relationship_created_at,
           member.auth_user_id,
           member.leaderboard_public_id,
           member.display_name,
           CASE
             WHEN member.valid_timezone IS NULL
               OR member.last_active_local_date IS NULL
             THEN 0
            WHEN member.last_active_local_date IN (
                    member.today,
                    member.today - 1
                  )
             THEN GREATEST(COALESCE(member.current_streak, 0), 0)
             ELSE 0
           END::integer AS effective_streak,
           scores.year_stars,
           member.auth_user_id = caller_id AS is_current_user
      FROM member_bounds AS member
      JOIN member_year_scores AS scores
        ON scores.auth_user_id = member.auth_user_id
  ),
  ranked_members AS (
    SELECT gated.*,
           DENSE_RANK() OVER (ORDER BY gated.year_stars DESC)::bigint AS friend_rank
      FROM freshness_gated AS gated
  ),
  accepted_rows AS (
    SELECT ranked.relationship_id,
           CASE WHEN ranked.is_current_user THEN 'self' ELSE 'accepted' END::text AS section,
           ranked.leaderboard_public_id AS player_id,
           ranked.display_name,
           ranked.effective_streak,
           ranked.year_stars,
           ranked.friend_rank,
           ranked.is_current_user,
           ranked.relationship_created_at AS created_at,
           NULL::timestamptz AS expires_at
      FROM ranked_members AS ranked
  ),
  incoming_rows AS (
    SELECT relation.id AS relationship_id,
           'incoming'::text AS section,
           requester.leaderboard_public_id AS player_id,
           requester.display_name,
           NULL::integer AS effective_streak,
           NULL::real AS year_stars,
           NULL::bigint AS friend_rank,
           false AS is_current_user,
           relation.created_at,
           relation.expires_at
      FROM public.friend_relationships AS relation
      JOIN public.users AS requester
        ON requester.auth_user_id = relation.requested_by
     WHERE relation.state = 'pending'
       AND caller_id IN (relation.user_a_id, relation.user_b_id)
       AND relation.requested_by IS DISTINCT FROM caller_id
  ),
  outgoing_rows AS (
    SELECT relation.id AS relationship_id,
           'outgoing'::text AS section,
           NULL::uuid AS player_id,
           NULL::text AS display_name,
           NULL::integer AS effective_streak,
           NULL::real AS year_stars,
           NULL::bigint AS friend_rank,
           false AS is_current_user,
           relation.created_at,
           relation.expires_at
      FROM public.friend_relationships AS relation
     WHERE relation.state = 'pending'
       AND relation.requested_by = caller_id
  )
  SELECT row_data.relationship_id,
         row_data.section,
         row_data.player_id,
         row_data.display_name,
         row_data.effective_streak,
         row_data.year_stars,
         row_data.friend_rank,
         row_data.is_current_user,
         row_data.created_at,
         row_data.expires_at
    FROM (
      SELECT * FROM incoming_rows
      UNION ALL
      SELECT * FROM outgoing_rows
      UNION ALL
      SELECT * FROM accepted_rows
    ) AS row_data
   ORDER BY
     CASE row_data.section
       WHEN 'incoming' THEN 1
       WHEN 'outgoing' THEN 2
       WHEN 'self' THEN 3
       ELSE 4
     END,
     row_data.friend_rank NULLS LAST,
     row_data.created_at DESC NULLS LAST,
     row_data.player_id;
END;
$$;

REVOKE ALL ON FUNCTION public.analytics_year_date(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_global_year_leaderboard_v1(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_global_year_leaderboard_v1(integer) TO authenticated;
REVOKE ALL ON FUNCTION public.get_my_year_friend_dashboard() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_year_friend_dashboard() TO authenticated;
