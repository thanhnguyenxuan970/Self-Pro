import AsyncStorage from '@react-native-async-storage/async-storage';
import { SQLiteDatabase } from 'expo-sqlite';
import { supabase } from './supabase';
import { getDb } from '../db/client';
import { selectClockSuspectLocalIds } from '../lib/clockSuspect';
import { getStoredGoogleUser } from '../hooks/useAuth';

const KEY_LAST_ACTIVITY = 'habit_sync_last_activity_id';
const KEY_LAST_FUND = 'habit_sync_last_fund_id';
const BATCH = 100;

// Cursors are scoped per local user id. A device can hold rows for more than
// one account (see resolveUserRow), so a global cursor + unfiltered SELECT
// would upload one account's rows under another account's email.
const activityKey = (userId: number) => `${KEY_LAST_ACTIVITY}:${userId}`;
const fundKey = (userId: number) => `${KEY_LAST_FUND}:${userId}`;

interface ActivityRow {
  id: number;
  user_id: number;
  task_type_id: number | null;
  kind: string;
  duration_min: number | null;
  points_earned: number;
  stars_delta: number;
  source: string;
  logged_at: number;
  local_date: string;
  week_start: string;
  note: string | null;
}

interface FundRow {
  id: number;
  user_id: number;
  type: string;
  amount: number;
  currency: string;
  source_unlock_id: number | null;
  note: string | null;
  occurred_at: number;
}

/** Map a Google OIDC sub to the local user row id, with email fallback for legacy rows. */
async function resolveUserId(db: SQLiteDatabase, userSub: string, userEmail: string): Promise<number | null> {
  const bySub = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM users WHERE google_sub = ?',
    [userSub]
  );
  if (bySub) return bySub.id;
  // Legacy rows (pre-M3 migration) store email in google_sub
  const byEmail = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM users WHERE google_sub = ?',
    [userEmail]
  );
  return byEmail?.id ?? null;
}

async function upsertBatch<T extends { id: number }>(
  table: string,
  rows: T[],
  userEmail: string,
  cursorKey: string,
): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase!.from(table).upsert(
    rows.map(({ id, ...r }) => ({ ...r as object, user_email: userEmail, local_id: id })),
    { onConflict: 'user_email,local_id' },
  ).select();
  if (error) throw error;
  await AsyncStorage.setItem(cursorKey, String(rows[rows.length - 1].id));
  return data ?? [];
}

/** Flags rows whose client-supplied logged_at is implausibly earlier than
 *  Supabase's server-assigned created_at (clock-rollback detection net).
 *  Best-effort: only runs when the upsert response actually included a
 *  created_at column. */
async function flagClockSuspectRows(db: SQLiteDatabase, upserted: Record<string, unknown>[]): Promise<void> {
  const suspectLocalIds = selectClockSuspectLocalIds(upserted);
  if (!suspectLocalIds.length) return;
  const placeholders = suspectLocalIds.map(() => '?').join(',');
  await db.runAsync(`UPDATE activity_log SET is_clock_suspect = 1 WHERE id IN (${placeholders})`, suspectLocalIds);
}

// Explicit column list (not SELECT *) so local-only columns -- e.g.
// is_clock_suspect, which has no matching column on the Supabase side --
// never silently leak into the upsert payload and break sync with a
// PostgREST "unknown column" error.
const ACTIVITY_SYNC_COLUMNS = 'id, user_id, task_type_id, kind, duration_min, points_earned, stars_delta, source, logged_at, local_date, week_start, note';

async function syncActivity(db: SQLiteDatabase, userId: number, userEmail: string): Promise<void> {
  const key = activityKey(userId);
  const raw = await AsyncStorage.getItem(key);
  const lastId = raw ? (parseInt(raw, 10) || 0) : 0;

  const rows = await db.getAllAsync<ActivityRow>(
    `SELECT ${ACTIVITY_SYNC_COLUMNS} FROM activity_log WHERE user_id = ? AND id > ? ORDER BY id ASC LIMIT ?`,
    [userId, lastId, BATCH]
  );
  if (!rows.length) return;
  const upserted = await upsertBatch('activity_log', rows, userEmail, key);
  await flagClockSuspectRows(db, upserted);
}

async function syncFund(db: SQLiteDatabase, userId: number, userEmail: string): Promise<void> {
  const key = fundKey(userId);
  const raw = await AsyncStorage.getItem(key);
  const lastId = raw ? (parseInt(raw, 10) || 0) : 0;

  const rows = await db.getAllAsync<FundRow>(
    'SELECT * FROM fund_transactions WHERE user_id = ? AND id > ? ORDER BY id ASC LIMIT ?',
    [userId, lastId, BATCH]
  );
  if (!rows.length) return;
  await upsertBatch('fund_transactions', rows, userEmail, key);
}

