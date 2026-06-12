import AsyncStorage from '@react-native-async-storage/async-storage';
import { SQLiteDatabase } from 'expo-sqlite';
import { supabase } from './supabase';
import { getDb } from '../db/client';

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
): Promise<void> {
  const { error } = await supabase!.from(table).upsert(
    rows.map(({ id, ...r }) => ({ ...r as object, user_email: userEmail, local_id: id })),
    { onConflict: 'user_email,local_id' },
  );
  if (error) throw error;
  await AsyncStorage.setItem(cursorKey, String(rows[rows.length - 1].id));
}

async function syncActivity(db: SQLiteDatabase, userId: number, userEmail: string): Promise<void> {
  const key = activityKey(userId);
  const raw = await AsyncStorage.getItem(key);
  const lastId = raw ? (parseInt(raw, 10) || 0) : 0;

  const rows = await db.getAllAsync<ActivityRow>(
    'SELECT * FROM activity_log WHERE user_id = ? AND id > ? ORDER BY id ASC LIMIT ?',
    [userId, lastId, BATCH]
  );
  if (!rows.length) return;
  await upsertBatch('activity_log', rows, userEmail, key);
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

/**
 * Push new local rows to Supabase. Silent no-op when credentials absent.
 * Only the signed-in user's own rows are pushed. Safe to call after every
 * log — batches 100 rows at a time.
 */
export async function syncToSupabase(userSub: string, userEmail: string): Promise<void> {
  if (!supabase) return;
  const db = await getDb();
  const userId = await resolveUserId(db, userSub, userEmail);
  if (userId == null) return;
  await Promise.allSettled([
    syncActivity(db, userId, userEmail),
    syncFund(db, userId, userEmail),
  ]);
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
