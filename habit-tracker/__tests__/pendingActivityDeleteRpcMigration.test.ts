const { readFileSync } = jest.requireActual<{
  readFileSync(path: string, encoding: 'utf8'): string;
}>('fs');

const migration = readFileSync(
  `${process.cwd()}/supabase/migrations/072_delete_pending_activity_rows.sql`,
  'utf8',
);

describe('pending activity delete RPC migration', () => {
  it('derives and validates the normalized account identity only from JWT context', () => {
    expect(migration).toMatch(/delete_my_activity_rows\s*\(\s*p_local_ids\s+bigint\[\]\s*\)/i);
    expect(migration).toContain('auth.uid()');
    expect(migration).toMatch(/auth\.jwt\(\)\s*->>\s*'email'/i);
    expect(migration).toMatch(/lower\s*\(\s*btrim\s*\(/i);
    expect(migration).toMatch(/Authenticated user with a valid email required/i);
    expect(migration).not.toMatch(/p_(?:user_)?email/i);
  });

  it('uses invoker rights, current RLS, and an account-normalized delete predicate', () => {
    expect(migration).toMatch(/SECURITY INVOKER/i);
    expect(migration).toMatch(
      /DELETE FROM public\.activity_log[\s\S]*lower\s*\(\s*btrim\s*\(\s*activity\.user_email\s*\)\s*\)\s*=\s*caller_email/i,
    );
    expect(migration).toMatch(/activity\.local_id\s*=\s*requested\.local_id/i);
    expect(migration).toMatch(/public\.account_write_allowed\(\)/i);
  });

  it('confirms requested ids that are absent for this account without inspecting another account', () => {
    expect(migration).toMatch(/NOT EXISTS\s*\([\s\S]*FROM public\.activity_log AS remaining/i);
    expect(migration).toMatch(
      /lower\s*\(\s*btrim\s*\(\s*remaining\.user_email\s*\)\s*\)\s*=\s*caller_email/i,
    );
    expect(migration).toMatch(/remaining\.local_id\s*=\s*requested\.local_id/i);
  });

  it('revokes the legacy RPC instead of exposing it to callers', () => {
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.delete_my_activity_rows\(bigint\[\]\) FROM PUBLIC, anon, authenticated;/i,
    );
    expect(migration).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.delete_my_activity_rows\(bigint\[\]\) TO authenticated;/i,
    );
    expect(migration).toMatch(/revoked immediately/i);
  });
});
