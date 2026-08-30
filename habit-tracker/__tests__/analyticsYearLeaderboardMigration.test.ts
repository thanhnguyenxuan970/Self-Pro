const { readFileSync } = jest.requireActual<{ readFileSync(path: string, encoding: string): string }>('fs');

const migration = readFileSync(
  `${process.cwd()}/supabase/migrations/069_analytics_year_social_leaderboards.sql`,
  'utf8',
);

test('annual Global RPC returns pseudonymous year-star rows with server ranks', () => {
  expect(migration).toContain('get_global_year_leaderboard_v1(p_limit integer DEFAULT 50)');
  expect(migration).toMatch(/RETURNS TABLE\s*\(\s*player_id uuid,\s*year_stars real,\s*rank bigint,\s*is_current_user boolean,\s*current_streak integer,\s*rank_delta_7d integer\s*\)/);
  expect(migration).toContain('profile.leaderboard_public_id AS player_id');
  expect(migration).not.toContain('RETURNS TABLE (user_email');
  expect(migration).not.toMatch(/ORDER BY[^;\n]*lifetime_stars/i);
});

test('annual aggregation has the same Analytics Year source and account boundary', () => {
  expect(migration).toContain("source = 'TASK'");
  expect(migration).toContain("IF p_local_date !~ '^\\d{4}-\\d{2}-\\d{2}$'");
  expect(migration).toContain('CURRENT_DATE');
  expect(migration).toContain('activity_start_date');
  expect(migration).toContain('stars_delta > 0');
});

test('annual aggregation uses each profile local date and rejects invalid date strings', () => {
  expect(migration).toContain('AT TIME ZONE profile_timezone.name');
  expect(migration).toContain('AT TIME ZONE member_timezone.name');
  expect(migration).toContain('analytics_year_date(local_date)');
  expect(migration).toContain('activity_log_analytics_year_email_valid_date_idx');
  expect(migration).toContain("to_char(parsed, 'YYYY-MM-DD') <> p_local_date");
  expect(migration).not.toContain('activity.local_date::date');
});

test('annual Friends aggregation computes member scores once before ranking', () => {
  expect(migration).toContain('member_year_scores AS');
  expect(migration).toContain('JOIN member_year_scores AS scores');
});

test('annual Friends RPC keeps privacy and authenticated-only execution', () => {
  expect(migration).toContain('get_my_year_friend_dashboard()');
  expect(migration).toContain('year_stars real');
  expect(migration).toContain('auth.uid()');
  expect(migration).toContain('REVOKE ALL ON FUNCTION public.get_global_year_leaderboard_v1(integer) FROM PUBLIC, anon, authenticated;');
  expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.get_global_year_leaderboard_v1(integer) TO authenticated;');
  expect(migration).toContain('REVOKE ALL ON FUNCTION public.get_my_year_friend_dashboard() FROM PUBLIC, anon, authenticated;');
  expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.get_my_year_friend_dashboard() TO authenticated;');
  expect(migration).not.toContain('user_email text');
});
