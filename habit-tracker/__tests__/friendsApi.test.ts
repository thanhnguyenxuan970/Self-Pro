jest.mock('../src/api/supabase', () => ({
  supabase: { rpc: jest.fn() },
}));

jest.mock('../src/api/syncService', () => ({
  withSupabaseSession: jest.fn(async (_email: string, _sub: string | undefined, operation: () => Promise<unknown>) => operation()),
}));

import {
  FriendsUnavailableError,
  blockFriend,
  cancelFriendRequest,
  getBlockedAccounts,
  getFriendDashboard,
  getFriendPendingCount,
  getOrCreateFriendCode,
  removeFriend,
  requestFriendByCode,
  respondToFriendRequest,
  rotateFriendCode,
  unblockFriend,
} from '../src/api/friendsApi';

const mockSupabase = jest.requireMock('../src/api/supabase') as { supabase: { rpc: jest.Mock } };
const mockSyncService = jest.requireMock('../src/api/syncService') as { withSupabaseSession: jest.Mock };

beforeEach(() => {
  mockSupabase.supabase.rpc.mockReset();
  mockSyncService.withSupabaseSession.mockReset();
  mockSyncService.withSupabaseSession.mockImplementation(async (_email: string, _sub: string | undefined, operation: () => Promise<unknown>) => operation());
});

test('friend-code creation establishes the Supabase session without retrying its write RPC', async () => {
  mockSupabase.supabase.rpc.mockResolvedValue({ data: 'K7M2QX', error: null });
  await getOrCreateFriendCode('me@example.com', 'sub-1');
  expect(mockSyncService.withSupabaseSession).toHaveBeenCalledWith(
    'me@example.com',
    'sub-1',
    expect.any(Function),
  );
  const [, params] = mockSupabase.supabase.rpc.mock.calls[0] ?? [];
  expect(params).toBeUndefined();
});

test('friend dashboard rejects a malformed non-array RPC payload before the mapper sees it', async () => {
  mockSupabase.supabase.rpc.mockResolvedValue({ data: { section: 'self' }, error: null });
  await expect(getFriendDashboard('me@example.com', 'sub-1')).rejects.toThrow('Invalid Friends dashboard response');
});

test('friend dashboard reads the server-authoritative Analytics Year RPC', async () => {
  mockSupabase.supabase.rpc.mockResolvedValue({ data: [], error: null });
  await expect(getFriendDashboard('me@example.com', 'sub-1')).resolves.toEqual([]);
  expect(mockSupabase.supabase.rpc).toHaveBeenCalledWith('get_my_year_friend_dashboard');
});

test('friend dashboard rejects a null success payload instead of treating it as an empty list', async () => {
  mockSupabase.supabase.rpc.mockResolvedValue({ data: null, error: null });
  await expect(getFriendDashboard('me@example.com', 'sub-1')).rejects.toThrow('Invalid Friends dashboard response');
});

test('friend-code responses must use the six-character server format', async () => {
  mockSupabase.supabase.rpc.mockResolvedValue({ data: 'not-valid', error: null });
  await expect(getOrCreateFriendCode('me@example.com', 'sub-1')).rejects.toThrow('Invalid friend code response');
});

test('blocked-account reads reject malformed success payloads instead of giving FlatList unchecked rows', async () => {
  mockSupabase.supabase.rpc.mockResolvedValue({ data: [{ relationship_id: 'rel-1', display_name: 'Binh' }], error: null });
  await expect(getBlockedAccounts('me@example.com', 'sub-1')).rejects.toThrow('Invalid blocked accounts response');
});

test('a missing RPC (PGRST202) on a read call maps to FriendsUnavailableError, not a generic throw', async () => {
  mockSupabase.supabase.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'not found' } });
  await expect(getFriendDashboard('me@example.com', 'sub-1')).rejects.toBeInstanceOf(FriendsUnavailableError);
});

test('a non-missing-RPC error on a read call still throws, so it renders as the plain retry state, not "unavailable"', async () => {
  mockSupabase.supabase.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST000', message: 'network blip' } });
  await expect(getFriendDashboard('me@example.com', 'sub-1')).rejects.not.toBeInstanceOf(FriendsUnavailableError);
});

test('get_friend_pending_count clamps a null/negative value to 0 rather than surfacing NaN', async () => {
  mockSupabase.supabase.rpc.mockResolvedValue({ data: null, error: null });
  await expect(getFriendPendingCount('me@example.com', 'sub-1')).resolves.toBe(0);
});

