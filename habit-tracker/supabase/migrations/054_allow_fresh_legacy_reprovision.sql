-- A freshly issued Google JWT may intentionally re-provision an account after
-- deletion. Keep the legacy RLS predicate behavior identical to the v2 RPC
-- fence by clearing only tombstones older than that token.

CREATE OR REPLACE FUNCTION public.account_write_allowed()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_id uuid := auth.uid();
  issued_at timestamptz;
  raw_iat text;
BEGIN
  IF caller_id IS NULL OR auth.email() IS NULL THEN RETURN false; END IF;
  raw_iat := NULLIF(auth.jwt()->>'iat', '');
  IF raw_iat IS NULL THEN RETURN false; END IF;
  BEGIN
    issued_at := to_timestamp(raw_iat::double precision);
  EXCEPTION WHEN others THEN
    RETURN false;
  END;
  IF issued_at IS NULL THEN RETURN false; END IF;
  PERFORM 1 FROM auth.users WHERE id = caller_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  DELETE FROM public.account_deletion_markers
   WHERE auth_user_id = caller_id
     AND issued_at > deleted_at;
  RETURN NOT EXISTS (
    SELECT 1 FROM public.account_deletion_markers
     WHERE auth_user_id = caller_id AND deleted_at >= issued_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.account_write_allowed() FROM PUBLIC, anon, authenticated;
