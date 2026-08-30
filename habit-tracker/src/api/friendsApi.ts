import { supabase } from './supabase';
import { withSupabaseSession, type SupabaseSessionOptions } from './syncService';
import { FRIEND_CODE_LENGTH } from '../lib/friends';
import type { FriendActionResult, FriendMutationStatus, FriendSection, RemoteFriendDashboardRow } from '../lib/friends';

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

const FRIEND_SECTIONS: readonly FriendSection[] = ['self', 'accepted', 'incoming', 'outgoing'];
const FRIEND_CODE_PATTERN = new RegExp(`^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{${FRIEND_CODE_LENGTH}}$`);
const FRIEND_MUTATION_STATUSES: readonly FriendMutationStatus[] = [
  'PENDING',
  'ACCEPTED',
  'OK',
  'NOT_FOUND',
  'SELF',
  'ALREADY_PENDING',
  'ALREADY_FRIENDS',
  'RATE_LIMITED',
  'FRIEND_LIMIT_REACHED',
  'PENDING_LIMIT_REACHED',
  'FORBIDDEN',
  'UNAVAILABLE',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isFriendMutationStatus(value: unknown): value is FriendMutationStatus {
  return typeof value === 'string' && FRIEND_MUTATION_STATUSES.includes(value as FriendMutationStatus);
}

function isRemoteFriendDashboardRow(value: unknown): value is RemoteFriendDashboardRow {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  const section = row.section as FriendSection;
  const relationshipIdIsValid = section === 'self'
    ? row.relationship_id === null
    : typeof row.relationship_id === 'string' && row.relationship_id.length > 0;
  return isNullableString(row.relationship_id)
    && typeof row.section === 'string'
    && FRIEND_SECTIONS.includes(section)
    && relationshipIdIsValid
    && isNullableString(row.player_id)
    && isNullableString(row.display_name)
    && (row.effective_streak === null || typeof row.effective_streak === 'number')
    && (row.year_stars === null || typeof row.year_stars === 'number')
    && (row.friend_rank === null || typeof row.friend_rank === 'number')
    && typeof row.is_current_user === 'boolean'
    && isNullableString(row.created_at)
    && isNullableString(row.expires_at);
}

function parseFriendDashboardRows(data: unknown): RemoteFriendDashboardRow[] {
  if (!Array.isArray(data) || !data.every(isRemoteFriendDashboardRow)) {
    throw new Error('Invalid Friends dashboard response');
  }
  return data;
}

function parseFriendCode(data: unknown): string {
  const code = typeof data === 'string' ? data.trim().toUpperCase() : '';
  if (!FRIEND_CODE_PATTERN.test(code)) {
    throw new Error('Invalid friend code response');
  }
  return code;
}

function isRemoteBlockedAccountRow(value: unknown): value is RemoteBlockedAccountRow {
  if (!isRecord(value)) return false;
  return typeof value.relationship_id === 'string'
    && value.relationship_id.length > 0
    && isNullableString(value.display_name)
    && typeof value.blocked_at === 'string'
    && value.blocked_at.length > 0;
}

function parseBlockedAccounts(data: unknown): RemoteBlockedAccountRow[] {
  if (!Array.isArray(data) || !data.every(isRemoteBlockedAccountRow)) {
    throw new Error('Invalid blocked accounts response');
  }
  return data;
}

function parseRetryAfterSeconds(value: unknown): number | null | undefined {
  return value === null
    ? null
    : typeof value === 'number' && Number.isInteger(value) && value >= 0
      ? value
      : undefined;
}

function parseFriendActionResult(data: unknown): FriendActionResult {
  const row = Array.isArray(data) && isRecord(data[0]) ? data[0] : null;
  if (!row || !isFriendMutationStatus(row.status)) return { status: 'UNAVAILABLE', retryAfterSeconds: null };
  const retryAfterSeconds = parseRetryAfterSeconds(row.retry_after_seconds);
  if (retryAfterSeconds === undefined) return { status: 'UNAVAILABLE', retryAfterSeconds: null };
  return { status: row.status, retryAfterSeconds };
}

function parseMutationStatus(data: unknown): FriendMutationStatus {
  const row = Array.isArray(data) && isRecord(data[0]) ? data[0] : null;
  return row && isFriendMutationStatus(row.status) ? row.status : 'UNAVAILABLE';
}

export async function getOrCreateFriendCode(currentUserEmail: string, accountSub?: string): Promise<string> {
  const { data, error } = await withFriendSession(currentUserEmail, accountSub, async () => supabase!.rpc('get_or_create_my_friend_code'));
  if (error) throw isMissingRpcError(error) ? new FriendsUnavailableError(error) : error;
  return parseFriendCode(data);
}

export async function rotateFriendCode(currentUserEmail: string, accountSub?: string): Promise<string> {
  const { data, error } = await withFriendSession(currentUserEmail, accountSub, async () => supabase!.rpc('rotate_my_friend_code'));
  if (error) throw isMissingRpcError(error) ? new FriendsUnavailableError(error) : error;
  return parseFriendCode(data);
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
    async () => supabase!.rpc('get_my_year_friend_dashboard'),
    { retryOnUnauthorized: true },
  );
  if (error) throw isMissingRpcError(error) ? new FriendsUnavailableError(error) : error;
  return parseFriendDashboardRows(data);
}

export async function getBlockedAccounts(currentUserEmail: string, accountSub?: string): Promise<RemoteBlockedAccountRow[]> {
  const { data, error } = await withFriendSession(
    currentUserEmail,
    accountSub,
    async () => supabase!.rpc('get_my_blocked_accounts'),
    { retryOnUnauthorized: true },
  );
  if (error) throw isMissingRpcError(error) ? new FriendsUnavailableError(error) : error;
  return parseBlockedAccounts(data);
}

export async function requestFriendByCode(currentUserEmail: string, code: string, accountSub?: string): Promise<FriendActionResult> {
  try {
    const { data, error } = await withFriendSession(currentUserEmail, accountSub, async () => supabase!.rpc('request_friend_by_code', { p_code: code }));
    if (error) throw error;
    return parseFriendActionResult(data);
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
    return parseMutationStatus(data);
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
