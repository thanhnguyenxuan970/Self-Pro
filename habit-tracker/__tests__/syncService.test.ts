const mockGetSession = jest.fn();
const mockSignInWithIdToken = jest.fn();
const mockUpsert = jest.fn();
const mockDeleteIn = jest.fn().mockResolvedValue({ error: null });
const mockDelete = jest.fn(() => ({ in: mockDeleteIn }));
const mockLegacyActivityRange = jest.fn().mockResolvedValue({ data: [], error: null });
const mockLegacyPage = (response: { data: unknown; error: unknown }) => {
  const data = Array.isArray(response.data)
    ? response.data.map(row => (
      row && typeof row === 'object' && !('id' in row) && 'local_id' in row
        ? { ...row, id: (row as { local_id: unknown }).local_id }
        : row
    ))
    : response.data;
  mockLegacyActivityRange
    .mockResolvedValueOnce({ ...response, data })
    .mockResolvedValueOnce({ data: [], error: null });
};
const mockLegacyActivityOrder = jest.fn(() => ({ range: mockLegacyActivityRange }));
const mockLegacyActivityEq = jest.fn(() => ({ order: mockLegacyActivityOrder }));
const mockLegacyActivityGt = jest.fn(() => ({ order: mockLegacyActivityOrder }));
const mockLegacyActivitySelect = jest.fn(() => ({ gt: mockLegacyActivityGt, order: mockLegacyActivityOrder }));
const mockSelect = jest.fn((_columns: string) => mockLegacyActivitySelect());
const mockRpc = jest.fn(async (name: string, args?: any): Promise<{ data: unknown; error: unknown | null }> => {
  if (name === 'save_my_data_backup_v2') return { data: 1, error: null };
  if (name === 'restore_my_data_backup_v2') return { data: { payload: null, revision: 0 }, error: null };
  if (name === 'append_my_activity_rows') {
    return { data: (args?.p_activity_rows ?? []).map((row: any) => ({ activity_key: row.activity_key, local_id: row.local_id })), error: null };
  }
  return { data: null, error: null };
});
const mockFrom = jest.fn(() => ({
  upsert: mockUpsert,
  delete: mockDelete,
  select: mockSelect,
}));
const mockConfigure = jest.fn();
const mockGetTokens = jest.fn();
const mockSignInSilently = jest.fn();
const mockSignOut = jest.fn().mockResolvedValue({ error: null });
const mockGetDb = jest.fn();
const mockStorageGetItem = jest.fn();
const mockStorageSetItem = jest.fn();
const mockStorageRemoveItem = jest.fn();
const mockStorageGetAllKeys = jest.fn();
const mockStorageMultiRemove = jest.fn();

const freshSession = (email: string, googleSub = 'google-sub') => ({
  user: { email, identities: [{ provider: 'google', identity_data: { sub: googleSub } }] },
  access_token: `cached-${email}`,
  expires_at: Math.floor(Date.now() / 1000) + 300,
});

const successfulTokenResponse = (email = 'user@example.com', googleSub = 'google-sub') => ({
  data: {
    user: freshSession(email, googleSub).user,
    session: freshSession(email, googleSub),
  },
  error: null,
});

jest.mock('../src/api/supabase', () => ({
  supabase: {
    auth: { getSession: mockGetSession, signInWithIdToken: mockSignInWithIdToken, signOut: mockSignOut },
    from: mockFrom,
    rpc: mockRpc,
  },
}));

jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: { configure: mockConfigure, getTokens: mockGetTokens, signInSilently: mockSignInSilently },
  isNoSavedCredentialFoundResponse: (r: { type: string }) => r?.type === 'noSavedCredentialFound',
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: mockStorageGetItem,
  setItem: mockStorageSetItem,
  removeItem: mockStorageRemoveItem,
  getAllKeys: mockStorageGetAllKeys,
  multiRemove: mockStorageMultiRemove,
}));

jest.mock('../src/db/client', () => ({ getDb: mockGetDb }));

import * as Sentry from '@sentry/react-native';
import {
  ensureSupabaseSession,
  withSupabaseSession,
  clearBackupRestoreBlocked,
  markBackupRestoreBlocked,
  refreshSupabaseSessionForAccount,
  resetSyncCursors,
  syncCurrentUserToSupabase,
  pauseAccountSync,
  readSocialProfile,
  restoreUserDataIfNeeded,
  restoreLifetimeStarsFromSupabase,
  runAccountSync,
  signInWithGoogleToken,
  cancelSupabaseSessionRestore,
  syncToSupabase,
  syncUserStreak,
  resetUserProgressInSupabase,
  deleteUserFromSupabase,
} from '../src/api/syncService';
import { isCloudBackupPayload } from '../src/lib/userDataBackup';
import { THANGUYENXUAN_EMAIL } from '../src/lib/accountActivityBoundary';
import { enqueuePendingActivityDeletes, readPendingActivityDeletes } from '../src/game/pendingActivityDeletes';
import { PendingActivityDeleteTestDb } from './helpers/pendingActivityDeleteDb';

