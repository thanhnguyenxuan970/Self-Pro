-- Delete activity twins by their durable identity. This is the stable-key
-- counterpart to migration 072's legacy local-id RPC.
CREATE OR REPLACE FUNCTION public.delete_my_activity_keys(p_activity_keys text[])
RETURNS TABLE (activity_key text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  caller_id uuid := auth.uid();
  caller_email text;
  requested_keys text[];
BEGIN
  caller_email := public.canonical_auth_email(caller_id);
  IF caller_id IS NULL
     OR caller_email IS NULL THEN
    RAISE EXCEPTION 'Authenticated user with a valid email required'
      USING ERRCODE = '28000';
  END IF;

  IF public.account_write_allowed() IS NOT TRUE THEN
    RAISE EXCEPTION 'Account writes are blocked';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT btrim(requested.activity_key) ORDER BY btrim(requested.activity_key)), ARRAY[]::text[])
    INTO requested_keys
   FROM unnest(COALESCE(p_activity_keys, ARRAY[]::text[])) AS requested(activity_key)
   WHERE btrim(requested.activity_key) <> ''
     AND length(btrim(requested.activity_key)) <= 128
     AND btrim(requested.activity_key) NOT LIKE 'legacy:%';

  IF cardinality(requested_keys) = 0 THEN
    RETURN;
  END IF;

  DELETE FROM public.activity_log AS activity
   USING unnest(requested_keys) AS requested(activity_key)
   WHERE lower(btrim(activity.user_email)) = caller_email
     AND activity.activity_key = requested.activity_key;

  -- Already-absent rows are successful acknowledgements, which makes retry
  -- idempotent while RLS/account fencing keeps the operation account-scoped.
  RETURN QUERY
  SELECT requested.activity_key
    FROM unnest(requested_keys) AS requested(activity_key)
   WHERE NOT EXISTS (
     SELECT 1
       FROM public.activity_log AS remaining
      WHERE lower(btrim(remaining.user_email)) = caller_email
        AND remaining.activity_key = requested.activity_key
   )
   ORDER BY requested.activity_key;
END;
$function$;

REVOKE ALL ON FUNCTION public.delete_my_activity_keys(text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_my_activity_keys(text[]) TO authenticated;
