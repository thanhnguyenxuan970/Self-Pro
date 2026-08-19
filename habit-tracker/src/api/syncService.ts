import AsyncStorage from '@react-native-async-storage/async-storage';
import { SQLiteDatabase } from 'expo-sqlite';
import * as Sentry from '@sentry/react-native';
import { supabase } from './supabase';
import { getDb } from '../db/client';
import { selectClockSuspectLocalIds } from '../lib/clockSuspect';
import { getStoredGoogleUser } from '../lib/googleUserStorage';
import { NoSavedGoogleCredentialError } from './syncErrors';

const KEY_LAST_ACTIVITY = 'habit_sync_last_activity_id';
const KEY_LAST_FUND = 'habit_sync_last_fund_id';
const BATCH = 100;

type AssertSyncActive = () => void;
type SyncTask = (assertActive: AssertSyncActive) => Promise<void>;

interface AccountSyncGate {
  epoch: number;
  blocked: boolean;
  tail: Promise<void>;
  active: Set<Promise<void>>;
  resume: Promise<void>;
  releaseResume: () => void;
}

class AccountSyncInvalidatedError extends Error {
  constructor() {
    super('Account sync was invalidated by a destructive account operation');
    this.name = 'AccountSyncInvalidatedError';
  }
}

const accountSyncGates = new Map<string, AccountSyncGate>();

function getAccountSyncGate(accountKey: string): AccountSyncGate {
  const existing = accountSyncGates.get(accountKey);
  if (existing) return existing;

  const gate: AccountSyncGate = {
    epoch: 0,
    blocked: false,
    tail: Promise.resolve(),
    active: new Set(),
    resume: Promise.resolve(),
    releaseResume: () => undefined,
  };
  accountSyncGates.set(accountKey, gate);
  return gate;
}

/** Serialize one account's uploads and make them quiesce before reset/delete. */
export function runAccountSync(accountKey: string, task: SyncTask): Promise<void> {
  const gate = getAccountSyncGate(accountKey);
  if (gate.blocked) return Promise.resolve();
  const epoch = gate.epoch;
  const operation = gate.tail.then(async () => {
    if (gate.blocked || gate.epoch !== epoch) return;
    const assertActive: AssertSyncActive = () => {
      if (gate.blocked || gate.epoch !== epoch) throw new AccountSyncInvalidatedError();
    };
    await task(assertActive);
  });

  let tracked!: Promise<void>;
  tracked = operation.then(
    () => { gate.active.delete(tracked); },
    (error) => {
      gate.active.delete(tracked);
      throw error;
    },
  );
  gate.active.add(tracked);
  gate.tail = tracked.then(() => undefined, () => undefined);
  return tracked;
}

/**
 * Prevent new uploads for an account and wait for the current upload queue to
 * settle. Keep the returned release function held until destructive work ends.
 */
export async function pauseAccountSync(accountKey: string): Promise<() => void> {
  const gate = getAccountSyncGate(accountKey);
  while (gate.blocked) await gate.resume;

  gate.blocked = true;
  gate.epoch += 1;
  gate.resume = new Promise<void>((resolve) => { gate.releaseResume = resolve; });
  while (gate.active.size) {
    await Promise.allSettled(Array.from(gate.active));
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;
    gate.blocked = false;
    gate.releaseResume();
    gate.resume = Promise.resolve();
  };
}

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