describe('restoreUserDataIfNeeded', () => {
  const emptyBackupPayload = (overrides: Record<string, unknown> = {}) => ({
    schema_version: 1,
    user: null,
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
    ...overrides,
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRpc.mockReset();
    mockRpc.mockImplementation(async (name: string, args?: { p_activity_rows?: Array<{ activity_key?: unknown; local_id?: unknown }> }) => {
      if (name === 'save_my_data_backup_v2') return { data: 1, error: null };
      if (name === 'restore_my_data_backup_v2') return { data: { payload: null, revision: 0 }, error: null };
      if (name === 'append_my_activity_rows') {
        return { data: (args?.p_activity_rows ?? []).map(row => ({ activity_key: row.activity_key, local_id: row.local_id })), error: null };
      }
      return { data: null, error: null };
    });
    mockStorageGetItem.mockReset();
    mockStorageSetItem.mockReset();
    mockDeleteIn.mockReset();
    mockDeleteIn.mockResolvedValue({ error: null });
  mockStorageRemoveItem.mockReset();
  mockStorageGetAllKeys.mockReset();
  mockStorageMultiRemove.mockReset();
    await clearBackupRestoreBlocked('user@example.com');
    mockStorageRemoveItem.mockClear();
    mockLegacyActivityOrder.mockReset();
    mockLegacyActivityOrder.mockImplementation(() => ({ range: mockLegacyActivityRange }));
    mockLegacyActivityRange.mockReset();
    mockLegacyActivityRange.mockResolvedValue({ data: [], error: null });
    mockGetSession.mockResolvedValue({ data: { session: freshSession('user@example.com') }, error: null });
  });

  it('does not block an existing local account when startup cloud restore is unavailable', async () => {
    mockStorageGetItem.mockImplementation(async (key: string) => (
      key === 'habit_sync_backup_restore_blocked:user@example.com' ? '1' : null
    ));
    mockRpc.mockImplementation(async (name: string) => (
      name === 'restore_my_data_backup_v2'
        ? { data: null, error: { message: 'temporary network failure' } }
        : { data: null, error: null }
    ));
    const db = {
      getFirstAsync: jest.fn(async (sql: string) => {
        if (sql.includes('COUNT(*)') && sql.includes('activity_log')) return { count: 1 };
        if (sql.includes('COUNT(*)')) return { count: 0 };
        return {
          username: 'me', timezone: 'Asia/Ho_Chi_Minh', carry_debt: 0, currency: 'VND',
          last_seen_week_start: null, lifetime_stars: 1, current_tier_id: 1,
          treat_stars: 0, treat_stars_lifetime: 0, value_per_star: 1000,
          penalty_hits_treats: 1, notification_time: null, notification_time_2: null,
          notification_time_3: null,
        };
      }),
      getAllAsync: jest.fn().mockResolvedValue([]),
      runAsync: jest.fn(),
      withTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
      withExclusiveTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
    };
    mockGetDb.mockResolvedValue(db);

    await expect(restoreUserDataIfNeeded(1, 'user@example.com', 'google-sub')).resolves.toBe('not_needed');
    expect(mockRpc).not.toHaveBeenCalledWith('restore_my_data_backup_v2');
    expect(mockStorageSetItem).not.toHaveBeenCalledWith('habit_sync_backup_restore_blocked:user@example.com', '1');
  });

  it('keeps interactive restore probes bounded for an unblocked populated account', async () => {
    const presenceQueries: string[] = [];
    const db = {
      getFirstAsync: jest.fn(async (sql: string) => {
        presenceQueries.push(sql);
        if (sql.includes('COUNT(*)') && sql.includes('activity_log')) return { count: 1 };
        if (sql.includes('COUNT(*)')) return { count: 0 };
        return null;
      }),
      getAllAsync: jest.fn().mockResolvedValue([]),
      runAsync: jest.fn(),
      withTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
      withExclusiveTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
    };
    mockStorageGetItem.mockResolvedValue(null);
    mockGetDb.mockResolvedValue(db);

    await expect(
      restoreUserDataIfNeeded(1, 'user@example.com', 'google-sub', undefined, true, undefined, true),
    ).resolves.toBe('not_needed');

    expect(mockRpc).not.toHaveBeenCalledWith('restore_my_data_backup_v2');
    expect(presenceQueries).toHaveLength(13);
    expect(presenceQueries.every(sql => sql.includes('LIMIT 1'))).toBe(true);
  });

  it('does not let retained pre-cutoff activity suppress restore', async () => {
    const email = THANGUYENXUAN_EMAIL;
    const db = {
      getFirstAsync: jest.fn(async (sql: string, params?: unknown[]) => {
        if (sql.includes('COUNT(*)') && sql.includes('activity_log')) {
          // The database still contains an audit row from before the account's
          // real-activity boundary. It must not make the local account look
          // populated when the restore probe applies that same boundary.
          return params?.[1] === '2026-07-06' ? { count: 0 } : { count: 1 };
        }
        if (sql.includes('COUNT(*)')) return { count: 0 };
        return null;
      }),
      getAllAsync: jest.fn().mockResolvedValue([]),
      runAsync: jest.fn(),
      withTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
      withExclusiveTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
    };
    mockGetSession.mockResolvedValue({ data: { session: freshSession(email) }, error: null });
    mockGetDb.mockResolvedValue(db);

    await expect(
      restoreUserDataIfNeeded(1, email, 'google-sub', undefined, true, undefined, true),
    ).resolves.toBe('empty');

    expect(mockRpc).toHaveBeenCalledWith('restore_my_data_backup_v2');
  });

  it('does not complete restore after the account session is invalidated during probes', async () => {
    let releaseProbes!: () => void;
    const probesReleased = new Promise<void>(resolve => { releaseProbes = resolve; });
    let signalProbeStarted!: () => void;
    const probeStarted = new Promise<void>(resolve => { signalProbeStarted = resolve; });
    let signaled = false;
    let active = true;
    const db = {
      getFirstAsync: jest.fn(async (sql: string) => {
        if (!sql.includes('COUNT(*)')) return null;
        if (!signaled) {
          signaled = true;
          signalProbeStarted();
        }
        await probesReleased;
        return { count: 1 };
      }),
      getAllAsync: jest.fn().mockResolvedValue([]),
      runAsync: jest.fn(),
      withTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
      withExclusiveTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
    };
    mockGetDb.mockResolvedValue(db);

    const restore = restoreUserDataIfNeeded(
      1,
      'user@example.com',
      'google-sub',
      () => active,
      true,
      undefined,
      true,
    );
    await probeStarted;
    active = false;
    releaseProbes();

    await expect(restore).resolves.toBe('unavailable');
    expect(mockRpc).not.toHaveBeenCalledWith('restore_my_data_backup_v2');
  });

  it('advances the local backup revision when an existing snapshot matches cloud', async () => {
    const payload = emptyBackupPayload({
      categories: [{ id: 1, name: 'Health', icon: '🏃', sort_order: 1, archived: 0 }],
    });
    mockStorageGetItem.mockImplementation(async (key: string) => (
      key === 'habit_sync_backup_revision:user@example.com' ? '45' : null
    ));
    mockRpc.mockImplementation(async (name: string) => (
      name === 'restore_my_data_backup_v2'
        ? { data: { payload, revision: 48 }, error: null }
        : { data: null, error: null }
    ));
    mockSignInSilently.mockResolvedValue({ type: 'success', data: {} });
    mockGetTokens.mockResolvedValue({ idToken: 'fresh-google-id-token' });
    mockSignInWithIdToken.mockResolvedValue(successfulTokenResponse());
    type ExistingSnapshotTestDb = {
      getFirstAsync: jest.Mock;
      getAllAsync: jest.Mock;
      runAsync: jest.Mock;
      withExclusiveTransactionAsync: jest.Mock;
    };
    const db: ExistingSnapshotTestDb = {
      getFirstAsync: jest.fn(async (sql: string) => {
        if (sql.includes('COUNT(*)')) return { count: sql.includes('activity_log') ? 1 : 0 };
        return null;
      }),
      getAllAsync: jest.fn(async (sql: string) => (
        sql.includes('FROM categories') ? payload.categories : []
      )),
      runAsync: jest.fn(),
      withExclusiveTransactionAsync: jest.fn(async (fn: (transactionDb: ExistingSnapshotTestDb) => Promise<void>) => fn(db)),
    };
    mockGetDb.mockResolvedValue(db);

    await expect(restoreUserDataIfNeeded(1, 'user@example.com', 'google-sub', undefined, true))
      .resolves.toBe('not_needed');

    expect(mockStorageSetItem).toHaveBeenCalledWith('habit_sync_backup_revision:user@example.com', '48');
  });

  it('does not advance the revision when an existing snapshot differs from cloud', async () => {
    const localPayload = emptyBackupPayload({
      categories: [{ id: 1, name: 'Health', icon: '🏃', sort_order: 1, archived: 0 }],
    });
    const cloudPayload = emptyBackupPayload({
      categories: [{ id: 1, name: 'Health', icon: '🧘', sort_order: 1, archived: 0 }],
    });
    mockStorageGetItem.mockImplementation(async (key: string) => (
      key === 'habit_sync_backup_revision:user@example.com' ? '45' : null
    ));
    mockRpc.mockImplementation(async (name: string) => (
      name === 'restore_my_data_backup_v2'
        ? { data: { payload: cloudPayload, revision: 48 }, error: null }
        : { data: null, error: null }
    ));
    type ExistingSnapshotTestDb = {
      getFirstAsync: jest.Mock;
      getAllAsync: jest.Mock;
      runAsync: jest.Mock;
      withExclusiveTransactionAsync: jest.Mock;
    };
    const db: ExistingSnapshotTestDb = {
      getFirstAsync: jest.fn(async (sql: string) => {
        if (sql.includes('COUNT(*)')) return { count: sql.includes('activity_log') ? 1 : 0 };
        return null;
      }),
      getAllAsync: jest.fn(async (sql: string) => (
        sql.includes('FROM categories') ? localPayload.categories : []
      )),
      runAsync: jest.fn(),
      withExclusiveTransactionAsync: jest.fn(async (fn: (transactionDb: ExistingSnapshotTestDb) => Promise<void>) => fn(db)),
    };
    mockGetDb.mockResolvedValue(db);

    await expect(restoreUserDataIfNeeded(1, 'user@example.com', 'google-sub', undefined, true))
      .resolves.toBe('unavailable');

    expect(mockStorageSetItem).not.toHaveBeenCalledWith('habit_sync_backup_revision:user@example.com', '48');
    expect(mockStorageSetItem).toHaveBeenCalledWith('habit_sync_backup_restore_blocked:user@example.com', '1');
  });

  it('restores a reinstall from the same Google account without losing habits, heatmap, challenges, or rank state', async () => {
    const payload = {
      schema_version: 1,
      user: {
        username: 'me',
        timezone: 'Asia/Bangkok',
        carry_debt: 0,
        currency: 'VND',
        lifetime_stars: 42,
        current_tier_id: 4,
      },
      categories: [{ id: 11, name: 'Health', icon: '🏃', sort_order: 1, archived: 0 }],
      task_types: [{
        id: 21, name: 'Running', kind: 'GOOD', is_time_based: 1,
        base_points: 10, star_penalty: 50, category_id: 11, icon: '🏃',
        archived: 0, sort_order: 1, is_pinned: 1, is_template: 1,
      }],
      activity_log: [{
        id: 31, task_type_id: 21, kind: 'GOOD', duration_min: 30,
        points_earned: 10, stars_delta: 2, source: 'TASK', logged_at: 1,
        local_date: '2026-08-20', week_start: '2026-08-17', note: null,
        is_backfill: 0, is_clock_suspect: 0,
      }],
      daily_summary: [{ id: 41, local_date: '2026-08-20', total_points: 10, bonus_star_awarded: 0, streak_count: 1 }],
      weekly_summary: [{
        id: 51, week_start: '2026-08-17', total_points: 10, weekly_stars: 2,
        peak_stars: 2, current_tier_id: 4, start_debt: 0, finalized: 0,
      }],
      reward_unlocks: [],
      fund_transactions: [],
      streak_freezes: [],
      treats: [],
      treat_history: [],
      challenges: [{
        id: 61, name: 'Run every day', task_type_id: 21, mode: 'streak',
        target_days: 7, weekly_target: null, total_weeks: null,
        start_date: '2026-08-20', status: 'active', freezes_left: 1,
        freeze_used: 0, streak_current: 1, completed_at: null,
        notifications_enabled: 1, notification_id: null,
        min_duration: 20, min_count: 1, created_at: '2026-08-20 00:00:00',
      }],
      challenge_log: [],
      challenge_days: [{ id: 71, challenge_id: 61, local_date: '2026-08-20', logged_at: 1 }],
      achievements: [],
      milestone_stars: [],
      boost_events: [],
    };
    mockRpc.mockImplementation(async (name: string) =>
      name === 'restore_my_data_backup_v2'
        ? { data: { payload, revision: 7 }, error: null }
        : { data: null, error: null });
    const writes: Array<[string, unknown[] | undefined]> = [];
    const db = {
      getFirstAsync: jest.fn(async (sql: string) => {
        if (sql.includes('COUNT(*)') && sql.includes('activity_log')) return { count: 0 };
        if (sql.includes('COUNT(*)') && sql.includes('challenges')) return { count: 0 };
        return null;
      }),
      getAllAsync: jest.fn().mockResolvedValue([]),
      runAsync: jest.fn(async (sql: string, params?: unknown[]) => {
        writes.push([sql, params]);
        return { changes: 1, lastInsertRowId: 1 };
      }),
      withTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
      withExclusiveTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
    };
    mockGetDb.mockResolvedValue(db);

    await restoreUserDataIfNeeded(1, 'user@example.com', 'google-sub');

    expect(mockStorageSetItem).toHaveBeenCalledWith('habit_sync_backup_revision:user@example.com', '7');
    expect(writes.some(([sql]) => sql.includes('INSERT OR REPLACE INTO categories'))).toBe(true);
    expect(writes.some(([sql]) => sql.includes('INSERT OR REPLACE INTO task_types'))).toBe(true);
    expect(writes.some(([sql]) => sql.includes('INSERT OR REPLACE INTO activity_log'))).toBe(true);
    expect(writes.some(([sql]) => sql.includes('INSERT OR REPLACE INTO challenges'))).toBe(true);
    expect(writes.some(([sql]) => sql.includes('INSERT OR REPLACE INTO challenge_days'))).toBe(true);
    expect(writes.some(([sql]) => sql.includes('UPDATE users SET'))).toBe(true);
  });

  it('rebuilds heatmap summaries from the legacy remote activity mirror when no snapshot exists', async () => {
    mockRpc.mockImplementation(async (name: string) =>
      name === 'restore_my_data_backup_v2'
        ? { data: { payload: null, revision: 0 }, error: null }
        : name === 'sync_lifetime_stars'
        ? { data: 180, error: null }
        : { data: null, error: null });
    mockLegacyPage({
      data: [
        {
          local_id: 11, kind: 'GOOD', duration_min: 20, points_earned: 10, stars_delta: 2,
          source: 'TASK', logged_at: 1, local_date: '2026-08-20', week_start: '2026-08-17',
        },
        {
          local_id: 12, kind: 'GOOD', duration_min: null, points_earned: 0, stars_delta: 1,
          source: 'DAILY_BONUS', logged_at: 2, local_date: '2026-08-21',
        },
      ],
      error: null,
    });
    const writes: string[] = [];
    let weeklyWriteParams: unknown[] | undefined;
    const db = {
      getFirstAsync: jest.fn(async (sql: string) => sql.includes('MAX(id)') ? { max_id: 12 } : null),
      getAllAsync: jest.fn().mockResolvedValue([]),
      runAsync: jest.fn(async (sql: string, params?: unknown[]) => {
        writes.push(sql);
        if (sql.includes('INSERT OR REPLACE INTO weekly_summary')) weeklyWriteParams = params;
        return { changes: 1, lastInsertRowId: 1 };
      }),
      withTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
      withExclusiveTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
    };
    mockGetDb.mockResolvedValue(db);

    await expect(restoreUserDataIfNeeded(1, 'user@example.com', 'google-sub')).resolves.toBe('restored');

    expect(mockLegacyActivityEq).not.toHaveBeenCalled();
    expect(mockLegacyActivityGt).toHaveBeenCalledWith('id', 0);
    expect(mockSelect.mock.calls.some(([columns]) => String(columns).includes('activity_key'))).toBe(false);
    expect(writes.filter(sql => sql.includes('INSERT OR REPLACE INTO activity_log'))).toHaveLength(1);
    expect(writes).toContainEqual(expect.stringContaining('INSERT OR REPLACE INTO daily_summary'));
    expect(writes).toContainEqual(expect.stringContaining('INSERT OR REPLACE INTO weekly_summary'));
    expect(weeklyWriteParams).toEqual(expect.arrayContaining(['2026-08-17']));
  });

  it('continues keyset pages and excludes legacy login telemetry from restored heatmap rows', async () => {
    mockRpc.mockImplementation(async (name: string) => name === 'restore_my_data_backup_v2'
      ? { data: { payload: null, revision: 0 }, error: null }
      : name === 'sync_lifetime_stars'
      ? { data: 180, error: null }
      : { data: null, error: null });
    mockLegacyActivityRange
      .mockResolvedValueOnce({
        data: [{
          id: 11,
          local_id: 11, kind: 'GOOD', duration_min: 20, points_earned: 10, stars_delta: 2,
          source: 'TASK', logged_at: 1, local_date: '2026-08-20', week_start: '2026-08-17',
        }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [{
          id: 12,
          local_id: 12, kind: 'LOGIN', duration_min: null, points_earned: 0, stars_delta: 0,
          source: 'LOGIN', logged_at: 2, local_date: '2026-08-21', week_start: '2026-08-17',
        }],
        error: null,
      })
      .mockResolvedValueOnce({ data: [], error: null });
    const writes: string[] = [];
    const db = {
      getFirstAsync: jest.fn(async (sql: string) => sql.includes('COUNT(*)') ? { count: 0 } : null),
      getAllAsync: jest.fn().mockResolvedValue([]),
      runAsync: jest.fn(async (sql: string) => {
        writes.push(sql);
        return { changes: 1, lastInsertRowId: 1 };
      }),
      withTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
      withExclusiveTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
    };
    mockGetDb.mockResolvedValue(db);

    await expect(restoreUserDataIfNeeded(1, 'user@example.com', 'google-sub')).resolves.toBe('restored');

    expect(mockLegacyActivityGt.mock.calls).toEqual([
      ['id', 0],
      ['id', 11],
      ['id', 12],
    ]);
    expect(writes.filter(sql => sql.includes('INSERT OR REPLACE INTO activity_log'))).toHaveLength(1);
  });

  it('fails closed when the legacy activity page is null without an API error', async () => {
    mockRpc.mockImplementation(async (name: string) => name === 'restore_my_data_backup_v2'
      ? { data: { payload: null, revision: 0 }, error: null }
      : name === 'sync_lifetime_stars'
      ? { data: 0, error: null }
      : { data: null, error: null });
    mockLegacyActivityRange.mockResolvedValueOnce({ data: null, error: null });
    const db = {
      getFirstAsync: jest.fn(async (sql: string) => sql.includes('COUNT(*)') ? { count: 0 } : null),
      getAllAsync: jest.fn().mockResolvedValue([]),
      runAsync: jest.fn(),
      withTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
      withExclusiveTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
    };
    mockGetDb.mockResolvedValue(db);

    await expect(restoreUserDataIfNeeded(1, 'user@example.com', 'google-sub')).resolves.toBe('unavailable');
    expect(db.runAsync).not.toHaveBeenCalled();
    expect(mockStorageSetItem).toHaveBeenCalledWith('habit_sync_backup_restore_blocked:user@example.com', '1');
  });

  it('blocks an empty legacy restore when the server still reports rank progress', async () => {
    mockRpc.mockImplementation(async (name: string) => {
      if (name === 'restore_my_data_backup_v2') return { data: { payload: null, revision: 0 }, error: null };
      if (name === 'sync_lifetime_stars') return { data: 264, error: null };
      return { data: null, error: null };
    });
    const db = {
      getFirstAsync: jest.fn(async (sql: string) => sql.includes('MAX(id)') ? { max_id: 41 } : null),
      getAllAsync: jest.fn().mockResolvedValue([]),
      runAsync: jest.fn(),
      withTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
      withExclusiveTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
    };
    mockGetDb.mockResolvedValue(db);

    await expect(restoreUserDataIfNeeded(1, 'user@example.com', 'google-sub')).resolves.toBe('unavailable');
    expect(db.runAsync).not.toHaveBeenCalled();
    expect(mockStorageSetItem).toHaveBeenCalledWith('habit_sync_backup_restore_blocked:user@example.com', '1');
    expect(mockStorageSetItem).not.toHaveBeenCalledWith('habit_sync_backup_revision:user@example.com', expect.anything());
  });

  it('fails closed when legacy activity exists but the server rank total is missing', async () => {
    mockRpc.mockImplementation(async (name: string) => {
      if (name === 'restore_my_data_backup_v2') return { data: { payload: null, revision: 0 }, error: null };
      if (name === 'sync_lifetime_stars') return { data: null, error: null };
      return { data: null, error: null };
    });
    mockLegacyPage({
      data: [{
        local_id: 11,
        kind: 'GOOD',
        duration_min: 20,
        points_earned: 10,
        stars_delta: 2,
        source: 'TASK',
        logged_at: 1,
        local_date: '2026-08-20',
        week_start: '2026-08-17',
      }],
      error: null,
    });
    const db = {
      getFirstAsync: jest.fn(async (sql: string) => sql.includes('COUNT(*)') ? { count: 0 } : null),
      getAllAsync: jest.fn().mockResolvedValue([]),
      runAsync: jest.fn(),
      withTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
      withExclusiveTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
    };
    mockGetDb.mockResolvedValue(db);

    await expect(restoreUserDataIfNeeded(1, 'user@example.com', 'google-sub')).resolves.toBe('unavailable');
    expect(db.runAsync).not.toHaveBeenCalled();
    expect(mockStorageSetItem).toHaveBeenCalledWith('habit_sync_backup_restore_blocked:user@example.com', '1');
  });

  it('blocks a cloud snapshot that contains stars but no persisted progress rows', async () => {
    mockRpc.mockImplementation(async (name: string) => {
      if (name === 'restore_my_data_backup_v2') {
        return {
          data: {
            payload: emptyBackupPayload({ user: { lifetime_stars: 264, current_tier_id: 6 } }),
            revision: 1,
          },
          error: null,
        };
      }
      if (name === 'sync_lifetime_stars') return { data: 264, error: null };
      return { data: null, error: null };
    });
    const db = {
      getFirstAsync: jest.fn(async (sql: string) => sql.includes('COUNT(*)') ? { count: 0 } : null),
      getAllAsync: jest.fn().mockResolvedValue([]),
      runAsync: jest.fn(),
      withTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
      withExclusiveTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
    };
    mockGetDb.mockResolvedValue(db);

    await expect(restoreUserDataIfNeeded(1, 'user@example.com', 'google-sub')).resolves.toBe('unavailable');
    expect(db.runAsync).not.toHaveBeenCalled();
    expect(mockStorageSetItem).toHaveBeenCalledWith('habit_sync_backup_restore_blocked:user@example.com', '1');
    expect(mockStorageSetItem).not.toHaveBeenCalledWith('habit_sync_backup_revision:user@example.com', expect.anything());
  });

  it('restores a treat-only snapshot instead of misclassifying it as lost progress', async () => {
    mockRpc.mockImplementation(async (name: string) => name === 'restore_my_data_backup_v2'
      ? {
          data: {
            payload: emptyBackupPayload({
              user: {
                lifetime_stars: 0,
                current_tier_id: null,
                treat_stars: 20,
                treat_stars_lifetime: 20,
              },
            }),
            revision: 2,
          },
          error: null,
        }
      : { data: null, error: null });
    const writes: Array<{ sql: string; params?: unknown[] }> = [];
    const db = {
      getFirstAsync: jest.fn(async (sql: string) => sql.includes('COUNT(*)') ? { count: 0 } : null),
      getAllAsync: jest.fn().mockResolvedValue([]),
      runAsync: jest.fn(async (sql: string, params?: unknown[]) => {
        writes.push({ sql, params });
        return { changes: 1, lastInsertRowId: 1 };
      }),
      withTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
      withExclusiveTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
    };
    mockGetDb.mockResolvedValue(db);

    await expect(restoreUserDataIfNeeded(1, 'user@example.com', 'google-sub')).resolves.toBe('restored');

    expect(mockLegacyActivityGt).not.toHaveBeenCalled();
    const userWrite = writes.find(write => write.sql.includes('UPDATE users SET'));
    expect(userWrite?.params).toEqual(expect.arrayContaining([20]));
    expect(mockStorageSetItem).toHaveBeenCalledWith('habit_sync_backup_revision:user@example.com', '2');
  });

  it('blocks a ranked partial snapshot instead of advancing its revision over missing activity', async () => {
    mockRpc.mockImplementation(async (name: string) => name === 'restore_my_data_backup_v2'
      ? {
          data: {
            payload: emptyBackupPayload({
              user: { lifetime_stars: 264, current_tier_id: 6 },
              task_types: [{ id: 11, name: 'Running', kind: 'GOOD' }],
            }),
            revision: 8,
          },
          error: null,
        }
      : { data: null, error: null });
    const db = {
      getFirstAsync: jest.fn(async (sql: string) => sql.includes('COUNT(*)') ? { count: 0 } : null),
      getAllAsync: jest.fn().mockResolvedValue([]),
      runAsync: jest.fn(),
      withTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
      withExclusiveTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
    };
    mockGetDb.mockResolvedValue(db);

    await expect(restoreUserDataIfNeeded(1, 'user@example.com', 'google-sub')).resolves.toBe('unavailable');
    expect(db.runAsync).not.toHaveBeenCalled();
    expect(mockLegacyActivityGt).not.toHaveBeenCalled();
    expect(mockStorageSetItem).toHaveBeenCalledWith('habit_sync_backup_restore_blocked:user@example.com', '1');
    expect(mockStorageSetItem).not.toHaveBeenCalledWith('habit_sync_backup_revision:user@example.com', '8');
  });

  it('falls back to the legacy activity mirror when a ranked cloud snapshot has no history', async () => {
    mockRpc.mockImplementation(async (name: string) =>
      name === 'restore_my_data_backup_v2'
        ? {
            data: {
              payload: emptyBackupPayload({ user: { lifetime_stars: 264, current_tier_id: 6 } }),
              revision: 4,
            },
            error: null,
          }
        : name === 'sync_lifetime_stars'
        ? { data: 260, error: null }
        : { data: null, error: null });
    mockLegacyPage({
      data: [{
        local_id: 41,
        kind: 'GOOD',
        duration_min: 20,
        points_earned: 10,
        stars_delta: 2,
        source: 'TASK',
        logged_at: 1,
        local_date: '2026-08-20',
        week_start: '2026-08-17',
        note: null,
      }],
      error: null,
    });
    const writes: string[] = [];
    const db = {
      getFirstAsync: jest.fn(async (sql: string) => sql.includes('MAX(id)') ? { max_id: 41 } : null),
      getAllAsync: jest.fn().mockResolvedValue([]),
      runAsync: jest.fn(async (sql: string) => {
        writes.push(sql);
        return { changes: 1, lastInsertRowId: 1 };
      }),
      withTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
      withExclusiveTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
    };
    mockGetDb.mockResolvedValue(db);

    await expect(restoreUserDataIfNeeded(1, 'user@example.com', 'google-sub')).resolves.toBe('restored');

    expect(mockLegacyActivityGt).toHaveBeenCalledWith('id', 0);
    expect(writes).toContainEqual(expect.stringContaining('INSERT OR REPLACE INTO activity_log'));
    expect(writes).toContainEqual(expect.stringContaining('INSERT OR REPLACE INTO daily_summary'));
    expect(writes).toContainEqual(expect.stringContaining('INSERT OR REPLACE INTO weekly_summary'));
    expect(mockStorageSetItem).toHaveBeenCalledWith('habit_sync_backup_revision:user@example.com', '4');
    expect(mockStorageRemoveItem).toHaveBeenCalledWith('habit_sync_backup_restore_blocked:user@example.com');
  });

  it('sets the restored local rank to the server-derived total before normal sync can re-upload the mirror', async () => {
    mockRpc.mockImplementation(async (name: string) => {
      if (name === 'restore_my_data_backup_v2') {
        return {
          data: {
            payload: emptyBackupPayload({ user: { lifetime_stars: 264, current_tier_id: 6 } }),
            revision: 4,
          },
          error: null,
        };
      }
      if (name === 'sync_lifetime_stars') return { data: 260, error: null };
      return { data: null, error: null };
    });
    mockLegacyPage({
      data: [{
        local_id: 41,
        kind: 'GOOD',
        duration_min: 20,
        points_earned: 10,
        stars_delta: 2,
        source: 'TASK',
        logged_at: 1,
        local_date: '2026-08-20',
        week_start: '2026-08-17',
        note: null,
      }],
      error: null,
    });
    const writes: Array<{ sql: string; params?: unknown[] }> = [];
    const db = {
      getFirstAsync: jest.fn(async (sql: string) => {
        if (sql.includes('COUNT(*)')) return { count: 0 };
        if (sql.includes('MAX(id)')) return { max_id: 41 };
        return null;
      }),
      getAllAsync: jest.fn(async (sql: string) => {
        if (sql.includes('FROM tiers')) return [{ id: 6, tier_order: 6, rank_name: 'Goated', stars_required: 256 }];
        return [];
      }),
      runAsync: jest.fn(async (sql: string, params?: unknown[]) => {
        writes.push({ sql, params });
        return { changes: 1, lastInsertRowId: 1 };
      }),
      withTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
      withExclusiveTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
    };
    mockGetDb.mockResolvedValue(db);

    await expect(restoreUserDataIfNeeded(1, 'user@example.com', 'google-sub')).resolves.toBe('restored');

    expect(mockRpc).toHaveBeenCalledWith('sync_lifetime_stars');
    expect(writes).toContainEqual({
      sql: 'UPDATE users SET lifetime_stars = ?, current_tier_id = ? WHERE id = ?',
      params: [260, 6, 1],
    });
  });

  it('preserves a higher local rank tier while reconciling restored stars', async () => {
    mockRpc.mockImplementation(async (name: string) => {
      if (name === 'restore_my_data_backup_v2') {
        return {
          data: {
            payload: emptyBackupPayload({ user: { lifetime_stars: 264, current_tier_id: 6 } }),
            revision: 4,
          },
          error: null,
        };
      }
      if (name === 'sync_lifetime_stars') return { data: 260, error: null };
      return { data: null, error: null };
    });
    mockLegacyPage({
      data: [{
        local_id: 41,
        kind: 'GOOD',
        duration_min: 20,
        points_earned: 10,
        stars_delta: 2,
        source: 'TASK',
        logged_at: 1,
        local_date: '2026-08-20',
        week_start: '2026-08-17',
        note: null,
      }],
      error: null,
    });
    const writes: Array<{ sql: string; params?: unknown[] }> = [];
    const db = {
      getFirstAsync: jest.fn(async (sql: string) => {
        if (sql.includes('COUNT(*)')) return { count: 0 };
        if (sql.includes('current_tier_id')) return { current_tier_id: 8 };
        if (sql.includes('positive_stars')) return { positive_stars: 0 };
        return null;
      }),
      getAllAsync: jest.fn(async (sql: string) => sql.includes('FROM tiers')
        ? [
            { id: 6, tier_order: 6, rank_name: 'Goated', stars_required: 256 },
            { id: 8, tier_order: 8, rank_name: 'Legend', stars_required: 1024 },
          ]
        : []),
      runAsync: jest.fn(async (sql: string, params?: unknown[]) => {
        writes.push({ sql, params });
        return { changes: 1, lastInsertRowId: 1 };
      }),
      withTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
      withExclusiveTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
    };
    mockGetDb.mockResolvedValue(db);

    await expect(restoreUserDataIfNeeded(1, 'user@example.com', 'google-sub')).resolves.toBe('restored');

    expect(writes).toContainEqual({
      sql: 'UPDATE users SET lifetime_stars = ?, current_tier_id = ? WHERE id = ?',
      params: [260, 8, 1],
    });
  });

  it('carries the cloud high-water tier through a legacy restore even when snapshot stars are zero', async () => {
    mockRpc.mockImplementation(async (name: string) => {
      if (name === 'restore_my_data_backup_v2') {
        return {
          data: {
            payload: emptyBackupPayload({ user: { lifetime_stars: 0, current_tier_id: 8 } }),
            revision: 4,
          },
          error: null,
        };
      }
      if (name === 'sync_lifetime_stars') return { data: 260, error: null };
      return { data: null, error: null };
    });
    mockLegacyPage({
      data: [{
        local_id: 41,
        kind: 'GOOD',
        duration_min: 20,
        points_earned: 10,
        stars_delta: 2,
        source: 'TASK',
        logged_at: 1,
        local_date: '2026-08-20',
        week_start: '2026-08-17',
        note: null,
      }],
      error: null,
    });
    const writes: Array<{ sql: string; params?: unknown[] }> = [];
    const db = {
      getFirstAsync: jest.fn(async (sql: string) => {
        if (sql.includes('COUNT(*)')) return { count: 0 };
        if (sql.includes('current_tier_id')) return { current_tier_id: null };
        if (sql.includes('positive_stars')) return { positive_stars: 0 };
        return null;
      }),
      getAllAsync: jest.fn(async (sql: string) => sql.includes('FROM tiers')
        ? [
            { id: 6, tier_order: 6, rank_name: 'Goated', stars_required: 256 },
            { id: 8, tier_order: 8, rank_name: 'Legend', stars_required: 1024 },
          ]
        : []),
      runAsync: jest.fn(async (sql: string, params?: unknown[]) => {
        writes.push({ sql, params });
        return { changes: 1, lastInsertRowId: 1 };
      }),
      withTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
      withExclusiveTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
    };
    mockGetDb.mockResolvedValue(db);

    await expect(restoreUserDataIfNeeded(1, 'user@example.com', 'google-sub')).resolves.toBe('restored');

    expect(writes).toContainEqual({
      sql: 'UPDATE users SET lifetime_stars = ?, current_tier_id = ? WHERE id = ?',
      params: [260, 8, 1],
    });
  });

  it('restores legacy history when the fresh local account only has a stale rank total', async () => {
    mockRpc.mockImplementation(async (name: string) =>
      name === 'restore_my_data_backup_v2'
        ? {
            data: {
              payload: emptyBackupPayload({ user: { lifetime_stars: 264, current_tier_id: 6 } }),
              revision: 4,
            },
            error: null,
          }
        : name === 'sync_lifetime_stars'
        ? { data: 260, error: null }
        : { data: null, error: null });
    mockLegacyPage({
      data: [{
        local_id: 42,
        kind: 'GOOD',
        duration_min: 20,
        points_earned: 10,
        stars_delta: 2,
        source: 'TASK',
        logged_at: 1,
        local_date: '2026-08-20',
        week_start: '2026-08-17',
        note: null,
      }],
      error: null,
    });
    const writes: Array<{ sql: string; params?: unknown[] }> = [];
    const db = {
      getFirstAsync: jest.fn(async (sql: string) => {
        if (sql.includes('COUNT(*)')) return { count: 0 };
        if (sql.includes('MAX(id)')) return { max_id: 42 };
        if (sql.includes('FROM users')) {
          return {
            username: 'me', timezone: 'Asia/Ho_Chi_Minh', carry_debt: 0, currency: 'VND',
            last_seen_week_start: null, lifetime_stars: 264, current_tier_id: 6,
            treat_stars: 0, treat_stars_lifetime: 0, value_per_star: 1000,
            penalty_hits_treats: 1, notification_time: null, notification_time_2: null,
            notification_time_3: null,
          };
        }
        return null;
      }),
      getAllAsync: jest.fn(async (sql: string) => sql.includes('FROM activity_log') ? [{ id: 42 }] : []),
      runAsync: jest.fn(async (sql: string, params?: unknown[]) => {
        writes.push({ sql, params });
        return { changes: 1, lastInsertRowId: 1 };
      }),
      withTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
      withExclusiveTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
    };
    mockGetDb.mockResolvedValue(db);

    await expect(restoreUserDataIfNeeded(1, 'user@example.com', 'google-sub')).resolves.toBe('restored');

    const activityWrite = writes.find(write => write.sql.includes('INSERT OR REPLACE INTO activity_log'));
    expect(activityWrite?.params?.[0]).toBeGreaterThan(42);
    expect(writes.map(write => write.sql)).toContainEqual(expect.stringContaining('INSERT OR REPLACE INTO daily_summary'));
    expect(writes.map(write => write.sql)).toContainEqual(expect.stringContaining('INSERT OR REPLACE INTO weekly_summary'));
  });

  it('fails closed when the server returns a non-null unsupported snapshot', async () => {
    mockRpc.mockImplementation(async (name: string) =>
      name === 'restore_my_data_backup_v2'
        ? { data: { payload: { schema_version: 999 }, revision: 3 }, error: null }
        : { data: null, error: null });
    const db = {
      getFirstAsync: jest.fn(async (sql: string) => sql.includes('COUNT(*)') ? { count: 0 } : null),
      getAllAsync: jest.fn().mockResolvedValue([]),
      runAsync: jest.fn(),
      withTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
      withExclusiveTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
    };
    mockGetDb.mockResolvedValue(db);

    await expect(restoreUserDataIfNeeded(1, 'user@example.com', 'google-sub')).resolves.toBe('unavailable');
    expect(db.runAsync).not.toHaveBeenCalled();
    expect(mockLegacyActivityEq).not.toHaveBeenCalled();
    expect(mockStorageSetItem).not.toHaveBeenCalledWith('habit_sync_backup_revision:user@example.com', '3');
    expect(mockStorageSetItem).toHaveBeenCalledWith('habit_sync_backup_restore_blocked:user@example.com', '1');
    expect(mockStorageSetItem).toHaveBeenCalledWith(
      'habit_sync_backup_restore_retryable:user@example.com',
      '0',
    );
  });

  it('allows a transiently blocked account to retry recovery without touching another account', async () => {
    let restoreBlocked = false;
    const blockedKey = 'habit_sync_backup_restore_blocked:user@example.com';
    const otherBlockedKey = 'habit_sync_backup_restore_blocked:other@example.com';
    mockStorageGetItem.mockImplementation(async (key: string) => (
      key === blockedKey && restoreBlocked ? '1' : null
    ));
    mockStorageSetItem.mockImplementation(async (key: string, value: string) => {
      if (key === blockedKey) restoreBlocked = value === '1';
    });
    mockStorageRemoveItem.mockImplementation(async (key: string) => {
      if (key === blockedKey) restoreBlocked = false;
    });
    let rpcCalls = 0;
    mockRpc.mockImplementation(async (name: string) => {
      if (name === 'sync_lifetime_stars') return { data: 0, error: null };
      if (name !== 'restore_my_data_backup_v2') return { data: null, error: null };
      rpcCalls += 1;
      return rpcCalls === 1
        ? { data: null, error: { message: 'temporary network failure' } }
        : { data: { payload: null, revision: 0 }, error: null };
    });
    const db = {
      getFirstAsync: jest.fn(async (sql: string) => sql.includes('COUNT(*)') ? { count: 0 } : null),
      getAllAsync: jest.fn().mockResolvedValue([]),
      runAsync: jest.fn(),
      withTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
      withExclusiveTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
    };
    mockGetDb.mockResolvedValue(db);

    await expect(restoreUserDataIfNeeded(1, 'user@example.com', 'google-sub')).resolves.toBe('unavailable');
    expect(restoreBlocked).toBe(true);
    expect(mockStorageSetItem).toHaveBeenCalledWith(
      'habit_sync_backup_restore_retryable:user@example.com',
      '1',
    );

    await expect(restoreUserDataIfNeeded(1, ' USER@EXAMPLE.COM ', 'google-sub', undefined, true, undefined, true)).resolves.toBe('empty');
    expect(mockStorageRemoveItem).toHaveBeenCalledWith(blockedKey);
    expect(mockStorageRemoveItem).not.toHaveBeenCalledWith(otherBlockedKey);
    expect(restoreBlocked).toBe(false);
    expect(mockRpc).toHaveBeenCalledTimes(4);
  });

  it('refreshes the Supabase session once after a restore 401', async () => {
    let restoreCalls = 0;
    mockRpc.mockImplementation(async (name: string) => {
      if (name === 'restore_my_data_backup_v2') {
        restoreCalls += 1;
        return restoreCalls === 1
          ? { data: null, error: { status: 401, message: 'Invalid JWT' } }
          : { data: { payload: null, revision: 2 }, error: null };
      }
      if (name === 'sync_lifetime_stars') return { data: 0, error: null };
      return { data: null, error: null };
    });
    mockSignInSilently.mockResolvedValue({ type: 'success' });
    mockGetTokens.mockResolvedValue({ idToken: 'id-token' });
    mockSignInWithIdToken.mockResolvedValue(successfulTokenResponse());
    const db = {
      getFirstAsync: jest.fn(async (sql: string) => sql.includes('COUNT(*)') ? { count: 0 } : null),
      getAllAsync: jest.fn().mockResolvedValue([]),
      runAsync: jest.fn(),
      withTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
      withExclusiveTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
    };
    mockGetDb.mockResolvedValue(db);

    await expect(restoreUserDataIfNeeded(1, 'user@example.com', 'google-sub')).resolves.toBe('empty');

    expect(mockRpc).toHaveBeenCalledWith('restore_my_data_backup_v2');
    expect(restoreCalls).toBe(2);
    expect(mockSignInWithIdToken).toHaveBeenCalledTimes(1);
  });

  it('refreshes a cached Supabase session when an explicit recovery retry follows a transient failure', async () => {
    let sessionRefreshed = false;
    mockGetSession.mockImplementation(async () => ({
      data: {
        session: {
          ...freshSession('user@example.com'),
          access_token: sessionRefreshed ? 'refreshed-user-token' : 'cached-user-token',
        },
      },
      error: null,
    }));
    mockRpc.mockImplementation(async (name: string) => {
      if (name === 'restore_my_data_backup_v2') {
        return sessionRefreshed
          ? { data: { payload: null, revision: 2 }, error: null }
          : { data: null, error: { message: 'temporary connection failure' } };
      }
      if (name === 'sync_lifetime_stars') return { data: 0, error: null };
      return { data: null, error: null };
    });
    const db = {
      getFirstAsync: jest.fn(async (sql: string) => sql.includes('COUNT(*)') ? { count: 0 } : null),
      getAllAsync: jest.fn().mockResolvedValue([]),
      runAsync: jest.fn(),
      withTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
      withExclusiveTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
    };
    mockGetDb.mockResolvedValue(db);

    await expect(
      restoreUserDataIfNeeded(1, 'user@example.com', 'google-sub'),
    ).resolves.toBe('unavailable');

    mockSignInSilently.mockResolvedValue({ type: 'success', data: {} });
    mockGetTokens.mockResolvedValue({ idToken: 'fresh-google-id-token' });
    mockSignInWithIdToken.mockImplementation(async () => {
      sessionRefreshed = true;
      const session = { ...freshSession('user@example.com'), access_token: 'refreshed-user-token' };
      return { data: { user: session.user, session }, error: null };
    });

    await expect(
      restoreUserDataIfNeeded(1, 'user@example.com', 'google-sub', undefined, true),
    ).resolves.toBe('empty');

    expect(mockSignInWithIdToken).toHaveBeenCalledTimes(1);
  });

  it('retries a previously blocked fresh account on the next startup without a tap', async () => {
    const blockedKey = 'habit_sync_backup_restore_blocked:user@example.com';
    mockStorageGetItem.mockImplementation(async (key: string) => (
      key === blockedKey ? '1' : null
    ));
    mockRpc.mockImplementation(async (name: string) => {
      if (name === 'restore_my_data_backup_v2') {
        return { data: { payload: null, revision: 4 }, error: null };
      }
      if (name === 'sync_lifetime_stars') return { data: 0, error: null };
      return { data: null, error: null };
    });
    const db = {
      getFirstAsync: jest.fn(async (sql: string) => sql.includes('COUNT(*)') ? { count: 0 } : null),
      getAllAsync: jest.fn().mockResolvedValue([]),
      runAsync: jest.fn(),
      withTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
      withExclusiveTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
    };
    mockGetDb.mockResolvedValue(db);

    await expect(
      restoreUserDataIfNeeded(1, 'user@example.com', 'google-sub', undefined, false, undefined, true),
    ).resolves.toBe('empty');

    expect(mockRpc).toHaveBeenCalledWith('restore_my_data_backup_v2');
    expect(mockStorageRemoveItem).toHaveBeenCalledWith(blockedKey);
  });

  it('keeps populated local data available during an automatic recovery probe', async () => {
    const blockedKey = 'habit_sync_backup_restore_blocked:user@example.com';
    const retryableKey = 'habit_sync_backup_restore_retryable:user@example.com';
    mockStorageGetItem.mockImplementation(async (key: string) => (
      key === blockedKey || key === retryableKey ? '1' : null
    ));
    mockRpc.mockImplementation(async (name: string) => (
      name === 'restore_my_data_backup_v2'
        ? { data: null, error: { message: 'temporary network failure' } }
        : { data: null, error: null }
    ));
    const db = {
      getFirstAsync: jest.fn(async (sql: string) => {
        if (sql.includes('COUNT(*)') && sql.includes('activity_log')) return { count: 1 };
        if (sql.includes('COUNT(*)')) return { count: 0 };
        return null;
      }),
      getAllAsync: jest.fn().mockResolvedValue([]),
      runAsync: jest.fn(),
      withTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
      withExclusiveTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
    };
    mockGetDb.mockResolvedValue(db);

    await expect(
      restoreUserDataIfNeeded(1, 'user@example.com', 'google-sub', undefined, false, undefined, true),
    ).resolves.toBe('not_needed');

    expect(mockRpc).not.toHaveBeenCalledWith('restore_my_data_backup_v2');
  });

  it('lets an explicit recovery retry reconcile a blocked populated account', async () => {
    const blockedKey = 'habit_sync_backup_restore_blocked:user@example.com';
    mockStorageGetItem.mockImplementation(async (key: string) => (
      key === blockedKey ? '1' : null
    ));
    mockRpc.mockImplementation(async (name: string) => (
      name === 'restore_my_data_backup_v2'
        ? { data: null, error: { message: 'temporary network failure' } }
        : { data: null, error: null }
    ));
    const db = {
      getFirstAsync: jest.fn(async (sql: string) => {
        if (sql.includes('COUNT(*)') && sql.includes('activity_log')) return { count: 1 };
        if (sql.includes('COUNT(*)')) return { count: 0 };
        return null;
      }),
      getAllAsync: jest.fn().mockResolvedValue([]),
      runAsync: jest.fn(),
      withTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
      withExclusiveTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
    };
    mockGetDb.mockResolvedValue(db);

    await expect(
      restoreUserDataIfNeeded(1, 'user@example.com', 'google-sub', undefined, true, undefined, true),
    ).resolves.toBe('unavailable');

    expect(mockRpc).toHaveBeenCalledWith('restore_my_data_backup_v2');
  });

  it('does not strand a recovery retry behind a timed-out offline restore', async () => {
    jest.useFakeTimers();
    const blockedKey = 'habit_sync_backup_restore_blocked:user@example.com';
    const retryableKey = 'habit_sync_backup_restore_retryable:user@example.com';
    let restoreBlocked = false;
    let restoreRetryable = false;
    mockStorageGetItem.mockImplementation(async (key: string) => (
      key === blockedKey ? (restoreBlocked ? '1' : null)
        : key === retryableKey ? (restoreRetryable ? '1' : null)
          : null
    ));
    mockStorageSetItem.mockImplementation(async (key: string, value: string) => {
      if (key === blockedKey) restoreBlocked = value === '1';
      if (key === retryableKey) restoreRetryable = value === '1';
    });
    mockStorageRemoveItem.mockImplementation(async (key: string) => {
      if (key === blockedKey) restoreBlocked = false;
      if (key === retryableKey) restoreRetryable = false;
    });
    const db = {
      getFirstAsync: jest.fn(async (sql: string) => sql.includes('COUNT(*)') ? { count: 0 } : null),
      getAllAsync: jest.fn().mockResolvedValue([]),
      runAsync: jest.fn(),
      withTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
      withExclusiveTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
    };
    mockGetDb.mockResolvedValue(db);

    let releaseOfflineRestore!: (value: { data: unknown; error: unknown | null }) => void;
    const offlineRestore = new Promise<{ data: unknown; error: unknown | null }>(resolve => {
      releaseOfflineRestore = resolve;
    });
    let restoreCalls = 0;
    mockRpc.mockImplementation(async (name: string) => {
      if (name === 'restore_my_data_backup_v2') {
        restoreCalls += 1;
        if (restoreCalls === 1) return offlineRestore;
        return { data: { payload: null, revision: 2 }, error: null };
      }
      if (name === 'sync_lifetime_stars') return { data: 0, error: null };
      return { data: null, error: null };
    });

    const settled = jest.fn();
    const flushMicrotasks = async () => {
      for (let index = 0; index < 64; index += 1) await Promise.resolve();
    };

    try {
      const firstRestore = restoreUserDataIfNeeded(
        1,
        'user@example.com',
        'google-sub',
        undefined,
        false,
        settled,
      );
      await flushMicrotasks();
      expect(restoreCalls).toBe(1);

      jest.advanceTimersByTime(15_000);
      await flushMicrotasks();
      await expect(firstRestore).resolves.toBe('unavailable');
      expect(settled).toHaveBeenCalledTimes(1);

      const retry = restoreUserDataIfNeeded(
        1,
        'user@example.com',
        'google-sub',
        undefined,
        true,
        undefined,
        true,
      );
      await flushMicrotasks();

      expect(restoreCalls).toBe(2);
      await expect(retry).resolves.toBe('empty');
    } finally {
      releaseOfflineRestore({ data: { payload: null, revision: 1 }, error: null });
      await flushMicrotasks();
      expect(restoreBlocked).toBe(false);
      expect(restoreRetryable).toBe(false);
      jest.useRealTimers();
    }
  });

  it('does not automatically probe a permanently blocked fresh account', async () => {
    const blockedKey = 'habit_sync_backup_restore_blocked:user@example.com';
    const retryableKey = 'habit_sync_backup_restore_retryable:user@example.com';
    mockStorageGetItem.mockImplementation(async (key: string) => (
      key === blockedKey ? '1' : key === retryableKey ? '0' : null
    ));
    const db = {
      getFirstAsync: jest.fn(async (sql: string) => sql.includes('COUNT(*)') ? { count: 0 } : null),
      getAllAsync: jest.fn().mockResolvedValue([]),
      runAsync: jest.fn(),
      withTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
      withExclusiveTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
    };
    mockGetDb.mockResolvedValue(db);

    await expect(
      restoreUserDataIfNeeded(1, 'user@example.com', 'google-sub', undefined, false, undefined, true),
    ).resolves.toBe('unavailable');

    expect(mockRpc).not.toHaveBeenCalledWith('restore_my_data_backup_v2');
  });

  it('does not let a concurrent upload pass while retry restore is in flight', async () => {
    const blockedKey = 'habit_sync_backup_restore_blocked:user@example.com';
    let restoreBlocked = true;
    let releaseRestore!: () => void;
    let restoreStarted!: () => void;
    const restoreStartedPromise = new Promise<void>(resolve => { restoreStarted = resolve; });
    const restoreReleasePromise = new Promise<void>(resolve => { releaseRestore = resolve; });
    const rpcOrder: string[] = [];
    mockStorageGetItem.mockImplementation(async (key: string) => (
      key === blockedKey && restoreBlocked ? '1' : null
    ));
    mockStorageRemoveItem.mockImplementation(async (key: string) => {
      if (key === blockedKey) restoreBlocked = false;
    });
    mockRpc.mockImplementation(async (name: string) => {
      if (name === 'restore_my_data_backup_v2') {
        rpcOrder.push('restore');
        restoreStarted();
        await restoreReleasePromise;
        return { data: { payload: null, revision: 0 }, error: null };
      }
      if (name === 'save_my_data_backup_v2') rpcOrder.push('save');
      return { data: name === 'sync_lifetime_stars' ? 0 : 1, error: null };
    });
    type RaceTestDb = {
      getFirstAsync: jest.Mock;
      getAllAsync: jest.Mock;
      runAsync: jest.Mock;
      withTransactionAsync: jest.Mock;
      withExclusiveTransactionAsync: jest.Mock;
    };
    let db!: RaceTestDb;
    db = {
      getFirstAsync: jest.fn(async (sql: string) => {
        if (sql.includes('COUNT(*)')) return { count: 0 };
        if (sql.includes('SELECT id FROM users')) return { id: 1 };
        if (sql.includes('FROM users WHERE id')) {
          return {
            username: 'me', timezone: 'Asia/Ho_Chi_Minh', carry_debt: 0, currency: 'VND',
            last_seen_week_start: null, lifetime_stars: 0, current_tier_id: null,
            treat_stars: 0, treat_stars_lifetime: 0, value_per_star: 1000,
            penalty_hits_treats: 1, notification_time: null, notification_time_2: null,
            notification_time_3: null,
          };
        }
        return null;
      }),
      getAllAsync: jest.fn().mockResolvedValue([]),
      runAsync: jest.fn(),
      withTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
      withExclusiveTransactionAsync: jest.fn(async (fn: (transactionDb: RaceTestDb) => Promise<void>) => fn(db)),
    };
    mockGetDb.mockResolvedValue(db);

    const restorePromise = restoreUserDataIfNeeded(1, 'user@example.com', 'google-sub', undefined, true);
    await restoreStartedPromise;
    const syncPromise = syncToSupabase('google-sub', 'user@example.com');
    await Promise.resolve();
    expect(rpcOrder).toEqual(['restore']);

    releaseRestore();
    await expect(restorePromise).resolves.toBe('empty');
    await syncPromise;
    expect(rpcOrder).toEqual(['restore']);
  });

  it('re-blocks a queued upload when the retry restore fails', async () => {
    const blockedKey = 'habit_sync_backup_restore_blocked:user@example.com';
    let restoreBlocked = true;
    let releaseRestore!: () => void;
    let restoreStarted!: () => void;
    const restoreStartedPromise = new Promise<void>(resolve => { restoreStarted = resolve; });
    const restoreReleasePromise = new Promise<void>(resolve => { releaseRestore = resolve; });
    const rpcOrder: string[] = [];
    mockStorageGetItem.mockImplementation(async (key: string) => (
      key === blockedKey && restoreBlocked ? '1' : null
    ));
    mockStorageSetItem.mockImplementation(async (key: string, value: string) => {
      if (key === blockedKey) restoreBlocked = value === '1';
    });
    mockStorageRemoveItem.mockImplementation(async (key: string) => {
      if (key === blockedKey) restoreBlocked = false;
    });
    mockRpc.mockImplementation(async (name: string) => {
      if (name === 'restore_my_data_backup_v2') {
        rpcOrder.push('restore');
        restoreStarted();
        await restoreReleasePromise;
        return { data: null, error: new Error('temporary network failure') };
      }
      if (name === 'save_my_data_backup_v2') rpcOrder.push('save');
      return { data: 1, error: null };
    });

    const restorePromise = restoreUserDataIfNeeded(1, 'user@example.com', 'google-sub', undefined, true);
    await restoreStartedPromise;
    const syncPromise = syncToSupabase('google-sub', 'user@example.com');

    releaseRestore();
    await expect(restorePromise).resolves.toBe('unavailable');
    await expect(syncPromise).resolves.toBeUndefined();
    expect(rpcOrder).toEqual(['restore']);
    expect(restoreBlocked).toBe(true);
  });

  it('re-blocks a queued upload when a normal restore is cancelled', async () => {
    const blockedKey = 'habit_sync_backup_restore_blocked:user@example.com';
    let restoreBlocked = false;
    let restoreActive = true;
    let releaseRestore!: () => void;
    let restoreStarted!: () => void;
    const restoreStartedPromise = new Promise<void>(resolve => { restoreStarted = resolve; });
    const restoreReleasePromise = new Promise<void>(resolve => { releaseRestore = resolve; });
    const rpcOrder: string[] = [];
    mockStorageGetItem.mockImplementation(async (key: string) => (
      key === blockedKey && restoreBlocked ? '1' : null
    ));
    mockStorageSetItem.mockImplementation(async (key: string, value: string) => {
      if (key === blockedKey) restoreBlocked = value === '1';
    });
    mockRpc.mockImplementation(async (name: string) => {
      if (name === 'restore_my_data_backup_v2') {
        rpcOrder.push('restore');
        restoreStarted();
        await restoreReleasePromise;
        return { data: { payload: null, revision: 0 }, error: null };
      }
      if (name === 'save_my_data_backup_v2') rpcOrder.push('save');
      return { data: 1, error: null };
    });

    const restorePromise = restoreUserDataIfNeeded(
      1,
      'user@example.com',
      'google-sub',
      () => restoreActive,
    );
    await restoreStartedPromise;
    const syncPromise = syncToSupabase('google-sub', 'user@example.com');
    restoreActive = false;
    releaseRestore();

    await expect(restorePromise).resolves.toBe('unavailable');
    await expect(syncPromise).resolves.toBeUndefined();
    expect(rpcOrder).toEqual(['restore']);
    expect(restoreBlocked).toBe(true);
  });

  it('keeps queued uploads blocked when persisting the restore marker fails', async () => {
    const blockedKey = 'habit_sync_backup_restore_blocked:user@example.com';
    let releaseRestore!: () => void;
    let restoreStarted!: () => void;
    const restoreStartedPromise = new Promise<void>(resolve => { restoreStarted = resolve; });
    const restoreReleasePromise = new Promise<void>(resolve => { releaseRestore = resolve; });
    const rpcOrder: string[] = [];
    mockStorageGetItem.mockResolvedValue(null);
    mockStorageSetItem.mockImplementation(async (key: string) => {
      if (key === blockedKey) throw new Error('AsyncStorage unavailable');
    });
    mockRpc.mockImplementation(async (name: string) => {
      if (name === 'restore_my_data_backup_v2') {
        rpcOrder.push('restore');
        restoreStarted();
        await restoreReleasePromise;
        return { data: null, error: new Error('temporary network failure') };
      }
      if (name === 'save_my_data_backup_v2') rpcOrder.push('save');
      return { data: 1, error: null };
    });

    const restorePromise = restoreUserDataIfNeeded(1, 'user@example.com', 'google-sub');
    await restoreStartedPromise;
    const syncPromise = syncToSupabase('google-sub', 'user@example.com');
    releaseRestore();

    await expect(restorePromise).resolves.toBe('unavailable');
    await expect(syncPromise).resolves.toBeUndefined();
    expect(rpcOrder).toEqual(['restore']);
  });

  it('allocates a new local id for a legacy mirror row independently of its source id', async () => {
    mockRpc.mockImplementation(async (name: string) => {
      if (name === 'restore_my_data_backup_v2') return { data: { payload: null, revision: 4 }, error: null };
      if (name === 'sync_lifetime_stars') return { data: 2, error: null };
      return { data: null, error: null };
    });
    mockLegacyPage({
      data: [{
        local_id: 11, kind: 'GOOD', duration_min: 20, points_earned: 10, stars_delta: 2,
        source: 'TASK', logged_at: 1, local_date: '2026-08-20', week_start: '2026-08-17',
      }],
      error: null,
    });
    const db = {
      getFirstAsync: jest.fn(async (sql: string) => sql.includes('COUNT(*)') ? { count: 0 } : null),
      getAllAsync: jest.fn(async (sql: string) => sql.includes('FROM activity_log') ? [{ id: 11 }] : []),
      runAsync: jest.fn(),
      withTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
      withExclusiveTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
    };
    mockGetDb.mockResolvedValue(db);

    await expect(restoreUserDataIfNeeded(1, 'user@example.com', 'google-sub')).resolves.toBe('restored');
    const activityWrite = db.runAsync.mock.calls.find(([sql]) => sql.includes('INSERT OR REPLACE INTO activity_log'));
    expect(activityWrite?.[1]?.[0]).toBe(1);
    expect(mockStorageRemoveItem).toHaveBeenCalledWith('habit_sync_backup_restore_blocked:user@example.com');
  });

  it('does not commit legacy rows when the server rank cannot be reconciled', async () => {
    mockRpc.mockImplementation(async (name: string) => {
      if (name === 'restore_my_data_backup_v2') return { data: { payload: null, revision: 4 }, error: null };
      if (name === 'sync_lifetime_stars') return { data: null, error: { message: 'rank unavailable' } };
      return { data: null, error: null };
    });
    mockLegacyPage({
      data: [{
        local_id: 11,
        kind: 'GOOD',
        duration_min: 20,
        points_earned: 10,
        stars_delta: 2,
        source: 'TASK',
        logged_at: 1,
        local_date: '2026-08-20',
        week_start: '2026-08-17',
      }],
      error: null,
    });
    const db = {
      getFirstAsync: jest.fn(async (sql: string) => sql.includes('COUNT(*)') ? { count: 0 } : null),
      getAllAsync: jest.fn().mockResolvedValue([]),
      runAsync: jest.fn(),
      withTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
      withExclusiveTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
    };
    mockGetDb.mockResolvedValue(db);

    await expect(restoreUserDataIfNeeded(1, 'user@example.com', 'google-sub')).resolves.toBe('unavailable');
    expect(db.runAsync).not.toHaveBeenCalled();
    expect(mockStorageSetItem).toHaveBeenCalledWith('habit_sync_backup_restore_blocked:user@example.com', '1');
  });

  it('fails closed when local activity appears before the legacy restore transaction starts', async () => {
    mockRpc.mockImplementation(async (name: string) => {
      if (name === 'restore_my_data_backup_v2') return { data: { payload: null, revision: 4 }, error: null };
      if (name === 'sync_lifetime_stars') return { data: 2, error: null };
      return { data: null, error: null };
    });
    mockLegacyPage({
      data: [{
        local_id: 11,
        kind: 'GOOD',
        duration_min: 20,
        points_earned: 10,
        stars_delta: 2,
        source: 'TASK',
        logged_at: 1,
        local_date: '2026-08-20',
        week_start: '2026-08-17',
      }],
      error: null,
    });
    let activityCountReads = 0;
    const db = {
      getFirstAsync: jest.fn(async (sql: string) => {
        if (sql.includes('COUNT(*)') && sql.includes('activity_log')) {
          activityCountReads += 1;
          return { count: activityCountReads === 1 ? 0 : 1 };
        }
        return sql.includes('COUNT(*)') ? { count: 0 } : null;
      }),
      getAllAsync: jest.fn().mockResolvedValue([]),
      runAsync: jest.fn(),
      withTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
      withExclusiveTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
    };
    mockGetDb.mockResolvedValue(db);

    await expect(restoreUserDataIfNeeded(1, 'user@example.com', 'google-sub')).resolves.toBe('unavailable');
    expect(db.runAsync).not.toHaveBeenCalled();
    expect(mockStorageSetItem).toHaveBeenCalledWith('habit_sync_backup_restore_blocked:user@example.com', '1');
  });

  it('replays journaled legacy cursor finalization after the first cursor write fails', async () => {
    let pending: string | null = null;
    let failCursorWrite = true;
    const pendingKey = 'habit_sync_legacy_restore_pending:user@example.com:1';
    const cursorKey = 'habit_sync_last_activity_id:1';
    mockStorageGetItem.mockImplementation(async (key: string) => key === pendingKey ? pending : null);
    mockStorageSetItem.mockImplementation(async (key: string, value: string) => {
      if (key === cursorKey && failCursorWrite) throw new Error('cursor storage unavailable');
      if (key === pendingKey) pending = value;
    });
    mockStorageRemoveItem.mockImplementation(async (key: string) => {
      if (key === pendingKey) pending = null;
    });
    mockRpc.mockImplementation(async (name: string) => {
      if (name === 'restore_my_data_backup_v2') return { data: { payload: null, revision: 4 }, error: null };
      if (name === 'sync_lifetime_stars') return { data: 2, error: null };
      return { data: null, error: null };
    });
    mockLegacyPage({
      data: [{
        local_id: 11,
        kind: 'GOOD',
        duration_min: 20,
        points_earned: 10,
        stars_delta: 2,
        source: 'TASK',
        logged_at: 1,
        local_date: '2026-08-20',
        week_start: '2026-08-17',
      }],
      error: null,
    });
    let maxQueryCount = 0;
    const db = {
      getFirstAsync: jest.fn(async (sql: string) => {
        if (sql.includes('COALESCE(MAX(id)')) {
          maxQueryCount += 1;
          return { count: 1, max_id: maxQueryCount === 1 ? 11 : 12 };
        }
        return sql.includes('COUNT(*)') ? { count: 0 } : null;
      }),
      getAllAsync: jest.fn().mockResolvedValue([]),
      runAsync: jest.fn(),
      withTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
      withExclusiveTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
    };
    mockGetDb.mockResolvedValue(db);

    await expect(restoreUserDataIfNeeded(1, 'user@example.com', 'google-sub')).resolves.toBe('unavailable');
    expect(pending).toBe('committed:12');

    failCursorWrite = false;
    await expect(restoreUserDataIfNeeded(1, 'user@example.com', 'google-sub', undefined, true)).resolves.toBe('restored');
    expect(pending).toBeNull();
    expect(mockLegacyActivityGt).toHaveBeenCalledTimes(2);
    expect(mockStorageSetItem).toHaveBeenCalledWith(cursorKey, '12');
  });

  it('fails closed when a legacy activity contains a malformed numeric field', async () => {
    mockRpc.mockImplementation(async (name: string) =>
      name === 'restore_my_data_backup_v2'
        ? { data: { payload: null, revision: 5 }, error: null }
        : { data: null, error: null });
    mockLegacyPage({
      data: [{
        local_id: 11, kind: 'GOOD', duration_min: 20, points_earned: 'not-a-number', stars_delta: 2,
        source: 'TASK', logged_at: 1, local_date: '2026-08-20', week_start: '2026-08-17',
      }],
      error: null,
    });
    const db = {
      getFirstAsync: jest.fn(async (sql: string) => sql.includes('COUNT(*)') ? { count: 0 } : null),
      getAllAsync: jest.fn().mockResolvedValue([]),
      runAsync: jest.fn(),
      withTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
      withExclusiveTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
    };
    mockGetDb.mockResolvedValue(db);

    await expect(restoreUserDataIfNeeded(1, 'user@example.com', 'google-sub')).resolves.toBe('unavailable');
    expect(db.runAsync).not.toHaveBeenCalled();
  });

  it('rejects coercible legacy numeric values and calendar-invalid dates', async () => {
    mockRpc.mockImplementation(async (name: string) =>
      name === 'restore_my_data_backup_v2'
        ? { data: { payload: null, revision: 6 }, error: null }
        : { data: null, error: null });
    mockLegacyPage({
      data: [{
        local_id: 11, kind: 'GOOD', duration_min: ' ', points_earned: 10, stars_delta: 2,
        source: 'TASK', logged_at: 1, local_date: '2024-02-30', week_start: '2024-02-26',
      }],
      error: null,
    });
    const db = {
      getFirstAsync: jest.fn(async (sql: string) => sql.includes('COUNT(*)') ? { count: 0 } : null),
      getAllAsync: jest.fn().mockResolvedValue([]),
      runAsync: jest.fn(),
      withTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
      withExclusiveTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
    };
    mockGetDb.mockResolvedValue(db);

    await expect(restoreUserDataIfNeeded(1, 'user@example.com', 'google-sub')).resolves.toBe('unavailable');
    expect(db.runAsync).not.toHaveBeenCalled();
  });

  it('rejects malformed full snapshots before deleting local rows', async () => {
    const payload = emptyBackupPayload({
      categories: [{ id: 11, name: 'Health', icon: null, sort_order: '1', archived: 0 }],
    });
    expect(isCloudBackupPayload(payload)).toBe(false);
    mockRpc.mockImplementation(async (name: string) =>
      name === 'restore_my_data_backup_v2'
        ? { data: { payload, revision: 7 }, error: null }
        : { data: null, error: null });
    const db = {
      getFirstAsync: jest.fn(async (sql: string) => sql.includes('COUNT(*)') ? { count: 0 } : null),
      getAllAsync: jest.fn().mockResolvedValue([]),
      runAsync: jest.fn(),
      withTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
      withExclusiveTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
    };
    mockGetDb.mockResolvedValue(db);

    await expect(restoreUserDataIfNeeded(1, 'user@example.com', 'google-sub')).resolves.toBe('unavailable');
    expect(db.runAsync).not.toHaveBeenCalled();

    const validNullUnlockReference = emptyBackupPayload({
      fund_transactions: [{ id: 12, type: 'reward', amount: 1, source_unlock_id: null, occurred_at: 1 }],
    });
    const invalidUnlockReference = emptyBackupPayload({
      fund_transactions: [{ id: 13, type: 'reward', amount: 1, source_unlock_id: 999, occurred_at: 1 }],
    });
    const duplicateDailySummary = emptyBackupPayload({
      daily_summary: [
        { id: 14, local_date: '2026-08-20', total_points: 1, bonus_star_awarded: 0, streak_count: 1 },
        { id: 15, local_date: '2026-08-20', total_points: 2, bonus_star_awarded: 0, streak_count: 1 },
      ],
    });
    expect(isCloudBackupPayload(validNullUnlockReference)).toBe(true);
    expect(isCloudBackupPayload(invalidUnlockReference)).toBe(false);
    expect(isCloudBackupPayload(duplicateDailySummary)).toBe(false);
  });

  it('fails closed before writes when SQLite exposes no transaction primitive', async () => {
    const payload = emptyBackupPayload();
    mockRpc.mockImplementation(async (name: string) =>
      name === 'restore_my_data_backup_v2'
        ? { data: { payload, revision: 8 }, error: null }
        : { data: null, error: null });
    const db = {
      getFirstAsync: jest.fn(async (sql: string) => sql.includes('COUNT(*)') ? { count: 0 } : null),
      getAllAsync: jest.fn().mockResolvedValue([]),
      runAsync: jest.fn(),
    };
    mockGetDb.mockResolvedValue(db);

    await expect(restoreUserDataIfNeeded(1, 'user@example.com', 'google-sub')).resolves.toBe('unavailable');
    expect(db.runAsync).not.toHaveBeenCalled();
    expect(mockStorageSetItem).toHaveBeenCalledWith('habit_sync_backup_restore_blocked:user@example.com', '1');
  });

  it('does not replace another local account when snapshot ids collide', async () => {
    mockRpc.mockImplementation(async (name: string) =>
      name === 'restore_my_data_backup_v2'
        ? {
            data: {
              payload: emptyBackupPayload({
                categories: [{ id: 11, name: 'Health', icon: '🏃', sort_order: 1, archived: 0 }],
              }),
              revision: 2,
            },
            error: null,
          }
        : { data: null, error: null });
    const db = {
      getFirstAsync: jest.fn(async (sql: string) => sql.includes('COUNT(*)') ? { count: 0 } : null),
      getAllAsync: jest.fn(async (sql: string) => sql.includes('FROM categories') ? [{ id: 11 }] : []),
      runAsync: jest.fn(),
      withTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
      withExclusiveTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
    };
    mockGetDb.mockResolvedValue(db);

    await expect(restoreUserDataIfNeeded(1, 'user@example.com', 'google-sub')).resolves.toBe('unavailable');
    expect(db.withExclusiveTransactionAsync).toHaveBeenCalled();
    expect(db.runAsync).not.toHaveBeenCalled();
  });
});

type ActivityLogRow = {
  userId: number;
  source: string;
  localDate: string;
};

function createSocialProfileDb(
  summaries: Array<{ userId: number; localDate: string; streakCount: number }>,
  activityRows: ActivityLogRow[],
) {
  return {
    getFirstAsync: jest.fn(async <T>(sql: string, params: unknown[]) => {
      const userId = params[0] as number;
      if (sql.includes('daily_summary')) {
        const latest = summaries
          .filter(row => row.userId === userId)
          .sort((left, right) => right.localDate.localeCompare(left.localDate))[0];
        return (latest ? { current_streak: latest.streakCount } : { current_streak: 0 }) as T;
      }

      if (sql.includes('activity_log')) {
        const qualifyingSources = sql.includes("source IN ('TASK', 'CHALLENGE')")
          ? new Set(['TASK', 'CHALLENGE'])
          : new Set<string>();
        const latestDate = activityRows
          .filter(row => row.userId === userId && qualifyingSources.has(row.source))
          .map(row => row.localDate)
          .sort()
          .at(-1) ?? null;
        return { last_active_local_date: latestDate } as T;
      }

      throw new Error(`Unexpected profile query: ${sql}`);
    }),
  };
}

describe('readSocialProfile', () => {
  it('uses only TASK and CHALLENGE rows for the latest social activity date', async () => {
    const db = createSocialProfileDb(
      [{ userId: 42, localDate: '2026-08-10', streakCount: 7 }],
      [
        { userId: 42, source: 'TASK', localDate: '2026-08-10' },
        { userId: 42, source: 'CHALLENGE', localDate: '2026-08-09' },
        { userId: 42, source: 'LOGIN', localDate: '2026-08-12' },
        { userId: 42, source: 'DAILY_BONUS', localDate: '2026-08-11' },
      ],
    );

    await expect(readSocialProfile(db as never, 42, 'Asia/Bangkok')).resolves.toEqual({
      currentStreak: 7,
      lastActiveLocalDate: '2026-08-10',
      timezone: 'Asia/Bangkok',
    });
  });

  it('moves freshness backward and then to null when newest qualifying rows are deleted', async () => {
    const activityRows: ActivityLogRow[] = [
      { userId: 42, source: 'TASK', localDate: '2026-08-10' },
      { userId: 42, source: 'CHALLENGE', localDate: '2026-08-09' },
      { userId: 42, source: 'LOGIN', localDate: '2026-08-12' },
    ];
    const db = createSocialProfileDb(
      [{ userId: 42, localDate: '2026-08-10', streakCount: 7 }],
      activityRows,
    );

    activityRows.splice(0, 1);
    await expect(readSocialProfile(db as never, 42, 'Asia/Bangkok')).resolves.toMatchObject({
      lastActiveLocalDate: '2026-08-09',
    });

    activityRows.splice(0, 1);
    await expect(readSocialProfile(db as never, 42, 'Asia/Bangkok')).resolves.toMatchObject({
      lastActiveLocalDate: null,
    });
  });
});

describe('account sync gate', () => {
  it('drains in-flight work and blocks new work during destructive operations', async () => {
    const account = 'sync-race@example.com';
    let finishWork!: () => void;
    let started!: () => void;
    const workStarted = new Promise<void>((resolve) => { started = resolve; });
    const workFinishes = new Promise<void>((resolve) => { finishWork = resolve; });
    const writes: string[] = [];

    const inFlight = runAccountSync(account, async () => {
      started();
      await workFinishes;
      writes.push('in-flight');
    });
    await workStarted;

    let pauseFinished = false;
    const pausePromise = pauseAccountSync(account).then((release) => {
      pauseFinished = true;
      return release;
    });
    await Promise.resolve();
    expect(pauseFinished).toBe(false);

    finishWork();
    const release = await pausePromise;
    await inFlight;

    await runAccountSync(account, async () => {
      writes.push('blocked');
    });
    expect(writes).toEqual(['in-flight']);

    release();
    await runAccountSync(account, async () => {
      writes.push('after-release');
    });
    expect(writes).toEqual(['in-flight', 'after-release']);
  });

  it('uses one gate for case-folded account emails', async () => {
    let finishWork!: () => void;
    let started!: () => void;
    const workStarted = new Promise<void>(resolve => { started = resolve; });
    const workFinishes = new Promise<void>(resolve => { finishWork = resolve; });

    const inFlight = runAccountSync('User@Example.com', async () => {
      started();
      await workFinishes;
    });
    await workStarted;

    let paused = false;
    const pause = pauseAccountSync(' user@example.com ').then(release => {
      paused = true;
      return release;
    });
    await Promise.resolve();
    expect(paused).toBe(false);

    finishWork();
    const release = await pause;
    await inFlight;
    release();
  });

  it('cancels a retry waiting behind a blocked account gate', async () => {
    const account = 'cancelled-retry@example.com';
    const release = await pauseAccountSync(account);
    const cancellation = new AbortController();
    const writes: string[] = [];

    const waitingRetry = runAccountSync(
      account,
      async () => { writes.push('stale-retry'); },
      true,
      true,
      cancellation.signal,
    );
    cancellation.abort();

    await expect(waitingRetry).rejects.toThrow('Account sync was invalidated');
    release();
    await Promise.resolve();
    expect(writes).toEqual([]);
  });

  it('rejects an already-aborted retry and supports a non-cancelled wait-for-gate retry', async () => {
    const account = 'aborted-retry@example.com';
    const release = await pauseAccountSync(account);
    const cancellation = new AbortController();
    cancellation.abort();
    await expect(runAccountSync(account, async () => undefined, false, true, cancellation.signal))
      .rejects.toThrow('Account sync was invalidated');

    const writes: string[] = [];
    const waiting = runAccountSync(account, async () => { writes.push('after-wait'); }, false, true);
    release();
    await waiting;
    expect(writes).toEqual(['after-wait']);
  });

  it('keeps a failed-closed account blocked unless the caller explicitly allows recovery', async () => {
    const account = 'fail-closed@example.com';
    mockStorageSetItem.mockRejectedValueOnce(new Error('storage unavailable'));
    await expect(markBackupRestoreBlocked(account)).rejects.toThrow('storage unavailable');

    const writes: string[] = [];
    await runAccountSync(account, async () => { writes.push('suppressed'); });
    expect(writes).toEqual([]);
    await runAccountSync(account, async () => { writes.push('explicit-recovery'); }, true);
    expect(writes).toEqual(['explicit-recovery']);

    mockStorageSetItem.mockResolvedValue(undefined);
    mockStorageRemoveItem.mockResolvedValue(undefined);
    await clearBackupRestoreBlocked(account);
  });

  it('waits for an existing pause and makes release idempotent', async () => {
    const account = 'double-pause@example.com';
    const firstRelease = await pauseAccountSync(account);
    let secondReady = false;
    const second = pauseAccountSync(account).then(release => {
      secondReady = true;
      return release;
    });
    await Promise.resolve();
    expect(secondReady).toBe(false);
    firstRelease();
    const secondRelease = await second;
    secondRelease();
    secondRelease();
  });
});

describe('syncUserStreak', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not upsert when Supabase has no authenticated session', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockSignInSilently.mockResolvedValue({ type: 'noSavedCredentialFound' });

    await expect(syncUserStreak('user@example.com', 7, 'google-sub')).rejects.toThrow('No saved Google credential');

    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('syncs only after confirming an authenticated session', async () => {
    mockGetSession.mockResolvedValue({ data: { session: freshSession('user@example.com') } });

    await syncUserStreak('user@example.com', 7, 'google-sub');

    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockRpc).toHaveBeenCalledWith('sync_user_profile', { p_current_streak: 7 });
  });

  it('does not write streak data through a session belonging to another account', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: freshSession('other@example.com') },
      error: null,
    });

    await expect(syncUserStreak('user@example.com', 7, 'google-sub')).rejects.toThrow('does not match');

    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe('destructive operation fencing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSession.mockResolvedValue({ data: { session: freshSession('user@example.com') }, error: null });
  });

  it('replays reset with its operation id and explicit supersede intent', async () => {
    mockRpc.mockImplementation(async (name: string) => {
      if (name === 'restore_my_data_backup_v2') return { data: { payload: null, revision: 12 }, error: null };
      return { data: null, error: null };
    });

    await resetUserProgressInSupabase('user@example.com', 'google-sub', '11111111-1111-4111-8111-111111111111', true);

    expect(mockRpc).toHaveBeenCalledWith('reset_my_progress_v3', {
      p_operation_id: '11111111-1111-4111-8111-111111111111',
      p_supersede: true,
    });
    expect(mockStorageSetItem).toHaveBeenCalledWith('habit_sync_backup_revision:user@example.com', '12');
  });

  it('replays account deletion with the original operation id without superseding it', async () => {
    await deleteUserFromSupabase('user@example.com', 'google-sub', '22222222-2222-4222-8222-222222222222');

    expect(mockRpc).toHaveBeenCalledWith('delete_my_account_data_v3', {
      p_operation_id: '22222222-2222-4222-8222-222222222222',
      p_supersede: false,
    });
    expect(mockStorageRemoveItem).toHaveBeenCalledWith('habit_sync_backup_revision:user@example.com');
  });
});

