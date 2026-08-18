-- Canonical friend relationships, invite codes, consent transitions, and
-- abuse controls. Social identity is always auth.uid(); email is not accepted
-- by any social RPC.

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS timezone text,
  ADD COLUMN IF NOT EXISTS last_active_local_date date,
  ADD COLUMN IF NOT EXISTS friend_code text;

ALTER TABLE public.users
  ADD CONSTRAINT users_friend_code_format_check
  CHECK (
    friend_code IS NULL
    OR friend_code ~ '^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$'
  );

CREATE UNIQUE INDEX users_friend_code_idx
  ON public.users (friend_code)
  WHERE friend_code IS NOT NULL;

CREATE TABLE public.friend_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a_id uuid NOT NULL REFERENCES public.users(auth_user_id) ON DELETE CASCADE,
  user_b_id uuid NOT NULL REFERENCES public.users(auth_user_id) ON DELETE CASCADE,
  state text NOT NULL CHECK (state IN ('pending', 'accepted', 'blocked')),
  requested_by uuid,
  blocked_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  expires_at timestamptz,
  CHECK (user_a_id < user_b_id),
  CHECK (requested_by IS NULL OR requested_by IN (user_a_id, user_b_id)),
  CHECK (blocked_by IS NULL OR blocked_by IN (user_a_id, user_b_id)),
  CHECK (
    (state = 'pending'
      AND requested_by IS NOT NULL
      AND blocked_by IS NULL
      AND accepted_at IS NULL
      AND expires_at IS NOT NULL)
    OR
    (state = 'accepted'
      AND requested_by IS NOT NULL
      AND blocked_by IS NULL
      AND accepted_at IS NOT NULL
      AND expires_at IS NULL)
    OR
    (state = 'blocked'
      AND blocked_by IS NOT NULL
      AND accepted_at IS NULL
      AND expires_at IS NULL)
  ),
  UNIQUE (user_a_id, user_b_id)
);

ALTER TABLE public.friend_relationships ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.friend_relationships FROM PUBLIC, anon, authenticated;

CREATE INDEX friend_relationships_a_state_created_idx
  ON public.friend_relationships (user_a_id, state, created_at DESC);
CREATE INDEX friend_relationships_b_state_created_idx
  ON public.friend_relationships (user_b_id, state, created_at DESC);
CREATE INDEX friend_relationships_pending_expiry_idx
  ON public.friend_relationships (expires_at)
  WHERE state = 'pending';

CREATE TABLE public.friend_code_attempts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  auth_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('probe_failure', 'relationship_created')),
  attempted_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.friend_code_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.friend_code_attempts FROM PUBLIC, anon, authenticated;

CREATE INDEX friend_code_attempts_user_kind_time_idx
  ON public.friend_code_attempts (auth_user_id, kind, attempted_at DESC);

CREATE OR REPLACE FUNCTION public.friend_pair_lock(p_user_a uuid, p_user_b uuid)
RETURNS void
LANGUAGE sql
VOLATILE
SET search_path = public, pg_temp
AS $$
  SELECT pg_advisory_xact_lock(
    hashtextextended(
      'friend-pair:' || least(p_user_a, p_user_b)::text || ':' || greatest(p_user_a, p_user_b)::text,
      0
    )
  )
$$;

CREATE OR REPLACE FUNCTION public.friend_capacity_locks(p_user_a uuid, p_user_b uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SET search_path = public, pg_temp
AS $$
DECLARE
  first_user uuid := least(p_user_a, p_user_b);
  second_user uuid := greatest(p_user_a, p_user_b);
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('friend-capacity:' || first_user::text, 0));
  IF second_user IS DISTINCT FROM first_user THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('friend-capacity:' || second_user::text, 0));
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.friend_retry_after_seconds(p_user_id uuid, p_kind text)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT GREATEST(
           1,
           CEIL(EXTRACT(EPOCH FROM (MIN(attempted_at) + interval '1 hour' - now())))::integer
         )
    FROM public.friend_code_attempts
   WHERE auth_user_id = p_user_id
     AND kind = p_kind
     AND attempted_at > now() - interval '1 hour'
$$;

CREATE OR REPLACE FUNCTION public.generate_friend_code_candidate()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  random_bytes bytea;
  byte_index integer;
  byte_value integer;
  result text := '';
