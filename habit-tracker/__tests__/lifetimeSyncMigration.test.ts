const { readFileSync } = jest.requireActual<{ readFileSync(path: string, encoding: string): string }>('fs');

test('server lifetime sync derives the current positive activity total', () => {
  const sql = readFileSync(`${process.cwd()}/supabase/migrations/047_current_lifetime_stars.sql`, 'utf8');

  expect(sql).toContain('next_stars := GREATEST(0, activity_stars + COALESCE(adjustment, 0));');
  expect(sql).not.toContain('next_stars := GREATEST(\n    COALESCE(stored_stars, 0),');
});
