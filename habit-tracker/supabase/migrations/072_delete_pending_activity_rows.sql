-- Retained only as a migration placeholder for databases that already know
-- this legacy local-id RPC. It is revoked immediately; old clients must not
-- be able to delete by local_id after the identity cutover.
CREATE OR REPLACE FUNCTION public.delete_my_activity_rows(p_local_ids bigint[])
RETURNS TABLE (local_id bigint)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  caller_id uuid := auth.uid();
  caller_email text := lower(btrim(COALESCE(auth.jwt() ->> 'email', '')));
  requested_ids bigint[];
BEGIN
  IF caller_id IS NULL
     OR caller_email = ''
     OR caller_email !~ '^[^[:space:]@]+@[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'Authenticated user with a valid email required'
      USING ERRCODE = '28000';
  END IF;

  IF public.account_write_allowed() IS NOT TRUE THEN
    RAISE EXCEPTION 'Account writes are blocked';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT requested.local_id ORDER BY requested.local_id), ARRAY[]::bigint[])
    INTO requested_ids
    FROM unnest(COALESCE(p_local_ids, ARRAY[]::bigint[])) AS requested(local_id)
   WHERE requested.local_id > 0;

  IF cardinality(requested_ids) = 0 THEN
    RETURN;
  END IF;

  DELETE FROM public.activity_log AS activity
   USING unnest(requested_ids) AS requested(local_id)
   WHERE lower(btrim(activity.user_email)) = caller_email
     AND activity.local_id = requested.local_id;

  -- A previous attempt may already have deleted a row. Confirm every requested
  -- ID that is absent for this normalized account; same-ID rows belonging to a
  -- different account are neither selected nor deleted.
  RETURN QUERY
  SELECT requested.local_id
    FROM unnest(requested_ids) AS requested(local_id)
   WHERE NOT EXISTS (
     SELECT 1
       FROM public.activity_log AS remaining
      WHERE lower(btrim(remaining.user_email)) = caller_email
        AND remaining.local_id = requested.local_id
   )
   ORDER BY requested.local_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.delete_my_activity_rows(bigint[]) FROM PUBLIC, anon, authenticated;
