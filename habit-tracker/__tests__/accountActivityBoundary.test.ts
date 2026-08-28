import {
  getAccountActivityStartDate,
  isActivityDateIncluded,
} from '../src/lib/accountActivityBoundary';
import {
  filterCloudBackupPayload,
  restoreUserDataBackup,
  type CloudBackupPayload,
} from '../src/lib/userDataBackup';

const emptyPayload = (): CloudBackupPayload => ({
  schema_version: 1,
  user: {
    username: 'me',
    lifetime_stars: 999,
    current_tier_id: 7,
  },
  categories: [],
  task_types: [],
  activity_log: [],
  daily_summary: [],
  weekly_summary: [],
  reward_unlocks: [],
  fund_transactions: [],
  streak_freezes: [],
  treats: [],
  treat_history: [],
  challenges: [],
  challenge_log: [],
  challenge_days: [],
  achievements: [],
  milestone_stars: [],
  boost_events: [],
});

test('uses the confirmed 06/07 boundary only for thanguyenxuan', () => {
  expect(getAccountActivityStartDate('THANHNGUYENXUAN970@GMAIL.COM')).toBe('2026-07-06');
  expect(getAccountActivityStartDate('other@example.com')).toBeNull();
  expect(isActivityDateIncluded('2026-07-05', '2026-07-06')).toBe(false);
  expect(isActivityDateIncluded('2026-07-06', '2026-07-06')).toBe(true);
  expect(isActivityDateIncluded('2026-07-07', null)).toBe(true);
});

test('filters old activity-derived backup rows and reanchors the backed-up stars', () => {
  const payload = emptyPayload();
  payload.activity_log = [
    { id: 1, local_date: '2026-07-05', stars_delta: 90 },
    { id: 2, local_date: '2026-07-06', stars_delta: 7 },
  ];
  payload.daily_summary = [
    { id: 1, local_date: '2026-07-05', total_points: 100 },
    { id: 2, local_date: '2026-07-06', total_points: 10 },
  ];
  payload.weekly_summary = [
    { id: 1, week_start: '2026-06-29', weekly_stars: 90 },
    { id: 2, week_start: '2026-07-06', weekly_stars: 7 },
  ];

  const filtered = filterCloudBackupPayload(payload, '2026-07-06');

  expect(filtered.activity_log).toEqual([{ id: 2, local_date: '2026-07-06', stars_delta: 7 }]);
  expect(filtered.daily_summary).toEqual([{ id: 2, local_date: '2026-07-06', total_points: 10 }]);
  expect(filtered.weekly_summary).toEqual([{ id: 2, week_start: '2026-07-06', weekly_stars: 7 }]);
  expect(filtered.user?.lifetime_stars).toBe(7);
  expect(filtered.user?.current_tier_id).toBeNull();
  expect(payload.activity_log).toHaveLength(2);
});

test('does not filter another account when no boundary is configured', () => {
  const payload = emptyPayload();
  payload.activity_log = [{ id: 1, local_date: '2026-01-01', stars_delta: 3 }];

  const filtered = filterCloudBackupPayload(payload, null);

  expect(filtered.activity_log).toEqual(payload.activity_log);
  expect(filtered.user?.lifetime_stars).toBe(999);
});

test('does not overwrite a populated local account during a divergent restore', async () => {
  const runAsync = jest.fn();
  type TestDb = {
    getFirstAsync: jest.Mock;
    getAllAsync: jest.Mock;
    runAsync: jest.Mock;
    withTransactionAsync: (task: () => Promise<void>) => Promise<void>;
    withExclusiveTransactionAsync?: (task: (transactionDb: TestDb) => Promise<void>) => Promise<void>;
  };
  const db: TestDb = {
    getFirstAsync: jest.fn(async (sql: string) => (
      sql.includes('FROM activity_log WHERE user_id = ?') ? { count: 1 } : { count: 0 }
    )),
    getAllAsync: jest.fn(),
    runAsync,
    withTransactionAsync: async (task: () => Promise<void>) => task(),
    withExclusiveTransactionAsync: undefined,
  };
  db.withExclusiveTransactionAsync = async task => task(db);

  await expect(restoreUserDataBackup(
    db,
    1,
    emptyPayload(),
    undefined,
    () => undefined,
    async transactionDb => {
      const row = await transactionDb.getFirstAsync<{ count: number }>(
        'SELECT COUNT(*) AS count FROM activity_log WHERE user_id = ?',
        [1],
      );
      return Number(row?.count) === 0;
    },
  )).resolves.toBe(false);

  expect(db.getFirstAsync).toHaveBeenCalledWith(
    'SELECT COUNT(*) AS count FROM activity_log WHERE user_id = ?',
    [1],
  );
  expect(runAsync).not.toHaveBeenCalled();
});

test('preserves pre-boundary audit rows during a filtered snapshot restore', async () => {
  const runAsync = jest.fn();
  type RestoreTestDb = {
    getFirstAsync: jest.Mock;
    getAllAsync: jest.Mock;
    runAsync: jest.Mock;
    withTransactionAsync: (task: () => Promise<void>) => Promise<void>;
    withExclusiveTransactionAsync: (task: (transactionDb: RestoreTestDb) => Promise<void>) => Promise<void>;
  };
  const db: RestoreTestDb = {
    getFirstAsync: jest.fn().mockResolvedValue(null),
    getAllAsync: jest.fn(async (sql: string) => (
      sql.includes('FROM tiers') ? [{ id: 1, tier_order: 1, stars_required: 5 }] : []
    )),
    runAsync,
    withTransactionAsync: async (task: () => Promise<void>) => task(),
    withExclusiveTransactionAsync: async (task: (transactionDb: RestoreTestDb) => Promise<void>) => task(db),
  };

  await expect(restoreUserDataBackup(
    db,
    1,
    emptyPayload(),
    undefined,
    () => undefined,
    async () => true,
    '2026-07-06',
  )).resolves.toBe(true);

  expect(runAsync).toHaveBeenCalledWith(
    'DELETE FROM activity_log WHERE user_id = ? AND local_date >= ?',
    [1, '2026-07-06'],
  );
  expect(runAsync).toHaveBeenCalledWith(
    'DELETE FROM daily_summary WHERE user_id = ? AND local_date >= ?',
    [1, '2026-07-06'],
  );
  expect(runAsync).toHaveBeenCalledWith(
    'DELETE FROM weekly_summary WHERE user_id = ? AND week_start >= ?',
    [1, '2026-07-06'],
  );
  expect(runAsync).not.toHaveBeenCalledWith(
    'DELETE FROM activity_log WHERE user_id = ?',
    [1],
  );
});
