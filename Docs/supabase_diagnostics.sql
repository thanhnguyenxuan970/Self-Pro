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

-- Operational interpretation of the attached errors:
-- * 28P01 (cli_login_postgres): refresh/re-authenticate the Supabase
--   CLI/database credential; no app SQL can repair a rejected password.
-- * 08006 (connection reset by peer): retry from a healthy connection and
--   check the client/network; it is not evidence of a data mutation failure.
-- * users_email_partial_key / /auth/v1/token 500: the shipped app has a
--   process-wide session lease plus one bounded retry. Verify a fresh export
--   with the current AAB before treating an old first-attempt line as a new
--   regression; multi-client races can still leave an initial server log.
