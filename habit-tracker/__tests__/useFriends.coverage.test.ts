const mockGetFriendPendingCount = jest.fn().mockResolvedValue(2);
const mockGetFriendDashboard = jest.fn().mockResolvedValue([{ rank: 1 }]);
const mockGetOrCreateFriendCode = jest.fn().mockResolvedValue('ABC123');
const mockGetBlockedAccounts = jest.fn().mockResolvedValue([{ google_sub: 'blocked' }]);
const mockRequestFriendByCode = jest.fn().mockResolvedValue({ status: 'PENDING' });
const mockRespondToFriendRequest = jest.fn().mockResolvedValue('OK');
const mockCancelFriendRequest = jest.fn().mockResolvedValue('OK');
const mockRemoveFriend = jest.fn().mockResolvedValue('OK');
const mockBlockFriend = jest.fn().mockResolvedValue('OK');
const mockUnblockFriend = jest.fn().mockResolvedValue('OK');
const mockRotateFriendCode = jest.fn().mockResolvedValue('NEW123');
const mockRefreshSupabaseSessionForAccount = jest.fn().mockResolvedValue(undefined);
const mockMapFriendDashboardRows = jest.fn((rows: unknown[], fallback: string) => ({ rows, fallback }));
const invalidateQueries = jest.fn();
const mockQueryResult = { error: null as unknown, refetch: jest.fn().mockResolvedValue({ isError: false, data: 'fresh' }) };

jest.mock('react', () => ({ useRef: <T,>(value: T) => ({ current: value }) }));
jest.mock('@tanstack/react-query', () => ({
  useQuery: jest.fn((options) => Object.assign(mockQueryResult, options)),
  useMutation: jest.fn((options) => options),
  useQueryClient: jest.fn(() => ({ invalidateQueries })),
}));
jest.mock('../src/api/friendsApi', () => ({
  FriendsUnavailableError: class FriendsUnavailableError extends Error {},
  blockFriend: mockBlockFriend,
  cancelFriendRequest: mockCancelFriendRequest,
  getBlockedAccounts: mockGetBlockedAccounts,
  getFriendDashboard: mockGetFriendDashboard,
  getFriendPendingCount: mockGetFriendPendingCount,
  getOrCreateFriendCode: mockGetOrCreateFriendCode,
  removeFriend: mockRemoveFriend,
  requestFriendByCode: mockRequestFriendByCode,
  respondToFriendRequest: mockRespondToFriendRequest,
  rotateFriendCode: mockRotateFriendCode,
  unblockFriend: mockUnblockFriend,
}));
jest.mock('../src/lib/friends', () => ({ mapFriendDashboardRows: mockMapFriendDashboardRows }));
jest.mock('../src/api/supabase', () => ({ supabase: {} }));
jest.mock('../src/api/syncService', () => ({ refreshSupabaseSessionForAccount: mockRefreshSupabaseSessionForAccount }));
jest.mock('../src/qa/qaSandbox', () => ({ isQaSandboxActive: jest.fn(() => false) }));
jest.mock('../src/utils/formatters', () => ({
  getLocalDate: jest.fn(() => '2026-09-05'),
  getMillisecondsUntilLocalMidnight: jest.fn(() => 777),
}));

import {
  friendKeys,
  useBlockFriend,
  useBlockedAccounts,
  useCancelFriendRequest,
  useFriendCode,
  useFriendDashboard,
  useFriendPendingCount,
  useRemoveFriend,
  useRequestFriendByCode,
  useRespondToFriendRequest,
  useRotateFriendCode,
  useUnblockFriend,
} from '../src/queries/useFriends';

beforeEach(() => {
  jest.clearAllMocks();
  mockQueryResult.error = null;
  mockQueryResult.refetch.mockResolvedValue({ isError: false, data: 'fresh' });
  mockRefreshSupabaseSessionForAccount.mockResolvedValue(undefined);
  mockRequestFriendByCode.mockResolvedValue({ status: 'PENDING' });
  mockRespondToFriendRequest.mockResolvedValue('OK');
  mockCancelFriendRequest.mockResolvedValue('OK');
  mockRemoveFriend.mockResolvedValue('OK');
  mockBlockFriend.mockResolvedValue('OK');
  mockUnblockFriend.mockResolvedValue('OK');
});

