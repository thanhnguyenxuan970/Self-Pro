const { readFileSync } = jest.requireActual<{ readFileSync(path: string, encoding: string): string }>('fs');

const migrationRoot = `${process.cwd()}/supabase/migrations`;
const migration022 = readFileSync(`${migrationRoot}/022_redact_leaderboard_emails.sql`, 'utf8');
const migration023 = readFileSync(`${migrationRoot}/023_leaderboard_compatibility.sql`, 'utf8');
const migration024 = readFileSync(`${migrationRoot}/024_preserve_legacy_leaderboard_identity.sql`, 'utf8');
const migration027 = readFileSync(`${migrationRoot}/027_provision_leaderboard_profiles.sql`, 'utf8');

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

test('every auth account receives a zero-star leaderboard profile', () => {
  expect(migration027).toContain('SECURITY DEFINER');
  expect(migration027).toContain('AFTER INSERT ON auth.users');
  expect(migration027).toContain('ON CONFLICT (user_email) DO NOTHING');
  expect(migration027).toContain('SELECT email');
  expect(migration027).toContain('FROM auth.users');
});

const migration026 = readFileSync(`${migrationRoot}/026_leaderboard_rank_neighborhood.sql`, 'utf8');

test('rank neighbourhood replaces the v2 RPC in place rather than creating an overload', () => {
  // Adding a p_neighbors argument would leave two candidate functions and make
  // a p_limit-only call ambiguous for PostgREST.
  expect(migration026).toContain('CREATE OR REPLACE FUNCTION public.get_global_leaderboard_v2(p_limit integer DEFAULT 50)');
  expect(migration026).toContain('RETURNS TABLE (player_id uuid, lifetime_stars real, rank bigint, is_current_user boolean)');
  expect(migration026).not.toMatch(/FUNCTION public\.get_global_leaderboard_v2\(p_neighbors/);
  expect(migration026).not.toContain('DROP FUNCTION');
});

test('rank neighbourhood widens rows returned but not the data exposed per row', () => {
  expect(migration026).toContain('r.rank BETWEEN');
  // Still pseudonymous: public id, stars, rank, and the caller flag only.
  expect(migration026).toContain('u.leaderboard_public_id AS player_id');
  expect(migration026).not.toContain('r.user_email');
  expect(migration026).not.toContain('THEN r.user_email');
});

test('the legacy RPC keeps its flat, contiguous row set for already-released clients', () => {
  expect(migration026).not.toContain('CREATE OR REPLACE FUNCTION public.get_global_leaderboard(');
});

test('neighbourhood execute grant stays restricted to authenticated callers', () => {
  expect(migration026).toContain('REVOKE ALL ON FUNCTION public.get_global_leaderboard_v2(integer) FROM PUBLIC, anon, authenticated;');
  expect(migration026).toContain('GRANT EXECUTE ON FUNCTION public.get_global_leaderboard_v2(integer) TO authenticated;');
});
