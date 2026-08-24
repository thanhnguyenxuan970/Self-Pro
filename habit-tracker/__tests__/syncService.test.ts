const mockGetSession = jest.fn();
const mockSignInWithIdToken = jest.fn();
const mockUpsert = jest.fn();
const mockDeleteIn = jest.fn().mockResolvedValue({ error: null });
const mockDeleteEq = jest.fn(() => ({ in: mockDeleteIn }));
const mockDelete = jest.fn(() => ({ eq: mockDeleteEq }));
const mockRpc = jest.fn().mockResolvedValue({ data: null, error: null });
const mockFrom = jest.fn(() => ({ upsert: mockUpsert, delete: mockDelete }));
const mockConfigure = jest.fn();
const mockGetTokens = jest.fn();
const mockSignInSilently = jest.fn();
const mockGetDb = jest.fn();
const mockStorageGetItem = jest.fn();
const mockStorageSetItem = jest.fn();
const mockStorageRemoveItem = jest.fn();

jest.mock('../src/api/supabase', () => ({
  supabase: {
    auth: { getSession: mockGetSession, signInWithIdToken: mockSignInWithIdToken },
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
}));

jest.mock('../src/db/client', () => ({ getDb: mockGetDb }));

import * as Sentry from '@sentry/react-native';
import {
  ensureSupabaseSession,
  pauseAccountSync,
  readSocialProfile,
  restoreLifetimeStarsFromSupabase,
  runAccountSync,
  signInWithGoogleToken,
  syncToSupabase,
  syncUserStreak,
} from '../src/api/syncService';

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
});

describe('syncUserStreak', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not upsert when Supabase has no authenticated session', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });

    await syncUserStreak('user@example.com', 7);

    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('syncs only after confirming an authenticated session', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { email: 'user@example.com' } } } });

    await syncUserStreak('user@example.com', 7);

    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockRpc).toHaveBeenCalledWith('sync_user_profile', { p_current_streak: 7 });
  });

  it('does not write streak data through a session belonging to another account', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { user: { email: 'other@example.com' } } },
      error: null,
    });

    await expect(syncUserStreak('user@example.com', 7)).rejects.toThrow('does not match');

    expect(mockRpc).not.toHaveBeenCalled();
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
    mockSignInWithIdToken.mockResolvedValue({
      data: { user: { email: 'user@example.com' } },
      error: null,
    });

    await ensureSupabaseSession('user@example.com');

    expect(mockConfigure).toHaveBeenCalledWith({ webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID });
    expect(mockSignInSilently).toHaveBeenCalled();
    expect(mockSignInWithIdToken).toHaveBeenCalledWith({ provider: 'google', token: 'fresh-google-id-token' });
  });

  it('shares one in-flight Google silent sign-in across concurrent session requests', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
    let resolveSilent!: (value: { type: string; data?: unknown }) => void;
    mockSignInSilently.mockReturnValue(new Promise<{ type: string; data?: unknown }>((resolve) => {
      resolveSilent = resolve;
    }));
    mockGetTokens.mockResolvedValue({ idToken: 'fresh-google-id-token' });
    mockSignInWithIdToken.mockResolvedValue({
      data: { user: { email: 'user@example.com' } },
      error: null,
    });

    const firstRequest = ensureSupabaseSession('user@example.com');
    const secondRequest = ensureSupabaseSession('user@example.com');
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(mockSignInSilently).toHaveBeenCalledTimes(1);

    resolveSilent({ type: 'success', data: {} });
    await Promise.all([firstRequest, secondRequest]);

    expect(mockSignInWithIdToken).toHaveBeenCalledTimes(1);
  });

  it('rejects when there is no saved Google credential to refresh', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
    mockSignInSilently.mockResolvedValue({ type: 'noSavedCredentialFound' });

    await expect(ensureSupabaseSession('user@example.com')).rejects.toThrow('No saved Google credential');
    expect(mockGetTokens).not.toHaveBeenCalled();
  });

  it('rejects a session for a different account before uploading rows', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { email: 'other@example.com' } } }, error: null });

    await expect(ensureSupabaseSession('user@example.com')).rejects.toThrow('does not match');
    expect(mockGetTokens).not.toHaveBeenCalled();
  });

  it('accepts a session email that only differs in case or surrounding whitespace', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { user: { email: 'User@Example.com  ' } } },
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
    mockSignInWithIdToken.mockResolvedValue({
      data: { user: { email: 'user@example.com' } },
      error: null,
    });

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
    mockSignInWithIdToken.mockResolvedValue({
      data: { user: { email: 'User@Example.com' } },
      error: null,
    });

    await expect(ensureSupabaseSession('user@example.com')).resolves.toBeUndefined();
  });
});