export type SocialProfileSignal = {
  currentStreak: number;
  lastActiveLocalDate: string | null;
  timezone: string;
};

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
  assertActive: AssertSyncActive,
): Promise<Record<string, unknown>[]> {
  assertActive();
  const { data, error } = await supabase!.from(table).upsert(
    rows.map(({ id, ...r }) => ({ ...r as object, user_email: userEmail, local_id: id })),
    { onConflict: 'user_email,local_id' },
  ).select();
  if (error) throw error;
  assertActive();
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

async function syncActivity(
  db: SQLiteDatabase,
  userId: number,
  userEmail: string,
  assertActive: AssertSyncActive,
  fromBeginning = false,
): Promise<void> {
  const key = activityKey(userId);
  const raw = fromBeginning ? null : await AsyncStorage.getItem(key);
  let lastId = raw ? (parseInt(raw, 10) || 0) : 0;

  // Drain every pending batch before calculating the remote lifetime total.
  // A single 100-row batch left a valid but stale server total whenever a
  // device had accumulated more activity than one sync pass could upload.
  while (true) {
    const rows = await db.getAllAsync<ActivityRow>(
      `SELECT ${ACTIVITY_SYNC_COLUMNS} FROM activity_log WHERE user_id = ? AND id > ? ORDER BY id ASC LIMIT ?`,
      [userId, lastId, BATCH]
    );
    if (!rows.length) return;
    const upserted = await upsertBatch('activity_log', rows, userEmail, key, assertActive);
    await flagClockSuspectRows(db, upserted);
    lastId = rows[rows.length - 1].id;
    if (rows.length < BATCH) return;
  }
}

async function syncFund(
  db: SQLiteDatabase,
  userId: number,
  userEmail: string,
  assertActive: AssertSyncActive,
): Promise<void> {
  const key = fundKey(userId);
  const raw = await AsyncStorage.getItem(key);
  const lastId = raw ? (parseInt(raw, 10) || 0) : 0;

  const rows = await db.getAllAsync<FundRow>(
    'SELECT * FROM fund_transactions WHERE user_id = ? AND id > ? ORDER BY id ASC LIMIT ?',
    [userId, lastId, BATCH]
  );
  if (!rows.length) return;
  await upsertBatch('fund_transactions', rows, userEmail, key, assertActive);
}

export async function readSocialProfile(
  db: SQLiteDatabase,
  userId: number,
  timezone: string,
): Promise<SocialProfileSignal> {
  const streak = await db.getFirstAsync<{ current_streak: number }>(
    `SELECT COALESCE(streak_count, 0) AS current_streak
     FROM daily_summary WHERE user_id = ?
     ORDER BY local_date DESC LIMIT 1`,
    [userId],
  );
  const freshness = await db.getFirstAsync<{ last_active_local_date: string | null }>(
    `SELECT MAX(local_date) AS last_active_local_date
     FROM activity_log
     WHERE user_id = ? AND source IN ('TASK', 'CHALLENGE')`,
    [userId],
  );

  return {
    currentStreak: streak?.current_streak ?? 0,
    lastActiveLocalDate: freshness?.last_active_local_date ?? null,
    timezone,
  };
}

async function syncUserProfile(db: SQLiteDatabase, userId: number, assertActive: AssertSyncActive): Promise<void> {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Ho_Chi_Minh';
  const profile = await readSocialProfile(db, userId, timezone);
  assertActive();
  const { error } = await supabase!.rpc('sync_user_profile_v2', {
    p_current_streak: profile.currentStreak,
    p_last_active_local_date: profile.lastActiveLocalDate,
    p_timezone: profile.timezone,
  });
  if (error) throw error;
}

async function syncLifetimeStars(assertActive: AssertSyncActive): Promise<number | null> {
  assertActive();
  const { data, error } = await supabase!.rpc('sync_lifetime_stars');
  if (error) throw error;
  const stars = Number(data);
  return Number.isFinite(stars) ? Math.max(0, stars) : null;
}

async function readLocalLifetimeStars(db: SQLiteDatabase, userId: number): Promise<number> {
  const user = await db.getFirstAsync<{ lifetime_stars: number }>(
    'SELECT lifetime_stars FROM users WHERE id = ?',
    [userId],
  );
  return Math.max(0, Number(user?.lifetime_stars) || 0);
}

/** Establish the short-lived Supabase session required by RLS before syncing.
 * Google owns the fresh ID token; Supabase sessions intentionally are not
 * persisted on-device. */
const SESSION_EXPIRY_SKEW_SECONDS = 60;

let inFlightSessionRefresh: { userEmail: string; promise: Promise<void> } | null = null;

async function refreshSupabaseSession(userEmail: string): Promise<void> {
  // require at call-time: preserves the native-module loading guard used by auth.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { GoogleSignin, isNoSavedCredentialFoundResponse } = require('@react-native-google-signin/google-signin') as typeof import('@react-native-google-signin/google-signin');
  GoogleSignin.configure({ webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID });
  // getTokens() only reads the cached ID token. signInSilently() refreshes the
  // native account before the token is sent to Supabase.
  const silent = await GoogleSignin.signInSilently();
  if (isNoSavedCredentialFoundResponse(silent)) {
    throw new NoSavedGoogleCredentialError();
  }
  const { idToken } = await GoogleSignin.getTokens();
  if (!idToken) throw new Error('Google did not provide an ID token for Supabase sync');
  const { data, error } = await supabase!.auth.signInWithIdToken({ provider: 'google', token: idToken });
  if (error) throw error;
  if (data.user?.email !== userEmail) throw new Error('Google token does not match the signed-in user');
}

function refreshSupabaseSessionOnce(userEmail: string): Promise<void> {
  const activeRefresh = inFlightSessionRefresh;
  if (activeRefresh) {
    if (activeRefresh.userEmail === userEmail) return activeRefresh.promise;
    return activeRefresh.promise
      .catch(() => undefined)
      .then(() => refreshSupabaseSessionOnce(userEmail));
  }

  let trackedPromise: Promise<void>;
  trackedPromise = refreshSupabaseSession(userEmail).finally(() => {
    if (inFlightSessionRefresh?.promise === trackedPromise) {
      inFlightSessionRefresh = null;
    }
  });
  inFlightSessionRefresh = { userEmail, promise: trackedPromise };
  return trackedPromise;
}

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
    // Compare case-insensitively: Gmail/Google treat email case as
    // insignificant, but GoTrue's stored session email and the locally
    // cached Google user email are not guaranteed byte-identical across
    // re-logins. A strict `!==` here silently blocked every sync for any
    // account that ever picked up a casing difference, with no error
    // surfaced anywhere the failure could be diagnosed from.
    if (session!.user.email?.trim().toLowerCase() !== userEmail.trim().toLowerCase()) {
      throw new Error('Supabase session does not match the signed-in user');
    }
    return;
  }

  await refreshSupabaseSessionOnce(userEmail);
}

