import {
  buildUserDataBackup,
  filterCloudBackupPayload,
  isCloudBackupPayload,
  restoreLegacyActivityMirror,
  restoreUserDataBackup,
  type CloudBackupPayload,
} from '../src/lib/userDataBackup';

const basePayload = (): CloudBackupPayload => ({
  schema_version: 1,
  user: null,
  categories: [], task_types: [], activity_log: [], daily_summary: [], weekly_summary: [],
  reward_unlocks: [], fund_transactions: [], streak_freezes: [], treats: [], treat_history: [],
  challenges: [], challenge_log: [], challenge_days: [], achievements: [], milestone_stars: [], boost_events: [],
});

const populatedPayload = (): CloudBackupPayload => ({
  schema_version: 1,
  user: {
    username: 'me', timezone: 'Asia/Ho_Chi_Minh', carry_debt: 0, currency: 'VND',
    last_seen_week_start: null, notification_time: null, notification_time_2: null, notification_time_3: null,
    treat_stars: 0, treat_stars_lifetime: 0, value_per_star: 1000, penalty_hits_treats: 1,
    lifetime_stars: 1, current_tier_id: 1,
  },
  categories: [{ id: 1, name: 'Health', icon: '🏃', sort_order: 1, archived: 0 }],
  task_types: [{ id: 2, name: 'Run', kind: 'GOOD', is_time_based: 0, base_points: 10, star_penalty: 0, category_id: 1, icon: null, archived: 0, sort_order: 1, is_pinned: 0, is_template: 1 }],
  activity_log: [{ id: 3, task_type_id: 2, kind: 'GOOD', duration_min: 30, points_earned: 5, stars_delta: 1, source: 'TASK', logged_at: 1, local_date: '2026-01-01', week_start: '2025-12-29', note: null, is_backfill: 0, is_clock_suspect: 0 }],
  daily_summary: [{ id: 4, local_date: '2026-01-01', total_points: 5, bonus_star_awarded: 0, streak_count: 1 }],
  weekly_summary: [{ id: 5, week_start: '2025-12-29', total_points: 5, weekly_stars: 1, peak_stars: 1, current_tier_id: null, start_debt: 0, finalized: 0 }],
  reward_unlocks: [{ id: 6, tier_id: 1, week_start: '2025-12-29', stars_at_unlock: 1, reward_amount: 0, claimed: 0, claimed_at: null }],
  fund_transactions: [{ id: 7, type: 'income', amount: 10, currency: 'VND', source_unlock_id: 6, note: null, occurred_at: 1 }],
  streak_freezes: [{ id: 8, local_date: '2026-01-01', purchased_at: 1 }],
  treats: [{ id: 9, name: 'Treat', icon: 'gift', target_stars: 1, approx_amount: 10, currency: 'VND', status: 'ACTIVE', sort_order: 0, reached_at: null, enjoyed_at: null, created_at: '2026-01-01' }],
  treat_history: [{ id: 10, treat_id: 9, name: 'Treat', stars_spent: 1, amount: 10, currency: 'VND', enjoyed_at: '2026-01-01' }],
  challenges: [{ id: 11, name: 'Challenge', task_type_id: 2, mode: 'streak', target_days: 1, weekly_target: null, total_weeks: null, start_date: '2026-01-01', status: 'active', freezes_left: 0, freeze_used: 0, streak_current: 1, completed_at: null, before_photo: null, after_photo: null, notifications_enabled: 1, notification_id: null, min_duration: null, min_count: null, created_at: '2026-01-01' }],
  challenge_log: [{ id: 12, challenge_id: 11, local_date: '2026-01-01', state: 'done' }],
  challenge_days: [{ id: 13, challenge_id: 11, local_date: '2026-01-01', logged_at: 1 }],
  achievements: [{ id: 14, key: 'first', rarity: 'common', earned_at: '2026-01-01', source_type: 'record', source_id: null }],
  milestone_stars: [{ id: 15, milestone_days: 1, stars: 1, awarded_at: 1 }],
  boost_events: [{ id: 16, local_date: '2026-01-01', multiplier: 1, claim_deadline: 1, claimed_at: null, expires_at: null, dismissed_at: null, created_at: 1 }],
});

