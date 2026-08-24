-- Make the deletion fence explicit at every public friend mutation entry
-- point. Pair-lock fencing remains useful for race serialization, but callers
-- must not depend on a later helper call to reject a stale JWT.

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
  PERFORM public.assert_account_write_allowed();
  PERFORM pg_advisory_xact_lock(hashtextextended('friend-capacity:' || first_user::text, 0));
  IF second_user IS DISTINCT FROM first_user THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('friend-capacity:' || second_user::text, 0));
  END IF;
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
  PERFORM public.assert_account_write_allowed();

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
     SET state = 'accepted', accepted_at = now(), expires_at = NULL, updated_at = now()
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
  IF caller_id IS NULL THEN
    RETURN QUERY SELECT 'NOT_FOUND'::text;
    RETURN;
  END IF;
  PERFORM public.assert_account_write_allowed();
  SELECT relation.* INTO relationship
    FROM public.friend_relationships AS relation
   WHERE relation.id = p_request_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'NOT_FOUND'::text;
    RETURN;
  END IF;
  PERFORM public.friend_pair_lock(relationship.user_a_id, relationship.user_b_id);
  DELETE FROM public.friend_relationships
   WHERE id = p_request_id AND state = 'pending' AND requested_by = caller_id;
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
  IF caller_id IS NULL THEN
    RETURN QUERY SELECT 'NOT_FOUND'::text;
    RETURN;
  END IF;
  PERFORM public.assert_account_write_allowed();
  SELECT relation.* INTO relationship
    FROM public.friend_relationships AS relation
   WHERE relation.id = p_relationship_id;
  IF NOT FOUND THEN
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
  IF caller_id IS NULL THEN
    RETURN QUERY SELECT 'NOT_FOUND'::text;
    RETURN;
  END IF;
  PERFORM public.assert_account_write_allowed();
  SELECT relation.* INTO original_relationship
    FROM public.friend_relationships AS relation
   WHERE relation.id = p_relationship_id;
  IF NOT FOUND THEN
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
       SET state = 'blocked', requested_by = NULL, blocked_by = caller_id,
           accepted_at = NULL, expires_at = NULL, updated_at = now()
     WHERE id = current_relationship.id;
  ELSE
    INSERT INTO public.friend_relationships (
      id, user_a_id, user_b_id, state, blocked_by
    ) VALUES (
      p_relationship_id, original_relationship.user_a_id,
      original_relationship.user_b_id, 'blocked', caller_id
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
  IF caller_id IS NULL THEN
    RETURN QUERY SELECT 'NOT_FOUND'::text;
    RETURN;
  END IF;
  PERFORM public.assert_account_write_allowed();
  SELECT relation.* INTO relationship
    FROM public.friend_relationships AS relation
   WHERE relation.id = p_relationship_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'NOT_FOUND'::text;
    RETURN;
  END IF;
  PERFORM public.friend_pair_lock(relationship.user_a_id, relationship.user_b_id);
  DELETE FROM public.friend_relationships
   WHERE id = p_relationship_id AND state = 'blocked' AND blocked_by = caller_id;
  IF FOUND THEN
    RETURN QUERY SELECT 'OK'::text;
  ELSE
    RETURN QUERY SELECT 'FORBIDDEN'::text;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.friend_capacity_locks(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.respond_to_friend_request(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_friend_request(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.remove_friend(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.block_friend(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.unblock_friend(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.respond_to_friend_request(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_friend_request(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_friend(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.block_friend(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unblock_friend(uuid) TO authenticated;
