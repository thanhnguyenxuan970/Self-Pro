import { supabase } from './supabase';
import { withSupabaseSession, type SupabaseSessionOptions } from './syncService';
import type { FriendActionResult, FriendMutationStatus, RemoteFriendDashboardRow } from '../lib/friends';

export type { FriendActionResult, FriendMutationStatus };

export type RemoteBlockedAccountRow = {
  relationship_id: string;
  display_name: string | null;
  blocked_at: string;
};

/**
 * Thrown by the read-style calls (dashboard/pending-count/code/blocked list)
 * when the backend genuinely can't serve the feature yet — a missing RPC
 * (PGRST202, a client ahead of a not-yet-deployed migration) or no Supabase
 * client configured at all. The UI must render this as "Friends temporarily
 * unavailable" (with the global leaderboard still offered), never as an
 * empty list and never conflated with a plain connectivity retry state.
 */
export class FriendsUnavailableError extends Error {
  constructor(cause?: unknown) {
    super('Friends backend unavailable');
    this.name = 'FriendsUnavailableError';
    this.cause = cause;
  }
}

function isMissingRpcError(error: unknown): boolean {
  const code = error && typeof error === 'object' && 'code' in error ? (error as { code?: unknown }).code : undefined;
  // PGRST202 means PostgREST could not find the RPC — the exact signature of
  // "client ahead of backend." PGRST301 is an invalid/expired JWT and must not
  // be mislabeled as a missing Friends backend.
  return code === 'PGRST202';
}

async function withFriendSession<T>(
  currentUserEmail: string,
  accountSub: string | undefined,
  operation: () => Promise<T>,
  options?: SupabaseSessionOptions,
): Promise<T> {
  if (!supabase) throw new FriendsUnavailableError();
  return options
    ? withSupabaseSession(currentUserEmail, accountSub, operation, undefined, options)
    : withSupabaseSession(currentUserEmail, accountSub, operation);
}

export async function getOrCreateFriendCode(currentUserEmail: string, accountSub?: string): Promise<string> {
  const { data, error } = await withFriendSession(
    currentUserEmail,
    accountSub,
    async () => supabase!.rpc('get_or_create_my_friend_code'),
    { retryOnUnauthorized: true },
  );
  if (error) throw isMissingRpcError(error) ? new FriendsUnavailableError(error) : error;
  return data as string;
}

export async function rotateFriendCode(currentUserEmail: string, accountSub?: string): Promise<string> {
  const { data, error } = await withFriendSession(currentUserEmail, accountSub, async () => supabase!.rpc('rotate_my_friend_code'));
  if (error) throw isMissingRpcError(error) ? new FriendsUnavailableError(error) : error;
  return data as string;
}

export async function getFriendPendingCount(currentUserEmail: string, accountSub?: string): Promise<number> {
  const { data, error } = await withFriendSession(
    currentUserEmail,
    accountSub,
    async () => supabase!.rpc('get_friend_pending_count'),
    { retryOnUnauthorized: true },
  );
  if (error) throw isMissingRpcError(error) ? new FriendsUnavailableError(error) : error;
  return Math.max(0, Number(data) || 0);
}

export async function getFriendDashboard(currentUserEmail: string, accountSub?: string): Promise<RemoteFriendDashboardRow[]> {
  const { data, error } = await withFriendSession(
    currentUserEmail,
    accountSub,
    async () => supabase!.rpc('get_my_friend_dashboard'),
    { retryOnUnauthorized: true },
  );
  if (error) throw isMissingRpcError(error) ? new FriendsUnavailableError(error) : error;
  return (data ?? []) as RemoteFriendDashboardRow[];
}

export async function getBlockedAccounts(currentUserEmail: string, accountSub?: string): Promise<RemoteBlockedAccountRow[]> {
  const { data, error } = await withFriendSession(
    currentUserEmail,
    accountSub,
    async () => supabase!.rpc('get_my_blocked_accounts'),
    { retryOnUnauthorized: true },
  );
  if (error) throw isMissingRpcError(error) ? new FriendsUnavailableError(error) : error;
  return (data ?? []) as RemoteBlockedAccountRow[];
}

export async function requestFriendByCode(currentUserEmail: string, code: string, accountSub?: string): Promise<FriendActionResult> {
  try {
    const { data, error } = await withFriendSession(currentUserEmail, accountSub, async () => supabase!.rpc('request_friend_by_code', { p_code: code }));
    if (error) throw error;
    const row = (data as { status: FriendMutationStatus; retry_after_seconds: number | null }[] | null)?.[0];
    if (!row) return { status: 'UNAVAILABLE', retryAfterSeconds: null };
    return { status: row.status, retryAfterSeconds: row.retry_after_seconds };
  } catch {
    // This RPC never RAISEs for a business outcome — any thrown error here
    // is an availability problem, not a business result.
    return { status: 'UNAVAILABLE', retryAfterSeconds: null };
  }
}

async function callStatusRpc(
  fnName: 'respond_to_friend_request' | 'cancel_friend_request' | 'remove_friend' | 'block_friend' | 'unblock_friend',
  params: Record<string, string>,
  currentUserEmail: string,
  accountSub?: string,
): Promise<FriendMutationStatus> {
  try {
    const { data, error } = await withFriendSession(currentUserEmail, accountSub, async () => supabase!.rpc(fnName, params));
    if (error) throw error;
    const row = (data as { status: FriendMutationStatus }[] | null)?.[0];
    return row?.status ?? 'UNAVAILABLE';
  } catch {
    // These RPCs never RAISE for a business outcome — any thrown error here
    // is an availability problem, not a business result.
    return 'UNAVAILABLE';
  }
}

export function respondToFriendRequest(currentUserEmail: string, requestId: string, action: 'accept' | 'reject', accountSub?: string): Promise<FriendMutationStatus> {
  return callStatusRpc('respond_to_friend_request', { p_request_id: requestId, p_action: action }, currentUserEmail, accountSub);
}

export function cancelFriendRequest(currentUserEmail: string, requestId: string, accountSub?: string): Promise<FriendMutationStatus> {
  return callStatusRpc('cancel_friend_request', { p_request_id: requestId }, currentUserEmail, accountSub);
}

export function removeFriend(currentUserEmail: string, relationshipId: string, accountSub?: string): Promise<FriendMutationStatus> {
  return callStatusRpc('remove_friend', { p_relationship_id: relationshipId }, currentUserEmail, accountSub);
}

export function blockFriend(currentUserEmail: string, relationshipId: string, accountSub?: string): Promise<FriendMutationStatus> {
  return callStatusRpc('block_friend', { p_relationship_id: relationshipId }, currentUserEmail, accountSub);
}

export function unblockFriend(currentUserEmail: string, relationshipId: string, accountSub?: string): Promise<FriendMutationStatus> {
  return callStatusRpc('unblock_friend', { p_relationship_id: relationshipId }, currentUserEmail, accountSub);
}
