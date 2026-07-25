-- Fix Security Advisor warnings:
--   "Public Can Execute SECURITY DEFINER Function" / "Signed-In Users Can Execute SECURITY DEFINER Function"
-- public.log_auth_signin() is a SECURITY DEFINER trigger function fired by
-- on_auth_user_signin (AFTER INSERT/UPDATE on auth.users). Trigger execution
-- does not require the invoking role to hold EXECUTE on the function, so the
-- default PUBLIC grant Postgres adds on CREATE FUNCTION is unnecessary and
-- lets any anon/authenticated caller invoke it directly via RPC.
REVOKE EXECUTE ON FUNCTION public.log_auth_signin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_auth_signin() FROM anon;
REVOKE EXECUTE ON FUNCTION public.log_auth_signin() FROM authenticated;