describe('friends query and mutation contracts', () => {
  test('builds stable account-scoped keys and query functions', async () => {
    expect(friendKeys.dashboard('sub', 'Me', '2026-09-05')).toEqual(['friends', 'sub', 'dashboard', '2026-09-05', 'Me']);

    const pending = useFriendPendingCount('a@example.com', 'sub') as unknown as { queryFn: () => Promise<number> };
    await expect(pending.queryFn()).resolves.toBe(2);
    const dashboard = useFriendDashboard('a@example.com', 'sub', 'Me', true) as unknown as { queryFn: () => Promise<unknown> };
    await expect(dashboard.queryFn()).resolves.toEqual({ rows: [{ rank: 1 }], fallback: 'Me' });
    const code = useFriendCode('a@example.com', 'sub', true) as unknown as { queryFn: () => Promise<string> };
    await expect(code.queryFn()).resolves.toBe('ABC123');
    const blocked = useBlockedAccounts('a@example.com', 'sub', true) as unknown as { queryFn: () => Promise<unknown> };
    await expect(blocked.queryFn()).resolves.toEqual([{ google_sub: 'blocked' }]);
  });

  test('exposes unavailable state and safely retries friend code', async () => {
    const FriendsUnavailableError = (require('../src/api/friendsApi') as { FriendsUnavailableError: new (message: string) => Error }).FriendsUnavailableError;
    mockQueryResult.error = new FriendsUnavailableError('offline');
    const dashboard = useFriendDashboard('a@example.com', 'sub', 'Me', true) as unknown as { isUnavailable: boolean };
    expect(dashboard.isUnavailable).toBe(true);
    const blocked = useBlockedAccounts('a@example.com', 'sub', true) as unknown as { isUnavailable: boolean };
    expect(blocked.isUnavailable).toBe(true);

    mockQueryResult.error = null;
    const hook = useFriendCode('a@example.com', 'sub', true) as unknown as { retryCode: () => Promise<unknown> };
    await expect(hook.retryCode()).resolves.toEqual({ isError: false, data: 'fresh' });
    expect(mockRefreshSupabaseSessionForAccount).toHaveBeenCalledWith('a@example.com', 'sub');

    const disabled = useFriendCode(null, null, false) as unknown as { retryCode: () => Promise<unknown> };
    await expect(disabled.retryCode()).resolves.toBeUndefined();
    mockRefreshSupabaseSessionForAccount.mockRejectedValueOnce(new Error('refresh failed'));
    const failed = useFriendCode('a@example.com', 'sub', true) as unknown as { retryCode: () => Promise<unknown> };
    await expect(failed.retryCode()).rejects.toThrow('refresh failed');

    mockRefreshSupabaseSessionForAccount.mockResolvedValueOnce(undefined);
    mockQueryResult.refetch.mockResolvedValueOnce({ isError: true, error: null });
    const unavailable = useFriendCode('a@example.com', 'sub', true) as unknown as { retryCode: () => Promise<unknown> };
    await expect(unavailable.retryCode()).rejects.toThrow('Friend code unavailable');
  });

  test('disables social queries without a complete account identity', () => {
    expect((useFriendPendingCount(null, null) as unknown as { enabled: boolean }).enabled).toBe(false);
    expect((useFriendDashboard(null, null, 'Me', true) as unknown as { enabled: boolean }).enabled).toBe(false);
    expect((useBlockedAccounts(null, null, true) as unknown as { enabled: boolean }).enabled).toBe(false);
  });

  test('runs friend mutations and invalidates only the affected caches', async () => {
    const request = useRequestFriendByCode('a@example.com', 'sub') as unknown as { mutationFn: (code: string) => Promise<unknown>; onSuccess: (result: { status: string }) => void };
    await expect(request.mutationFn('ABC')).resolves.toEqual({ status: 'PENDING' });
    request.onSuccess({ status: 'PENDING' });
    request.onSuccess({ status: 'BLOCKED' });

    const respond = useRespondToFriendRequest('a@example.com', 'sub') as unknown as { mutationFn: (input: { requestId: string; action: 'accept' | 'reject' }) => Promise<unknown>; onSuccess: (status: string) => void };
    await respond.mutationFn({ requestId: 'r1', action: 'accept' });
    respond.onSuccess('OK');
    respond.onSuccess('NOOP');

    const cancel = useCancelFriendRequest('a@example.com', 'sub') as unknown as { mutationFn: (id: string) => Promise<unknown>; onSuccess: (status: string) => void };
    await cancel.mutationFn('r1');
    cancel.onSuccess('OK');
    const remove = useRemoveFriend('a@example.com', 'sub') as unknown as { mutationFn: (id: string) => Promise<unknown>; onSuccess: (status: string) => void };
    await remove.mutationFn('rel1');
    remove.onSuccess('OK');

    const block = useBlockFriend('a@example.com', 'sub') as unknown as { mutationFn: (id: string) => Promise<unknown>; onSuccess: (status: string) => void };
    await block.mutationFn('rel1');
    block.onSuccess('OK');
    const unblock = useUnblockFriend('a@example.com', 'sub') as unknown as { mutationFn: (id: string) => Promise<unknown>; onSuccess: (status: string) => void };
    await unblock.mutationFn('rel1');
    unblock.onSuccess('OK');
    const rotate = useRotateFriendCode('a@example.com', 'sub') as unknown as { mutationFn: () => Promise<unknown>; onSuccess: () => void };
    await expect(rotate.mutationFn()).resolves.toBe('NEW123');
    rotate.onSuccess();

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['friends', 'sub', 'dashboard'] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: friendKeys.blockedAccounts('sub') });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: friendKeys.code('sub') });
  });
});