BEGIN
  -- Rejection sampling avoids modulo bias: 248 is the largest multiple of 31
  -- below 256, so every alphabet position has equal probability.
  WHILE length(result) < 6 LOOP
    random_bytes := gen_random_bytes(12);
    FOR byte_index IN 0..length(random_bytes) - 1 LOOP
      byte_value := get_byte(random_bytes, byte_index);
      IF byte_value < 248 THEN
        result := result || substr(alphabet, (byte_value % 31) + 1, 1);
        EXIT WHEN length(result) = 6;
      END IF;
    END LOOP;
  END LOOP;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_or_create_my_friend_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_id uuid := auth.uid();
  stored_code text;
  candidate text;
  attempt integer;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authenticated user required';
  END IF;

  SELECT friend_code
    INTO stored_code
    FROM public.users
   WHERE auth_user_id = caller_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Authenticated profile required';
  END IF;
  IF stored_code IS NOT NULL THEN
    RETURN stored_code;
  END IF;

  FOR attempt IN 1..20 LOOP
    candidate := public.generate_friend_code_candidate();
    BEGIN
      UPDATE public.users
         SET friend_code = candidate
       WHERE auth_user_id = caller_id;
      RETURN candidate;
    EXCEPTION WHEN unique_violation THEN
      NULL;
    END;
  END LOOP;

  RAISE EXCEPTION 'Could not allocate a unique friend code';
END;
$$;

CREATE OR REPLACE FUNCTION public.rotate_my_friend_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_id uuid := auth.uid();
  previous_code text;
  candidate text;
  attempt integer;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authenticated user required';
  END IF;

  SELECT friend_code
    INTO previous_code
    FROM public.users
   WHERE auth_user_id = caller_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Authenticated profile required';
  END IF;

  FOR attempt IN 1..20 LOOP
    candidate := public.generate_friend_code_candidate();
    CONTINUE WHEN candidate IS NOT DISTINCT FROM previous_code;
    BEGIN
      UPDATE public.users
         SET friend_code = candidate
       WHERE auth_user_id = caller_id;
      RETURN candidate;
    EXCEPTION WHEN unique_violation THEN
      NULL;
    END;
  END LOOP;

  RAISE EXCEPTION 'Could not rotate to a unique friend code';
END;
$$;

