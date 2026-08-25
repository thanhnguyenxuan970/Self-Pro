-- RLS write policies call this SECURITY DEFINER predicate as the
-- authenticated request role. Keep direct anonymous/public execution closed,
-- but restore the EXECUTE privilege required during policy evaluation.
REVOKE EXECUTE ON FUNCTION public.account_write_allowed() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.account_write_allowed() TO authenticated;