/**
 * Push new local rows to Supabase. Silent no-op when credentials absent.
 * Only the signed-in user's own rows are pushed. Safe to call after every
 * log — batches 100 rows at a time.
 */
export async function syncToSupabase(userSub: string, userEmail: string): Promise<void> {
  if (!supabase) return;
  await runAccountSync(userEmail, async (assertActive) => {
    assertActive();
    await ensureSupabaseSession(userEmail);
    assertActive();
    const db = await getDb();
    const userId = await resolveUserId(db, userSub, userEmail);
    if (userId == null) return;
    await Promise.all([
      syncActivity(db, userId, userEmail, assertActive),
      syncFund(db, userId, userEmail, assertActive),
    ]);
    // Publish the local social projection only after activity upload so remote
    // progress and freshness converge within this serialized account sync.
    await syncUserProfile(db, userId, assertActive);
    const remoteStars = await syncLifetimeStars(assertActive);
    const localStars = await readLocalLifetimeStars(db, userId);
    if (remoteStars !== null && remoteStars < localStars) {
      // A stale or advanced local cursor must never leave the backend frozen.
      // Re-upload only this caller's append-only local source of truth, then
      // let the protected RPC recalculate rank; no client total is written to
      // `public.users`, and no other account's rows are touched.
      await syncActivity(db, userId, userEmail, assertActive, true);
      await syncLifetimeStars(assertActive);
    }
  });
}

/** Sync all pending rows for the currently stored Google account. */
export async function syncCurrentUserToSupabase(): Promise<void> {
  const user = await getStoredGoogleUser();
  if (!user) return;
  try {
    await syncToSupabase(user.sub, user.email);
  } catch (error) {
    // Every call site fires this without awaiting and only console.warns in
    // __DEV__, so a broken sync (this account's lifetime_stars silently
    // freezing while local kept climbing) had no signal anywhere in
    // production -- discoverable only by manually inspecting the live DB.
    // Report it centrally so future occurrences show up without that.
    Sentry.captureException(error);
    throw error;
  }
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
  await runAccountSync(userEmail, async (assertActive) => {
    assertActive();
    const { data: { session } } = await supabase!.auth.getSession();
    assertActive();
    if (!session) return;
    const { error } = await supabase!.rpc('sync_user_profile', { p_current_streak: currentStreak });
    if (error) throw error;
  });
}

/** Reset the remote progress mirror before clearing local lifetime rank data. */
export async function resetUserProgressInSupabase(userEmail: string): Promise<void> {
  if (!supabase) return;
  await ensureSupabaseSession(userEmail);
  const { error } = await supabase.rpc('reset_my_progress');
  if (error) throw error;
}

/**
 * Permanently delete all of this user's rows from Supabase.
 * Call during account deletion BEFORE clearing local state so the
 * Supabase Auth session is still active (required when RLS is enabled).
 */
export async function deleteUserFromSupabase(userEmail: string): Promise<void> {
  if (!supabase) return;
  await ensureSupabaseSession(userEmail);
  const { error } = await supabase.rpc('delete_my_account_data');
  if (error) throw error;
}
