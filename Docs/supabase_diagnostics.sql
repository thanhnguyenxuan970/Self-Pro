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

-- 11) Backup/relation existence. Use to_regclass so an optional relation can
--     be checked without failing the diagnostic session. Do not SELECT from
--     user_data_backup_history unless this query returns its relation name.
SELECT
  x.relation_name,
  to_regclass(x.relation_name) AS live_relation
FROM (VALUES
  ('public.user_data_backups'::text),
  ('public.user_data_backup_history'::text),
  ('public.task_types'::text),
  ('public.categories'::text)
) AS x(relation_name)
ORDER BY x.relation_name;

-- 12) Live backup metadata and JSON shape. payload_bytes is derived from the
--     JSONB text representation; it is not assumed to be a stored column.
--     The payload is intentionally not selected in full.
SELECT
  b.auth_user_id,
  b.schema_version,
  b.revision,
  b.updated_at,
  jsonb_typeof(b.payload) AS payload_type,
  octet_length(b.payload::text) AS payload_bytes,
  CASE
    WHEN jsonb_typeof(b.payload) = 'object' THEN ARRAY(
      SELECT key
      FROM jsonb_object_keys(b.payload) AS key
      ORDER BY key
    )
    ELSE ARRAY[]::text[]
  END AS top_level_keys,
  CASE
    WHEN jsonb_typeof(b.payload->'categories') = 'array'
    THEN jsonb_array_length(b.payload->'categories')
    ELSE 0
  END AS categories,
  CASE
    WHEN jsonb_typeof(b.payload->'task_types') = 'array'
    THEN jsonb_array_length(b.payload->'task_types')
    ELSE 0
  END AS task_types,
  CASE
    WHEN jsonb_typeof(b.payload->'activity_log') = 'array'
    THEN jsonb_array_length(b.payload->'activity_log')
    ELSE 0
  END AS activity_log
FROM public.user_data_backups AS b
ORDER BY b.updated_at DESC;

-- 13) Backup-only categories/task types. These are JSON arrays inside
--     user_data_backups.payload, not public relations in the live schema.
--     Missing keys, JSON null, scalar values, and non-object elements are
--     counted safely instead of being passed to array/object functions.
WITH backup AS (
  SELECT auth_user_id, payload
  FROM public.user_data_backups
), category_items AS (
  SELECT
    auth_user_id,
    e.item,
    'categories'::text AS dataset
  FROM backup
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(payload->'categories') = 'array'
      THEN payload->'categories'
      ELSE '[]'::jsonb
    END
  ) AS e(item)
), task_type_items AS (
  SELECT
    auth_user_id,
    e.item,
    'task_types'::text AS dataset
  FROM backup
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(payload->'task_types') = 'array'
      THEN payload->'task_types'
      ELSE '[]'::jsonb
    END
  ) AS e(item)
), items AS (
  SELECT * FROM category_items
  UNION ALL
  SELECT * FROM task_type_items
)
SELECT
  auth_user_id,
  dataset,
  count(*) AS rows,
  count(*) FILTER (WHERE jsonb_typeof(item) = 'object') AS object_rows,
  count(*) FILTER (
    WHERE jsonb_typeof(item) = 'object'
      AND jsonb_typeof(item->'id') = 'number'
  ) AS numeric_id_rows
FROM items
GROUP BY auth_user_id, dataset
ORDER BY auth_user_id, dataset;

