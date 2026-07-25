const mockGetSession = jest.fn();
const mockSignInWithIdToken = jest.fn();
const mockUpsert = jest.fn();
const mockFrom = jest.fn(() => ({ upsert: mockUpsert }));
const mockConfigure = jest.fn();
const mockGetTokens = jest.fn();
const mockSignInSilently = jest.fn();
const mockGetDb = jest.fn();
const mockStorageGetItem = jest.fn();

jest.mock('../src/api/supabase', () => ({
  supabase: { auth: { getSession: mockGetSession, signInWithIdToken: mockSignInWithIdToken }, from: mockFrom },
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

import { ensureSupabaseSession, syncToSupabase, syncUserStreak } from '../src/api/syncService';

describe('syncUserStreak', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not upsert when Supabase has no authenticated session', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });

    await syncUserStreak('user@example.com', 7);

    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('upserts only after confirming an authenticated session', async () => {
    mockGetSession.mockResolvedValue({ data: { session: {} } });
    mockUpsert.mockResolvedValue({ error: null });

    await syncUserStreak('user@example.com', 7);

    expect(mockFrom).toHaveBeenCalledWith('users');
    expect(mockUpsert).toHaveBeenCalledWith(
      { user_email: 'user@example.com', current_streak: 7 },
      { onConflict: 'user_email' },
    );
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