describe('ensureSupabaseSession', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('re-establishes a Supabase session from a fresh Google ID token', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
    mockSignInSilently.mockResolvedValue({ type: 'success', data: {} });
    mockGetTokens.mockResolvedValue({ idToken: 'fresh-google-id-token' });
    mockSignInWithIdToken.mockResolvedValue(successfulTokenResponse());

    await ensureSupabaseSession('user@example.com');

    expect(mockConfigure).toHaveBeenCalledWith({ webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID });
    expect(mockSignInSilently).toHaveBeenCalled();
    expect(mockSignInWithIdToken).toHaveBeenCalledWith({ provider: 'google', token: 'fresh-google-id-token' });
  });

  it('shares one in-flight Google silent sign-in across concurrent session requests', async () => {
    let sessionReady = false;
    mockGetSession.mockImplementation(async () => {
      return sessionReady
        ? { data: { session: freshSession('user@example.com') }, error: null }
        : { data: { session: null }, error: null };
    });
    let resolveSilent!: (value: { type: string; data?: unknown }) => void;
    mockSignInSilently.mockReturnValue(new Promise<{ type: string; data?: unknown }>((resolve) => {
      resolveSilent = resolve;
    }));
    mockGetTokens.mockResolvedValue({ idToken: 'fresh-google-id-token' });
    mockSignInWithIdToken.mockImplementation(async () => {
      sessionReady = true;
      return successfulTokenResponse();
    });

    const firstRequest = ensureSupabaseSession('user@example.com');
    const secondRequest = ensureSupabaseSession('user@example.com');
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(mockSignInSilently).toHaveBeenCalledTimes(1);

    resolveSilent({ type: 'success', data: {} });
    await Promise.all([firstRequest, secondRequest]);

    expect(mockSignInWithIdToken).toHaveBeenCalledTimes(1);
  });

  it('cancels a startup refresh before a late native response can exchange its token', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
    let resolveSilent!: (value: { type: string; data?: unknown }) => void;
    mockSignInSilently.mockReturnValue(new Promise<{ type: string; data?: unknown }>((resolve) => {
      resolveSilent = resolve;
    }));
    mockGetTokens.mockResolvedValue({ idToken: 'late-google-token' });
    let active = true;

    const request = ensureSupabaseSession('user@example.com', () => active);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    active = false;
    resolveSilent({ type: 'success', data: {} });

    await expect(request).rejects.toThrow('cancelled');
    expect(mockGetTokens).not.toHaveBeenCalled();
    expect(mockSignInWithIdToken).not.toHaveBeenCalled();
  });

  it('evicts a canceled hung refresh so a later account can establish its own session', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
    let resolveStaleSilent!: (value: { type: string; data?: unknown }) => void;
    mockSignInSilently
      .mockImplementationOnce(() => new Promise<{ type: string; data?: unknown }>((resolve) => {
        resolveStaleSilent = resolve;
      }))
      .mockResolvedValueOnce({ type: 'success', data: {} });
    mockGetTokens.mockResolvedValue({ idToken: 'fresh-google-token' });
    mockSignInWithIdToken.mockResolvedValue(successfulTokenResponse('new@example.com'));
    let active = true;

    const stale = ensureSupabaseSession('old@example.com', () => active);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    active = false;
    cancelSupabaseSessionRestore();

    await expect(ensureSupabaseSession('new@example.com')).resolves.toBeUndefined();
    expect(mockSignInSilently).toHaveBeenCalledTimes(2);

    resolveStaleSilent({ type: 'success', data: {} });
    await expect(stale).rejects.toThrow('cancelled');
  });

  it('rejects when there is no saved Google credential to refresh', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
    mockSignInSilently.mockResolvedValue({ type: 'noSavedCredentialFound' });

    await expect(ensureSupabaseSession('user@example.com')).rejects.toThrow('No saved Google credential');
    expect(mockGetTokens).not.toHaveBeenCalled();
  });

  it('rejects a session for a different account before uploading rows', async () => {
    mockGetSession.mockResolvedValue({ data: { session: freshSession('other@example.com') }, error: null });

    await expect(ensureSupabaseSession('user@example.com')).rejects.toThrow('does not match');
    expect(mockGetTokens).not.toHaveBeenCalled();
  });

  it('accepts a session email that only differs in case or surrounding whitespace', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: freshSession('User@Example.com  ') },
      error: null,
    });

    await expect(ensureSupabaseSession(' user@example.com')).resolves.toBeUndefined();
    expect(mockGetTokens).not.toHaveBeenCalled();
  });

  it('re-authenticates instead of trusting an expired cached session', async () => {
    const expiredAt = Math.floor(Date.now() / 1000) - 10;
    mockGetSession.mockResolvedValue({
      data: { session: { user: { email: 'user@example.com' }, expires_at: expiredAt } },
      error: null,
    });
    mockSignInSilently.mockResolvedValue({ type: 'success', data: {} });
    mockGetTokens.mockResolvedValue({ idToken: 'fresh-google-id-token' });
    mockSignInWithIdToken.mockResolvedValue(successfulTokenResponse());

    await ensureSupabaseSession('user@example.com');

    expect(mockSignInWithIdToken).toHaveBeenCalledWith({ provider: 'google', token: 'fresh-google-id-token' });
  });

  it('accepts a freshly-refreshed token whose email only differs in case, same as an already-fresh session', async () => {
    const expiredAt = Math.floor(Date.now() / 1000) - 10;
    mockGetSession.mockResolvedValue({
      data: { session: { user: { email: 'user@example.com' }, expires_at: expiredAt } },
      error: null,
    });
    mockSignInSilently.mockResolvedValue({ type: 'success', data: {} });
    mockGetTokens.mockResolvedValue({ idToken: 'fresh-google-id-token' });
    mockSignInWithIdToken.mockResolvedValue(successfulTokenResponse('User@Example.com'));

    await expect(ensureSupabaseSession('user@example.com')).resolves.toBeUndefined();
  });

  it('rejects every malformed or errored Supabase session envelope before native refresh', async () => {
    for (const response of [
      undefined,
      { data: null },
      { data: {} },
      { data: { session: {} } },
    ]) {
      mockGetSession.mockReset();
      mockGetSession.mockResolvedValueOnce(response);
      await expect(ensureSupabaseSession('malformed@example.com')).rejects.toThrow('Supabase session response was malformed');
    }
    mockGetSession.mockResolvedValueOnce({ data: { session: null }, error: new Error('session lookup failed') });
    await expect(ensureSupabaseSession('errored@example.com')).rejects.toThrow('session lookup failed');
  });

  it('refreshes when the cached Google subject differs and when a caller forces refresh', async () => {
    mockGetSession.mockResolvedValue({ data: { session: freshSession('user@example.com', 'old-sub') }, error: null });
    mockSignInSilently.mockResolvedValue({ type: 'success', data: {} });
    mockGetTokens.mockResolvedValue({ idToken: 'fresh-google-id-token' });
    mockSignInWithIdToken.mockResolvedValue(successfulTokenResponse('user@example.com', 'new-sub'));

    await ensureSupabaseSession('user@example.com', undefined, 'new-sub');
    expect(mockSignInWithIdToken).toHaveBeenCalledTimes(1);

    mockGetSession.mockResolvedValue({ data: { session: freshSession('user@example.com', 'new-sub') }, error: null });
    await refreshSupabaseSessionForAccount('user@example.com', 'new-sub');
    expect(mockSignInWithIdToken).toHaveBeenCalledTimes(2);
  });

  it('rejects a silent refresh when Google does not return an ID token', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
    mockSignInSilently.mockResolvedValue({ type: 'success', data: {} });
    mockGetTokens.mockResolvedValue({ idToken: null });
    await expect(ensureSupabaseSession('no-token@example.com')).rejects.toThrow('did not provide an ID token');
  });
});

