const mockGetSession = jest.fn();
const mockSignInWithIdToken = jest.fn();
const mockUpsert = jest.fn();
const mockRpc = jest.fn().mockResolvedValue({ data: null, error: null });
const mockFrom = jest.fn(() => ({ upsert: mockUpsert }));
const mockConfigure = jest.fn();
const mockGetTokens = jest.fn();
const mockSignInSilently = jest.fn();
const mockGetDb = jest.fn();
const mockStorageGetItem = jest.fn();

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
  setItem: jest.fn(),
}));

jest.mock('../src/db/client', () => ({ getDb: mockGetDb }));

import {
  ensureSupabaseSession,
  pauseAccountSync,
  readSocialProfile,
  runAccountSync,
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
    mockGetSession.mockResolvedValue({ data: { session: {} } });

    await syncUserStreak('user@example.com', 7);

    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockRpc).toHaveBeenCalledWith('sync_user_profile', { p_current_streak: 7 });
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
});
