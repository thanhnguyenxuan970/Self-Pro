jest.mock('../src/api/supabase', () => ({
  supabase: { rpc: jest.fn() },
}));

jest.mock('../src/api/syncService', () => ({
  ensureSupabaseSession: jest.fn(),
}));

import {
  FriendsUnavailableError,
  blockFriend,
  getFriendDashboard,
  getFriendPendingCount,
  getOrCreateFriendCode,
  requestFriendByCode,
  respondToFriendRequest,
} from '../src/api/friendsApi';

const mockSupabase = jest.requireMock('../src/api/supabase') as { supabase: { rpc: jest.Mock } };
const mockSyncService = jest.requireMock('../src/api/syncService') as { ensureSupabaseSession: jest.Mock };

beforeEach(() => {
  mockSupabase.supabase.rpc.mockReset();
  mockSyncService.ensureSupabaseSession.mockReset();
});

test('every call establishes the Supabase session first, using only the email — never sent to the RPC itself', async () => {
  mockSupabase.supabase.rpc.mockResolvedValue({ data: 'K7M2QX', error: null });
  await getOrCreateFriendCode('me@example.com');
  expect(mockSyncService.ensureSupabaseSession).toHaveBeenCalledWith('me@example.com');
  const [, params] = mockSupabase.supabase.rpc.mock.calls[0] ?? [];
  expect(params).toBeUndefined();
});

test('a missing RPC (PGRST202) on a read call maps to FriendsUnavailableError, not a generic throw', async () => {
  mockSupabase.supabase.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'not found' } });
  await expect(getFriendDashboard('me@example.com')).rejects.toBeInstanceOf(FriendsUnavailableError);
});

test('a non-missing-RPC error on a read call still throws, so it renders as the plain retry state, not "unavailable"', async () => {
  mockSupabase.supabase.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST000', message: 'network blip' } });
  await expect(getFriendDashboard('me@example.com')).rejects.not.toBeInstanceOf(FriendsUnavailableError);
});

test('get_friend_pending_count clamps a null/negative value to 0 rather than surfacing NaN', async () => {
  mockSupabase.supabase.rpc.mockResolvedValue({ data: null, error: null });
  await expect(getFriendPendingCount('me@example.com')).resolves.toBe(0);
});

test('request_friend_by_code unpacks the single-row status+retry_after_seconds result', async () => {
  mockSupabase.supabase.rpc.mockResolvedValue({ data: [{ status: 'RATE_LIMITED', retry_after_seconds: 2520 }], error: null });
  await expect(requestFriendByCode('me@example.com', 'K7M2QX')).resolves.toEqual({ status: 'RATE_LIMITED', retryAfterSeconds: 2520 });
});

test('a mutation RPC never throws — any error maps to status UNAVAILABLE so the sheet stays open with a message, never a crash', async () => {
  mockSupabase.supabase.rpc.mockRejectedValue(new Error('offline'));
  await expect(requestFriendByCode('me@example.com', 'K7M2QX')).resolves.toEqual({ status: 'UNAVAILABLE', retryAfterSeconds: null });
  await expect(respondToFriendRequest('me@example.com', 'req-1', 'accept')).resolves.toBe('UNAVAILABLE');
  await expect(blockFriend('me@example.com', 'rel-1')).resolves.toBe('UNAVAILABLE');
});

test('respond_to_friend_request passes the request id and action through as RPC params', async () => {
  mockSupabase.supabase.rpc.mockResolvedValue({ data: [{ status: 'OK' }], error: null });
  await respondToFriendRequest('me@example.com', 'req-1', 'accept');
  expect(mockSupabase.supabase.rpc).toHaveBeenCalledWith('respond_to_friend_request', { p_request_id: 'req-1', p_action: 'accept' });
});
