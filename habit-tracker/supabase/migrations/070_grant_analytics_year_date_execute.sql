-- The annual helper is used by an expression index on activity_log.
-- PostgreSQL evaluates that expression under the request role while an
-- authenticated client inserts or updates an activity row, so the helper
-- must be executable by authenticated while remaining closed to public/anon.
REVOKE EXECUTE ON FUNCTION public.analytics_year_date(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.analytics_year_date(text) TO authenticated;