function validDb() {
  const getFirstAsync = jest.fn().mockResolvedValue(null);
  const getAllAsync = jest.fn().mockResolvedValue([]);
  const runAsync = jest.fn().mockResolvedValue({ changes: 1 });
  const db = {
    getFirstAsync,
    getAllAsync,
    runAsync,
    withTransactionAsync: jest.fn(async (task: () => Promise<void>) => task()),
    withExclusiveTransactionAsync: undefined as undefined | jest.Mock,
  };
  db.withExclusiveTransactionAsync = jest.fn(async (task: (transactionDb: typeof db) => Promise<void>) => task(db));
  return db;
}

describe('cloud backup validation branches', () => {
  test('rejects invalid envelope, user, arrays, row ids, and field rules', () => {
    expect(isCloudBackupPayload(null)).toBe(false);
    expect(isCloudBackupPayload({ ...basePayload(), schema_version: 2 })).toBe(false);
    expect(isCloudBackupPayload({ ...basePayload(), user: [] })).toBe(false);
    expect(isCloudBackupPayload({ ...basePayload(), categories: {} })).toBe(false);
    expect(isCloudBackupPayload({ ...basePayload(), categories: [{ id: 0 }] })).toBe(false);
    expect(isCloudBackupPayload({ ...basePayload(), categories: [{ id: 1, name: '' }] })).toBe(false);
    expect(isCloudBackupPayload({ ...basePayload(), categories: [{ id: 1, name: 'A' }] })).toBe(true);
    expect(isCloudBackupPayload({ ...basePayload(), categories: [{ id: 1, name: 'A' }, { id: 1, name: 'B' }] })).toBe(false);
    expect(isCloudBackupPayload({ ...basePayload(), user: { carry_debt: 2 } })).toBe(false);
    expect(isCloudBackupPayload({ ...basePayload(), user: { last_seen_week_start: '2026-02-30' } })).toBe(false);
  });

  test('rejects duplicate logical keys and broken relationship graphs', () => {
    const task = { id: 2, name: 'Read' };
    expect(isCloudBackupPayload({ ...basePayload(), task_types: [task, { ...task, id: 3 }] })).toBe(false);

    const withCategory = { ...basePayload(), categories: [{ id: 1, name: 'Health' }], task_types: [{ id: 2, name: 'Run', category_id: 99 }] };
    expect(isCloudBackupPayload(withCategory)).toBe(false);
    expect(isCloudBackupPayload({ ...basePayload(), activity_log: [{ id: 1, local_date: '2026-01-01', week_start: '2026-01-01', task_type_id: 99 }] })).toBe(false);
    expect(isCloudBackupPayload({ ...basePayload(), challenges: [{ id: 1, name: 'C', start_date: '2026-01-01', task_type_id: 99, created_at: 'x' }] })).toBe(false);
    expect(isCloudBackupPayload({ ...basePayload(), fund_transactions: [{ id: 1, type: 'x', source_unlock_id: 99 }] })).toBe(false);
    expect(isCloudBackupPayload({ ...basePayload(), achievements: [{ id: 1, key: 'x', earned_at: 'x', source_type: 'challenge', source_id: 99 }] })).toBe(false);
    expect(isCloudBackupPayload({ ...basePayload(), challenge_log: [{ id: 1, challenge_id: 99, local_date: '2026-01-01' }] })).toBe(false);
    expect(isCloudBackupPayload({ ...basePayload(), challenge_days: [{ id: 1, challenge_id: 99, local_date: '2026-01-01' }] })).toBe(false);
    expect(isCloudBackupPayload({ ...basePayload(), treats: [{ id: 1, name: 'Treat', created_at: 'x' }], treat_history: [{ id: 2, treat_id: 99, name: 'Treat', enjoyed_at: 'x' }] })).toBe(false);
    expect(isCloudBackupPayload({ ...basePayload(), daily_summary: [{ id: 1, local_date: '2026-01-01' }, { id: 2, local_date: '2026-01-01' }] })).toBe(false);
    expect(isCloudBackupPayload({
      ...basePayload(),
      achievements: [
        { id: 1, key: 'same', earned_at: '2026-01-01' },
        { id: 2, key: 'same', earned_at: '2026-01-01' },
      ],
    })).toBe(false);
  });

  test('accepts a complete relationship graph and filters a historical boundary consistently', () => {
    const payload = populatedPayload();
    expect(isCloudBackupPayload(payload)).toBe(true);
    const filtered = filterCloudBackupPayload(payload, '2026-01-02');
    expect(filtered.activity_log).toEqual([]);
    expect(filtered.daily_summary).toEqual([]);
    expect(filtered.user).toMatchObject({ lifetime_stars: 0, current_tier_id: null });
  });

  test('rejects an oversized row collection and non-numeric ids', () => {
    const oversized = Array.from({ length: 100001 }, (_, id) => ({ id: id + 1, name: 'Category' }));
    expect(isCloudBackupPayload({ ...basePayload(), categories: oversized })).toBe(false);
    expect(isCloudBackupPayload({ ...basePayload(), categories: [{ id: '1', name: 'Health' }] })).toBe(false);
  });

  test('exercises strict date, string, timestamp, integer, and bounded-number validation', () => {
    const paddedCategory = populatedPayload();
    paddedCategory.categories[0].name = ' Health ';
    expect(isCloudBackupPayload(paddedCategory)).toBe(false);

    const badKind = populatedPayload();
    badKind.task_types[0].kind = 'MAYBE';
    expect(isCloudBackupPayload(badKind)).toBe(false);

    const badDate = populatedPayload();
    badDate.activity_log[0].local_date = '2026-02-30';
    expect(isCloudBackupPayload(badDate)).toBe(false);

    const malformedDate = populatedPayload();
    malformedDate.activity_log[0].local_date = 'not-a-date';
    expect(isCloudBackupPayload(malformedDate)).toBe(false);
    const outOfRangeDate = populatedPayload();
    outOfRangeDate.activity_log[0].local_date = '0999-01-01';
    expect(isCloudBackupPayload(outOfRangeDate)).toBe(false);

    const badTimestamp = populatedPayload();
    badTimestamp.activity_log[0].logged_at = 1.5;
    expect(isCloudBackupPayload(badTimestamp)).toBe(false);
    const tooLateTimestamp = populatedPayload();
    tooLateTimestamp.activity_log[0].logged_at = 32_503_680_000_001;
    expect(isCloudBackupPayload(tooLateTimestamp)).toBe(false);

    const badInteger = populatedPayload();
    badInteger.daily_summary[0].id = 1.5;
    expect(isCloudBackupPayload(badInteger)).toBe(false);

    const badNumber = populatedPayload();
    badNumber.user!.lifetime_stars = Number.POSITIVE_INFINITY;
    expect(isCloudBackupPayload(badNumber)).toBe(false);
    const textNumber = populatedPayload();
    textNumber.user!.lifetime_stars = '1';
    expect(isCloudBackupPayload(textNumber)).toBe(false);
    const tooLargeNumber = populatedPayload();
    tooLargeNumber.user!.lifetime_stars = 1_000_000_000_001;
    expect(isCloudBackupPayload(tooLargeNumber)).toBe(false);

    const tooLong = populatedPayload();
    tooLong.categories[0].name = 'x'.repeat(1_048_577);
    expect(isCloudBackupPayload(tooLong)).toBe(false);
    const negativeTimestamp = populatedPayload();
    negativeTimestamp.activity_log[0].logged_at = -1;
    expect(isCloudBackupPayload(negativeTimestamp)).toBe(false);
    const unsafeInteger = populatedPayload();
    unsafeInteger.daily_summary[0].streak_count = Number.MAX_SAFE_INTEGER + 1;
    expect(isCloudBackupPayload(unsafeInteger)).toBe(false);
    const badBound = populatedPayload();
    badBound.user!.treat_stars = -1;
    expect(isCloudBackupPayload(badBound)).toBe(false);
  });
});

