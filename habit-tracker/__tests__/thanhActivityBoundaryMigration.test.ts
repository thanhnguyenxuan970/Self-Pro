const { readFileSync } = jest.requireActual<{ readFileSync(path: string, encoding: string): string }>('fs');

const migrationPath = `${process.cwd()}/supabase/migrations/067_account_activity_start_boundary.sql`;
const migration = readFileSync(migrationPath, 'utf8');

test('stores the confirmed activity boundary only for the authorized account', () => {
  expect(migration).toContain('ADD COLUMN IF NOT EXISTS activity_start_date date');
  expect(migration).toContain("lower(btrim(user_email)) = 'thanhnguyenxuan970@gmail.com'");
  expect(migration).toContain("DATE '2026-07-06'");
});

test('makes lifetime sync ignore rows before the inclusive activity boundary', () => {
  expect(migration).toContain('activity.local_date::date >= valid_start_date');
  expect(migration).toContain('CREATE OR REPLACE FUNCTION public.sync_user_profile_v2(');
  expect(migration).toContain('CREATE OR REPLACE FUNCTION public.sync_lifetime_stars()');
  expect(migration).not.toMatch(/\bDELETE\s+FROM\s+public\.activity_log\b/i);
});