-- 14) Compare one account's cloud activity with its backup snapshot.
--     The record identity is activity_log.local_id on cloud and the
--     snapshot activity_log.id, both represented as text. Both sides use
--     the same account, source <> LOGIN filter, valid-date rule, cutoff,
--     and (record_id, source, kind, local_date) comparison key.
--     Date validation is arithmetic: regex alone does not admit 2026-02-30.
--     This is a key-only comparison. It does not compare points_earned,
--     stars_delta, duration_min, or other activity payload fields.
--     Leave both manual_* values NULL for a JWT-backed request. In the SQL
--     Editor, replace both with the audited UUID/email pair; the pair is
--     checked against auth.users before any comparison count is returned.
--     This statement must run under a role that can read auth.users and
--     public.user_data_backups (typically postgres, service_role, or an
--     explicitly provisioned diagnostic role); a normal JWT/authenticated
--     request generally does not have both table privileges.
WITH params AS (
  SELECT
    NULL::text AS manual_auth_user_id_text,
    NULL::text AS manual_user_email,
    auth.uid()::text AS jwt_auth_user_id_text,
    NULLIF(lower(btrim(auth.email())), '') AS jwt_user_email,
    DATE '2026-09-02' AS cutoff_date
), input_params AS (
  SELECT
    cutoff_date,
    NULLIF(btrim(manual_auth_user_id_text), '') AS manual_id_text,
    NULLIF(lower(btrim(manual_user_email)), '') AS manual_email,
    jwt_auth_user_id_text,
    jwt_user_email
  FROM params
), account_input AS (
  SELECT
    cutoff_date,
    CASE
      WHEN manual_id_text IS NULL AND manual_email IS NULL
      THEN jwt_auth_user_id_text
      WHEN manual_id_text IS NOT NULL AND manual_email IS NOT NULL
      THEN manual_id_text
      ELSE NULL
    END AS requested_id_text,
    CASE
      WHEN manual_id_text IS NULL AND manual_email IS NULL
      THEN jwt_user_email
      WHEN manual_id_text IS NOT NULL AND manual_email IS NOT NULL
      THEN manual_email
      ELSE NULL
    END AS requested_email,
    (manual_id_text IS NOT NULL) IS DISTINCT FROM (manual_email IS NOT NULL)
      AS manual_pair_partial
  FROM input_params
), account_candidate AS (
  SELECT
    cutoff_date,
    requested_email,
    manual_pair_partial,
    CASE
      WHEN requested_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN requested_id_text::uuid
      ELSE NULL::uuid
    END AS requested_auth_user_id
  FROM account_input
), account_validation AS (
  SELECT
    c.cutoff_date,
    c.requested_auth_user_id,
    c.requested_email,
    c.manual_pair_partial,
    u.id AS matched_auth_user_id,
    NULLIF(lower(btrim(u.email)), '') AS canonical_auth_email,
    CASE
      WHEN c.manual_pair_partial
        OR c.requested_auth_user_id IS NULL
        OR c.requested_email IS NULL
        OR u.id IS NULL
        OR NULLIF(lower(btrim(u.email)), '') IS DISTINCT FROM c.requested_email
      THEN 'invalid_account_params'::text
      ELSE 'account_valid'::text
    END AS account_status
  FROM account_candidate AS c
  LEFT JOIN auth.users AS u ON u.id = c.requested_auth_user_id
), backup_shape AS (
  SELECT
    a.*,
    (b.auth_user_id IS NOT NULL) AS backup_exists_raw,
    jsonb_typeof(b.payload) AS payload_type,
    CASE
      WHEN b.auth_user_id IS NULL THEN NULL::text
      WHEN b.payload IS NULL THEN 'payload_sql_null'::text
      WHEN jsonb_typeof(b.payload) <> 'object' THEN 'payload_' || jsonb_typeof(b.payload)
      WHEN NOT (b.payload ? 'activity_log') THEN 'missing'::text
      ELSE COALESCE(jsonb_typeof(b.payload->'activity_log'), 'sql_null')
    END AS activity_log_type,
    CASE
      WHEN jsonb_typeof(b.payload->'activity_log') = 'array'
      THEN jsonb_array_length(b.payload->'activity_log')
      ELSE NULL::integer
    END AS activity_log_length,
    CASE
      WHEN jsonb_typeof(b.payload->'activity_log') = 'array'
      THEN (
        SELECT count(*)
        FROM jsonb_array_elements(b.payload->'activity_log') AS e(item)
        WHERE jsonb_typeof(e.item) IS DISTINCT FROM 'object'
           OR jsonb_typeof(e.item->'id') IS DISTINCT FROM 'number'
           OR jsonb_typeof(e.item->'source') IS DISTINCT FROM 'string'
           OR jsonb_typeof(e.item->'kind') IS DISTINCT FROM 'string'
           OR jsonb_typeof(e.item->'local_date') IS DISTINCT FROM 'string'
           OR NULLIF(e.item->>'id', '') IS NULL
           OR NULLIF(e.item->>'source', '') IS NULL
           OR NULLIF(e.item->>'kind', '') IS NULL
           OR NULLIF(e.item->>'local_date', '') IS NULL
      )
      ELSE NULL::bigint
    END AS invalid_item_count
  FROM account_validation AS a
  LEFT JOIN public.user_data_backups AS b
    ON b.auth_user_id = a.requested_auth_user_id
), cloud_raw AS (
  SELECT
    'cloud'::text AS dataset,
    a.local_id::text AS record_id,
    a.source,
    a.kind,
    a.local_date AS local_date_text
  FROM public.activity_log AS a
  CROSS JOIN backup_shape AS b
  WHERE b.account_status = 'account_valid'
    AND lower(btrim(a.user_email)) = b.requested_email
    AND a.source <> 'LOGIN'
), snapshot_raw AS (
  SELECT
    'snapshot'::text AS dataset,
    e.item->>'id' AS record_id,
    e.item->>'source' AS source,
    e.item->>'kind' AS kind,
    e.item->>'local_date' AS local_date_text
  FROM public.user_data_backups AS b
  CROSS JOIN backup_shape AS s
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN s.activity_log_type = 'array'
      THEN b.payload->'activity_log'
      ELSE '[]'::jsonb
    END
  ) AS e(item)
  WHERE s.account_status = 'account_valid'
    AND s.backup_exists_raw
    AND s.activity_log_type = 'array'
    AND s.invalid_item_count = 0
    AND b.auth_user_id = s.requested_auth_user_id
    AND jsonb_typeof(e.item) = 'object'
    AND e.item->>'source' <> 'LOGIN'
), raw_rows AS (
  SELECT * FROM cloud_raw
  UNION ALL
  SELECT * FROM snapshot_raw
), date_parts AS (
  SELECT
    raw_rows.*,
    regexp_match(
      local_date_text,
      '^([0-9]{4})-([0-9]{2})-([0-9]{2})$'
    ) AS parts
  FROM raw_rows
), parsed_rows AS (
  SELECT
    dataset,
    record_id,
    source,
    kind,
    local_date_text,
    CASE WHEN parts IS NOT NULL THEN parts[1]::integer END AS year_number,
    CASE WHEN parts IS NOT NULL THEN parts[2]::integer END AS month_number,
    CASE WHEN parts IS NOT NULL THEN parts[3]::integer END AS day_number
  FROM date_parts
), normalized_rows AS (
  SELECT
    dataset,
    record_id,
    source,
    kind,
    CASE
      WHEN year_number BETWEEN 1 AND 9999
       AND month_number BETWEEN 1 AND 12
       AND day_number BETWEEN 1 AND CASE
         WHEN month_number IN (1, 3, 5, 7, 8, 10, 12) THEN 31
         WHEN month_number IN (4, 6, 9, 11) THEN 30
         WHEN (year_number % 400 = 0)
           OR (year_number % 4 = 0 AND year_number % 100 <> 0)
           THEN 29
         ELSE 28
       END
      THEN make_date(year_number, month_number, day_number)
      ELSE NULL::date
    END AS local_date
  FROM parsed_rows
), cloud_rows AS (
  SELECT record_id, source, kind, local_date
  FROM normalized_rows
  WHERE dataset = 'cloud'
), snapshot_rows AS (
  SELECT record_id, source, kind, local_date
  FROM normalized_rows
  WHERE dataset = 'snapshot'
), cloud_key_counts AS (
  SELECT record_id, source, kind, local_date, count(*) AS row_count
  FROM cloud_rows
  WHERE record_id IS NOT NULL
    AND record_id <> ''
    AND local_date IS NOT NULL
    AND local_date <= (SELECT cutoff_date FROM backup_shape)
  GROUP BY record_id, source, kind, local_date
), snapshot_key_counts AS (
  SELECT record_id, source, kind, local_date, count(*) AS row_count
  FROM snapshot_rows
  WHERE record_id IS NOT NULL
    AND record_id <> ''
    AND local_date IS NOT NULL
    AND local_date <= (SELECT cutoff_date FROM backup_shape)
  GROUP BY record_id, source, kind, local_date
), cloud_keys AS (
  SELECT record_id, source, kind, local_date
  FROM cloud_key_counts
), snapshot_keys AS (
  SELECT record_id, source, kind, local_date
  FROM snapshot_key_counts
), matched AS (
  SELECT
    c.record_id AS cloud_record_id,
    s.record_id AS snapshot_record_id
  FROM cloud_keys AS c
  FULL OUTER JOIN snapshot_keys AS s
    ON s.record_id = c.record_id
   AND s.source IS NOT DISTINCT FROM c.source
   AND s.kind IS NOT DISTINCT FROM c.kind
   AND s.local_date IS NOT DISTINCT FROM c.local_date
), comparison_counts AS (
  SELECT
    (SELECT count(*) FROM cloud_rows) AS cloud_rows_in_account,
    (SELECT count(*) FROM snapshot_rows) AS snapshot_rows_in_account,
    (SELECT count(*) FROM cloud_rows
     WHERE local_date IS NOT NULL
       AND local_date <= (SELECT cutoff_date FROM backup_shape))
      AS cloud_rows_through_cutoff,
    (SELECT count(*) FROM snapshot_rows
     WHERE local_date IS NOT NULL
       AND local_date <= (SELECT cutoff_date FROM backup_shape))
      AS snapshot_rows_through_cutoff,
    (SELECT count(*) FROM cloud_rows WHERE local_date IS NULL)
      AS cloud_invalid_or_blank_dates,
    (SELECT count(*) FROM snapshot_rows WHERE local_date IS NULL)
      AS snapshot_invalid_or_blank_dates,
    (SELECT count(*) FROM cloud_keys) AS cloud_unique_keys_through_cutoff,
    (SELECT count(*) FROM snapshot_keys) AS snapshot_unique_keys_through_cutoff,
    count(*) FILTER (WHERE cloud_record_id IS NOT NULL
                          AND snapshot_record_id IS NULL) AS cloud_only_keys,
    count(*) FILTER (WHERE cloud_record_id IS NULL
                          AND snapshot_record_id IS NOT NULL) AS snapshot_only_keys,
    count(*) FILTER (WHERE cloud_record_id IS NOT NULL
                          AND snapshot_record_id IS NOT NULL) AS matched_keys
  FROM matched
), duplicate_counts AS (
  SELECT
    (SELECT count(*) FILTER (WHERE row_count > 1) FROM cloud_key_counts)
      AS cloud_duplicate_key_groups,
    COALESCE((SELECT sum(row_count - 1)
              FROM cloud_key_counts
              WHERE row_count > 1), 0)::bigint AS cloud_duplicate_extra_rows,
    (SELECT count(*) FILTER (WHERE row_count > 1) FROM snapshot_key_counts)
      AS snapshot_duplicate_key_groups,
    COALESCE((SELECT sum(row_count - 1)
              FROM snapshot_key_counts
              WHERE row_count > 1), 0)::bigint AS snapshot_duplicate_extra_rows
), comparison_state AS (
  SELECT
    b.*,
    CASE
      WHEN b.account_status <> 'account_valid' THEN 'invalid_account_params'
      WHEN NOT b.backup_exists_raw THEN 'backup_missing'
      WHEN b.payload_type IS NULL THEN 'payload_sql_null'
      WHEN b.payload_type <> 'object' THEN 'payload_wrong_type'
      WHEN b.activity_log_type = 'missing' THEN 'activity_log_missing'
      WHEN b.activity_log_type = 'null' THEN 'activity_log_json_null'
      WHEN b.activity_log_type <> 'array' THEN 'activity_log_wrong_type'
      WHEN b.invalid_item_count > 0 THEN 'activity_log_invalid_items'
      WHEN b.activity_log_length = 0 THEN 'valid_empty_array'
      ELSE 'comparison_ready'
    END AS comparison_status
  FROM backup_shape AS b
)
SELECT
  s.account_status,
  s.comparison_status,
  CASE WHEN s.account_status = 'account_valid'
       THEN s.backup_exists_raw END AS backup_exists,
  CASE WHEN s.account_status = 'account_valid'
       THEN s.activity_log_type END AS activity_log_type,
  CASE WHEN s.account_status = 'account_valid'
       THEN s.invalid_item_count END AS invalid_item_count,
  CASE WHEN s.account_status = 'account_valid'
       THEN s.activity_log_length END AS activity_log_length,
  'key only: record_id, source, kind, local_date; payload content not compared'
    AS match_basis,
  CASE WHEN s.comparison_status IN ('comparison_ready', 'valid_empty_array')
       THEN c.cloud_rows_in_account END AS cloud_rows_in_account,
  CASE WHEN s.comparison_status IN ('comparison_ready', 'valid_empty_array')
       THEN c.snapshot_rows_in_account END AS snapshot_rows_in_account,
  CASE WHEN s.comparison_status IN ('comparison_ready', 'valid_empty_array')
       THEN c.cloud_rows_through_cutoff END AS cloud_rows_through_cutoff,
  CASE WHEN s.comparison_status IN ('comparison_ready', 'valid_empty_array')
       THEN c.snapshot_rows_through_cutoff END AS snapshot_rows_through_cutoff,
  CASE WHEN s.comparison_status IN ('comparison_ready', 'valid_empty_array')
       THEN c.cloud_invalid_or_blank_dates END AS cloud_invalid_or_blank_dates,
  CASE WHEN s.comparison_status IN ('comparison_ready', 'valid_empty_array')
       THEN c.snapshot_invalid_or_blank_dates END AS snapshot_invalid_or_blank_dates,
  CASE WHEN s.comparison_status IN ('comparison_ready', 'valid_empty_array')
       THEN c.cloud_unique_keys_through_cutoff END AS cloud_unique_keys_through_cutoff,
  CASE WHEN s.comparison_status IN ('comparison_ready', 'valid_empty_array')
       THEN c.snapshot_unique_keys_through_cutoff END AS snapshot_unique_keys_through_cutoff,
  CASE WHEN s.comparison_status IN ('comparison_ready', 'valid_empty_array')
       THEN d.cloud_duplicate_key_groups END AS cloud_duplicate_key_groups,
  CASE WHEN s.comparison_status IN ('comparison_ready', 'valid_empty_array')
       THEN d.cloud_duplicate_extra_rows END AS cloud_duplicate_extra_rows,
  CASE WHEN s.comparison_status IN ('comparison_ready', 'valid_empty_array')
       THEN d.snapshot_duplicate_key_groups END AS snapshot_duplicate_key_groups,
  CASE WHEN s.comparison_status IN ('comparison_ready', 'valid_empty_array')
       THEN d.snapshot_duplicate_extra_rows END AS snapshot_duplicate_extra_rows,
  CASE WHEN s.comparison_status IN ('comparison_ready', 'valid_empty_array')
       THEN c.cloud_only_keys END AS cloud_only_keys,
  CASE WHEN s.comparison_status IN ('comparison_ready', 'valid_empty_array')
       THEN c.snapshot_only_keys END AS snapshot_only_keys,
  CASE WHEN s.comparison_status IN ('comparison_ready', 'valid_empty_array')
       THEN c.matched_keys END AS matched_keys
FROM comparison_state AS s
CROSS JOIN comparison_counts AS c
CROSS JOIN duplicate_counts AS d;

-- 15) Effective table privileges for the roles that may be involved. The
--     backup table is intentionally protected; application access should go
--     through its SECURITY DEFINER RPCs rather than direct table reads.
SELECT
  r.rolname,
  has_table_privilege(r.rolname, 'public.user_data_backups', 'SELECT') AS can_select_table,
  has_table_privilege(r.rolname, 'public.user_data_backups', 'INSERT') AS can_insert_table,
  has_table_privilege(r.rolname, 'public.user_data_backups', 'UPDATE') AS can_update_table,
  has_table_privilege(r.rolname, 'public.user_data_backups', 'DELETE') AS can_delete_table
FROM pg_catalog.pg_roles AS r
WHERE r.rolname IN ('anon', 'authenticated', 'service_role', 'postgres')
ORDER BY r.rolname;

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
