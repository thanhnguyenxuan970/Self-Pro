const { readFileSync } = jest.requireActual<{ readFileSync(path: string, encoding: string): string }>('fs');

const migration = readFileSync(
  `${process.cwd()}/supabase/migrations/078_repair_activity_local_id_compatibility.sql`,
  'utf8',
);

describe('activity local-id compatibility repair migration', () => {
  it('preserves rows while making the legacy conflict target valid in old deployments', () => {
    expect(migration).toMatch(/ROW_NUMBER\(\) OVER/i);
    expect(migration).toMatch(/SET local_id = max_local_id \+ duplicate_rows\.allocation_number/i);
    expect(migration).not.toMatch(/DELETE FROM public\.activity_log/i);
    expect(migration).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS activity_log_user_email_local_id_compat_key\s+ON public\.activity_log \(user_email, local_id\)/i,
    );
  });
});
