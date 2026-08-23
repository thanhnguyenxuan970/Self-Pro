import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
  type RemoteBlockedAccountRow,
} from '../api/friendsApi';
import { mapFriendDashboardRows } from '../lib/friends';
import { supabase } from '../api/supabase';
import { isQaSandboxActive } from '../qa/qaSandbox';

// Keyed by the stable Google `sub`, never email alone, so switching accounts
// on the same device can never serve one account's cached social data to
// another.
export const friendKeys = {
  all: (accountSub: string) => ['friends', accountSub] as const,
  dashboard: (accountSub: string, fallbackPlayerLabel: string) => ['friends', accountSub, 'dashboard', fallbackPlayerLabel] as const,
  code: (accountSub: string) => ['friends', accountSub, 'code'] as const,
  pendingCount: (accountSub: string) => ['friends', accountSub, 'pending-count'] as const,
  blockedAccounts: (accountSub: string) => ['friends', accountSub, 'blocked-accounts'] as const,
};

/**
 * App-level pending-request count, enabled at authenticated app entry (not
 * gated on the Rank/Friends screen being mounted) so the tab badge is
 * already correct the first time the user opens Rank.
 *
 * This file deliberately never imports `react-native` (every query/api/lib
 * module here stays plain-Node testable — see `useLeaderboard.ts`), so the
 * `AppState`-driven foreground refetch RN needs in place of a
 * `visibilitychange` event is wired by the caller (`RootNavigator`'s
 * `MainTabs`) via this hook's returned `refetch`, not inside this hook.
 */
export function useFriendPendingCount(currentUserEmail: string | null, accountSub: string | null) {
  return useQuery({
    queryKey: friendKeys.pendingCount(accountSub ?? 'anon'),
    enabled: !isQaSandboxActive() && !!supabase && !!currentUserEmail && !!accountSub,
    staleTime: 60_000,
    retry: false,
    queryFn: () => getFriendPendingCount(currentUserEmail!),
  });
}

/**
 * The ranked friend dashboard. Enabled only while the Friends segment is
 * actually selected — this is a 101-row payload and shouldn't be fetched
 * just because Rank mounted on the Global segment.
 */
export function useFriendDashboard(currentUserEmail: string | null, accountSub: string | null, fallbackPlayerLabel: string, enabled: boolean) {
  const query = useQuery({
    queryKey: friendKeys.dashboard(accountSub ?? 'anon', fallbackPlayerLabel),
    enabled: enabled && !isQaSandboxActive() && !!supabase && !!currentUserEmail && !!accountSub,
    staleTime: 30_000,
    retry: false,
    queryFn: async () => mapFriendDashboardRows(await getFriendDashboard(currentUserEmail!), fallbackPlayerLabel),
  });
  return { ...query, isUnavailable: query.error instanceof FriendsUnavailableError };
}

export function useFriendCode(currentUserEmail: string | null, accountSub: string | null, enabled: boolean) {
  const query = useQuery({
    queryKey: friendKeys.code(accountSub ?? 'anon'),
    enabled: enabled && !isQaSandboxActive() && !!supabase && !!currentUserEmail && !!accountSub,
    staleTime: Infinity,
    retry: false,
    queryFn: () => getOrCreateFriendCode(currentUserEmail!),
  });
  return { ...query, isUnavailable: query.error instanceof FriendsUnavailableError };
}

export function useBlockedAccounts(currentUserEmail: string | null, accountSub: string | null, enabled: boolean) {
  const query = useQuery<RemoteBlockedAccountRow[]>({
    queryKey: friendKeys.blockedAccounts(accountSub ?? 'anon'),
    enabled: enabled && !isQaSandboxActive() && !!supabase && !!currentUserEmail && !!accountSub,
    staleTime: 30_000,
    retry: false,
    queryFn: () => getBlockedAccounts(currentUserEmail!),
  });
  return { ...query, isUnavailable: query.error instanceof FriendsUnavailableError };
}

// TanStack Query matches invalidateQueries keys as prefixes, so the
// dashboard's variable `fallbackPlayerLabel` suffix doesn't need to be known
// here — invalidating everything under ['friends', sub, 'dashboard'] hits
// every label variant.
function invalidateDashboardAndPendingCount(qc: ReturnType<typeof useQueryClient>, accountSub: string) {
  qc.invalidateQueries({ queryKey: ['friends', accountSub, 'dashboard'] });
  qc.invalidateQueries({ queryKey: friendKeys.pendingCount(accountSub) });
}

export function useRequestFriendByCode(currentUserEmail: string | null, accountSub: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => requestFriendByCode(currentUserEmail!, code),
    onSuccess: result => {
      if (result.status === 'PENDING' || result.status === 'ACCEPTED') {
        invalidateDashboardAndPendingCount(qc, accountSub);
      }
    },
  });
}

export function useRespondToFriendRequest(currentUserEmail: string | null, accountSub: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { requestId: string; action: 'accept' | 'reject' }) => respondToFriendRequest(currentUserEmail!, input.requestId, input.action),
    onSuccess: status => {
      if (status === 'OK') invalidateDashboardAndPendingCount(qc, accountSub);
    },
  });
}

export function useCancelFriendRequest(currentUserEmail: string | null, accountSub: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (requestId: string) => cancelFriendRequest(currentUserEmail!, requestId),
    onSuccess: status => {
      if (status === 'OK') invalidateDashboardAndPendingCount(qc, accountSub);
    },
  });
}

export function useRemoveFriend(currentUserEmail: string | null, accountSub: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (relationshipId: string) => removeFriend(currentUserEmail!, relationshipId),
    onSuccess: status => {
      if (status === 'OK') invalidateDashboardAndPendingCount(qc, accountSub);
    },
  });
}

export function useBlockFriend(currentUserEmail: string | null, accountSub: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (relationshipId: string) => blockFriend(currentUserEmail!, relationshipId),
    onSuccess: status => {
      if (status === 'OK') {
        invalidateDashboardAndPendingCount(qc, accountSub);
        // Blocking (from either the ladder row or an incoming request) adds
        // a row to the blocked list, even though that screen is rarely open
        // at the time — mark it stale so the next visit is fresh.
        qc.invalidateQueries({ queryKey: friendKeys.blockedAccounts(accountSub) });
      }
    },
  });
}

export function useUnblockFriend(currentUserEmail: string | null, accountSub: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (relationshipId: string) => unblockFriend(currentUserEmail!, relationshipId),
    onSuccess: status => {
      if (status === 'OK') qc.invalidateQueries({ queryKey: friendKeys.blockedAccounts(accountSub) });
    },
  });
}

export function useRotateFriendCode(currentUserEmail: string | null, accountSub: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => rotateFriendCode(currentUserEmail!),
    onSuccess: () => qc.invalidateQueries({ queryKey: friendKeys.code(accountSub) }),
  });
}
