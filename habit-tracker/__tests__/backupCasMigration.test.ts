declare const require: (moduleName: string) => {
  readFileSync: (path: string, encoding: 'utf8') => string;
};

const { readFileSync } = require('fs');

const migrationSql = readFileSync(
  `${process.cwd()}/supabase/migrations/068_silent_backup_cas_conflicts.sql`,
  'utf8',
);

test('makes v2 CAS contention non-error while preserving the legacy wrapper fence', () => {
  expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION public.save_my_data_backup_v2');
  expect(migrationSql).toContain('RETURNS bigint');
  expect(migrationSql).toContain('IF p_expected_revision <> current_revision THEN');
  expect(migrationSql).toContain('RETURN -1;');
  expect(migrationSql).not.toContain(
    "RAISE EXCEPTION 'Backup revision conflict: expected %, current %'",
  );
  expect(migrationSql).toContain(
    'result_revision := public.save_my_data_backup_v2(p_schema_version, p_payload, 0);',
  );
  expect(migrationSql).toContain('IF result_revision = -1 THEN');
  expect(migrationSql).toContain("RAISE EXCEPTION 'Backup revision conflict';");
  expect(migrationSql).toContain(
    'REVOKE ALL ON FUNCTION public.save_my_data_backup_v2(integer, jsonb, bigint)',
  );
  expect(migrationSql).toContain(
    'GRANT EXECUTE ON FUNCTION public.save_my_data_backup_v2(integer, jsonb, bigint) TO authenticated;',
  );
});
