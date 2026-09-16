const { readFileSync } = jest.requireActual<{ readFileSync(path: string, encoding: string): string }>('fs');

const identityMigration = readFileSync(
  `${process.cwd()}/supabase/migrations/073_activity_identity.sql`,
  'utf8',
);
const historyMigration = readFileSync(
  `${process.cwd()}/supabase/migrations/074_user_data_backup_history.sql`,
  'utf8',
);
const activityDeleteKeyMigration = readFileSync(
  `${process.cwd()}/supabase/migrations/075_delete_activity_keys.sql`,
  'utf8',
);
const activityServerGateMigration = readFileSync(
  `${process.cwd()}/supabase/migrations/076_activity_server_gate.sql`,
  'utf8',
);
const localMigrations = readFileSync(
  `${process.cwd()}/src/db/migrations.ts`,
  'utf8',
);

describe('activity identity migration contract', () => {
  it('does not invent legacy keys and removes both forms of the local-id conflict only after a duplicate check', () => {
    expect(identityMigration).toMatch(/ADD COLUMN IF NOT EXISTS activity_key text/i);
    expect(identityMigration).not.toMatch(/SET activity_key\s*=\s*'legacy:'/i);
    expect(identityMigration).not.toMatch(/ALTER COLUMN activity_key SET NOT NULL/i);
    expect(identityMigration).toMatch(/duplicate non-null identities require reconciliation/i);
    expect(identityMigration).toMatch(/CREATE UNIQUE INDEX(?: IF NOT EXISTS)? activity_log_user_email_activity_key_key[\s\S]*WHERE activity_key IS NOT NULL/i);
    expect(identityMigration).toMatch(/DROP CONSTRAINT IF EXISTS activity_log_user_email_local_id_key/i);
    expect(identityMigration).toMatch(/pg_catalog\.pg_constraint/i);
    expect(identityMigration).toMatch(/DROP INDEX IF EXISTS public\.activity_log_user_email_local_id_key/i);
  });
});

describe('activity server gate migration contract', () => {
  it('blocks direct writes and the legacy local-id delete RPC', () => {
    expect(activityServerGateMigration).toMatch(/REVOKE INSERT, UPDATE, DELETE ON TABLE public\.activity_log FROM PUBLIC, anon, authenticated/i);
    expect(activityServerGateMigration).toMatch(/delete_my_activity_rows[\s\S]*is retired/i);
    expect(activityServerGateMigration).toMatch(/REVOKE ALL ON FUNCTION public\.delete_my_activity_rows\(bigint\[\]\)/i);
    expect(activityServerGateMigration).toMatch(/append_my_activity_rows\(p_activity_rows jsonb\)/i);
    expect(activityServerGateMigration).toMatch(/Activity key content conflict/i);
    expect(activityServerGateMigration).toMatch(/ON CONFLICT DO NOTHING/i);
    expect(activityServerGateMigration).toMatch(/conflict could not be resolved/i);
    expect(activityServerGateMigration).toMatch(/SET search_path = pg_catalog, public, pg_temp/i);
    expect(activityServerGateMigration).toMatch(/GRANT EXECUTE ON FUNCTION public\.append_my_activity_rows\(jsonb\)/i);
    expect(activityServerGateMigration).toMatch(/DROP FUNCTION IF EXISTS public\.delete_my_activity_rows\(bigint\[\]\)/i);
    expect(activityServerGateMigration).toMatch(/CREATE FUNCTION public\.delete_my_activity_rows\(p_local_ids bigint\[\]\)/i);
    expect(activityServerGateMigration).not.toMatch(/CREATE OR REPLACE FUNCTION public\.delete_my_activity_rows/i);
  });
});

describe('backup history migration contract', () => {
  it('stores immutable revisions with a bounded retention window', () => {
    expect(historyMigration).toMatch(/CREATE TABLE IF NOT EXISTS public\.user_data_backup_history/i);
    expect(historyMigration).toMatch(/SET search_path = pg_catalog, public, pg_temp/i);
    expect(historyMigration).toMatch(/PRIMARY KEY \(auth_user_id, revision\)/i);
    expect(historyMigration).toMatch(/INSERT INTO public\.user_data_backup_history/i);
    expect(historyMigration).toMatch(/FROM public\.user_data_backups AS backup/i);
    expect(historyMigration).toMatch(/revision >= 0/i);
    expect(historyMigration).toMatch(/marker\.applied_revision/i);
    expect(historyMigration).toMatch(/revision < next_revision - 29/i);
    expect(historyMigration).toMatch(/list_my_data_backup_history\(p_limit integer\)/i);
    expect(historyMigration).toMatch(/restore_my_data_backup_revision\(p_revision bigint\)/i);
    expect(historyMigration).toMatch(/GRANT EXECUTE ON FUNCTION public\.list_my_data_backup_history/i);
    expect(historyMigration).toMatch(/GRANT EXECUTE ON FUNCTION public\.restore_my_data_backup_revision/i);
  });
});

describe('stable activity delete migration contract', () => {
  it('deletes and acknowledges rows by durable activity key', () => {
    expect(activityDeleteKeyMigration).toMatch(/delete_my_activity_keys\s*\(p_activity_keys\s+text\[\]\)/i);
    expect(activityDeleteKeyMigration).toMatch(/SECURITY DEFINER/i);
    expect(activityDeleteKeyMigration).toMatch(/SET search_path = pg_catalog, public, pg_temp/i);
    expect(activityDeleteKeyMigration).toMatch(/canonical_auth_email\(caller_id\)/i);
    expect(activityDeleteKeyMigration).toMatch(/activity\.activity_key\s*=\s*requested\.activity_key/i);
    expect(activityDeleteKeyMigration).toMatch(/NOT EXISTS\s*\([\s\S]*remaining\.activity_key\s*=\s*requested\.activity_key/i);
    expect(activityDeleteKeyMigration).toMatch(/GRANT EXECUTE ON FUNCTION public\.delete_my_activity_keys\(text\[\]\)/i);
  });
});

describe('local restore outbox suppression contract', () => {
  it('replaces the delete trigger and keeps suppression account-scoped', () => {
    expect(localMigrations).toMatch(/activity_restore_suppression/i);
    expect(localMigrations).toMatch(/DROP TRIGGER IF EXISTS trg_activity_log_enqueue_delete/i);
    expect(localMigrations).toMatch(/NOT EXISTS \(\s*SELECT 1 FROM activity_restore_suppression/i);
  });

  it('keeps the mirror task reference separate from the local task relationship', () => {
    expect(localMigrations).toMatch(/activity_source_task_type_id INTEGER/i);
    expect(localMigrations).toMatch(/v34 -> v35/i);
  });
});