test('pending-count reads request one bounded auth retry for a server-rejected JWT', async () => {
  mockSupabase.supabase.rpc.mockResolvedValue({ data: 2, error: null });

  await getFriendPendingCount('me@example.com', 'sub-1');

  expect(mockSyncService.withSupabaseSession).toHaveBeenCalledWith(
    'me@example.com',
    'sub-1',
    expect.any(Function),
    undefined,
    { retryOnUnauthorized: true },
  );
});

test('does not misclassify an invalid JWT as an unavailable Friends backend', async () => {
  const authError = { code: 'PGRST301', status: 401, message: 'JWT expired' };
  mockSupabase.supabase.rpc.mockResolvedValue({ data: null, error: authError });

  await expect(getFriendPendingCount('me@example.com', 'sub-1')).rejects.toBe(authError);
});

test('request_friend_by_code unpacks the single-row status+retry_after_seconds result', async () => {
  mockSupabase.supabase.rpc.mockResolvedValue({ data: [{ status: 'RATE_LIMITED', retry_after_seconds: 2520 }], error: null });
  await expect(requestFriendByCode('me@example.com', 'K7M2QX', 'sub-1')).resolves.toEqual({ status: 'RATE_LIMITED', retryAfterSeconds: 2520 });
});

test('mutation payloads with unknown statuses or retry values fail closed to UNAVAILABLE', async () => {
  mockSupabase.supabase.rpc
    .mockResolvedValueOnce({ data: [{ status: 'MAYBE', retry_after_seconds: null }], error: null })
    .mockResolvedValueOnce({ data: [{ status: 'OK', retry_after_seconds: 'soon' }], error: null })
    .mockResolvedValueOnce({ data: [{ status: 'MAYBE' }], error: null });

  await expect(requestFriendByCode('me@example.com', 'K7M2QX', 'sub-1'))
    .resolves.toEqual({ status: 'UNAVAILABLE', retryAfterSeconds: null });
  await expect(requestFriendByCode('me@example.com', 'K7M2QX', 'sub-1'))
    .resolves.toEqual({ status: 'UNAVAILABLE', retryAfterSeconds: null });
  await expect(respondToFriendRequest('me@example.com', 'req-1', 'accept', 'sub-1'))
    .resolves.toBe('UNAVAILABLE');
});

test('a mutation RPC never throws — any error maps to status UNAVAILABLE so the sheet stays open with a message, never a crash', async () => {
  mockSupabase.supabase.rpc.mockRejectedValue(new Error('offline'));
  await expect(requestFriendByCode('me@example.com', 'K7M2QX', 'sub-1')).resolves.toEqual({ status: 'UNAVAILABLE', retryAfterSeconds: null });
  await expect(respondToFriendRequest('me@example.com', 'req-1', 'accept', 'sub-1')).resolves.toBe('UNAVAILABLE');
  await expect(blockFriend('me@example.com', 'rel-1', 'sub-1')).resolves.toBe('UNAVAILABLE');

  expect(mockSyncService.withSupabaseSession.mock.calls).toHaveLength(3);
  for (const call of mockSyncService.withSupabaseSession.mock.calls) {
    expect(call).toHaveLength(3);
  }
});

test('respond_to_friend_request passes the request id and action through as RPC params', async () => {
  mockSupabase.supabase.rpc.mockResolvedValue({ data: [{ status: 'OK' }], error: null });
  await respondToFriendRequest('me@example.com', 'req-1', 'accept', 'sub-1');
  expect(mockSupabase.supabase.rpc).toHaveBeenCalledWith('respond_to_friend_request', { p_request_id: 'req-1', p_action: 'accept' });
});

test('defensive parsers reject primitive and malformed RPC payloads', async () => {
  mockSupabase.supabase.rpc.mockResolvedValueOnce({ data: 123, error: null });
  await expect(getOrCreateFriendCode('me@example.com')).rejects.toThrow('Invalid friend code response');

  mockSupabase.supabase.rpc.mockResolvedValueOnce({ data: [{ relationship_id: '', display_name: null, blocked_at: '' }], error: null });
  await expect(getBlockedAccounts('me@example.com')).rejects.toThrow('Invalid blocked accounts response');

  mockSupabase.supabase.rpc.mockResolvedValueOnce({ data: [{ status: 'OK', retry_after_seconds: undefined }], error: null });
  await expect(requestFriendByCode('me@example.com', 'K7M2QX')).resolves.toEqual({ status: 'UNAVAILABLE', retryAfterSeconds: null });

  mockSupabase.supabase.rpc.mockResolvedValueOnce({ data: null, error: 'offline' });
  await expect(requestFriendByCode('me@example.com', 'K7M2QX')).resolves.toEqual({ status: 'UNAVAILABLE', retryAfterSeconds: null });
  mockSupabase.supabase.rpc.mockResolvedValueOnce({ data: [{ status: 'OK' }], error: 'offline' });
  await expect(respondToFriendRequest('me@example.com', 'req-1', 'reject')).resolves.toBe('UNAVAILABLE');
});

