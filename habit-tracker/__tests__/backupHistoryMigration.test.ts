const { readFileSync } = jest.requireActual<{ readFileSync(path: string, encoding: string): string }>('fs');

const historyMigration = readFileSync(
  `${process.cwd()}/supabase/migrations/074_user_data_backup_history.sql`,
  'utf8',
);

describe('backup history migration conflict handling', () => {
  it('does not name a possibly absent constraint in an ON CONFLICT target', () => {
    expect(historyMigration).not.toMatch(
      /ON CONFLICT\s*\(\s*auth_user_id\s*,\s*revision\s*\)/i,
    );
    expect(historyMigration.match(/ON CONFLICT\s+DO NOTHING/gi)).toHaveLength(3);
  });
});
