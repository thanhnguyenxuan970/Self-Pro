import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { getDb } from '../db/client';

const KEY_LAST_ACTIVITY = 'habit_sync_last_activity_id';
const KEY_LAST_FUND = 'habit_sync_last_fund_id';
const BATCH = 100;

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

async function syncActivity(userEmail: string): Promise<void> {
  const db = await getDb();
  const raw = await AsyncStorage.getItem(KEY_LAST_ACTIVITY);
  const lastId = raw ? (parseInt(raw, 10) || 0) : 0;

  const rows = await db.getAllAsync<ActivityRow>(
    'SELECT * FROM activity_log WHERE id > ? ORDER BY id ASC LIMIT ?',
    [lastId, BATCH]
  );
  if (!rows.length) return;

  const { error } = await supabase!.from('activity_log').upsert(
    rows.map(({ id, ...r }) => ({ ...r, user_email: userEmail, local_id: id })),
    { onConflict: 'user_email,local_id' }
  );
  if (error) throw error;

  await AsyncStorage.setItem(KEY_LAST_ACTIVITY, String(rows[rows.length - 1].id));
}

async function syncFund(userEmail: string): Promise<void> {
  const db = await getDb();
  const raw = await AsyncStorage.getItem(KEY_LAST_FUND);
  const lastId = raw ? (parseInt(raw, 10) || 0) : 0;

  const rows = await db.getAllAsync<FundRow>(
    'SELECT * FROM fund_transactions WHERE id > ? ORDER BY id ASC LIMIT ?',
    [lastId, BATCH]
  );
  if (!rows.length) return;

  const { error } = await supabase!.from('fund_transactions').upsert(
    rows.map(({ id, ...r }) => ({ ...r, user_email: userEmail, local_id: id })),
    { onConflict: 'user_email,local_id' }
  );
  if (error) throw error;

  await AsyncStorage.setItem(KEY_LAST_FUND, String(rows[rows.length - 1].id));
}

/**
 * Push new local rows to Supabase. Silent no-op when credentials absent.
 * Safe to call after every log — batches 100 rows at a time.
 */
export async function syncToSupabase(userEmail: string): Promise<void> {
  if (!supabase) return;
  const results = await Promise.allSettled([syncActivity(userEmail), syncFund(userEmail)]);
  for (const r of results) {
    if (r.status === 'rejected') console.warn('[sync] failed:', r.reason);
  }
}

/** Reset sync cursors (call on sign-out so next sign-in re-syncs from scratch). */
export async function resetSyncCursors(): Promise<void> {
  await AsyncStorage.multiRemove([KEY_LAST_ACTIVITY, KEY_LAST_FUND]);
}

/**
 * Push current streak to Supabase users table so it can be restored on new device.
 * Requires `current_streak` column on Supabase users table:
 *   ALTER TABLE users ADD COLUMN IF NOT EXISTS current_streak INTEGER DEFAULT 0;
 * Silent no-op when Supabase not configured.
 */
export async function syncUserStreak(userEmail: string, currentStreak: number): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from('users')
    .update({ current_streak: currentStreak })
    .eq('user_email', userEmail);
  if (error) console.warn('[sync] streak sync failed:', error.message);
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