CREATE OR REPLACE FUNCTION public.request_friend_by_code(p_code text)
RETURNS TABLE(status text, retry_after_seconds integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_id uuid := auth.uid();
  target_id uuid;
  normalized_code text;
  user_a uuid;
  user_b uuid;
  relationship public.friend_relationships%ROWTYPE;
  probe_count integer;
  success_count integer;
  caller_accepted integer;
  target_accepted integer;
  caller_outgoing integer;
  target_incoming integer;
BEGIN
  IF caller_id IS NULL THEN
    RETURN QUERY SELECT 'FORBIDDEN'::text, NULL::integer;
    RETURN;
  END IF;

  -- Serialize both limiter buckets for this caller. This lock is deliberately
  -- separate from pair and capacity locks, which use distinct hash prefixes.
  PERFORM pg_advisory_xact_lock(hashtextextended('friend-rate:' || caller_id::text, 0));

  DELETE FROM public.friend_code_attempts
   WHERE auth_user_id = caller_id
     AND attempted_at <= now() - interval '1 hour';

  SELECT count(*)::integer
    INTO probe_count
    FROM public.friend_code_attempts
   WHERE auth_user_id = caller_id
     AND kind = 'probe_failure'
     AND attempted_at > now() - interval '1 hour';

  IF probe_count >= 10 THEN
    RETURN QUERY
    SELECT 'RATE_LIMITED'::text,
           public.friend_retry_after_seconds(caller_id, 'probe_failure');
    RETURN;
  END IF;

  normalized_code := upper(btrim(COALESCE(p_code, '')));
  IF normalized_code !~ '^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$' THEN
    INSERT INTO public.friend_code_attempts (auth_user_id, kind)
    VALUES (caller_id, 'probe_failure');
    RETURN QUERY SELECT 'NOT_FOUND'::text, NULL::integer;
    RETURN;
  END IF;

  SELECT auth_user_id
    INTO target_id
    FROM public.users
   WHERE friend_code = normalized_code;

  IF target_id IS NULL THEN
    INSERT INTO public.friend_code_attempts (auth_user_id, kind)
    VALUES (caller_id, 'probe_failure');
    RETURN QUERY SELECT 'NOT_FOUND'::text, NULL::integer;
    RETURN;
  END IF;

  IF target_id = caller_id THEN
    RETURN QUERY SELECT 'SELF'::text, NULL::integer;
    RETURN;
  END IF;

  user_a := least(caller_id, target_id);
  user_b := greatest(caller_id, target_id);
  PERFORM public.friend_pair_lock(user_a, user_b);

  SELECT relation.*
    INTO relationship
    FROM public.friend_relationships AS relation
   WHERE relation.user_a_id = user_a
     AND relation.user_b_id = user_b
   FOR UPDATE;

  IF FOUND AND relationship.state = 'pending' AND relationship.expires_at <= now() THEN
    DELETE FROM public.friend_relationships WHERE id = relationship.id;
    relationship := NULL;
  END IF;

  IF relationship.id IS NOT NULL AND relationship.state = 'blocked' THEN
    INSERT INTO public.friend_code_attempts (auth_user_id, kind)
    VALUES (caller_id, 'probe_failure');
    RETURN QUERY SELECT 'NOT_FOUND'::text, NULL::integer;
    RETURN;
  END IF;

  IF relationship.id IS NOT NULL AND relationship.state = 'accepted' THEN
    RETURN QUERY SELECT 'ALREADY_FRIENDS'::text, NULL::integer;
    RETURN;
  END IF;

  IF relationship.id IS NOT NULL
     AND relationship.state = 'pending'
     AND relationship.requested_by = caller_id THEN
    RETURN QUERY SELECT 'ALREADY_PENDING'::text, NULL::integer;
    RETURN;
  END IF;

  SELECT count(*)::integer
    INTO success_count
    FROM public.friend_code_attempts
   WHERE auth_user_id = caller_id
     AND kind = 'relationship_created'
     AND attempted_at > now() - interval '1 hour';

  IF success_count >= 30 THEN
    RETURN QUERY
    SELECT 'RATE_LIMITED'::text,
           public.friend_retry_after_seconds(caller_id, 'relationship_created');
    RETURN;
  END IF;

  PERFORM public.friend_capacity_locks(caller_id, target_id);

  -- Capacity is defined over live pending rows. Cleanup must happen on the
  -- write path as well as dashboard reads; otherwise a user who never opens
  -- the inbox remains falsely capped by expired requests.
  DELETE FROM public.friend_relationships AS relation
   WHERE relation.state = 'pending'
     AND relation.expires_at <= now()
     AND (
       caller_id IN (relation.user_a_id, relation.user_b_id)
       OR target_id IN (relation.user_a_id, relation.user_b_id)
     );

  IF relationship.id IS NOT NULL AND relationship.state = 'pending' THEN
    SELECT count(*)::integer
      INTO caller_accepted
      FROM public.friend_relationships AS relation
     WHERE relation.state = 'accepted'
       AND caller_id IN (relation.user_a_id, relation.user_b_id);
    SELECT count(*)::integer
      INTO target_accepted
      FROM public.friend_relationships AS relation
     WHERE relation.state = 'accepted'
       AND target_id IN (relation.user_a_id, relation.user_b_id);

    IF caller_accepted >= 100 OR target_accepted >= 100 THEN
      RETURN QUERY SELECT 'FRIEND_LIMIT_REACHED'::text, NULL::integer;
      RETURN;
    END IF;

    UPDATE public.friend_relationships
       SET state = 'accepted',
           blocked_by = NULL,
           accepted_at = now(),
           expires_at = NULL,
           updated_at = now()
     WHERE id = relationship.id;

    INSERT INTO public.friend_code_attempts (auth_user_id, kind)
    VALUES (caller_id, 'relationship_created');
    RETURN QUERY SELECT 'ACCEPTED'::text, NULL::integer;
    RETURN;
  END IF;

  SELECT count(*)::integer
    INTO caller_outgoing
    FROM public.friend_relationships AS relation
   WHERE relation.state = 'pending'
     AND relation.requested_by = caller_id;

  SELECT count(*)::integer
    INTO target_incoming
    FROM public.friend_relationships AS relation
   WHERE relation.state = 'pending'
     AND relation.requested_by IS DISTINCT FROM target_id
     AND target_id IN (relation.user_a_id, relation.user_b_id);

  IF caller_outgoing >= 20 OR target_incoming >= 50 THEN
    RETURN QUERY SELECT 'PENDING_LIMIT_REACHED'::text, NULL::integer;
    RETURN;
  END IF;

  INSERT INTO public.friend_relationships (
    user_a_id, user_b_id, state, requested_by, expires_at
  ) VALUES (
    user_a, user_b, 'pending', caller_id, now() + interval '30 days'
  );

  INSERT INTO public.friend_code_attempts (auth_user_id, kind)
  VALUES (caller_id, 'relationship_created');
  RETURN QUERY SELECT 'PENDING'::text, NULL::integer;
END;
$$;

CREATE OR REPLACE FUNCTION public.respond_to_friend_request(p_request_id uuid, p_action text)
RETURNS TABLE(status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_id uuid := auth.uid();
  relationship public.friend_relationships%ROWTYPE;
  normalized_action text := lower(btrim(COALESCE(p_action, '')));
  caller_accepted integer;
  requester_accepted integer;
BEGIN
  IF caller_id IS NULL THEN
    RETURN QUERY SELECT 'FORBIDDEN'::text;
    RETURN;
  END IF;

  SELECT relation.* INTO relationship
    FROM public.friend_relationships AS relation
   WHERE relation.id = p_request_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'NOT_FOUND'::text;
    RETURN;
  END IF;

  PERFORM public.friend_pair_lock(relationship.user_a_id, relationship.user_b_id);
  SELECT relation.* INTO relationship
    FROM public.friend_relationships AS relation
   WHERE relation.id = p_request_id
   FOR UPDATE;

  IF NOT FOUND
     OR relationship.state <> 'pending'
     OR caller_id NOT IN (relationship.user_a_id, relationship.user_b_id) THEN
    RETURN QUERY SELECT 'NOT_FOUND'::text;
    RETURN;
  END IF;

  IF relationship.expires_at <= now() THEN
    DELETE FROM public.friend_relationships WHERE id = relationship.id;
    RETURN QUERY SELECT 'NOT_FOUND'::text;
    RETURN;
  END IF;

  IF relationship.requested_by = caller_id OR normalized_action NOT IN ('accept', 'reject') THEN
    RETURN QUERY SELECT 'FORBIDDEN'::text;
    RETURN;
  END IF;

  IF normalized_action = 'reject' THEN
    DELETE FROM public.friend_relationships WHERE id = relationship.id;
    RETURN QUERY SELECT 'OK'::text;
    RETURN;
  END IF;

  PERFORM public.friend_capacity_locks(relationship.user_a_id, relationship.user_b_id);
  SELECT count(*)::integer INTO caller_accepted
    FROM public.friend_relationships AS relation
   WHERE relation.state = 'accepted'
     AND caller_id IN (relation.user_a_id, relation.user_b_id);
  SELECT count(*)::integer INTO requester_accepted
    FROM public.friend_relationships AS relation
   WHERE relation.state = 'accepted'
     AND relationship.requested_by IN (relation.user_a_id, relation.user_b_id);

  IF caller_accepted >= 100 OR requester_accepted >= 100 THEN
    RETURN QUERY SELECT 'FRIEND_LIMIT_REACHED'::text;
    RETURN;
  END IF;

  UPDATE public.friend_relationships
     SET state = 'accepted',
         accepted_at = now(),
         expires_at = NULL,
         updated_at = now()
   WHERE id = relationship.id;
  RETURN QUERY SELECT 'OK'::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_friend_request(p_request_id uuid)
RETURNS TABLE(status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_id uuid := auth.uid();
  relationship public.friend_relationships%ROWTYPE;
BEGIN
  SELECT relation.* INTO relationship
    FROM public.friend_relationships AS relation
   WHERE relation.id = p_request_id;
  IF caller_id IS NULL OR NOT FOUND THEN
    RETURN QUERY SELECT 'NOT_FOUND'::text;
    RETURN;
  END IF;
  PERFORM public.friend_pair_lock(relationship.user_a_id, relationship.user_b_id);
  DELETE FROM public.friend_relationships
   WHERE id = p_request_id
     AND state = 'pending'
     AND requested_by = caller_id;
  IF FOUND THEN
    RETURN QUERY SELECT 'OK'::text;
  ELSE
    RETURN QUERY SELECT 'FORBIDDEN'::text;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_friend(p_relationship_id uuid)
RETURNS TABLE(status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_id uuid := auth.uid();
  relationship public.friend_relationships%ROWTYPE;
BEGIN
  SELECT relation.* INTO relationship
    FROM public.friend_relationships AS relation
   WHERE relation.id = p_relationship_id;
  IF caller_id IS NULL OR NOT FOUND THEN
    RETURN QUERY SELECT 'NOT_FOUND'::text;
    RETURN;
  END IF;
  PERFORM public.friend_pair_lock(relationship.user_a_id, relationship.user_b_id);
  DELETE FROM public.friend_relationships
   WHERE id = p_relationship_id
     AND state = 'accepted'
     AND caller_id IN (user_a_id, user_b_id);
  IF FOUND THEN
    RETURN QUERY SELECT 'OK'::text;
  ELSE
    RETURN QUERY SELECT 'NOT_FOUND'::text;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.block_friend(p_relationship_id uuid)
RETURNS TABLE(status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_id uuid := auth.uid();
  original_relationship public.friend_relationships%ROWTYPE;
  current_relationship public.friend_relationships%ROWTYPE;
BEGIN
  SELECT relation.* INTO original_relationship
    FROM public.friend_relationships AS relation
   WHERE relation.id = p_relationship_id;
  IF caller_id IS NULL OR NOT FOUND THEN
    RETURN QUERY SELECT 'NOT_FOUND'::text;
    RETURN;
  END IF;

  IF caller_id NOT IN (original_relationship.user_a_id, original_relationship.user_b_id) THEN
    RETURN QUERY SELECT 'NOT_FOUND'::text;
    RETURN;
  END IF;

  PERFORM public.friend_pair_lock(original_relationship.user_a_id, original_relationship.user_b_id);
  SELECT relation.* INTO current_relationship
    FROM public.friend_relationships AS relation
   WHERE relation.user_a_id = original_relationship.user_a_id
     AND relation.user_b_id = original_relationship.user_b_id
   FOR UPDATE;

  IF FOUND AND current_relationship.state = 'blocked' THEN
    IF current_relationship.blocked_by = caller_id THEN
      RETURN QUERY SELECT 'OK'::text;
    ELSE
      RETURN QUERY SELECT 'NOT_FOUND'::text;
    END IF;
    RETURN;
  END IF;

  IF FOUND THEN
    UPDATE public.friend_relationships
       SET state = 'blocked',
           requested_by = NULL,
           blocked_by = caller_id,
           accepted_at = NULL,
           expires_at = NULL,
           updated_at = now()
     WHERE id = current_relationship.id;
  ELSE
    -- A racing remove/reject/cancel may delete the row after block validated
    -- the pair but before block acquired the pair lock. Recreate the canonical
    -- blocked row so the safety transition wins that race.
    INSERT INTO public.friend_relationships (
      id, user_a_id, user_b_id, state, blocked_by
    ) VALUES (
      p_relationship_id,
      original_relationship.user_a_id,
      original_relationship.user_b_id,
      'blocked',
      caller_id
    );
  END IF;
  RETURN QUERY SELECT 'OK'::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.unblock_friend(p_relationship_id uuid)
RETURNS TABLE(status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_id uuid := auth.uid();
  relationship public.friend_relationships%ROWTYPE;
BEGIN
  SELECT relation.* INTO relationship
    FROM public.friend_relationships AS relation
   WHERE relation.id = p_relationship_id;
  IF caller_id IS NULL OR NOT FOUND THEN
    RETURN QUERY SELECT 'NOT_FOUND'::text;
    RETURN;
  END IF;
  PERFORM public.friend_pair_lock(relationship.user_a_id, relationship.user_b_id);
  DELETE FROM public.friend_relationships
   WHERE id = p_relationship_id
     AND state = 'blocked'
     AND blocked_by = caller_id;
  IF FOUND THEN
    RETURN QUERY SELECT 'OK'::text;
  ELSE
    RETURN QUERY SELECT 'FORBIDDEN'::text;
  END IF;
END;
$$;

-- Extend account deletion without changing its released signature. Reset is
-- intentionally unchanged here: resetting progress preserves social state.
CREATE OR REPLACE FUNCTION public.delete_my_account_data()
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

  DELETE FROM public.friend_code_attempts WHERE auth_user_id = caller_id;
  DELETE FROM public.activity_log WHERE user_email = caller_email;
  DELETE FROM public.fund_transactions WHERE user_email = caller_email;
  DELETE FROM public.users WHERE auth_user_id = caller_id;
END;
$$;

REVOKE ALL ON FUNCTION public.friend_pair_lock(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.friend_capacity_locks(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.friend_retry_after_seconds(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.generate_friend_code_candidate() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_or_create_my_friend_code() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rotate_my_friend_code() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.request_friend_by_code(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.respond_to_friend_request(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_friend_request(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.remove_friend(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.block_friend(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.unblock_friend(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_my_account_data() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_or_create_my_friend_code() TO authenticated;
GRANT EXECUTE ON FUNCTION public.rotate_my_friend_code() TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_friend_by_code(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_to_friend_request(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_friend_request(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_friend(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.block_friend(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unblock_friend(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_my_account_data() TO authenticated;
