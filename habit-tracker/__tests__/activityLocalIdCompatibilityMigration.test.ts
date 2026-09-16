const { readFileSync } = jest.requireActual<{ readFileSync(path: string, encoding: string): string }>('fs');

const migration = readFileSync(
  `${process.cwd()}/supabase/migrations/077_activity_local_id_compatibility.sql`,
  'utf8',
);

describe('legacy activity upsert compatibility migration', () => {
  it('makes the obsolete PostgREST conflict target resolvable without reopening direct writes', () => {
    expect(migration).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS activity_log_user_email_local_id_compat_key\s+ON public\.activity_log \(user_email, local_id\)/i,
    );
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.append_my_activity_rows\(jsonb\) FROM PUBLIC, anon, authenticated/i,
    );
    expect(migration).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.append_my_activity_rows\(jsonb\) TO authenticated/i,
    );
    expect(migration).toMatch(/local_id is a legacy mirror field, not the durable activity identity/i);
    expect(migration).toMatch(/ROW_NUMBER\(\) OVER/i);
    expect(migration).not.toMatch(/DELETE FROM public\.activity_log/i);
    expect(migration).not.toMatch(
      /INSERT INTO public\.activity_log[\s\S]*ON CONFLICT\s*\(\s*user_email\s*,\s*local_id\s*\)/i,
    );
    expect(migration).toMatch(/ON CONFLICT\s+DO NOTHING/i);
    expect(migration).toMatch(/local_id is no longer the logical identity/i);
  });
});
