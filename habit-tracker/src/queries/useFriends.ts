import { useRef } from 'react';
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
import { refreshSupabaseSessionForAccount } from '../api/syncService';
import { isQaSandboxActive } from '../qa/qaSandbox';
import { getLocalDate, getMillisecondsUntilLocalMidnight } from '../utils/formatters';

// Keyed by the stable Google `sub`, never email alone, so switching accounts
// on the same device can never serve one account's cached social data to
// another.
export const friendKeys = {
  all: (accountSub: string) => ['friends', accountSub] as const,
  dashboard: (accountSub: string, fallbackPlayerLabel: string, today: string) => ['friends', accountSub, 'dashboard', today, fallbackPlayerLabel] as const,
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
    queryFn: () => getFriendPendingCount(currentUserEmail!, accountSub!),
  });
}

/**
 * The ranked friend dashboard. Enabled only while the Friends segment is
 * actually selected — this is a 101-row payload and shouldn't be fetched
 * just because Rank mounted on the Global segment.
 */
export function useFriendDashboard(currentUserEmail: string | null, accountSub: string | null, fallbackPlayerLabel: string, enabled: boolean) {
  const today = getLocalDate();
  const query = useQuery({
    queryKey: friendKeys.dashboard(accountSub ?? 'anon', fallbackPlayerLabel, today),
    enabled: enabled && !isQaSandboxActive() && !!supabase && !!currentUserEmail && !!accountSub,
    staleTime: 30_000,
    refetchInterval: () => getMillisecondsUntilLocalMidnight(),
    retry: false,
    queryFn: async () => mapFriendDashboardRows(await getFriendDashboard(currentUserEmail!, accountSub!), fallbackPlayerLabel),
  });
  return { ...query, isUnavailable: query.error instanceof FriendsUnavailableError };
}

export function useFriendCode(currentUserEmail: string | null, accountSub: string | null, enabled: boolean) {
  const retryIdentityRef = useRef({
    email: currentUserEmail,
    sub: accountSub,
  });
  if (
    retryIdentityRef.current.email !== currentUserEmail
    || retryIdentityRef.current.sub !== accountSub
  ) {
    retryIdentityRef.current = { email: currentUserEmail, sub: accountSub };
  }

  const query = useQuery({
    queryKey: friendKeys.code(accountSub ?? 'anon'),
    enabled: enabled && !isQaSandboxActive() && !!supabase && !!currentUserEmail && !!accountSub,
    staleTime: Infinity,
    retry: false,
    queryFn: () => getOrCreateFriendCode(currentUserEmail!, accountSub!),
  });
  async function retryCode() {
    const startedIdentity = retryIdentityRef.current;
    if (currentUserEmail && accountSub && enabled) {
      try {
        await refreshSupabaseSessionForAccount(currentUserEmail, accountSub);
      } catch (error) {
        if (retryIdentityRef.current === startedIdentity) throw error;
        // Do not repeat the write-capable get-or-create RPC when the auth-only
        // recovery failed or the account changed while it was in flight. The
        // sheet keeps the retry affordance without touching the other account.
        return;
      }
      if (retryIdentityRef.current !== startedIdentity) return;
      const result = await query.refetch();
      if (result.isError) throw result.error ?? new Error('Friend code unavailable');
      return result;
    }
    return;
  }
  return { ...query, isUnavailable: query.error != null, retryCode };
}

export function useBlockedAccounts(currentUserEmail: string | null, accountSub: string | null, enabled: boolean) {
  const query = useQuery<RemoteBlockedAccountRow[]>({
    queryKey: friendKeys.blockedAccounts(accountSub ?? 'anon'),
    enabled: enabled && !isQaSandboxActive() && !!supabase && !!currentUserEmail && !!accountSub,
    staleTime: 30_000,
    retry: false,
    queryFn: () => getBlockedAccounts(currentUserEmail!, accountSub!),
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
    mutationFn: (code: string) => requestFriendByCode(currentUserEmail!, code, accountSub),
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
    mutationFn: (input: { requestId: string; action: 'accept' | 'reject' }) => respondToFriendRequest(currentUserEmail!, input.requestId, input.action, accountSub),
    onSuccess: status => {
      if (status === 'OK') invalidateDashboardAndPendingCount(qc, accountSub);
    },
  });
}

export function useCancelFriendRequest(currentUserEmail: string | null, accountSub: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (requestId: string) => cancelFriendRequest(currentUserEmail!, requestId, accountSub),
    onSuccess: status => {
      if (status === 'OK') invalidateDashboardAndPendingCount(qc, accountSub);
    },
  });
}

export function useRemoveFriend(currentUserEmail: string | null, accountSub: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (relationshipId: string) => removeFriend(currentUserEmail!, relationshipId, accountSub),
    onSuccess: status => {
      if (status === 'OK') invalidateDashboardAndPendingCount(qc, accountSub);
    },
  });
}

export function useBlockFriend(currentUserEmail: string | null, accountSub: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (relationshipId: string) => blockFriend(currentUserEmail!, relationshipId, accountSub),
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
    mutationFn: (relationshipId: string) => unblockFriend(currentUserEmail!, relationshipId, accountSub),
    onSuccess: status => {
      if (status === 'OK') qc.invalidateQueries({ queryKey: friendKeys.blockedAccounts(accountSub) });
    },
  });
}

export function useRotateFriendCode(currentUserEmail: string | null, accountSub: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => rotateFriendCode(currentUserEmail!, accountSub),
    onSuccess: () => qc.invalidateQueries({ queryKey: friendKeys.code(accountSub) }),
  });
}
