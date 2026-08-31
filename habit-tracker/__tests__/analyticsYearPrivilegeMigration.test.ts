const { existsSync, readFileSync } = jest.requireActual<{
  existsSync(path: string): boolean;
  readFileSync(path: string, encoding: string): string;
}>('fs');

const migrationPath = `${process.cwd()}/supabase/migrations/070_grant_analytics_year_date_execute.sql`;
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : '';

test('annual date helper stays executable for authenticated activity-log index maintenance', () => {
  expect(existsSync(migrationPath)).toBe(true);
  expect(migration).toMatch(
    /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.analytics_year_date\s*\(\s*text\s*\)\s+FROM\s+PUBLIC\s*,\s*anon\s*;/i,
  );
  expect(migration).toMatch(
    /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.analytics_year_date\s*\(\s*text\s*\)\s+TO\s+authenticated\s*;/i,
  );
});