test('maps primitive action payloads and missing rotate/blocked RPCs to safe unavailable results', async () => {
  mockSupabase.supabase.rpc.mockResolvedValueOnce({ data: 123, error: null });
  await expect(requestFriendByCode('me@example.com', 'K7M2QX')).resolves.toEqual({ status: 'UNAVAILABLE', retryAfterSeconds: null });

  mockSupabase.supabase.rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202' } });
  await expect(rotateFriendCode('me@example.com')).rejects.toBeInstanceOf(FriendsUnavailableError);

  mockSupabase.supabase.rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202' } });
  await expect(getBlockedAccounts('me@example.com')).rejects.toBeInstanceOf(FriendsUnavailableError);

  mockSupabase.supabase.rpc.mockResolvedValueOnce({ data: 'K7M2QX', error: null });
  await expect(rotateFriendCode('me@example.com')).resolves.toBe('K7M2QX');
  mockSupabase.supabase.rpc.mockResolvedValueOnce({ data: [], error: null });
  await expect(getBlockedAccounts('me@example.com')).resolves.toEqual([]);

  const genericError = new Error('backend failed');
  mockSupabase.supabase.rpc.mockResolvedValueOnce({ data: null, error: genericError });
  await expect(rotateFriendCode('me@example.com')).rejects.toBe(genericError);
  mockSupabase.supabase.rpc.mockResolvedValueOnce({ data: null, error: genericError });
  await expect(getBlockedAccounts('me@example.com')).rejects.toBe(genericError);
});

test('rejects every malformed dashboard row shape before it reaches the UI mapper', async () => {
  const valid = {
    relationship_id: null, section: 'self', player_id: 'p', display_name: 'P',
    effective_streak: 1, year_stars: 2, friend_rank: 1, is_current_user: true,
    created_at: null, expires_at: null,
  };
  for (const row of [
    { ...valid, section: 'unknown' },
    { ...valid, section: 'accepted', relationship_id: null },
    { ...valid, player_id: 42 },
    { ...valid, effective_streak: '1' },
    { ...valid, year_stars: '2' },
    { ...valid, friend_rank: '1' },
    { ...valid, is_current_user: 1 },
    { ...valid, created_at: 42 },
  ]) {
    mockSupabase.supabase.rpc.mockResolvedValueOnce({ data: [row], error: null });
    await expect(getFriendDashboard('me@example.com')).rejects.toThrow('Invalid Friends dashboard response');
  }
});

test('accepts valid nullable retry values and rejects empty action payloads', async () => {
  mockSupabase.supabase.rpc
    .mockResolvedValueOnce({ data: [{ status: 'OK', retry_after_seconds: null }], error: null })
    .mockResolvedValueOnce({ data: [{ status: 'PENDING', retry_after_seconds: 0 }], error: null })
    .mockResolvedValueOnce({ data: [], error: null })
    .mockResolvedValueOnce({ data: null, error: null });
  await expect(requestFriendByCode('me@example.com', 'K7M2QX')).resolves.toEqual({ status: 'OK', retryAfterSeconds: null });
  await expect(requestFriendByCode('me@example.com', 'K7M2QX')).resolves.toEqual({ status: 'PENDING', retryAfterSeconds: 0 });
  await expect(respondToFriendRequest('me@example.com', 'r', 'reject')).resolves.toBe('UNAVAILABLE');
  await expect(respondToFriendRequest('me@example.com', 'r', 'reject')).resolves.toBe('UNAVAILABLE');
});