describe('withSupabaseSession', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSession.mockReset();
    mockSignInSilently.mockReset();
    mockGetTokens.mockReset();
    mockSignInWithIdToken.mockReset();
  });

  it('re-authenticates once and retries a protected read after the server returns 401', async () => {
    let currentSession = freshSession('user@example.com');
    mockGetSession.mockImplementation(async () => ({ data: { session: currentSession }, error: null }));
    mockSignInSilently.mockResolvedValue({ type: 'success', data: {} });
    mockGetTokens.mockResolvedValue({ idToken: 'fresh-google-id-token' });
    mockSignInWithIdToken.mockImplementation(async () => {
      currentSession = { ...freshSession('user@example.com'), access_token: 'reauthenticated-user-token' };
      return { data: { user: currentSession.user, session: currentSession }, error: null };
    });

    let attempts = 0;
    const operation = jest.fn(async () => {
      attempts += 1;
      return attempts === 1
        ? { data: null, error: { status: 401, message: 'Invalid JWT' } }
        : { data: 3, error: null };
    });

    await expect(withSupabaseSession(
      'user@example.com',
      'google-sub',
      operation,
      undefined,
      { retryOnUnauthorized: true },
    )).resolves.toEqual({ data: 3, error: null });

    expect(operation).toHaveBeenCalledTimes(2);
    expect(mockSignInWithIdToken).toHaveBeenCalledTimes(1);
  });

  it('bounds recovery to one re-authentication across mixed throw and response 401 shapes', async () => {
    let currentSession = freshSession('user@example.com');
    mockGetSession.mockImplementation(async () => ({ data: { session: currentSession }, error: null }));
    mockSignInSilently.mockResolvedValue({ type: 'success', data: {} });
    mockGetTokens.mockResolvedValue({ idToken: 'fresh-google-id-token' });
    mockSignInWithIdToken.mockImplementation(async () => {
      currentSession = { ...freshSession('user@example.com'), access_token: 'reauthenticated-user-token' };
      return { data: { user: currentSession.user, session: currentSession }, error: null };
    });

    let attempts = 0;
    const operation = jest.fn(async () => {
      attempts += 1;
      if (attempts === 1) throw { status: 401, message: 'Invalid JWT' };
      return { data: null, error: { status: 401, message: 'JWT still invalid' } };
    });

    await expect(withSupabaseSession(
      'user@example.com',
      'google-sub',
      operation,
      undefined,
      { retryOnUnauthorized: true },
    )).resolves.toEqual({ data: null, error: { status: 401, message: 'JWT still invalid' } });

    expect(operation).toHaveBeenCalledTimes(2);
    expect(mockSignInWithIdToken).toHaveBeenCalledTimes(1);
  });

  it('re-authenticates when a protected read reports a top-level 401 status', async () => {
    let currentSession = freshSession('user@example.com');
    mockGetSession.mockImplementation(async () => ({ data: { session: currentSession }, error: null }));
    mockSignInSilently.mockResolvedValue({ type: 'success', data: {} });
    mockGetTokens.mockResolvedValue({ idToken: 'fresh-google-id-token' });
    mockSignInWithIdToken.mockImplementation(async () => {
      currentSession = { ...freshSession('user@example.com'), access_token: 'reauthenticated-user-token' };
      return { data: { user: currentSession.user, session: currentSession }, error: null };
    });

    let attempts = 0;
    const operation = jest.fn(async () => {
      attempts += 1;
      return attempts === 1 ? { status: 401, data: null } : { status: 200, data: 4 };
    });

    await expect(withSupabaseSession(
      'user@example.com',
      'google-sub',
      operation,
      undefined,
      { retryOnUnauthorized: true },
    )).resolves.toEqual({ status: 200, data: 4 });

    expect(operation).toHaveBeenCalledTimes(2);
    expect(mockSignInWithIdToken).toHaveBeenCalledTimes(1);
  });

  it('does not re-authenticate for a non-JWT error that only mentions authorization', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: freshSession('user@example.com') },
      error: null,
    });
    const operation = jest.fn(async () => {
      throw { status: 403, message: 'User is unauthorized to view this private row' };
    });

    await expect(withSupabaseSession(
      'user@example.com',
      'google-sub',
      operation,
      undefined,
      { retryOnUnauthorized: true },
    )).rejects.toMatchObject({ status: 403 });

    expect(operation).toHaveBeenCalledTimes(1);
    expect(mockSignInWithIdToken).not.toHaveBeenCalled();
  });

  it('does not re-authenticate a 403/5xx response just because its nested error mentions a token', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: freshSession('user@example.com') },
      error: null,
    });
    const operation = jest.fn(async () => ({
      status: 403,
      data: null,
      error: { message: 'invalid token for this private resource' },
    }));

    await expect(withSupabaseSession(
      'user@example.com',
      'google-sub',
      operation,
      undefined,
      { retryOnUnauthorized: true },
    )).resolves.toEqual({
      status: 403,
      data: null,
      error: { message: 'invalid token for this private resource' },
    });

    expect(operation).toHaveBeenCalledTimes(1);
    expect(mockSignInWithIdToken).not.toHaveBeenCalled();
  });

  it('fails closed when Supabase returns a malformed session response', async () => {
    mockGetSession.mockResolvedValue(undefined);
    const operation = jest.fn(async () => ({ data: 1, error: null }));

    await expect(withSupabaseSession(
      'user@example.com',
      'google-sub',
      operation,
      undefined,
      { retryOnUnauthorized: true },
    )).rejects.toThrow('Supabase session response was malformed');

    expect(operation).not.toHaveBeenCalled();
    expect(mockSignInWithIdToken).not.toHaveBeenCalled();
  });

  it('does not deadlock forced JWT recovery behind a direct sign-in queued on the same session lease', async () => {
    let currentSession = freshSession('user@example.com');
    mockGetSession.mockImplementation(async () => ({ data: { session: currentSession }, error: null }));
    mockSignInSilently.mockResolvedValue({ type: 'success', data: {} });
    mockGetTokens.mockResolvedValue({ idToken: 'fresh-google-id-token' });
    mockSignInWithIdToken.mockImplementation(async ({ token }: { token: string }) => {
      currentSession = { ...freshSession('user@example.com'), access_token: `session-${token}` };
      return { data: { user: currentSession.user, session: currentSession }, error: null };
    });

    let releaseFirstOperation!: () => void;
    const firstOperationGate = new Promise<void>(resolve => { releaseFirstOperation = resolve; });
    let firstOperationStarted!: () => void;
    const firstOperationStartedPromise = new Promise<void>(resolve => { firstOperationStarted = resolve; });
    let attempts = 0;
    const operation = jest.fn(async () => {
      attempts += 1;
      if (attempts === 1) {
        firstOperationStarted();
        await firstOperationGate;
        return { data: null, error: { status: 401, message: 'Invalid JWT' } };
      }
      return { data: 4, error: null };
    });

    const read = withSupabaseSession(
      'user@example.com',
      'google-sub',
      operation,
      undefined,
      { retryOnUnauthorized: true },
    );
    await firstOperationStartedPromise;

    const directSignIn = signInWithGoogleToken('user@example.com', 'direct-token');
    releaseFirstOperation();

    await expect(read).resolves.toEqual({ data: 4, error: null });
    await expect(directSignIn).resolves.toBeUndefined();
    expect(mockSignInWithIdToken).toHaveBeenCalledWith({ provider: 'google', token: 'fresh-google-id-token' });
  });

  it('fails closed when the process-wide Supabase session changes during a protected operation', async () => {
    const first = freshSession('user@example.com');
    const second = { ...freshSession('user@example.com'), access_token: 'different-token' };
    mockGetSession
      .mockResolvedValueOnce({ data: { session: first }, error: null })
      .mockResolvedValueOnce({ data: { session: first }, error: null })
      .mockResolvedValueOnce({ data: { session: second }, error: null });
    await expect(withSupabaseSession(
      'user@example.com',
      'google-sub',
      async () => ({ data: 1, error: null }),
    )).rejects.toThrow('session changed during the protected operation');
  });
});