describe('backup snapshot and legacy restore seams', () => {
  test('builds snapshots through exclusive, ordinary, and minimal adapter paths', async () => {
    const exclusive = validDb();
    await expect(buildUserDataBackup(exclusive, 1)).resolves.toEqual(expect.objectContaining({ schema_version: 1, user: null }));

    const ordinary = validDb();
    (ordinary as any).withExclusiveTransactionAsync = undefined;
    await expect(buildUserDataBackup(ordinary, 1)).resolves.toEqual(expect.objectContaining({ schema_version: 1 }));

    const minimal = validDb();
    (minimal as any).withExclusiveTransactionAsync = undefined;
    (minimal as any).withTransactionAsync = undefined;
    await expect(buildUserDataBackup(minimal, 1, undefined, '2026-01-01')).resolves.toEqual(expect.objectContaining({ schema_version: 1 }));
  });

  test('restores a valid empty snapshot and respects a stale fresh-account check', async () => {
    const db = validDb();
    await expect(restoreUserDataBackup(db, 1, basePayload(), 'sub')).resolves.toBe(true);
    const stale = validDb();
    await expect(restoreUserDataBackup(stale, 1, basePayload(), undefined, undefined, async () => false)).resolves.toBe(false);
    const unavailable = validDb();
    (unavailable as any).withExclusiveTransactionAsync = undefined;
    await expect(restoreUserDataBackup(unavailable, 1, basePayload())).rejects.toThrow('Exclusive SQLite restore transaction unavailable');
    await expect(restoreUserDataBackup(validDb(), 1, { ...basePayload(), schema_version: 2 } as never)).rejects.toThrow('Invalid cloud backup payload');
  });

  test('restores every supported table and applies default/null field conversions', async () => {
    const db = validDb();
    const payload = populatedPayload();
    await expect(restoreUserDataBackup(db, 1, payload, 'sub')).resolves.toBe(true);
    expect(db.runAsync).toHaveBeenCalledWith(expect.stringContaining('INSERT OR REPLACE INTO boost_events'), expect.any(Array));
    expect(db.runAsync.mock.calls.length).toBeGreaterThan(20);

    const tiersDb = validDb();
    tiersDb.getAllAsync.mockImplementation(async (sql: string) => sql.includes('FROM tiers')
      ? [{ id: 1, tier_order: 1, stars_required: 1 }, { id: 2, tier_order: 2, stars_required: 100 }]
      : []);
    await expect(restoreUserDataBackup(tiersDb, 1, payload, 'sub')).resolves.toBe(true);

    const recalculatedTierDb = validDb();
    const tierPayload = populatedPayload();
    tierPayload.user!.current_tier_id = null;
    await expect(restoreUserDataBackup(recalculatedTierDb, 1, tierPayload, 'sub', undefined, undefined, '2026-01-01')).resolves.toBe(true);
  });

  test('handles legacy LOGIN-only rows, filtered rows, and a complete legacy restore', async () => {
    const db = validDb();
    await expect(restoreLegacyActivityMirror(db, 1, [{ local_id: 1, source: 'LOGIN' }])).resolves.toEqual({ count: 0, maxId: 0 });

    const validRow = { local_id: 7, kind: 'GOOD', source: 'TASK', duration_min: null, points_earned: 5, stars_delta: 1, logged_at: 100, local_date: '2026-01-01', week_start: null };
    const filtered = validDb();
    await expect(restoreLegacyActivityMirror(filtered, 1, [validRow], undefined, undefined, false, undefined, '2026-02-01')).resolves.toEqual({ count: 0, maxId: 0 });

    const complete = validDb();
    const finalize = jest.fn().mockResolvedValue(undefined);
    await expect(restoreLegacyActivityMirror(complete, 1, [validRow], undefined, undefined, false, finalize)).resolves.toEqual({ count: 1, maxId: 7 });
    expect(finalize).toHaveBeenCalled();
  });

  test('rejects malformed legacy numeric, text, and duplicate-id rows', async () => {
    const valid = { local_id: 7, kind: 'GOOD', source: 'TASK', duration_min: null, points_earned: 5, stars_delta: 1, logged_at: 100, local_date: '2026-01-01', week_start: null };
    await expect(restoreLegacyActivityMirror(validDb(), 1, [{ ...valid, points_earned: undefined }]))
      .rejects.toThrow('Invalid legacy activity field: points_earned');
    await expect(restoreLegacyActivityMirror(validDb(), 1, [{ ...valid, kind: ' ' }]))
      .rejects.toThrow('Invalid legacy activity row');
    await expect(restoreLegacyActivityMirror(validDb(), 1, [valid, { ...valid }]))
      .rejects.toThrow('Duplicate legacy activity ids');
    await expect(restoreLegacyActivityMirror(validDb(), 1, [{ ...valid, source: ' TASK ' }]))
      .rejects.toThrow('Invalid legacy activity row');

    await expect(restoreLegacyActivityMirror(validDb(), 1, [{ ...valid, local_id: 0 }]))
      .rejects.toThrow('Invalid legacy activity row');
    await expect(restoreLegacyActivityMirror(validDb(), 1, [{ ...valid, duration_min: -1 }]))
      .rejects.toThrow('Invalid legacy activity row');
    await expect(restoreLegacyActivityMirror(validDb(), 1, [{ ...valid, stars_delta: -1_000_000_000_001 }]))
      .rejects.toThrow('Invalid legacy activity row');
    await expect(restoreLegacyActivityMirror(validDb(), 1, [{ ...valid, points_earned: '5' }]))
      .rejects.toThrow('Invalid legacy activity field: points_earned');
    await expect(restoreLegacyActivityMirror(validDb(), 1, [{ ...valid, week_start: 'not-a-date' }]))
      .rejects.toThrow('Invalid legacy activity row');
    await expect(restoreLegacyActivityMirror(validDb(), 1, [{ ...valid, local_date: 'not-a-date', week_start: null }]))
      .rejects.toThrow('Invalid legacy activity row');
    await expect(restoreLegacyActivityMirror(validDb(), 1, [{ ...valid, note: 'x'.repeat(1_048_577) }]))
      .rejects.toThrow('Invalid legacy activity row');
  });

  test('blocks cross-account legacy ids and refuses unsafe id remapping', async () => {
    const valid = { local_id: 7, kind: 'GOOD', source: 'TASK', duration_min: null, points_earned: 5, stars_delta: 1, logged_at: 100, local_date: '2026-01-01', week_start: null };
    const conflictDb = validDb();
    conflictDb.getAllAsync.mockImplementation(async (sql: string) => sql.includes('WHERE id IN') ? [{ id: 7 }] : []);
    await expect(restoreLegacyActivityMirror(conflictDb, 1, [valid])).rejects.toThrow('Legacy activity restore conflicts with another local account');

    const overflowDb = validDb();
    overflowDb.getAllAsync.mockImplementation(async (sql: string) => sql.includes('WHERE id IN') ? [{ id: 7 }] : []);
    overflowDb.getFirstAsync.mockResolvedValue({ max_id: Number.MAX_SAFE_INTEGER });
    await expect(restoreLegacyActivityMirror(overflowDb, 1, [valid], undefined, undefined, true))
      .rejects.toThrow('Legacy activity id remap exceeds SQLite integer safety');

    const minimal = validDb();
    (minimal as any).withExclusiveTransactionAsync = undefined;
    await expect(restoreLegacyActivityMirror(minimal, 1, [valid])).rejects.toThrow('Exclusive SQLite restore transaction unavailable');

    const childConflict = validDb();
    childConflict.getAllAsync.mockImplementation(async (sql: string) => sql.includes('JOIN challenges parent') ? [{ id: 13 }] : []);
    await expect(restoreUserDataBackup(childConflict, 1, populatedPayload())).rejects.toThrow('another local account');
  });
});