test('covers all status-only RPC wrappers and rotation code parsing', async () => {
  mockSupabase.supabase.rpc
    .mockResolvedValueOnce({ data: ' abcdEF ', error: null })
    .mockResolvedValueOnce({ data: [{ status: 'ACCEPTED' }], error: null })
    .mockResolvedValueOnce({ data: [{ status: 'OK' }], error: null })
    .mockResolvedValueOnce({ data: [{ status: 'SELF' }], error: null })
    .mockResolvedValueOnce({ data: [{ status: 'FORBIDDEN' }], error: null })
    .mockResolvedValueOnce({ data: [{ status: 'NOT_FOUND' }], error: null });
  await expect(rotateFriendCode('me@example.com')).resolves.toBe('ABCDEF');
  await expect(respondToFriendRequest('me@example.com', 'r', 'accept')).resolves.toBe('ACCEPTED');
  await expect(cancelFriendRequest('me@example.com', 'r')).resolves.toBe('OK');
  await expect(removeFriend('me@example.com', 'rel')).resolves.toBe('SELF');
  await expect(blockFriend('me@example.com', 'rel')).resolves.toBe('FORBIDDEN');
  await expect(unblockFriend('me@example.com', 'rel')).resolves.toBe('NOT_FOUND');
});

test('fails closed when the Supabase client is not configured', async () => {
  const configuredClient = mockSupabase.supabase;
  mockSupabase.supabase = null as never;
  try {
    await expect(getFriendDashboard('me@example.com')).rejects.toBeInstanceOf(FriendsUnavailableError);
    await expect(requestFriendByCode('me@example.com', 'K7M2QX')).resolves.toEqual({ status: 'UNAVAILABLE', retryAfterSeconds: null });
  } finally {
    mockSupabase.supabase = configuredClient;
  }
});

test('read calls classify missing-RPC errors consistently across endpoints', async () => {
  for (const call of [
    () => getOrCreateFriendCode('me@example.com'),
    () => getFriendPendingCount('me@example.com'),
    () => getBlockedAccounts('me@example.com'),
  ]) {
    mockSupabase.supabase.rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202' } });
    await expect(call()).rejects.toBeInstanceOf(FriendsUnavailableError);
  }
});

test('accepts complete nullable dashboard and blocked-account rows', async () => {
  mockSupabase.supabase.rpc.mockResolvedValueOnce({ data: [
    { relationship_id: null, section: 'self', player_id: null, display_name: null, effective_streak: null, year_stars: null, friend_rank: null, is_current_user: true, created_at: null, expires_at: null },
    { relationship_id: 'r1', section: 'accepted', player_id: 'p1', display_name: 'A', effective_streak: 4, year_stars: 20, friend_rank: 2, is_current_user: false, created_at: '2026-01-01', expires_at: null },
    { relationship_id: 'r2', section: 'incoming', player_id: 'p2', display_name: null, effective_streak: 0, year_stars: 0, friend_rank: null, is_current_user: false, created_at: null, expires_at: '2026-01-02' },
    { relationship_id: 'r3', section: 'outgoing', player_id: 'p3', display_name: 'B', effective_streak: null, year_stars: null, friend_rank: 3, is_current_user: false, created_at: '2026-01-03', expires_at: '2026-01-04' },
  ], error: null });
  await expect(getFriendDashboard('me@example.com')).resolves.toHaveLength(4);

  mockSupabase.supabase.rpc.mockResolvedValueOnce({ data: [{ relationship_id: 'r4', display_name: null, blocked_at: '2026-01-05' }], error: null });
  await expect(getBlockedAccounts('me@example.com')).resolves.toEqual([{ relationship_id: 'r4', display_name: null, blocked_at: '2026-01-05' }]);
});

test('rejects null rows in dashboard and blocked-account arrays', async () => {
  mockSupabase.supabase.rpc.mockResolvedValueOnce({ data: [null], error: null });
  await expect(getFriendDashboard('me@example.com')).rejects.toThrow('Invalid Friends dashboard response');
  mockSupabase.supabase.rpc.mockResolvedValueOnce({ data: [null], error: null });
  await expect(getBlockedAccounts('me@example.com')).rejects.toThrow('Invalid blocked accounts response');
});

test('keeps primitive RPC failures distinct and classifies rotation rollout errors', async () => {
  mockSupabase.supabase.rpc.mockResolvedValueOnce({ data: null, error: 'offline' });
  await expect(getOrCreateFriendCode('me@example.com')).rejects.toBe('offline');
  mockSupabase.supabase.rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202' } });
  await expect(rotateFriendCode('me@example.com')).rejects.toBeInstanceOf(FriendsUnavailableError);
});
