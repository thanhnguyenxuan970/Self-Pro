-- Versioned profile sync and privacy-preserving friend dashboard. The client
-- supplies only local progress freshness; identity and display name come from
-- the authenticated session.

CREATE OR REPLACE FUNCTION public.sanitize_friend_display_name(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT NULLIF(
           left(
             btrim(
               regexp_replace(
                 regexp_replace(COALESCE(p_name, ''), '[[:cntrl:]]', '', 'g'),
                 '[[:space:]]+',
                 ' ',
                 'g'
               )
             ),
             80
           ),
           ''
         )
$$;

CREATE OR REPLACE FUNCTION public.sync_user_profile_v2(
  p_current_streak integer,
  p_last_active_local_date date,
  p_timezone text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_id uuid := auth.uid();
  caller_email text := auth.email();
  jwt_payload jsonb := auth.jwt();
  raw_name text;
  clean_name text;
  valid_timezone text;
  valid_active_date date;
  today_in_timezone date;
BEGIN
  IF caller_id IS NULL OR caller_email IS NULL THEN
    RAISE EXCEPTION 'Authenticated user required';
  END IF;

  raw_name := COALESCE(
    jwt_payload #>> '{user_metadata,full_name}',
    jwt_payload #>> '{user_metadata,name}'
  );
  clean_name := public.sanitize_friend_display_name(raw_name);

  SELECT timezone_name.name
    INTO valid_timezone
    FROM pg_timezone_names AS timezone_name
   WHERE timezone_name.name = btrim(COALESCE(p_timezone, ''))
   LIMIT 1;

  IF valid_timezone IS NOT NULL THEN
    today_in_timezone := (now() AT TIME ZONE valid_timezone)::date;
    IF p_last_active_local_date IS NULL
       OR p_last_active_local_date <= today_in_timezone THEN
      valid_active_date := p_last_active_local_date;
    END IF;
  END IF;

  INSERT INTO public.users (
    user_email,
    auth_user_id,
    current_streak,
    display_name,
    timezone,
    last_active_local_date
  ) VALUES (
    caller_email,
    caller_id,
    GREATEST(COALESCE(p_current_streak, 0), 0),
    clean_name,
    valid_timezone,
    valid_active_date
  )
  ON CONFLICT (auth_user_id) DO UPDATE
     SET user_email = EXCLUDED.user_email,
         current_streak = EXCLUDED.current_streak,
         display_name = COALESCE(EXCLUDED.display_name, public.users.display_name),
         timezone = EXCLUDED.timezone,
         last_active_local_date = EXCLUDED.last_active_local_date;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_friend_pending_count()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_id uuid := auth.uid();
  pending_count integer;
BEGIN
  IF caller_id IS NULL THEN
    RETURN 0;
  END IF;

  DELETE FROM public.friend_relationships AS relation
   WHERE relation.state = 'pending'
     AND relation.expires_at <= now()
     AND caller_id IN (relation.user_a_id, relation.user_b_id);

  SELECT count(*)::integer
    INTO pending_count
    FROM public.friend_relationships AS relation
   WHERE relation.state = 'pending'
     AND caller_id IN (relation.user_a_id, relation.user_b_id)
     AND relation.requested_by IS DISTINCT FROM caller_id;

  RETURN pending_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_friend_dashboard()
RETURNS TABLE (
  relationship_id uuid,
  section text,
  player_id uuid,
  display_name text,
  effective_streak integer,
  lifetime_stars real,
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
           profile.*
      FROM public.users AS profile
     WHERE profile.auth_user_id = caller_id
    UNION ALL
    SELECT circle.relationship_id,
           circle.created_at,
           profile.*
      FROM accepted_circle AS circle
      JOIN public.users AS profile
        ON profile.auth_user_id = circle.member_id
  ),
  freshness_gated AS (
    SELECT member.relationship_id,
           member.relationship_created_at,
           member.auth_user_id,
           member.leaderboard_public_id,
           member.display_name,
           CASE
             WHEN member.timezone IS NULL
               OR NOT EXISTS (
                 SELECT 1
                   FROM pg_timezone_names AS timezone_name
                  WHERE timezone_name.name = member.timezone
               )
               OR member.last_active_local_date IS NULL
             THEN 0
             WHEN member.last_active_local_date IN (
                    (now() AT TIME ZONE member.timezone)::date,
                    (now() AT TIME ZONE member.timezone)::date - 1
                  )
             THEN GREATEST(COALESCE(member.current_streak, 0), 0)
             ELSE 0
           END::integer AS effective_streak,
           GREATEST(COALESCE(member.lifetime_stars, 0), 0)::real AS lifetime_stars,
           member.auth_user_id = caller_id AS is_current_user
      FROM accepted_members AS member
  ),
  ranked_members AS (
    SELECT gated.*,
           DENSE_RANK() OVER (ORDER BY gated.lifetime_stars DESC)::bigint AS friend_rank
      FROM freshness_gated AS gated
  ),
  accepted_rows AS (
    SELECT ranked.relationship_id,
           CASE WHEN ranked.is_current_user THEN 'self' ELSE 'accepted' END::text AS section,
           ranked.leaderboard_public_id AS player_id,
           ranked.display_name,
           ranked.effective_streak,
           ranked.lifetime_stars,
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
           NULL::real AS lifetime_stars,
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
           NULL::real AS lifetime_stars,
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
         row_data.lifetime_stars,
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

-- Reset progress but retain friend code and all social relationships.
CREATE OR REPLACE FUNCTION public.reset_my_progress()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_id uuid := auth.uid();
  caller_email text := auth.email();
BEGIN
  IF caller_id IS NULL OR caller_email IS NULL THEN
    RAISE EXCEPTION 'Authenticated user required';
  END IF;

  DELETE FROM public.activity_log WHERE user_email = caller_email;
  DELETE FROM public.fund_transactions WHERE user_email = caller_email;
  UPDATE public.users
     SET current_streak = 0,
         lifetime_stars = 0,
         last_active_local_date = NULL
   WHERE auth_user_id = caller_id;
END;
$$;

REVOKE ALL ON FUNCTION public.sanitize_friend_display_name(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_user_profile_v2(integer, date, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_friend_pending_count() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_my_friend_dashboard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reset_my_progress() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.sync_user_profile_v2(integer, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_friend_pending_count() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_friend_dashboard() TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_my_progress() TO authenticated;
