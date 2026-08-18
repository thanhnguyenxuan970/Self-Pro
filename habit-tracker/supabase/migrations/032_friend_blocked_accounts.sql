-- Complete the blocker-owned account list and preserve outgoing-request
-- anonymity. Released social tables remain inaccessible to clients directly.

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

  IF FOUND
     AND current_relationship.state = 'pending'
     AND current_relationship.requested_by = caller_id THEN
    RETURN QUERY SELECT 'FORBIDDEN'::text;
    RETURN;
  END IF;

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

CREATE OR REPLACE FUNCTION public.get_my_blocked_accounts()
RETURNS TABLE(
  relationship_id uuid,
  display_name text,
  blocked_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT relation.id,
         public.sanitize_friend_display_name(profile.display_name),
         relation.updated_at
    FROM public.friend_relationships AS relation
    JOIN public.users AS profile
      ON profile.auth_user_id = CASE
           WHEN relation.user_a_id = auth.uid() THEN relation.user_b_id
           ELSE relation.user_a_id
         END
   WHERE auth.uid() IS NOT NULL
     AND relation.state = 'blocked'
     AND relation.blocked_by = auth.uid()
   ORDER BY relation.updated_at DESC, relation.id
$$;

REVOKE ALL ON FUNCTION public.block_friend(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_my_blocked_accounts() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.block_friend(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_blocked_accounts() TO authenticated;
