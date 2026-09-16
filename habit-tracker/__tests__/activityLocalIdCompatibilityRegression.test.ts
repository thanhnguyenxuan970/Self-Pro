const { readFileSync } = jest.requireActual<{ readFileSync(path: string, encoding: string): string }>('fs');

const migrationPath = (name: string) => `${process.cwd()}/supabase/migrations/${name}`;

describe('activity local-id compatibility regression guards', () => {
  it.each([
    '077_activity_local_id_compatibility.sql',
    '078_repair_activity_local_id_compatibility.sql',
  ])('allocates repaired ids above the full table range in %s', (name) => {
    const migration = readFileSync(migrationPath(name), 'utf8');

    expect(migration).toMatch(
      /SELECT COALESCE\(MAX\(activity\.local_id\), 0\)\s+INTO max_local_id\s+FROM public\.activity_log AS activity/i,
    );
    expect(migration).toMatch(
      /SELECT COUNT\(\*\)\s+INTO duplicate_count\s+FROM \([\s\S]*ROW_NUMBER\(\) OVER/i,
    );
  });

  it('remaps normalized-account local-id collisions before the raw compatibility index can reject them', () => {
    const migration = readFileSync(
      migrationPath('077_activity_local_id_compatibility.sql'),
      'utf8',
    );

    expect(migration).toMatch(
      /PERFORM 1\s+FROM public\.activity_log AS collision[\s\S]*lower\(btrim\(collision\.user_email\)\) = caller_email[\s\S]*collision\.local_id = v_local_id/i,
    );
    expect(migration).toMatch(/v_local_id := v_next_local_id/i);
  });
});