/** Establish the short-lived Supabase session required by RLS before syncing.
 * Google owns the fresh ID token; Supabase sessions intentionally are not
 * persisted on-device. */
const SESSION_EXPIRY_SKEW_SECONDS = 60;

export async function ensureSupabaseSession(userEmail: string): Promise<void> {
  if (!supabase) return;
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  // getSession() only reports whether a session object is cached in memory —
  // with autoRefreshToken: false it never refreshes, so a session held across
  // an hour-long app session is stale JWT that Supabase will 401 on. Check
  // expires_at explicitly instead of trusting presence alone.
  const sessionIsFresh = session != null
    && (session.expires_at == null || session.expires_at > Math.floor(Date.now() / 1000) + SESSION_EXPIRY_SKEW_SECONDS);
  if (sessionIsFresh) {
    if (session!.user.email !== userEmail) throw new Error('Supabase session does not match the signed-in user');
    return;
  }

  // require at call-time: preserves the native-module loading guard used by auth.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { GoogleSignin, isNoSavedCredentialFoundResponse } = require('@react-native-google-signin/google-signin') as typeof import('@react-native-google-signin/google-signin');
  GoogleSignin.configure({ webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID });
  // getTokens() only reads whatever ID token is cached on the native
  // GoogleSignInAccount — it does not refresh it. That cached token expires
  // ~1hr after the last sign-in, so on Android it goes stale mid-session and
  // Supabase rejects it as "Bad ID token". signInSilently() forces the native
  // SDK to refresh the account (and its ID token) before we read it.
  const silent = await GoogleSignin.signInSilently();
  if (isNoSavedCredentialFoundResponse(silent)) {
    throw new Error('No saved Google credential to refresh the sync session');
  }
  const { idToken } = await GoogleSignin.getTokens();
  if (!idToken) throw new Error('Google did not provide an ID token for Supabase sync');
  const { data, error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken });
  if (error) throw error;
  if (data.user?.email !== userEmail) throw new Error('Google token does not match the signed-in user');
}

/**
 * Push new local rows to Supabase. Silent no-op when credentials absent.
 * Only the signed-in user's own rows are pushed. Safe to call after every
 * log — batches 100 rows at a time.
 */
export async function syncToSupabase(userSub: string, userEmail: string): Promise<void> {
  if (!supabase) return;
  await ensureSupabaseSession(userEmail);
  const db = await getDb();
  const userId = await resolveUserId(db, userSub, userEmail);
  if (userId == null) return;
  await Promise.all([
    syncActivity(db, userId, userEmail),
    syncFund(db, userId, userEmail),
  ]);
}

/** Sync all pending rows for the currently stored Google account. */
export async function syncCurrentUserToSupabase(): Promise<void> {
  const user = await getStoredGoogleUser();
  if (user) await syncToSupabase(user.sub, user.email);
}

/** Reset all sync cursors (call on sign-out so next sign-in re-syncs from scratch). */
export async function resetSyncCursors(): Promise<void> {
  const keys = await AsyncStorage.getAllKeys();
  const cursorKeys = keys.filter(
    (k) =>
      k === KEY_LAST_ACTIVITY ||
      k === KEY_LAST_FUND ||
      k.startsWith(`${KEY_LAST_ACTIVITY}:`) ||
      k.startsWith(`${KEY_LAST_FUND}:`)
  );
  if (cursorKeys.length) await AsyncStorage.multiRemove(cursorKeys);
}

/**
 * Push current streak to Supabase users table so it can be restored on new device.
 * Upsert because nothing else inserts the users row — a plain update matched 0 rows.
 * Silent no-op when Supabase not configured.
 */
export async function syncUserStreak(userEmail: string, currentStreak: number): Promise<void> {
  if (!supabase) return;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;
  const { error } = await supabase
    .from('users')
    .upsert({ user_email: userEmail, current_streak: currentStreak }, { onConflict: 'user_email' });
  if (error && __DEV__) console.warn('[sync] streak sync failed:', error.message);
}

/**
 * Permanently delete all of this user's rows from Supabase.
 * Call during account deletion BEFORE clearing local state so the
 * Supabase Auth session is still active (required when RLS is enabled).
 */
export async function deleteUserFromSupabase(userEmail: string): Promise<void> {
  if (!supabase) return;
  const { error: e1 } = await supabase
    .from('activity_log')
    .delete()
    .eq('user_email', userEmail);
  if (e1) throw e1;
  const { error: e2 } = await supabase
    .from('fund_transactions')
    .delete()
    .eq('user_email', userEmail);
  if (e2) throw e2;
}