describe('signInWithGoogleToken', () => {
  beforeEach(() => {
    mockSignInWithIdToken.mockReset();
    mockGetSession.mockReset();
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
    jest.clearAllMocks();
  });

  it('does not release a queued canceled exchange before the prior session operation finishes', async () => {
    let resolveFirstExchange!: (value: unknown) => void;
    mockSignInWithIdToken.mockImplementation(({ token }: { token: string }) => {
      if (token === 'first-token') {
        return new Promise(resolve => { resolveFirstExchange = resolve; });
      }
      return Promise.resolve(successfulTokenResponse(token === 'new-token' ? 'new@example.com' : 'old@example.com'));
    });

    const first = signInWithGoogleToken('first@example.com', 'first-token');
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    let active = true;
    const canceled = signInWithGoogleToken('old@example.com', 'old-token', () => active);
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    active = false;
    cancelSupabaseSessionRestore();

    const live = signInWithGoogleToken('new@example.com', 'new-token');
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    expect(mockSignInWithIdToken).toHaveBeenCalledTimes(1);

    resolveFirstExchange(successfulTokenResponse('first@example.com'));
    await expect(first).resolves.toBeUndefined();
    await expect(canceled).rejects.toThrow('cancelled');
    await expect(live).resolves.toBeUndefined();
    expect(mockSignInWithIdToken).toHaveBeenNthCalledWith(2, { provider: 'google', token: 'new-token' });
  });

  it('does not exchange a new token when the same account already has a fresh session', async () => {
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          user: { email: 'User@Example.com' },
          access_token: 'cached-user-token',
          expires_at: Math.floor(Date.now() / 1000) + 300,
        },
      },
      error: null,
    });
    mockSignInWithIdToken.mockResolvedValue({
      ...successfulTokenResponse(),
    });

    await signInWithGoogleToken('user@example.com', 'google-token');

    expect(mockSignInWithIdToken).not.toHaveBeenCalled();
  });

  it('does not trust a matching session that has no expiry', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { user: { email: 'user@example.com' } } },
      error: null,
    });
    mockSignInWithIdToken.mockResolvedValue(successfulTokenResponse());

    await expect(signInWithGoogleToken('user@example.com', 'google-token')).resolves.toBeUndefined();

    expect(mockSignInWithIdToken).toHaveBeenCalledWith({ provider: 'google', token: 'google-token' });
  });

  it('bounds a hung GoTrue token exchange so the process-wide session lease cannot remain pinned forever', async () => {
    jest.useFakeTimers();
    try {
      mockSignInWithIdToken.mockReturnValue(new Promise(() => undefined));
      const pending = signInWithGoogleToken('user@example.com', 'hung-token');
      for (let index = 0; index < 5; index += 1) await Promise.resolve();
      expect(mockSignInWithIdToken).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(15_000);
      for (let index = 0; index < 5; index += 1) await Promise.resolve();
      await expect(pending).rejects.toThrow('Supabase token exchange timed out');
    } finally {
      jest.useRealTimers();
    }
  });

  it('queues late timed-out exchange cleanup behind a newer session operation', async () => {
    jest.useFakeTimers();
    try {
      let resolveStaleExchange!: (value: ReturnType<typeof successfulTokenResponse>) => void;
      let resolveLiveExchange!: (value: ReturnType<typeof successfulTokenResponse>) => void;
      let liveExchangeStarted = false;
      let staleLateResponseReceived = false;
      let lateCleanupReadStarted = false;

      mockGetSession.mockImplementation(async () => {
        if (staleLateResponseReceived && liveExchangeStarted) {
          lateCleanupReadStarted = true;
          return {
            data: {
              session: {
                user: { email: 'user@example.com' },
                access_token: 'stale-access-token',
              },
            },
            error: null,
          };
        }
        return { data: { session: null }, error: null };
      });
      mockSignInWithIdToken
        .mockImplementationOnce(() => new Promise(resolve => { resolveStaleExchange = resolve; }))
        .mockImplementationOnce(() => {
          liveExchangeStarted = true;
          return new Promise(resolve => { resolveLiveExchange = resolve; });
        });

      const stale = signInWithGoogleToken('user@example.com', 'stale-token');
      for (let index = 0; index < 6; index += 1) await Promise.resolve();
      jest.advanceTimersByTime(15_000);
      for (let index = 0; index < 6; index += 1) await Promise.resolve();
      await expect(stale).rejects.toThrow('Supabase token exchange timed out');

      const live = signInWithGoogleToken('other@example.com', 'live-token');
      for (let index = 0; index < 6; index += 1) await Promise.resolve();
      expect(liveExchangeStarted).toBe(true);

      staleLateResponseReceived = true;
      resolveStaleExchange(successfulTokenResponse('user@example.com'));
      for (let index = 0; index < 6; index += 1) await Promise.resolve();
      expect(lateCleanupReadStarted).toBe(false);

      resolveLiveExchange(successfulTokenResponse('other@example.com'));
      await expect(live).resolves.toBeUndefined();
      for (let index = 0; index < 6; index += 1) await Promise.resolve();
      expect(lateCleanupReadStarted).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  it('fails closed when GoTrue returns a user without a usable session', async () => {
    mockSignInWithIdToken.mockResolvedValue({
      data: { user: { email: 'user@example.com' }, session: null },
      error: null,
    });

    await expect(signInWithGoogleToken('user@example.com', 'google-token'))
      .rejects.toThrow('usable session');
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('treats the exact expiry-skew boundary as stale', async () => {
    const now = 1_800_000_000_000;
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(now);
    try {
      mockGetSession.mockResolvedValue({
        data: { session: { user: { email: 'user@example.com' }, expires_at: now / 1000 + 60 } },
        error: null,
      });
      mockSignInWithIdToken.mockResolvedValue(successfulTokenResponse());

      await expect(signInWithGoogleToken('user@example.com', 'google-token')).resolves.toBeUndefined();
      expect(mockSignInWithIdToken).toHaveBeenCalledTimes(1);
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('shares one GoTrue request between direct sign-in and concurrent rehydration', async () => {
    let sessionReady = false;
    mockGetSession.mockImplementation(async () => {
      return sessionReady
        ? { data: { session: freshSession('user@example.com') }, error: null }
        : { data: { session: null }, error: null };
    });
    let resolveSilent!: (value: { type: string; data?: unknown }) => void;
    mockSignInSilently.mockReturnValue(new Promise(resolve => { resolveSilent = resolve; }));
    mockGetTokens.mockResolvedValue({ idToken: 'google-token-2' });

    let resolveRequest!: (value: ReturnType<typeof successfulTokenResponse>) => void;
    mockSignInWithIdToken.mockReturnValue(new Promise(resolve => {
      resolveRequest = value => {
        sessionReady = true;
        resolve(value);
      };
    }));

    const rehydration = ensureSupabaseSession('user@example.com');
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    expect(mockSignInSilently).toHaveBeenCalledTimes(1);

    const directSignIn = signInWithGoogleToken('USER@example.com', 'google-token-1');
    resolveSilent({ type: 'success', data: {} });
    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    expect(mockSignInWithIdToken).toHaveBeenCalledTimes(1);
    resolveRequest(successfulTokenResponse());
    await expect(Promise.all([rehydration, directSignIn])).resolves.toEqual([undefined, undefined]);
  });

  it('retries a transient duplicate auth-user insert and then verifies the account email', async () => {
    mockSignInWithIdToken
      .mockResolvedValueOnce({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "users_email_partial_key"' } })
      .mockResolvedValueOnce(successfulTokenResponse('User@Example.com'));

    await expect(signInWithGoogleToken(' user@example.com ', 'google-token')).resolves.toBeUndefined();
    expect(mockSignInWithIdToken).toHaveBeenCalledTimes(2);
  });

  it('retries one transient HTTP 500 from the auth exchange before succeeding', async () => {
    mockSignInWithIdToken
      .mockResolvedValueOnce({ data: null, error: { status: 500, code: 'unexpected_failure', message: 'Internal Server Error' } })
      .mockResolvedValueOnce(successfulTokenResponse());

    await expect(signInWithGoogleToken('user@example.com', 'google-token')).resolves.toBeUndefined();
    expect(mockSignInWithIdToken).toHaveBeenCalledTimes(2);
  });

  it('does not retry a transient auth error after the caller is canceled', async () => {
    let active = true;
    mockSignInWithIdToken
      .mockImplementationOnce(async () => {
        active = false;
        return { data: null, error: { status: 500, message: 'temporary auth failure' } };
      })
      .mockResolvedValueOnce(successfulTokenResponse());

    await expect(signInWithGoogleToken('user@example.com', 'google-token', () => active))
      .rejects.toThrow('cancelled');
    expect(mockSignInWithIdToken).toHaveBeenCalledTimes(1);
  });

  it('lets a concurrent caller retry with a different token after the first exchange fails', async () => {
    mockSignInWithIdToken
      .mockResolvedValueOnce({ data: null, error: { status: 400, code: 'invalid_grant', message: 'Google token rejected' } })
      .mockResolvedValueOnce(successfulTokenResponse());

    const first = signInWithGoogleToken('user@example.com', 'stale-token');
    const second = signInWithGoogleToken('user@example.com', 'fresh-token');

    await expect(first).rejects.toMatchObject({ code: 'invalid_grant' });
    await expect(second).resolves.toBeUndefined();
    expect(mockSignInWithIdToken).toHaveBeenNthCalledWith(1, { provider: 'google', token: 'stale-token' });
    expect(mockSignInWithIdToken).toHaveBeenNthCalledWith(2, { provider: 'google', token: 'fresh-token' });
  });

  it('does not reuse one concurrent exchange for a different Google subject', async () => {
    mockSignInWithIdToken
      .mockResolvedValueOnce(successfulTokenResponse('user@example.com', 'subject-one'))
      .mockResolvedValueOnce(successfulTokenResponse('user@example.com', 'subject-two'));

    await Promise.all([
      signInWithGoogleToken('user@example.com', 'token-one', undefined, 'subject-one'),
      signInWithGoogleToken('user@example.com', 'token-two', undefined, 'subject-two'),
    ]);

    expect(mockSignInWithIdToken).toHaveBeenNthCalledWith(1, { provider: 'google', token: 'token-one' });
    expect(mockSignInWithIdToken).toHaveBeenNthCalledWith(2, { provider: 'google', token: 'token-two' });
  });

  it('rejects an empty Google ID token before calling Supabase', async () => {
    await expect(signInWithGoogleToken('user@example.com', '  ')).rejects.toThrow('Google ID token is required');
    expect(mockSignInWithIdToken).not.toHaveBeenCalled();
  });

  it('does not sign out a newer session when a canceled exchange finishes late', async () => {
    let sessionRead = 0;
    mockGetSession.mockImplementation(async () => {
      sessionRead += 1;
      return sessionRead === 3
        ? { data: { session: { user: { email: 'user@example.com' }, access_token: 'fresh-access-token' } }, error: null }
        : { data: { session: null }, error: null };
    });
    let resolveStaleRequest!: (value: { data: { user: { email: string }; session: { access_token: string; expires_at: number } }; error: null }) => void;
    mockSignInWithIdToken
      .mockImplementationOnce(() => new Promise(resolve => { resolveStaleRequest = resolve; }))
      .mockResolvedValueOnce(successfulTokenResponse());
    let active = true;

    const stale = signInWithGoogleToken('user@example.com', 'same-token', () => active);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    active = false;
    cancelSupabaseSessionRestore();
    const live = signInWithGoogleToken('user@example.com', 'same-token');

    resolveStaleRequest({
      data: {
        user: { email: 'user@example.com' },
        session: { access_token: 'stale-access-token', expires_at: Math.floor(Date.now() / 1000) + 300 },
      },
      error: null,
    });
    await expect(stale).rejects.toThrow('cancelled');
    await expect(live).resolves.toBeUndefined();
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('retries a same-token caller that joined before startup cancellation', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
    let resolveStaleRequest!: (value: { data: { user: { email: string }; session: { access_token: string; expires_at: number } }; error: null }) => void;
    mockSignInWithIdToken
      .mockImplementationOnce(() => new Promise(resolve => { resolveStaleRequest = resolve; }))
      .mockResolvedValueOnce(successfulTokenResponse());
    let active = true;

    const stale = signInWithGoogleToken('user@example.com', 'same-token', () => active);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const live = signInWithGoogleToken('user@example.com', 'same-token');
    active = false;
    resolveStaleRequest({
      data: {
        user: { email: 'user@example.com' },
        session: { access_token: 'stale-access-token', expires_at: Math.floor(Date.now() / 1000) + 300 },
      },
      error: null,
    });

    await expect(stale).rejects.toThrow('cancelled');
    await expect(live).resolves.toBeUndefined();
    expect(mockSignInWithIdToken).toHaveBeenCalledTimes(2);
  });

  it('clears a successful exchange when Supabase returns a different account', async () => {
    mockGetSession
      .mockResolvedValueOnce({ data: { session: null }, error: null })
      .mockResolvedValueOnce({
        data: {
          session: {
            user: { email: 'other@example.com' },
            access_token: 'other-access-token',
            expires_at: Math.floor(Date.now() / 1000) + 300,
          },
        },
        error: null,
      });
    mockSignInWithIdToken.mockResolvedValue({
      data: {
        user: { email: 'other@example.com' },
        session: {
          access_token: 'other-access-token',
          expires_at: Math.floor(Date.now() / 1000) + 300,
        },
      },
      error: null,
    });

    await expect(signInWithGoogleToken('user@example.com', 'google-token'))
      .rejects.toThrow('does not match');
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it('rejects a token whose verified Google subject differs from the local profile', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
    mockSignInWithIdToken.mockResolvedValue({
      data: {
        user: {
          email: 'user@example.com',
          identities: [{ provider: 'google', identity_data: { sub: 'verified-other-sub' } }],
        },
        session: { access_token: 'verified-other-token', expires_at: Math.floor(Date.now() / 1000) + 300 },
      },
      error: null,
    });

    await expect(signInWithGoogleToken('user@example.com', 'google-token', undefined, 'expected-sub'))
      .rejects.toThrow('Google account');
  });

  it('surfaces non-race auth failures instead of publishing an unauthenticated local account', async () => {
    const authError = { status: 400, code: 'invalid_grant', message: 'Google token rejected' };
    mockSignInWithIdToken.mockResolvedValue({ data: null, error: authError });

    await expect(signInWithGoogleToken('user@example.com', 'google-token')).rejects.toBe(authError);
    expect(mockSignInWithIdToken).toHaveBeenCalledTimes(1);
  });
});

describe('syncToSupabase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRpc.mockImplementation(async (name: string, args?: { p_activity_rows?: Array<{ activity_key?: unknown; local_id?: unknown }> }) => {
      if (name === 'save_my_data_backup_v2') return { data: 1, error: null };
      if (name === 'append_my_activity_rows') {
        return { data: (args?.p_activity_rows ?? []).map(row => ({ activity_key: row.activity_key, local_id: row.local_id })), error: null };
      }
      return { data: null, error: null };
    });
  });

  const makeSyncBackupPayload = (activityLog: Record<string, unknown>[] = []) => ({
    schema_version: 1,
    user: null,
    categories: [],
    task_types: [],
    activity_log: activityLog,
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

  const makeSyncActivityRow = (
    id: number,
    localDate: string,
    weekStart: string,
    pointsEarned = 1,
  ) => ({
    id,
    task_type_id: null,
    kind: 'GOOD',
    duration_min: 30,
    points_earned: pointsEarned,
    stars_delta: 1,
    source: 'TASK',
    logged_at: id,
    local_date: localDate,
    week_start: weekStart,
    note: null,
    activity_key: `activity-test-${id}`,
    activity_identity_status: 'resolved',
    is_backfill: 0,
    is_clock_suspect: 0,
  });

  it('does not upload a local mutation while cloud restore is blocked', async () => {
    mockStorageGetItem.mockImplementation(async (key: string) =>
      key === 'habit_sync_backup_restore_blocked:user@example.com' ? '1' : null);

    await expect(syncToSupabase('google-sub', 'user@example.com')).resolves.toBeUndefined();
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('returns without legacy writes when the signed-in subject has no local row', async () => {
    mockGetSession.mockResolvedValue({ data: { session: freshSession('missing@example.com', 'missing-sub') }, error: null });
    mockGetDb.mockResolvedValue({
      getFirstAsync: jest.fn().mockResolvedValue(null),
      getAllAsync: jest.fn(),
      runAsync: jest.fn(),
    });
    await expect(syncToSupabase('missing-sub', 'missing@example.com')).resolves.toBeUndefined();
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalledWith('sync_user_profile_v2', expect.anything());
  });

  it('treats a non-numeric lifetime response as unavailable instead of writing a bogus local total', async () => {
    mockGetSession.mockResolvedValue({ data: { session: freshSession('no-total@example.com', 'no-total-sub') }, error: null });
    mockStorageGetItem.mockResolvedValue(null);
    const db = {
      getFirstAsync: jest.fn(async (sql: string) => {
        if (sql.includes('SELECT id FROM users')) return { id: 1 };
        if (sql.includes('lifetime_stars')) return { lifetime_stars: 0 };
        if (sql.includes('daily_summary')) return { current_streak: 0 };
        if (sql.includes('activity_log')) return { last_active_local_date: null };
        return null;
      }),
      getAllAsync: jest.fn().mockResolvedValue([]),
      runAsync: jest.fn(),
    };
    mockGetDb.mockResolvedValue(db);
    mockRpc.mockImplementation(async (name: string) => (
      name === 'sync_lifetime_stars' ? { data: 'not-a-number', error: null } : { data: null, error: null }
    ));
    await expect(syncToSupabase('no-total-sub', 'no-total@example.com')).resolves.toBeUndefined();
    expect(db.runAsync).not.toHaveBeenCalledWith(expect.stringContaining('UPDATE users SET lifetime_stars'), expect.anything());
  });

  it('reconciles a non-throwing CAS conflict result before any legacy writes', async () => {
    const email = 'sentinel-conflict@example.com';
    const revisionKey = `habit_sync_backup_revision:${email}`;
    const blockedKey = `habit_sync_backup_restore_blocked:${email}`;
    const localActivity = [makeSyncActivityRow(1, '2026-08-20', '2026-08-17')];
    const cloudPayload = makeSyncBackupPayload([
      makeSyncActivityRow(1, '2026-08-20', '2026-08-17', 2),
    ]);
    let restoreBlocked = false;
    let revision = '45';

    mockGetSession.mockResolvedValue({ data: { session: freshSession(email) }, error: null });
    mockStorageGetItem.mockImplementation(async (key: string) => {
      if (key === revisionKey) return revision;
      if (key === blockedKey) return restoreBlocked ? '1' : null;
      return null;
    });
    mockStorageSetItem.mockImplementation(async (key: string, value: string) => {
      if (key === revisionKey) revision = value;
      if (key === blockedKey) restoreBlocked = value === '1';
    });
    mockRpc.mockImplementation(async (name: string) => {
      if (name === 'save_my_data_backup_v2') return { data: -1, error: null };
      if (name === 'restore_my_data_backup_v2') {
        return { data: { payload: cloudPayload, revision: 51 }, error: null };
      }
      if (name === 'sync_lifetime_stars') return { data: 0, error: null };
      return { data: null, error: null };
    });
    const db = {
      getFirstAsync: jest.fn(async (sql: string) => {
        if (sql.includes('SELECT id FROM users WHERE google_sub')) return { id: 1 };
        if (sql.includes('COUNT(*)') && sql.includes('activity_log')) return { count: 1 };
        if (sql.includes('COUNT(*)')) return { count: 0 };
        if (sql.includes('SELECT lifetime_stars')) return { lifetime_stars: 0 };
        if (sql.includes('daily_summary')) return { current_streak: 0 };
        if (sql.includes('MAX(local_date)')) return { last_active_local_date: null };
        return null;
      }),
      getAllAsync: jest.fn(async (sql: string) => (
        sql.includes('FROM activity_log') && !sql.includes('id > ?') ? localActivity : []
      )),
      runAsync: jest.fn(),
      withTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
    };
    mockGetDb.mockResolvedValue(db);

    await expect(syncToSupabase('google-sub', email)).rejects.toThrow('Backup revision conflict');

    expect(mockRpc).toHaveBeenCalledWith('restore_my_data_backup_v2');
    expect(restoreBlocked).toBe(true);
    expect(mockStorageSetItem).toHaveBeenCalledWith(blockedKey, '1');
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('reconciles CAS with the cutoff-filtered cloud snapshot', async () => {
    const email = THANGUYENXUAN_EMAIL;
    const revisionKey = `habit_sync_backup_revision:${email}`;
    const blockedKey = `habit_sync_backup_restore_blocked:${email}`;
    const localActivity = [
      makeSyncActivityRow(1, '2026-07-05', '2026-06-29'),
      makeSyncActivityRow(2, '2026-07-06', '2026-07-06'),
    ];
    const cloudPayload = makeSyncBackupPayload(localActivity);
    let revision = '45';
    let restoreBlocked = false;
    let saveAttempts = 0;

    mockGetSession.mockResolvedValue({ data: { session: freshSession(email) }, error: null });
    mockStorageGetItem.mockImplementation(async (key: string) => {
      if (key === revisionKey) return revision;
      if (key === blockedKey) return restoreBlocked ? '1' : null;
      return null;
    });
    mockStorageSetItem.mockImplementation(async (key: string, value: string) => {
      if (key === revisionKey) revision = value;
      if (key === blockedKey) restoreBlocked = value === '1';
    });
    mockRpc.mockImplementation(async (name: string) => {
      if (name === 'save_my_data_backup_v2') {
        saveAttempts += 1;
        return { data: null, error: new Error('Backup revision conflict') };
      }
      if (name === 'restore_my_data_backup_v2') {
        return { data: { payload: cloudPayload, revision: 48 }, error: null };
      }
      if (name === 'sync_lifetime_stars') return { data: 0, error: null };
      return { data: null, error: null };
    });
    const db = {
      getFirstAsync: jest.fn(async (sql: string) => {
        if (sql.includes('SELECT id FROM users WHERE google_sub')) return { id: 1 };
        if (sql.includes('COUNT(*)') && sql.includes('activity_log')) return { count: 2 };
        if (sql.includes('COUNT(*)')) return { count: 0 };
        if (sql.includes('SELECT lifetime_stars')) return { lifetime_stars: 0 };
        if (sql.includes('daily_summary')) return { current_streak: 0 };
        if (sql.includes('MAX(local_date)')) return { last_active_local_date: null };
        return null;
      }),
      getAllAsync: jest.fn(async (sql: string) => (
        sql.includes('FROM activity_log') && !sql.includes('id > ?') ? localActivity : []
      )),
      runAsync: jest.fn(),
      withTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
    };
    mockGetDb.mockResolvedValue(db);

    await expect(syncToSupabase('google-sub', email)).resolves.toBeUndefined();

    expect(saveAttempts).toBe(1);
    expect(mockStorageSetItem).toHaveBeenCalledWith(revisionKey, '48');
    expect(mockStorageSetItem).not.toHaveBeenCalledWith(blockedKey, '1');
    expect(restoreBlocked).toBe(false);
  });

  it('persists a divergent CAS restore block and suppresses later sync attempts', async () => {
    const email = 'divergent@example.com';
    const revisionKey = `habit_sync_backup_revision:${email}`;
    const blockedKey = `habit_sync_backup_restore_blocked:${email}`;
    const localActivity = [makeSyncActivityRow(1, '2026-08-20', '2026-08-17')];
    const cloudPayload = makeSyncBackupPayload([
      makeSyncActivityRow(1, '2026-08-20', '2026-08-17', 2),
    ]);
    let restoreBlocked = false;
    let saveAttempts = 0;
    let revision = '45';

    mockGetSession.mockResolvedValue({ data: { session: freshSession(email) }, error: null });
    mockStorageGetItem.mockImplementation(async (key: string) => {
      if (key === revisionKey) return revision;
      if (key === blockedKey) return restoreBlocked ? '1' : null;
      return null;
    });
    mockStorageSetItem.mockImplementation(async (key: string, value: string) => {
      if (key === revisionKey) revision = value;
      if (key === blockedKey) restoreBlocked = value === '1';
    });
    mockRpc.mockImplementation(async (name: string) => {
      if (name === 'save_my_data_backup_v2') {
        saveAttempts += 1;
        return { data: null, error: new Error('Backup revision conflict') };
      }
      if (name === 'restore_my_data_backup_v2') {
        return { data: { payload: cloudPayload, revision: 48 }, error: null };
      }
      if (name === 'sync_lifetime_stars') return { data: 0, error: null };
      return { data: null, error: null };
    });
    const db = {
      getFirstAsync: jest.fn(async (sql: string) => {
        if (sql.includes('SELECT id FROM users WHERE google_sub')) return { id: 1 };
        if (sql.includes('COUNT(*)') && sql.includes('activity_log')) return { count: 1 };
        if (sql.includes('COUNT(*)')) return { count: 0 };
        if (sql.includes('SELECT lifetime_stars')) return { lifetime_stars: 0 };
        if (sql.includes('daily_summary')) return { current_streak: 0 };
        if (sql.includes('MAX(local_date)')) return { last_active_local_date: null };
        return null;
      }),
      getAllAsync: jest.fn(async (sql: string) => (
        sql.includes('FROM activity_log') && !sql.includes('id > ?') ? localActivity : []
      )),
      runAsync: jest.fn(),
      withTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
    };
    mockGetDb.mockResolvedValue(db);

    await expect(syncToSupabase('google-sub', email)).rejects.toThrow('Backup revision conflict');
    expect(restoreBlocked).toBe(true);
    expect(mockStorageSetItem).toHaveBeenCalledWith(blockedKey, '1');

    const rpcCallsAfterBlock = mockRpc.mock.calls.length;
    await expect(syncToSupabase('google-sub', email)).resolves.toBeUndefined();

    expect(mockRpc).toHaveBeenCalledTimes(rpcCallsAfterBlock);
    expect(saveAttempts).toBe(1);
  });

  it('publishes streak freshness through the versioned profile RPC after activity sync', async () => {
    mockGetSession.mockResolvedValue({ data: { session: freshSession('user@example.com') }, error: null });
    mockStorageGetItem.mockResolvedValue(null);
    const writes: string[] = [];
    const db = {
      getFirstAsync: jest.fn(async (sql: string) => {
        if (sql.includes('FROM users')) return { id: 1 };
        if (sql.includes('daily_summary')) return { current_streak: 7 };
        if (sql.includes('activity_log')) return { last_active_local_date: '2026-08-10' };
        throw new Error(`Unexpected sync query: ${sql}`);
      }),
      getAllAsync: jest.fn((sql: string) => sql.includes('activity_log')
        ? [{ id: 9, user_id: 1, task_type_id: 2, kind: 'GOOD', duration_min: null, points_earned: 1, stars_delta: 1, source: 'TASK', logged_at: 1, local_date: '2026-08-10', week_start: '2026-08-10', note: null, activity_key: 'activity-test-9', activity_identity_status: 'resolved' }]
        : []),
      runAsync: jest.fn(),
    };
    mockGetDb.mockResolvedValue(db);
    mockUpsert.mockImplementation(() => {
      writes.push('activity-upload');
      return { select: jest.fn().mockResolvedValue({ data: null, error: null }) };
    });
    mockRpc.mockImplementation(async (name: string) => {
      if (name === 'sync_user_profile_v2') writes.push('profile');
      if (name === 'save_my_data_backup_v2') return { data: 1, error: null };
      if (name === 'append_my_activity_rows') {
        writes.push('activity-upload');
        return { data: [{ activity_key: 'activity-test-9', local_id: 9 }], error: null };
      }
      return { data: null, error: null };
    });
    const dateTimeFormat = jest.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => (
      { resolvedOptions: () => ({ timeZone: 'Asia/Bangkok' }) } as Intl.DateTimeFormat
    ));

    try {
      await syncToSupabase('google-sub', 'user@example.com');
    } finally {
      dateTimeFormat.mockRestore();
    }

    expect(mockRpc).toHaveBeenCalledWith('sync_user_profile_v2', {
      p_current_streak: 7,
      p_last_active_local_date: '2026-08-10',
      p_timezone: 'Asia/Bangkok',
    });
    expect(mockRpc).toHaveBeenCalledWith('save_my_data_backup_v2', expect.objectContaining({ p_expected_revision: 0 }));
    expect(mockStorageSetItem).toHaveBeenCalledWith('habit_sync_backup_revision:user@example.com', '1');
    expect(writes).toEqual(['activity-upload', 'profile']);
  });

  it('uses the canonical email for server row ownership', async () => {
    mockGetSession.mockResolvedValue({ data: { session: freshSession('user@example.com') }, error: null });
    mockStorageGetItem.mockResolvedValue(null);
    let uploadedRows: Array<{ activity_key?: string; local_id?: number }> = [];
    mockGetDb.mockResolvedValue({
      getFirstAsync: jest.fn(async (sql: string, params: unknown[]) => {
        if (sql.includes('SELECT id FROM users')) {
          if (sql.includes('WHERE account_key = ?') && params[0] === 'user@example.com') return { id: 1 };
          if (params[0] === 'google-sub') return null;
          return sql.includes('LOWER(TRIM') && params[0] === 'user@example.com'
            ? { id: 1 }
            : null;
        }
        if (sql.includes('daily_summary')) return { current_streak: 0 };
        if (sql.includes('activity_log')) return { last_active_local_date: null };
        if (sql.includes('lifetime_stars')) return { lifetime_stars: 0 };
        throw new Error(`Unexpected sync query: ${sql}`);
      }),
      getAllAsync: jest.fn((sql: string) => sql.includes('activity_log')
        ? [{ id: 9, user_id: 1, task_type_id: 2, kind: 'GOOD', duration_min: null, points_earned: 1, stars_delta: 1, source: 'TASK', logged_at: 1, local_date: '2026-08-10', week_start: '2026-08-10', note: null, activity_key: 'activity-test-9', activity_identity_status: 'resolved' }]
        : []),
      runAsync: jest.fn(),
    });
    mockRpc.mockImplementation(async (name: string, args?: { p_activity_rows?: Array<{ activity_key?: string; local_id?: number }> }) => {
      if (name === 'append_my_activity_rows') {
        uploadedRows = args?.p_activity_rows ?? [];
        return { data: uploadedRows.map(row => ({ activity_key: row.activity_key, local_id: row.local_id })), error: null };
      }
      return name === 'sync_lifetime_stars' ? { data: 0, error: null } : { data: null, error: null };
    });

    await syncToSupabase('google-sub', ' User@Example.com ');

    expect(uploadedRows[0]?.activity_key).toBe('activity-test-9');
    expect(uploadedRows[0]?.local_id).toBe(9);
  });

  it('uses the stable activity key after the identity migration is present', async () => {
    mockGetSession.mockResolvedValue({ data: { session: freshSession('user@example.com') }, error: null });
    mockStorageGetItem.mockResolvedValue(null);
    const db = {
      getFirstAsync: jest.fn(async (sql: string) => {
        if (sql.includes('SELECT id FROM users')) return { id: 1 };
        if (sql.includes('daily_summary')) return { current_streak: 0 };
        if (sql.includes('activity_log')) return { last_active_local_date: null };
        if (sql.includes('lifetime_stars')) return { lifetime_stars: 0 };
        return null;
      }),
      getAllAsync: jest.fn((sql: string) => sql.includes('activity_log')
        ? [{ id: 9, user_id: 1, task_type_id: null, activity_source_task_type_id: 23, kind: 'GOOD', duration_min: null, points_earned: 1, stars_delta: 1, source: 'TASK', logged_at: 1, local_date: '2026-08-10', week_start: '2026-08-10', note: null, activity_key: 'activity-device-a-9' }]
        : []),
      runAsync: jest.fn(),
    };
    mockGetDb.mockResolvedValue(db);
    let uploadedRows: Array<{ activity_key?: string; local_id?: number; task_type_id?: number | null }> = [];
    mockRpc.mockImplementation(async (name: string, args?: { p_activity_rows?: Array<{ activity_key?: string; local_id?: number; task_type_id?: number | null }> }) => {
      if (name === 'append_my_activity_rows') {
        uploadedRows = args?.p_activity_rows ?? [];
        return { data: uploadedRows.map(row => ({ activity_key: row.activity_key, local_id: row.local_id })), error: null };
      }
      return name === 'sync_lifetime_stars' ? { data: 0, error: null } : { data: 1, error: null };
    });

    await syncToSupabase('google-sub', 'user@example.com');

    expect(uploadedRows[0]?.activity_key).toBe('activity-device-a-9');
    expect(uploadedRows[0]?.local_id).toBe(9);
    expect(uploadedRows[0]?.task_type_id).toBe(23);
    expect(mockSelect).not.toHaveBeenCalledWith('activity_key', { head: true });
  });

  it('keeps an unresolved legacy activity local and pending across a retry', async () => {
    mockGetSession.mockResolvedValue({ data: { session: freshSession('user@example.com') }, error: null });
    mockStorageGetItem.mockResolvedValue(null);
    const unresolved = {
      ...makeSyncActivityRow(9, '2026-08-10', '2026-08-10'),
      activity_key: null,
      activity_identity_status: 'unresolved',
    };
    let appendCalls = 0;
    const db = {
      getFirstAsync: jest.fn(async (sql: string) => {
        if (sql.includes('SELECT id FROM users')) return { id: 1 };
        if (sql.includes('FROM users')) return { id: 1, lifetime_stars: 0 };
        if (sql.includes('daily_summary')) return { current_streak: 0 };
        if (sql.includes('activity_log')) return { last_active_local_date: null };
        if (sql.includes('lifetime_stars')) return { lifetime_stars: 0 };
        return null;
      }),
      getAllAsync: jest.fn(async (sql: string) => sql.includes('FROM activity_log') ? [unresolved] : []),
      runAsync: jest.fn(),
    };
    mockGetDb.mockResolvedValue(db);
    mockRpc.mockImplementation(async (name: string) => {
      if (name === 'append_my_activity_rows') {
        appendCalls += 1;
        return { data: [{ activity_key: 'unexpected' }], error: null };
      }
      return name === 'save_my_data_backup_v2' ? { data: 1, error: null } : { data: 0, error: null };
    });

    await expect(syncToSupabase('google-sub', 'user@example.com'))
      .rejects.toThrow('unresolved identity');
    await expect(syncToSupabase('google-sub', 'user@example.com'))
      .rejects.toThrow('unresolved identity');

    expect(appendCalls).toBe(0);
    expect(mockStorageSetItem).not.toHaveBeenCalledWith('habit_sync_last_activity_id:1', expect.anything());
    expect((await db.getAllAsync('SELECT * FROM activity_log'))[0]).toMatchObject({
      id: 9,
      activity_key: null,
      activity_identity_status: 'unresolved',
    });
  });

  it('deletes a stable outbox row by activity key after the identity migration is present', async () => {
    mockStorageGetItem.mockResolvedValue(null);
    const outboxDb = new PendingActivityDeleteTestDb();
    outboxDb.setAccountKey(1, 'user@example.com');
    await enqueuePendingActivityDeletes(outboxDb.asDatabase(), 'user@example.com', [55]);
    outboxDb.setActivityKey('user@example.com', 55, 'activity-device-a-55');
    outboxDb.otherGetFirstAsync = async (sql: string) => {
      if (sql.includes('FROM users')) return { id: 1 };
      if (sql.includes('daily_summary')) return { current_streak: 0 };
      if (sql.includes('activity_log')) return { last_active_local_date: null };
      throw new Error(`Unexpected sync query: ${sql}`);
    };
    mockGetDb.mockResolvedValue(outboxDb.asDatabase());
    mockRpc.mockImplementation(async (name: string, args?: { p_activity_keys?: string[] }) => {
      if (name === 'save_my_data_backup_v2') return { data: 1, error: null };
      if (name === 'delete_my_activity_keys') {
        return { data: (args?.p_activity_keys ?? []).map(activity_key => ({ activity_key })), error: null };
      }
      return { data: 0, error: null };
    });

    await syncToSupabase('google-sub', 'user@example.com');

    expect(mockRpc).toHaveBeenCalledWith('delete_my_activity_keys', {
      p_activity_keys: ['activity-device-a-55'],
    });
    expect(await readPendingActivityDeletes(outboxDb.asDatabase(), 'user@example.com')).toEqual([]);
  });

  it('keeps upload, cursor, and outbox untouched when the stable delete RPC is missing', async () => {
    mockGetSession.mockResolvedValue({ data: { session: freshSession('user@example.com') }, error: null });
    mockStorageGetItem.mockResolvedValue(null);
    const outboxDb = new PendingActivityDeleteTestDb();
    outboxDb.setAccountKey(1, 'user@example.com');
    await enqueuePendingActivityDeletes(outboxDb.asDatabase(), 'user@example.com', [55]);
    outboxDb.setActivityKey('user@example.com', 55, 'activity-device-a-55');
    outboxDb.otherGetFirstAsync = async (sql: string) => {
      if (sql.includes('FROM users')) return { id: 1 };
      if (sql.includes('daily_summary')) return { current_streak: 0 };
      if (sql.includes('activity_log')) return { last_active_local_date: null };
      throw new Error(`Unexpected sync query: ${sql}`);
    };
    mockGetDb.mockResolvedValue(outboxDb.asDatabase());
    mockRpc.mockImplementation(async (name: string) => {
      if (name === 'save_my_data_backup_v2') return { data: 1, error: null };
      if (name === 'delete_my_activity_keys') {
        return { data: null, error: { code: 'PGRST202', message: 'function delete_my_activity_keys not found' } };
      }
      return { data: 0, error: null };
    });

    await expect(syncToSupabase('google-sub', 'user@example.com'))
      .rejects.toThrow('delete_my_activity_keys RPC is unavailable');

    expect(mockUpsert).not.toHaveBeenCalled();
    expect(mockStorageSetItem).not.toHaveBeenCalledWith('habit_sync_last_activity_id:1', expect.anything());
    expect(await readPendingActivityDeletes(outboxDb.asDatabase(), 'user@example.com')).toEqual([55]);
  });

  it('surfaces an activity_log upload failure instead of swallowing it', async () => {
    mockGetSession.mockResolvedValue({ data: { session: freshSession('user@example.com') }, error: null });
    mockStorageGetItem.mockResolvedValue(null);
    mockGetDb.mockResolvedValue({
      getFirstAsync: jest.fn().mockResolvedValue({ id: 1 }),
      getAllAsync: jest.fn((sql: string) => sql.includes('activity_log')
        ? [{ id: 9, user_id: 1, task_type_id: 2, kind: 'GOOD', duration_min: null, points_earned: 1, stars_delta: 1, source: 'TASK', logged_at: 1, local_date: '2026-07-22', week_start: '2026-07-20', note: null, activity_key: 'activity-test-9', activity_identity_status: 'resolved' }]
        : []),
      runAsync: jest.fn(),
    });
    mockRpc.mockImplementation(async (name: string) => (
      name === 'append_my_activity_rows'
        ? { data: null, error: new Error('RLS denied') }
        : { data: 1, error: null }
    ));

    await expect(syncToSupabase('google-sub', 'user@example.com')).rejects.toThrow('RLS denied');
  });

  it('keeps the activity cursor pending when the append RPC is missing', async () => {
    mockGetSession.mockResolvedValue({ data: { session: freshSession('user@example.com') }, error: null });
    mockStorageGetItem.mockResolvedValue(null);
    const db = {
      getFirstAsync: jest.fn().mockResolvedValue({ id: 1 }),
      getAllAsync: jest.fn((sql: string) => sql.includes('activity_log')
        ? [{ id: 9, user_id: 1, task_type_id: 2, kind: 'GOOD', duration_min: null, points_earned: 1, stars_delta: 1, source: 'TASK', logged_at: 1, local_date: '2026-07-22', week_start: '2026-07-20', note: null, activity_key: 'activity-test-9', activity_identity_status: 'resolved' }]
        : []),
      runAsync: jest.fn(),
    };
    mockGetDb.mockResolvedValue(db);
    mockRpc.mockImplementation(async (name: string) => (
      name === 'append_my_activity_rows'
        ? { data: null, error: { code: 'PGRST202', message: 'function append_my_activity_rows not found' } }
        : { data: 1, error: null }
    ));

    await expect(syncToSupabase('google-sub', 'user@example.com'))
      .rejects.toThrow('append_my_activity_rows RPC is unavailable');

    expect(mockStorageSetItem).not.toHaveBeenCalledWith('habit_sync_last_activity_id:1', expect.anything());
    expect(mockSelect).not.toHaveBeenCalledWith('activity_key', { head: true });
  });

  it('re-uploads the signed-in user activity when the server rank total lags the local lifetime total', async () => {
    mockGetSession.mockResolvedValue({ data: { session: freshSession('user@example.com') }, error: null });
    mockStorageGetItem.mockResolvedValue(null);
    const activityRows = [
      { id: 1, user_id: 1, task_type_id: 2, kind: 'GOOD', duration_min: null, points_earned: 1, stars_delta: 275, source: 'TASK', logged_at: 1, local_date: '2026-08-10', week_start: '2026-08-10', note: null, activity_key: 'activity-test-1', activity_identity_status: 'resolved' },
      { id: 2, user_id: 1, task_type_id: 2, kind: 'GOOD', duration_min: null, points_earned: 1, stars_delta: 4, source: 'TASK', logged_at: 2, local_date: '2026-08-11', week_start: '2026-08-10', note: null, activity_key: 'activity-test-2', activity_identity_status: 'resolved' },
    ];
    const uploadedActivityIds: number[][] = [];
    const db = {
      getFirstAsync: jest.fn(async (sql: string) => {
        if (sql.includes('SELECT id FROM users')) return { id: 1 };
        if (sql.includes('FROM users')) return { lifetime_stars: 279 };
        if (sql.includes('SELECT lifetime_stars FROM users')) return { lifetime_stars: 279 };
        if (sql.includes('daily_summary')) return { current_streak: 7 };
        if (sql.includes('activity_log')) return { last_active_local_date: '2026-08-11' };
        throw new Error(`Unexpected sync query: ${sql}`);
      }),
      getAllAsync: jest.fn(async (sql: string, params: unknown[]) => {
        if (!sql.includes('activity_log')) return [];
        const afterId = params[1] as number;
        return activityRows.filter(row => row.id > afterId);
      }),
      runAsync: jest.fn(),
    };
    mockGetDb.mockResolvedValue(db);
    mockRpc.mockImplementation(async (name: string, args?: { p_activity_rows?: Array<{ local_id?: number; activity_key?: string }> }) => {
      if (name === 'append_my_activity_rows') {
        const rows = args?.p_activity_rows ?? [];
        uploadedActivityIds.push(rows.map(row => row.local_id as number));
        return { data: rows.map(row => ({ activity_key: row.activity_key, local_id: row.local_id })), error: null };
      }
      if (name === 'sync_lifetime_stars') {
        lifetimeSyncCalls += 1;
        return { data: lifetimeSyncCalls === 1 ? 275 : 279, error: null };
      }
      return { data: 1, error: null };
    });
    let lifetimeSyncCalls = 0;

    await syncToSupabase('google-sub', 'user@example.com');

    expect(uploadedActivityIds).toEqual([[1, 2], [1, 2]]);
    expect(mockRpc.mock.calls.filter(([name]) => name === 'append_my_activity_rows')).toHaveLength(2);
    expect(mockRpc).toHaveBeenCalledWith('save_my_data_backup_v2', expect.any(Object));
    expect(mockRpc.mock.calls[0][0]).toBe('save_my_data_backup_v2');
  });

  it('pulls a higher server high-water total into local SQLite during normal sync', async () => {
    mockGetSession.mockResolvedValue({ data: { session: freshSession('user@example.com') }, error: null });
    mockStorageGetItem.mockResolvedValue(null);
    const userRow = { lifetime_stars: 43.4, current_tier_id: 4 as number | null };
    const tiers = [
      { id: 4, tier_order: 4, rank_name: 'Gigachad', stars_required: 40 },
    ];
    const runAsync = jest.fn(async (sql: string, params: unknown[]) => {
      if (sql.includes('UPDATE users SET lifetime_stars')) {
        userRow.lifetime_stars = params[0] as number;
        userRow.current_tier_id = params[1] as number | null;
      }
      return { changes: 1 };
    });
    const db = {
      getFirstAsync: jest.fn(async (sql: string) => {
        if (sql.includes('SELECT id FROM users')) return { id: 1 };
        if (sql.includes('lifetime_stars')) return { ...userRow };
        if (sql.includes('daily_summary')) return { current_streak: 7 };
        if (sql.includes('activity_log')) return { last_active_local_date: '2026-08-10' };
        throw new Error(`Unexpected sync query: ${sql}`);
      }),
      getAllAsync: jest.fn(async (sql: string) => {
        if (sql.includes('FROM tiers')) return tiers;
        return [];
      }),
      runAsync,
      withTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
    };
    mockGetDb.mockResolvedValue(db);
    mockRpc.mockImplementation(async (name: string) =>
      name === 'sync_lifetime_stars' ? { data: 44, error: null } : { data: null, error: null });

    await syncToSupabase('google-sub', 'user@example.com');

    expect(userRow.lifetime_stars).toBe(44);
    expect(runAsync).toHaveBeenCalledWith(
      'UPDATE users SET lifetime_stars = ?, current_tier_id = ? WHERE id = ?',
      [44, 4, 1],
    );
  });

  it('asks the JWT-scoped key RPC to clear rows, then acknowledges returned keys', async () => {
    mockGetSession.mockResolvedValue({ data: { session: freshSession('user@example.com') }, error: null });
    mockStorageGetItem.mockResolvedValue(null);
    const outboxDb = new PendingActivityDeleteTestDb();
    outboxDb.setAccountKey(1, 'user@example.com');
    await enqueuePendingActivityDeletes(outboxDb.asDatabase(), 'user@example.com', [55, 56]);
    outboxDb.setActivityKey('user@example.com', 55, 'activity-device-a-55');
    outboxDb.setActivityKey('user@example.com', 56, 'activity-device-a-56');
    outboxDb.otherGetFirstAsync = async (sql: string) => {
        if (sql.includes('FROM users')) return { id: 1 };
        if (sql.includes('daily_summary')) return { current_streak: 7 };
        if (sql.includes('activity_log')) return { last_active_local_date: '2026-08-10' };
        throw new Error(`Unexpected sync query: ${sql}`);
    };
    mockRpc.mockImplementation(async (name: string) => {
      if (name === 'save_my_data_backup_v2') return { data: 1, error: null };
      if (name === 'delete_my_activity_keys') {
        return { data: [{ activity_key: 'activity-device-a-55' }, { activity_key: 'activity-device-a-56' }], error: null };
      }
      return { data: null, error: null };
    });
    const db = outboxDb.asDatabase();
    mockGetDb.mockResolvedValue(db);
    const dateTimeFormat = jest.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => (
      { resolvedOptions: () => ({ timeZone: 'Asia/Bangkok' }) } as Intl.DateTimeFormat
    ));

    try {
      await syncToSupabase('google-sub', ' User@Example.com ');
    } finally {
      dateTimeFormat.mockRestore();
    }

    expect(mockRpc).toHaveBeenCalledWith('delete_my_activity_keys', {
      p_activity_keys: ['activity-device-a-55', 'activity-device-a-56'],
    });
    expect(await readPendingActivityDeletes(db, 'user@example.com')).toEqual([]);
  });

  it('keeps an outbox row pending when its durable activity key is unknown', async () => {
    mockGetSession.mockResolvedValue({ data: { session: freshSession('user@example.com') }, error: null });
    mockStorageGetItem.mockResolvedValue(null);
    const outboxDb = new PendingActivityDeleteTestDb();
    outboxDb.setAccountKey(1, 'user@example.com');
    await enqueuePendingActivityDeletes(outboxDb.asDatabase(), 'user@example.com', [55]);
    outboxDb.otherGetFirstAsync = async (sql: string) => {
      if (sql.includes('FROM users')) return { id: 1 };
      if (sql.includes('daily_summary')) return { current_streak: 0 };
      if (sql.includes('activity_log')) return { last_active_local_date: null };
      throw new Error(`Unexpected sync query: ${sql}`);
    };
    mockGetDb.mockResolvedValue(outboxDb.asDatabase());
    mockRpc.mockImplementation(async (name: string) => (
      name === 'save_my_data_backup_v2' ? { data: 1, error: null } : { data: [], error: null }
    ));

    await expect(syncToSupabase('google-sub', 'user@example.com'))
      .rejects.toThrow('durable activity identity is unavailable');

    expect(mockRpc).not.toHaveBeenCalledWith('delete_my_activity_keys', expect.anything());
    expect(mockUpsert).not.toHaveBeenCalled();
    expect(await readPendingActivityDeletes(outboxDb.asDatabase(), 'user@example.com')).toEqual([55]);
  });

  it('treats already-absent remote rows as cleared when the key RPC confirms every requested key', async () => {
    mockGetSession.mockResolvedValue({ data: { session: freshSession('user@example.com') }, error: null });
    mockStorageGetItem.mockResolvedValue(null);
    const outboxDb = new PendingActivityDeleteTestDb();
    outboxDb.setAccountKey(1, 'user@example.com');
    await enqueuePendingActivityDeletes(outboxDb.asDatabase(), 'user@example.com', [55]);
    outboxDb.setActivityKey('user@example.com', 55, 'activity-device-a-55');
    outboxDb.otherGetFirstAsync = async () => ({ id: 1 });
    mockGetDb.mockResolvedValue(outboxDb.asDatabase());
    mockRpc.mockImplementation(async (name: string) => {
      if (name === 'save_my_data_backup_v2') return { data: 1, error: null };
      if (name === 'delete_my_activity_keys') {
        return { data: [{ activity_key: 'activity-device-a-55' }], error: null };
      }
      return { data: null, error: null };
    });

    await expect(syncToSupabase('google-sub', 'user@example.com')).resolves.toBeUndefined();
    expect(await readPendingActivityDeletes(outboxDb.asDatabase(), 'user@example.com')).toEqual([]);
  });

  it('keeps the pending-delete queue when the key RPC fails, so the next sync retries it', async () => {
    mockGetSession.mockResolvedValue({ data: { session: freshSession('user@example.com') }, error: null });
    mockStorageGetItem.mockResolvedValue(null);
    const outboxDb = new PendingActivityDeleteTestDb();
    outboxDb.setAccountKey(1, 'user@example.com');
    await enqueuePendingActivityDeletes(outboxDb.asDatabase(), 'user@example.com', [55]);
    outboxDb.setActivityKey('user@example.com', 55, 'activity-device-a-55');
    outboxDb.otherGetFirstAsync = async () => ({ id: 1 });
    const db = outboxDb.asDatabase();
    mockGetDb.mockResolvedValue(db);
    mockRpc.mockImplementation(async (name: string) => {
      if (name === 'save_my_data_backup_v2') return { data: 1, error: null };
      if (name === 'delete_my_activity_keys') return { data: null, error: new Error('RLS denied') };
      return { data: null, error: null };
    });

    await expect(syncToSupabase('google-sub', 'user@example.com')).rejects.toThrow('RLS denied');

    expect(await readPendingActivityDeletes(db, 'user@example.com')).toEqual([55]);
  });

  it('acknowledges only keys returned by the RPC and preserves the rest after a later failure', async () => {
    mockGetSession.mockResolvedValue({ data: { session: freshSession('user@example.com') }, error: null });
    mockStorageGetItem.mockResolvedValue(null);
    const outboxDb = new PendingActivityDeleteTestDb();
    outboxDb.setAccountKey(1, 'user@example.com');
    await enqueuePendingActivityDeletes(outboxDb.asDatabase(), 'user@example.com', [55, 56]);
    outboxDb.setActivityKey('user@example.com', 55, 'activity-device-a-55');
    outboxDb.setActivityKey('user@example.com', 56, 'activity-device-a-56');
    outboxDb.otherGetFirstAsync = async () => ({ id: 1 });
    mockGetDb.mockResolvedValue(outboxDb.asDatabase());
    let deleteCalls = 0;
    mockRpc.mockImplementation(async (name: string) => {
      if (name === 'save_my_data_backup_v2') return { data: 1, error: null };
      if (name === 'delete_my_activity_keys') {
        deleteCalls += 1;
        return deleteCalls === 1
          ? { data: [{ activity_key: 'activity-device-a-55' }], error: null }
          : { data: null, error: new Error('SECOND_RPC_FAILED') };
      }
      return { data: null, error: null };
    });

    await expect(syncToSupabase('google-sub', 'user@example.com')).rejects.toThrow('SECOND_RPC_FAILED');
    expect(await readPendingActivityDeletes(outboxDb.asDatabase(), 'user@example.com')).toEqual([56]);
  });

  it('does not acknowledge anything when the RPC returns an invalid or foreign key', async () => {
    mockGetSession.mockResolvedValue({ data: { session: freshSession('user@example.com') }, error: null });
    mockStorageGetItem.mockResolvedValue(null);
    const outboxDb = new PendingActivityDeleteTestDb();
    outboxDb.setAccountKey(1, 'user@example.com');
    await enqueuePendingActivityDeletes(outboxDb.asDatabase(), 'user@example.com', [55]);
    outboxDb.setActivityKey('user@example.com', 55, 'activity-device-a-55');
    outboxDb.otherGetFirstAsync = async () => ({ id: 1 });
    mockGetDb.mockResolvedValue(outboxDb.asDatabase());
    mockRpc.mockImplementation(async (name: string) => {
      if (name === 'save_my_data_backup_v2') return { data: 1, error: null };
      if (name === 'delete_my_activity_keys') return { data: [{ activity_key: 'activity-device-b-999' }], error: null };
      return { data: null, error: null };
    });

    await expect(syncToSupabase('google-sub', 'user@example.com'))
      .rejects.toThrow('Invalid activity delete acknowledgement');
    expect(await readPendingActivityDeletes(outboxDb.asDatabase(), 'user@example.com')).toEqual([55]);
  });
});

describe('restoreLifetimeStarsFromSupabase', () => {
  const tiers = [
    { id: 1, tier_order: 1, rank_name: 'Delulu', stars_required: 5 },
    { id: 2, tier_order: 2, rank_name: 'Mewing', stars_required: 10 },
    { id: 3, tier_order: 3, rank_name: 'Rizz', stars_required: 20 },
    { id: 4, tier_order: 4, rank_name: 'Gigachad', stars_required: 40 },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSession.mockResolvedValue({ data: { session: freshSession('user@example.com') }, error: null });
  });

  it('pulls a higher server total down into local SQLite and advances the tier to match', async () => {
    mockRpc.mockImplementation(async (name: string) =>
      name === 'sync_lifetime_stars' ? { data: 39, error: null } : { data: null, error: null });
    const userRow: { lifetime_stars: number; current_tier_id: number | null } = { lifetime_stars: 8, current_tier_id: 1 };
    const runAsync = jest.fn(async (sql: string, params: unknown[]) => {
      if (sql.includes('UPDATE users SET lifetime_stars')) {
        userRow.lifetime_stars = params[0] as number;
        userRow.current_tier_id = params[1] as number | null;
      }
      return { changes: 1 };
    });
    const db = {
      getFirstAsync: jest.fn(async (sql: string) => (sql.includes('FROM users') ? { ...userRow } : null)),
      getAllAsync: jest.fn(async (sql: string) => (sql.includes('FROM tiers') ? tiers : [])),
      runAsync,
      withTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
    };
    mockGetDb.mockResolvedValue(db);

    await restoreLifetimeStarsFromSupabase(1, 'user@example.com');

    // 39 stars clears Delulu/Mewing/Rizz (5/10/20) but not Gigachad (40).
    expect(runAsync).toHaveBeenCalledWith(
      'UPDATE users SET lifetime_stars = ?, current_tier_id = ? WHERE id = ?',
      [39, 3, 1],
    );
  });

  it('never lowers or rewrites local data when the server total is not ahead of local', async () => {
    mockRpc.mockImplementation(async (name: string) =>
      name === 'sync_lifetime_stars' ? { data: 8, error: null } : { data: null, error: null });
    const db = {
      getFirstAsync: jest.fn(async () => ({ lifetime_stars: 39, current_tier_id: 4 })),
      getAllAsync: jest.fn(async () => tiers),
      runAsync: jest.fn(),
      withTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
    };
    mockGetDb.mockResolvedValue(db);

    await restoreLifetimeStarsFromSupabase(1, 'user@example.com');

    // The local-vs-remote check now runs inside the transaction (reading the
    // local total there too, not just before it) so a concurrent write can't
    // be silently overshot -- so withTransactionAsync itself is still called,
    // but it must never reach an actual write.
    expect(db.runAsync).not.toHaveBeenCalled();
  });

  it('uses the exclusive SQLite transaction adapter when one is available', async () => {
    mockRpc.mockImplementation(async (name: string) =>
      name === 'sync_lifetime_stars' ? { data: 39, error: null } : { data: null, error: null });
    const userRow = { lifetime_stars: 8, current_tier_id: 1 as number | null };
    const runAsync = jest.fn(async (sql: string, params: unknown[]) => {
      if (sql.includes('UPDATE users SET lifetime_stars')) {
        userRow.lifetime_stars = params[0] as number;
        userRow.current_tier_id = params[1] as number | null;
      }
      return { changes: 1 };
    });
    const getFirstAsync = jest.fn(async (sql: string) => (sql.includes('FROM users') ? { ...userRow } : null));
    const getAllAsync = jest.fn(async (sql: string) => (sql.includes('FROM tiers') ? tiers : []));
    const db = {
      getFirstAsync,
      getAllAsync,
      runAsync,
      withExclusiveTransactionAsync: jest.fn(async (fn: (transactionDb: unknown) => Promise<void>) => fn({ getFirstAsync, runAsync })),
      withTransactionAsync: jest.fn(),
    };
    mockGetDb.mockResolvedValue(db);

    await restoreLifetimeStarsFromSupabase(1, 'user@example.com');

    expect(db.withExclusiveTransactionAsync).toHaveBeenCalledTimes(1);
    expect(db.withTransactionAsync).not.toHaveBeenCalled();
    expect(userRow.lifetime_stars).toBe(39);
  });

  it('re-reads the local total inside the transaction, so a concurrent local write applied between the outer RPC read and the transaction is never overshot', async () => {
    mockRpc.mockImplementation(async (name: string) =>
      name === 'sync_lifetime_stars' ? { data: 39, error: null } : { data: null, error: null });
    // Simulate a concurrent local write: by the time the transaction opens
    // and re-reads, local has already caught up past the remote total.
    const runAsync = jest.fn();
    const db = {
      getFirstAsync: jest.fn(async () => ({ lifetime_stars: 50, current_tier_id: 4 })),
      getAllAsync: jest.fn(async () => tiers),
      runAsync,
      withTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
    };
    mockGetDb.mockResolvedValue(db);

    await restoreLifetimeStarsFromSupabase(1, 'user@example.com');

    expect(db.withTransactionAsync).toHaveBeenCalledTimes(1);
    expect(runAsync).not.toHaveBeenCalled();
  });

  it('is best-effort: swallows a failure instead of throwing, and reports it', async () => {
    mockGetSession.mockRejectedValue(new Error('offline'));

    await expect(restoreLifetimeStarsFromSupabase(1, 'user@example.com')).resolves.toBeUndefined();
    expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error));
  });
});

describe('sync cursor maintenance', () => {
  it('removes both legacy and account-scoped cursor keys', async () => {
    mockStorageGetAllKeys.mockResolvedValue([
      'habit_sync_last_activity_id',
      'habit_sync_last_fund_id',
      'habit_sync_last_activity_id:1',
      'habit_sync_last_fund_id:2',
      'unrelated',
    ]);
    await resetSyncCursors();
    expect(mockStorageMultiRemove).toHaveBeenCalledWith([
      'habit_sync_last_activity_id',
      'habit_sync_last_fund_id',
      'habit_sync_last_activity_id:1',
      'habit_sync_last_fund_id:2',
    ]);
  });

  it('does not issue a multi-remove call when no cursor keys exist', async () => {
    mockStorageMultiRemove.mockClear();
    mockStorageGetAllKeys.mockResolvedValue(['unrelated']);
    await resetSyncCursors();
    expect(mockStorageMultiRemove).not.toHaveBeenCalled();
  });
});
