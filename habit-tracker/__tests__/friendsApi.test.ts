jest.mock('../src/api/supabase', () => ({
  supabase: { rpc: jest.fn() },
}));

jest.mock('../src/api/syncService', () => ({
  withSupabaseSession: jest.fn(async (_email: string, _sub: string | undefined, operation: () => Promise<unknown>) => operation()),
}));

import {
  FriendsUnavailableError,
  blockFriend,
  getBlockedAccounts,
  getFriendDashboard,
  getFriendPendingCount,
  getOrCreateFriendCode,
  requestFriendByCode,
  respondToFriendRequest,
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
