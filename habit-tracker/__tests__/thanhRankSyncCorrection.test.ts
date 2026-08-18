const { readFileSync } = jest.requireActual<{ readFileSync(path: string, encoding: string): string }>('fs');

const migrationRoot = `${process.cwd()}/supabase/migrations`;
const migration039 = readFileSync(`${migrationRoot}/039_correct_thanhnguyenxuan_rank_sync_to_256.sql`, 'utf8');
const migration040 = readFileSync(`${migrationRoot}/040_correct_thanhnguyenxuan_rank_sync_to_268.sql`, 'utf8');
const migration041 = readFileSync(`${migrationRoot}/041_correct_thanhnguyenxuan_rank_sync_to_275.sql`, 'utf8');
const migration042 = readFileSync(`${migrationRoot}/042_reanchor_thanhnguyenxuan_rank_sync_to_279.sql`, 'utf8');

test('the account-specific rank correction advances only the known stale 252-star state to 256', () => {
  expect(migration039).toContain('SET lifetime_stars_adjustment = -228,');
  expect(migration039).toContain('lifetime_stars = 256');
  expect(migration039).toContain("WHERE user_email = 'thanhnguyenxuan970@gmail.com'");
  expect(migration039).toContain('AND lifetime_stars = 252');
  expect(migration039).toContain('AND lifetime_stars_adjustment = -232');
});

test('the correction does not delete activity history or alter the sync function contract', () => {
  expect(migration039).not.toMatch(/\bDELETE\s+FROM\s+public\.activity_log\b/i);
  expect(migration039).not.toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.sync_lifetime_stars/i);
});

test('the live re-anchor derives its durable offset and aborts on a changed state', () => {
  expect(migration040).toContain('lifetime_stars_adjustment = 268 - activity_stars');
  expect(migration040).toContain('lifetime_stars = 268');
  expect(migration040).toContain('AND lifetime_stars = 256');
  expect(migration040).toContain('AND lifetime_stars_adjustment = -228');
  expect(migration040).toContain('RAISE EXCEPTION');
});

test('the live re-anchor preserves activity history and the existing sync function', () => {
  expect(migration040).not.toMatch(/\bDELETE\s+FROM\s+public\.activity_log\b/i);
  expect(migration040).not.toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.sync_lifetime_stars/i);
});

test('the current-phone correction advances from 268 to 275 without freezing future sync', () => {
  expect(migration041).toContain('lifetime_stars_adjustment = 275 - activity_stars');
  expect(migration041).toContain('lifetime_stars = 275');
  expect(migration041).toContain('AND lifetime_stars = 268');
  expect(migration041).toContain('AND lifetime_stars_adjustment = -201');
  expect(migration041).toContain('RAISE EXCEPTION');
});

test('the current-phone correction preserves activity history and sync function', () => {
  expect(migration041).not.toMatch(/\bDELETE\s+FROM\s+public\.activity_log\b/i);
  expect(migration041).not.toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.sync_lifetime_stars/i);
});

test('the live reconciliation re-anchors only the authorized account and keeps future server sync dynamic', () => {
  expect(migration042).toContain('lifetime_stars_adjustment = 279 - activity_stars');
  expect(migration042).toContain('lifetime_stars = 279');
  expect(migration042).toContain("WHERE user_email = 'thanhnguyenxuan970@gmail.com'");
  expect(migration042).toContain('AND lifetime_stars = 275');
  expect(migration042).toContain('AND lifetime_stars_adjustment = -194');
  expect(migration042).toContain('RAISE EXCEPTION');
  expect(migration042).not.toMatch(/\bDELETE\s+FROM\s+public\.activity_log\b/i);
  expect(migration042).not.toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.sync_lifetime_stars/i);
});
