-- Habi / Self-Pro Supabase diagnostics
--
-- Read-only checks for the Supabase SQL Editor or an authenticated psql
-- session. Run one statement at a time and use a fresh time window when
-- checking whether an old log error is still occurring. Never paste tokens,
-- passwords, or raw log exports into this file.

-- 1) Inspect the live columns before writing a diagnostic query.
SELECT
  table_schema,
  table_name,
  column_name,
  data_type,
  udt_name
FROM information_schema.columns
WHERE (table_schema, table_name) IN (
  ('auth', 'audit_log_entries'),
  ('public', 'users'),
  ('public', 'activity_log'),
  ('public', 'fund_transactions')
)
ORDER BY table_schema, table_name, ordinal_position;

-- 2) RLS status. pg_class uses relrowsecurity/relforcerowsecurity;
--    row_security is not a pg_class column.
SELECT
  n.nspname AS schema_name,
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS force_rls
FROM pg_catalog.pg_class AS c
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind IN ('r', 'p')
  AND c.relname IN ('users', 'activity_log', 'fund_transactions')
ORDER BY c.relname;

-- 3) RLS policy definitions. pg_policies exposes qual/with_check;
--    policydef is not a pg_policies column.
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_catalog.pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('users', 'activity_log', 'fund_transactions')
ORDER BY tablename, policyname;

-- 4) Index definitions. pg_indexes exposes indexname/indexdef;
--    indexrelname belongs to pg_stat_user_indexes, not pg_index.
SELECT
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_catalog.pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('users', 'activity_log', 'fund_transactions')
ORDER BY tablename, indexname;

-- 5) Optional index usage statistics. Use this view when indexrelname is
--    required, rather than aliasing pg_index as if it had that column.
SELECT
  schemaname,
  relname AS table_name,
  indexrelname AS index_name,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch
FROM pg_catalog.pg_stat_user_indexes
WHERE schemaname = 'public'
  AND relname IN ('users', 'activity_log', 'fund_transactions')
ORDER BY relname, indexrelname;

-- 6) Function signatures. There is no stored signature column: derive it
--    from the function OID and identity arguments.
SELECT
  n.nspname AS schema_name,
  p.proname AS routine_name,
  format(
    '%I.%I(%s)',
    n.nspname,
    p.proname,
    pg_get_function_identity_arguments(p.oid)
  ) AS signature,
  p.prokind,
  p.prosecdef AS security_definer
FROM pg_catalog.pg_proc AS p
JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
ORDER BY p.proname, signature;

-- 7) Definitions for normal SQL/PL functions only. pg_get_functiondef
--    must not be called on aggregates such as array_agg (prokind = 'a').
SELECT
  n.nspname AS schema_name,
  p.proname AS routine_name,
  pg_get_function_identity_arguments(p.oid) AS identity_arguments,
  pg_get_functiondef(p.oid) AS definition
FROM pg_catalog.pg_proc AS p
JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prokind = 'f'
ORDER BY p.proname, identity_arguments;

-- 8) If an aggregate must be inspected, list it without requesting a
--    function definition. pg_proc marks aggregates with prokind = 'a'.
SELECT
  n.nspname AS schema_name,
  p.proname AS aggregate_name,
  pg_get_function_identity_arguments(p.oid) AS identity_arguments,
  p.prokind
FROM pg_catalog.pg_proc AS p
JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
WHERE p.prokind = 'a'
  AND p.proname = 'array_agg';

-- 9) Supabase Auth audit logs. payload is json in the live schema, so cast
--    before using JSONB operators; action/provider are payload keys.
SELECT
  created_at,
  payload::jsonb ->> 'action' AS action,
  payload::jsonb ->> 'provider' AS provider,
  payload::jsonb ->> 'log_type' AS log_type
FROM auth.audit_log_entries
WHERE created_at >= now() - interval '24 hours'
ORDER BY created_at DESC;

-- 10) Account-scoped public.users read for a JWT-backed request. The live
--     ownership column is user_email, not email. auth.email() avoids pasting
--     an unescaped email into SQL. In the SQL Editor it normally returns NULL
--     because there is no request JWT; use the catalog checks above there.
SELECT
  user_email,
  activity_start_date,
  lifetime_stars,
  lifetime_stars_adjustment
FROM public.users
WHERE lower(btrim(user_email)) = lower(btrim(auth.email()));

-- Operational interpretation of the attached errors:
-- * 42703 on users.email: use public.users.user_email; the logged query used
--   a column that does not exist in the live schema.
-- * 401/42501 on REST public.users with auth_user = null: this is the expected
--   RLS boundary for an anonymous request. Use a real user's access token for
--   account-scoped reads; the JWT also needs the table's SELECT grant/policy.
--   Do not grant anon access to public.users. If auth_user is present but the
--   request is still 42501, inspect table privileges/RLS instead of changing
--   the query's column name.
-- * PGRST301 / HTTP 401: the cached Supabase JWT is invalid or expired. The
--   app may re-authenticate once for read-only Friends RPCs; it is not a
--   missing-RPC/schema-cache error.
-- * P0001 "Backup revision conflict": before migration 068, another writer
--   advancing the snapshot surfaced as this expected database error. The
--   current v2 function returns a non-error sentinel so the app can reconcile
--   without a P0001; a remaining P0001 usually indicates an older deployed
--   function/client or the legacy void wrapper. Preserve both copies and
--   require explicit, validated reconciliation; never force-overwrite cloud
--   data or delete local SQLite data.
-- * 28P01 (cli_login_postgres): refresh/re-authenticate the Supabase
--   CLI/database credential; no app SQL can repair a rejected password.
-- * 08006 (connection reset by peer): retry from a healthy connection and
--   check the client/network; it is not evidence of a data mutation failure.
-- * users_email_partial_key / /auth/v1/token 500: the shipped app has a
--   process-wide session lease plus one bounded retry. Verify a fresh export
--   with the current AAB before treating an old first-attempt line as a new
--   regression; multi-client races can still leave an initial server log.
