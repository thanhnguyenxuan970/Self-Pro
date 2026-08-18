import { supabase } from './supabase';
import { ensureSupabaseSession } from './syncService';
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
  readonly kind = 'UNAVAILABLE' as const;
  constructor(cause?: unknown) {
    super('Friends backend unavailable');
    this.name = 'FriendsUnavailableError';
    this.cause = cause;
  }
}

function isMissingRpcError(error: unknown): boolean {
  const code = error && typeof error === 'object' && 'code' in error ? (error as { code?: unknown }).code : undefined;
  // PGRST202: PostgREST couldn't find the RPC — the exact signature of "client
  // ahead of backend." PGRST301 covers a stale/invalid schema cache entry for
  // the same underlying cause.
  return code === 'PGRST202' || code === 'PGRST301';
}

async function ensureSession(currentUserEmail: string): Promise<void> {
  if (!supabase) throw new FriendsUnavailableError();
  await ensureSupabaseSession(currentUserEmail);
}

export async function getOrCreateFriendCode(currentUserEmail: string): Promise<string> {
  await ensureSession(currentUserEmail);
  const { data, error } = await supabase!.rpc('get_or_create_my_friend_code');
  if (error) throw isMissingRpcError(error) ? new FriendsUnavailableError(error) : error;
  return data as string;
}

export async function rotateFriendCode(currentUserEmail: string): Promise<string> {
  await ensureSession(currentUserEmail);
  const { data, error } = await supabase!.rpc('rotate_my_friend_code');
  if (error) throw isMissingRpcError(error) ? new FriendsUnavailableError(error) : error;
  return data as string;
}

export async function getFriendPendingCount(currentUserEmail: string): Promise<number> {
  await ensureSession(currentUserEmail);
  const { data, error } = await supabase!.rpc('get_friend_pending_count');
  if (error) throw isMissingRpcError(error) ? new FriendsUnavailableError(error) : error;
  return Math.max(0, Number(data) || 0);
}

export async function getFriendDashboard(currentUserEmail: string): Promise<RemoteFriendDashboardRow[]> {
  await ensureSession(currentUserEmail);
  const { data, error } = await supabase!.rpc('get_my_friend_dashboard');
  if (error) throw isMissingRpcError(error) ? new FriendsUnavailableError(error) : error;
  return (data ?? []) as RemoteFriendDashboardRow[];
}

export async function getBlockedAccounts(currentUserEmail: string): Promise<RemoteBlockedAccountRow[]> {
  await ensureSession(currentUserEmail);
  const { data, error } = await supabase!.rpc('get_my_blocked_accounts');
  if (error) throw isMissingRpcError(error) ? new FriendsUnavailableError(error) : error;
  return (data ?? []) as RemoteBlockedAccountRow[];
}

export async function requestFriendByCode(currentUserEmail: string, code: string): Promise<FriendActionResult> {
  try {
    await ensureSession(currentUserEmail);
    const { data, error } = await supabase!.rpc('request_friend_by_code', { p_code: code });
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
): Promise<FriendMutationStatus> {
  try {
    await ensureSession(currentUserEmail);
    const { data, error } = await supabase!.rpc(fnName, params);
    if (error) throw error;
    const row = (data as { status: FriendMutationStatus }[] | null)?.[0];
    return row?.status ?? 'UNAVAILABLE';
  } catch {
    // These RPCs never RAISE for a business outcome — any thrown error here
    // is an availability problem, not a business result.
    return 'UNAVAILABLE';
  }
}

export function respondToFriendRequest(currentUserEmail: string, requestId: string, action: 'accept' | 'reject'): Promise<FriendMutationStatus> {
  return callStatusRpc('respond_to_friend_request', { p_request_id: requestId, p_action: action }, currentUserEmail);
}

export function cancelFriendRequest(currentUserEmail: string, requestId: string): Promise<FriendMutationStatus> {
  return callStatusRpc('cancel_friend_request', { p_request_id: requestId }, currentUserEmail);
}

export function removeFriend(currentUserEmail: string, relationshipId: string): Promise<FriendMutationStatus> {
  return callStatusRpc('remove_friend', { p_relationship_id: relationshipId }, currentUserEmail);
}

export function blockFriend(currentUserEmail: string, relationshipId: string): Promise<FriendMutationStatus> {
  return callStatusRpc('block_friend', { p_relationship_id: relationshipId }, currentUserEmail);
}

export function unblockFriend(currentUserEmail: string, relationshipId: string): Promise<FriendMutationStatus> {
  return callStatusRpc('unblock_friend', { p_relationship_id: relationshipId }, currentUserEmail);
}
