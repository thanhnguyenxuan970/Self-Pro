const { readFileSync } = jest.requireActual<{ readFileSync(path: string, encoding: string): string }>('fs');

const migrationRoot = `${process.cwd()}/supabase/migrations`;
const migration022 = readFileSync(`${migrationRoot}/022_redact_leaderboard_emails.sql`, 'utf8');
const migration023 = readFileSync(`${migrationRoot}/023_leaderboard_compatibility.sql`, 'utf8');
const migration024 = readFileSync(`${migrationRoot}/024_preserve_legacy_leaderboard_identity.sql`, 'utf8');

test('privacy migration keeps the legacy leaderboard RPC shape', () => {
  expect(migration022).toContain('RETURNS TABLE (user_email text, lifetime_stars real, rank bigint)');
  expect(migration022).not.toContain('RETURNS TABLE (player_id uuid');
  expect(migration022).toContain('WHEN r.is_current_user THEN r.user_email');
  expect(migration023).toContain('WHEN r.is_current_user THEN r.user_email');
});

test('legacy leaderboard keeps current-user identity without exposing other emails', () => {
  expect(migration024).toContain('u.user_email,');
  expect(migration024).toContain('WHEN r.is_current_user THEN r.user_email');
  expect(migration024).toContain("ELSE format('player-%s'");
});