describe('signInWithGoogleToken', () => {
  beforeEach(() => {
    mockSignInWithIdToken.mockReset();
    mockGetSession.mockReset();
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
    jest.clearAllMocks();
  });

  it('does not exchange a new token when the same account already has a fresh session', async () => {
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          user: { email: 'User@Example.com' },
          expires_at: Math.floor(Date.now() / 1000) + 300,
        },
      },
      error: null,
    });
    mockSignInWithIdToken.mockResolvedValue({
      data: { user: { email: 'user@example.com' } },
      error: null,
    });

    await signInWithGoogleToken('user@example.com', 'google-token');

    expect(mockSignInWithIdToken).not.toHaveBeenCalled();
  });

  it('shares one GoTrue request between direct sign-in and concurrent rehydration', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
    let resolveSilent!: (value: { type: string; data?: unknown }) => void;
    mockSignInSilently.mockReturnValue(new Promise(resolve => { resolveSilent = resolve; }));
    mockGetTokens.mockResolvedValue({ idToken: 'google-token-2' });

    let resolveRequest!: (value: { data: { user: { email: string } }; error: null }) => void;
    mockSignInWithIdToken.mockReturnValue(new Promise(resolve => { resolveRequest = resolve; }));

    const rehydration = ensureSupabaseSession('user@example.com');
    await Promise.resolve();
    expect(mockSignInSilently).toHaveBeenCalledTimes(1);

    const directSignIn = signInWithGoogleToken('USER@example.com', 'google-token-1');
    resolveSilent({ type: 'success', data: {} });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(mockSignInWithIdToken).toHaveBeenCalledTimes(1);
    resolveRequest({ data: { user: { email: 'user@example.com' } }, error: null });
    await expect(Promise.all([rehydration, directSignIn])).resolves.toEqual([undefined, undefined]);
  });

  it('retries a transient duplicate auth-user insert and then verifies the account email', async () => {
    mockSignInWithIdToken
      .mockResolvedValueOnce({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "users_email_partial_key"' } })
      .mockResolvedValueOnce({ data: { user: { email: 'User@Example.com' } }, error: null });

    await expect(signInWithGoogleToken(' user@example.com ', 'google-token')).resolves.toBeUndefined();
    expect(mockSignInWithIdToken).toHaveBeenCalledTimes(2);
  });

  it('retries one transient HTTP 500 from the auth exchange before succeeding', async () => {
    mockSignInWithIdToken
      .mockResolvedValueOnce({ data: null, error: { status: 500, code: 'unexpected_failure', message: 'Internal Server Error' } })
      .mockResolvedValueOnce({ data: { user: { email: 'user@example.com' } }, error: null });

    await expect(signInWithGoogleToken('user@example.com', 'google-token')).resolves.toBeUndefined();
    expect(mockSignInWithIdToken).toHaveBeenCalledTimes(2);
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
  });

  it('publishes streak freshness through the versioned profile RPC after activity sync', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { email: 'user@example.com' } } }, error: null });
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
        ? [{ id: 9, user_id: 1, task_type_id: 2, kind: 'GOOD', duration_min: null, points_earned: 1, stars_delta: 1, source: 'TASK', logged_at: 1, local_date: '2026-08-10', week_start: '2026-08-10', note: null }]
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
    expect(writes).toEqual(['activity-upload', 'profile']);
  });

  it('surfaces an activity_log upload failure instead of swallowing it', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { email: 'user@example.com' } } }, error: null });
    mockStorageGetItem.mockResolvedValue(null);
    mockGetDb.mockResolvedValue({
      getFirstAsync: jest.fn().mockResolvedValue({ id: 1 }),
      getAllAsync: jest.fn((sql: string) => sql.includes('activity_log')
        ? [{ id: 9, user_id: 1, task_type_id: 2, kind: 'GOOD', duration_min: null, points_earned: 1, stars_delta: 1, source: 'TASK', logged_at: 1, local_date: '2026-07-22', week_start: '2026-07-20', note: null }]
        : []),
      runAsync: jest.fn(),
    });
    mockUpsert.mockReturnValue({ select: jest.fn().mockResolvedValue({ data: null, error: new Error('RLS denied') }) });

    await expect(syncToSupabase('google-sub', 'user@example.com')).rejects.toThrow('RLS denied');
  });

  it('re-uploads the signed-in user activity when the server rank total lags the local lifetime total', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { email: 'user@example.com' } } }, error: null });
    mockStorageGetItem.mockResolvedValue(null);
    const activityRows = [
      { id: 1, user_id: 1, task_type_id: 2, kind: 'GOOD', duration_min: null, points_earned: 1, stars_delta: 275, source: 'TASK', logged_at: 1, local_date: '2026-08-10', week_start: '2026-08-10', note: null },
      { id: 2, user_id: 1, task_type_id: 2, kind: 'GOOD', duration_min: null, points_earned: 1, stars_delta: 4, source: 'TASK', logged_at: 2, local_date: '2026-08-11', week_start: '2026-08-10', note: null },
    ];
    const uploadedActivityIds: number[][] = [];
    const db = {
      getFirstAsync: jest.fn(async (sql: string) => {
        if (sql.includes('SELECT id FROM users')) return { id: 1 };
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
    mockUpsert.mockImplementation((rows: Array<{ local_id: number }>) => {
      uploadedActivityIds.push(rows.map(row => row.local_id));
      return { select: jest.fn().mockResolvedValue({ data: null, error: null }) };
    });
    let lifetimeSyncCalls = 0;
    mockRpc.mockImplementation(async (name: string) => {
      if (name === 'sync_lifetime_stars') {
        lifetimeSyncCalls += 1;
        return { data: lifetimeSyncCalls === 1 ? 275 : 279, error: null };
      }
      return { data: null, error: null };
    });

    await syncToSupabase('google-sub', 'user@example.com');

    expect(uploadedActivityIds).toEqual([[1, 2], [1, 2]]);
    expect(mockRpc).toHaveBeenCalledTimes(3);
    expect(mockRpc).toHaveBeenLastCalledWith('sync_lifetime_stars');
  });

  it('pulls a higher server high-water total into local SQLite during normal sync', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { email: 'user@example.com' } } }, error: null });
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

  it('deletes already-uploaded twins of locally-deleted rows before uploading, then clears the queue', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { email: 'user@example.com' } } }, error: null });
    mockStorageGetItem.mockImplementation(async (key: string) =>
      (key === 'pending_activity_deletes:1' ? JSON.stringify([55, 56]) : null));
    const db = {
      getFirstAsync: jest.fn(async (sql: string) => {
        if (sql.includes('FROM users')) return { id: 1 };
        if (sql.includes('daily_summary')) return { current_streak: 7 };
        if (sql.includes('activity_log')) return { last_active_local_date: '2026-08-10' };
        throw new Error(`Unexpected sync query: ${sql}`);
      }),
      getAllAsync: jest.fn(() => []),
      runAsync: jest.fn(),
      withTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
    };
    mockGetDb.mockResolvedValue(db);
    const dateTimeFormat = jest.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => (
      { resolvedOptions: () => ({ timeZone: 'Asia/Bangkok' }) } as Intl.DateTimeFormat
    ));

    try {
      await syncToSupabase('google-sub', 'user@example.com');
    } finally {
      dateTimeFormat.mockRestore();
    }

    expect(mockDeleteEq).toHaveBeenCalledWith('user_email', 'user@example.com');
    expect(mockDeleteIn).toHaveBeenCalledWith('local_id', [55, 56]);
    expect(mockStorageRemoveItem).toHaveBeenCalledWith('pending_activity_deletes:1');
  });

  it('keeps the pending-delete queue when the remote delete fails, so the next sync retries it', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { email: 'user@example.com' } } }, error: null });
    mockStorageGetItem.mockImplementation(async (key: string) =>
      (key === 'pending_activity_deletes:1' ? JSON.stringify([55]) : null));
    mockGetDb.mockResolvedValue({
      getFirstAsync: jest.fn().mockResolvedValue({ id: 1 }),
      getAllAsync: jest.fn(() => []),
      runAsync: jest.fn(),
    });
    mockDeleteIn.mockResolvedValueOnce({ error: new Error('RLS denied') });

    await expect(syncToSupabase('google-sub', 'user@example.com')).rejects.toThrow('RLS denied');

    expect(mockStorageRemoveItem).not.toHaveBeenCalled();
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
    mockGetSession.mockResolvedValue({ data: { session: { user: { email: 'user@example.com' } } }, error: null });
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
