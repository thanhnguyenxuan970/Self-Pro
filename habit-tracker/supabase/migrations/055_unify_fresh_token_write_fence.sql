-- Keep every SECURITY DEFINER writer on the same deletion-fence predicate.
-- A token issued after deletion is an intentional re-provisioning signal; an
-- older token must remain blocked so an offline install cannot resurrect data.

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

  -- Keep the tombstone permanently. A fresh token is allowed because it is
  -- newer than the marker, while an older token remains denied forever.
  -- Deleting the marker here would let a stale token write after the fresh
  -- session had reprovisioned the account.
  RETURN NOT EXISTS (
    SELECT 1
      FROM public.account_deletion_markers
     WHERE auth_user_id = caller_id
       AND deleted_at >= issued_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_account_write_allowed()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_id uuid := auth.uid();
  raw_iat text;
  issued_at timestamptz;
BEGIN
  IF caller_id IS NULL OR auth.email() IS NULL THEN
    RAISE EXCEPTION 'Authenticated user required';
  END IF;
  PERFORM 1 FROM auth.users WHERE id = caller_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Authenticated user required';
  END IF;
  raw_iat := NULLIF(auth.jwt()->>'iat', '');
  IF raw_iat IS NULL THEN
    RAISE EXCEPTION 'Authenticated token issue time required';
  END IF;
  BEGIN
    issued_at := to_timestamp(raw_iat::double precision);
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'Authenticated token issue time required';
  END;
  IF issued_at IS NULL THEN
    RAISE EXCEPTION 'Authenticated token issue time required';
  END IF;

  -- Delegate the actual marker transition to the final predicate used by
  -- legacy RLS writes. This prevents snapshot/profile/reset RPCs from drifting
  -- into a stricter stale implementation after account deletion.
  IF NOT public.account_write_allowed() THEN
    RAISE EXCEPTION 'Account was deleted; sign in again';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.account_write_allowed() FROM PUBLIC, anon, authenticated;
