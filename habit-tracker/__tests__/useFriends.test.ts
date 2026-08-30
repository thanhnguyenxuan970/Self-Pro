jest.mock('@tanstack/react-query', () => ({
  useQuery: (options: unknown) => options,
  useMutation: (options: unknown) => options,
  useQueryClient: () => mockQueryClient,
}));

jest.mock('../src/api/supabase', () => ({
  supabase: { rpc: jest.fn() },
}));

jest.mock('../src/api/syncService', () => ({
  ensureSupabaseSession: jest.fn(),
}));

jest.mock('../src/api/friendsApi', () => ({
  ...jest.requireActual('../src/api/friendsApi'),
  getFriendDashboard: jest.fn(),
  getFriendPendingCount: jest.fn(),
  requestFriendByCode: jest.fn(),
  respondToFriendRequest: jest.fn(),
  blockFriend: jest.fn(),
  rotateFriendCode: jest.fn(),
}));

const mockQueryClient = { invalidateQueries: jest.fn() };

import {
  friendKeys,
  useBlockFriend,
  useFriendDashboard,
  useFriendPendingCount,
  useRequestFriendByCode,
  useRespondToFriendRequest,
  useRotateFriendCode,
} from '../src/queries/useFriends';
import * as friendsApi from '../src/api/friendsApi';
import { getLocalDate } from '../src/utils/formatters';

type QueryLike = { enabled: boolean; queryFn: () => Promise<unknown> };
type MutationLike<TData, TVars> = { onSuccess: (data: TData, variables: TVars, context: undefined, meta: never) => void };

beforeEach(() => {
  mockQueryClient.invalidateQueries.mockReset();
  jest.mocked(friendsApi.getFriendDashboard).mockReset();
  jest.mocked(friendsApi.getFriendPendingCount).mockReset();
});

test('friendKeys are stable and keyed on account sub, not email', () => {
  expect(friendKeys.dashboard('sub-1', 'Player', '2026-08-30')).toEqual(['friends', 'sub-1', 'dashboard', '2026-08-30', 'Player']);
  expect(friendKeys.pendingCount('sub-1')).toEqual(['friends', 'sub-1', 'pending-count']);
  expect(friendKeys.code('sub-1')).toEqual(['friends', 'sub-1', 'code']);
});

test('friend dashboard cache is scoped to the local calendar date', () => {
  const hook = useFriendDashboard('me@example.com', 'sub-1', 'Player', true) as unknown as { queryKey: readonly unknown[] };
  expect(hook.queryKey).toEqual(['friends', 'sub-1', 'dashboard', getLocalDate(), 'Player']);
});

test('useFriendPendingCount is disabled without an authenticated email or account sub', () => {
  const a = useFriendPendingCount(null, 'sub-1') as unknown as QueryLike;
  const b = useFriendPendingCount('me@example.com', null) as unknown as QueryLike;
  expect(a.enabled).toBe(false);
  expect(b.enabled).toBe(false);
});

test('useFriendDashboard stays disabled until the Friends segment is active, independent of auth state', () => {
  const disabled = useFriendDashboard('me@example.com', 'sub-1', 'Player', false) as unknown as QueryLike;
  expect(disabled.enabled).toBe(false);
  const enabled = useFriendDashboard('me@example.com', 'sub-1', 'Player', true) as unknown as QueryLike;
  expect(enabled.enabled).toBe(true);
});

test('useFriendDashboard queryFn maps raw rows through mapFriendDashboardRows', async () => {
  jest.mocked(friendsApi.getFriendDashboard).mockResolvedValue([
    { relationship_id: null, section: 'self', player_id: 'me', display_name: 'Minh', effective_streak: 3, year_stars: 10, friend_rank: 1, is_current_user: true, created_at: null, expires_at: null },
  ]);
  const hook = useFriendDashboard('me@example.com', 'sub-1', 'Player', true) as unknown as QueryLike;
  const result = await hook.queryFn() as { ladder: { displayName: string }[] };
  expect(result.ladder).toHaveLength(1);
  expect(result.ladder[0].displayName).toBe('Minh');
});

test('a successful add-friend request (PENDING) invalidates dashboard and pending count; a failure does not', () => {
  const hook = useRequestFriendByCode('me@example.com', 'sub-1') as unknown as MutationLike<{ status: string; retryAfterSeconds: number | null }, string>;
  hook.onSuccess({ status: 'PENDING', retryAfterSeconds: null }, 'CODE12', undefined, {} as never);
  expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['friends', 'sub-1', 'dashboard'] });
  expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['friends', 'sub-1', 'pending-count'] });

  mockQueryClient.invalidateQueries.mockClear();
  hook.onSuccess({ status: 'RATE_LIMITED', retryAfterSeconds: 60 }, 'CODE12', undefined, {} as never);
  expect(mockQueryClient.invalidateQueries).not.toHaveBeenCalled();
});

test('respond/accept only invalidates on status OK, never on a rejected mutation call', () => {
  const hook = useRespondToFriendRequest('me@example.com', 'sub-1') as unknown as MutationLike<string, { requestId: string; action: 'accept' | 'reject' }>;
  hook.onSuccess('OK', { requestId: 'r1', action: 'accept' }, undefined, {} as never);
  expect(mockQueryClient.invalidateQueries).toHaveBeenCalledTimes(2);

  mockQueryClient.invalidateQueries.mockClear();
  hook.onSuccess('NOT_FOUND', { requestId: 'r1', action: 'accept' }, undefined, {} as never);
  expect(mockQueryClient.invalidateQueries).not.toHaveBeenCalled();
});

test('blocking a friend invalidates dashboard, pending count, and the blocked-accounts list', () => {
  const hook = useBlockFriend('me@example.com', 'sub-1') as unknown as MutationLike<string, string>;
  hook.onSuccess('OK', 'rel-1', undefined, {} as never);
  expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: friendKeys.blockedAccounts('sub-1') });
});

test('rotating the code invalidates only the code query, not the dashboard', () => {
  const hook = useRotateFriendCode('me@example.com', 'sub-1') as unknown as MutationLike<string, void>;
  hook.onSuccess('NEWCODE', undefined as unknown as void, undefined, {} as never);
  expect(mockQueryClient.invalidateQueries).toHaveBeenCalledTimes(1);
  expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: friendKeys.code('sub-1') });
});
