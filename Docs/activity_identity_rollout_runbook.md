# Activity identity cutover runbook

This runbook is intentionally fail-closed. Production remains on migration 071
until the independent export, provenance review, and staging evidence are
complete.

## Preconditions

- Preserve every existing export/report. Do not restore revision 88 or import
  the rejected 326-row set.
- Take an independent export of `activity_log`, the latest backup, relevant
  schema/function definitions, migration metadata, and all post-cutover writes.
  Verify the export by restoring it into an isolated clone and comparing row
  counts, hashes, and key activity fields.
- Inventory legacy rows with no confirmed durable key. Keep their local data;
  mark them unresolved/quarantined. `local_id`, equal fingerprints, and equal
  dates are investigation clues only, not automatic mappings.

## Migration order

1. Review and test the local fail-closed client changes. New activities create
   one opaque key and reuse it for retries, backups, and restores.
2. Apply 073 only in staging. It adds nullable `activity_key`, refuses duplicate
   non-null identities, and removes the local-id uniqueness constraint. It does
   not backfill `legacy:<local_id>` and does not make the column NOT NULL while
   unresolved rows remain.
3. Apply the cleaned 074 backup-history migration and verify reset/delete retain
   or remove snapshot history according to the operation.
4. Apply 075 and verify delete acknowledgements are keyed only by
   `activity_key`.
5. Apply 076 in staging. It revokes direct activity INSERT/UPDATE/DELETE,
   retires `delete_my_activity_rows(bigint[])`, and exposes only the
   JWT-scoped, insert-only `append_my_activity_rows(jsonb)` RPC. Same-key,
   same-content retries are idempotent; same-key content changes fail.

Do not apply this sequence to production until all staging checks pass. The
server gate is required because stopping old clients in the release is not a
server-side guarantee.

## Required staging matrix

Run with two clients authenticated to one account:

| Scenario | Required result |
|---|---|
| Same `local_id`, different activities/keys | Both rows survive; neither overwrites the other |
| Retry after timeout or lost response | Same key is acknowledged once; no duplicate |
| Same key, divergent content | RPC rejects; cursor remains unchanged and an actionable conflict is logged |
| Delete, timeout, retry | Keyed delete is idempotent; outbox clears only after acknowledgement |
| Restore, then sync | Existing key/content is idempotent; divergent content blocks before destructive restore work |
| Legacy row without key | Row remains local with `unresolved` status; no upload/delete fallback; pending state survives process restart |
| Missing activity column/RPC | Activity upload/delete, cursor, and outbox remain pending |
| Old client after cutover | Direct REST write and local-id delete RPC are rejected by the server |

The legacy mirror reader pages by the cloud `activity_log.id`, never by
`local_id`. During SQLite hydration it allocates fresh local primary keys;
source `local_id` is metadata only. A valid key from the cloud mirror is
accepted under its explicit mirror policy, while missing/legacy keys remain
`unresolved`. A cloud `task_type_id` is stored as
`activity_source_task_type_id`; local `task_type_id` remains detached, while
sync sends the source value for immutable-content comparison.

Restore replacement deletes are not user delete intent. Local migration 34
adds an account-scoped restore-suppression table to the SQLite delete trigger.
Before replacement, the restore transaction blocks if any snapshot durable key
already has a pending user delete. After that explicit reconciliation, the
transaction enables suppression and removes the marker before commit; it never
clears pre-existing pending deletes by key alone. Unresolved and unrelated
pending entries are preserved.

Before applying the SQL sequence, run the local SQLite migration through
version 35 on a database copy and execute the real-trigger restore test. The
PostgreSQL migration 073 must remove both the historical UNIQUE constraint and
an independent index if either form exists.

Also check task/category references independently. A matching activity key or
fingerprint does not prove that the referenced task/category belongs to the
same source account.

## Rollout

- Keep production at 071 during staging.
- After staging sign-off, take and verify the pre-cutover export, then apply
  073→076 in order with migration logs captured.
- Confirm direct REST DML is denied for `authenticated`, the old local-id RPC
  is not executable, and the new append/delete RPCs are executable only for
  `authenticated` and only for the JWT account.
- Release the client only after the server gate is active. Monitor RPC errors,
  unresolved counts, cursor age, outbox depth, and same-key conflict counts.

## Rollback

This project has no PITR. Rollback means restoring the verified independent
pre-cutover export into an isolated clone first, then executing the approved
restore procedure. It is not an inverse migration and must not be done by
dropping only the identity index.

Restoring a pre-cutover export necessarily loses writes made after cutover
unless those writes were exported separately and reconciled. Keep that
post-cutover export immutable. If 073 or a later migration fails, prefer a
forward fix; otherwise restore the complete pre-073 export, schema/function
metadata, and explicitly reconcile post-cutover writes before reopening
writes. Never release an old client against a partially gated schema.
