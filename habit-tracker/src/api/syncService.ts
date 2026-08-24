import AsyncStorage from '@react-native-async-storage/async-storage';
import { SQLiteDatabase } from 'expo-sqlite';
import * as Sentry from '@sentry/react-native';
import { supabase } from './supabase';
import { getDb } from '../db/client';
import { selectClockSuspectLocalIds } from '../lib/clockSuspect';
import { getStoredGoogleUser } from '../lib/googleUserStorage';
import { NoSavedGoogleCredentialError } from './syncErrors';
import { applyLifetimeStarsDelta } from '../game/lifetimeRankWrites';
import type { LifetimeTierRow } from '../game/lifetimeRank';
import { readPendingActivityDeletes, clearPendingActivityDeletes } from '../game/pendingActivityDeletes';
import { isQaSandboxActive } from '../qa/qaSandbox';

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

/**
 * Delete this account's already-uploaded twins of local rows that were hard-
 * deleted since the last sync (uncheck, backfill edit, challenge reward
 * reversal, task archive). Must run before syncActivity/sync_lifetime_stars
 * so a recheck's freshly-uploaded row is never summed alongside a stale
 * orphan for the same logical activity instance.
 */
async function syncPendingActivityDeletes(
  userId: number,
  userEmail: string,
  assertActive: AssertSyncActive,
): Promise<void> {
  const pendingIds = await readPendingActivityDeletes(userId);
  if (!pendingIds.length) return;
  assertActive();
  const { error } = await supabase!
    .from('activity_log')
    .delete()
    .eq('user_email', userEmail)
    .in('local_id', pendingIds);
  if (error) throw error;
  assertActive();
  await clearPendingActivityDeletes(userId, pendingIds);
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

async function readLocalLifetimeStars(
  db: Pick<SQLiteDatabase, 'getFirstAsync'>,
  userId: number,
): Promise<number> {
  const user = await db.getFirstAsync<{ lifetime_stars: number }>(
    'SELECT lifetime_stars FROM users WHERE id = ?',
    [userId],
  );
  return Math.max(0, Number(user?.lifetime_stars) || 0);
}

/**
 * Pull a higher server total into local SQLite without creating a fake
 * activity row or replaying rank-up celebrations. The read and write are kept
 * in one transaction so a local star write cannot be silently overshot.
 */
async function pullLifetimeStarsIntoLocal(
  db: SQLiteDatabase,
  userId: number,
  remoteStars: number,
  assertActive: AssertSyncActive,
): Promise<void> {
  if (!Number.isFinite(remoteStars) || remoteStars <= 0) return;

  assertActive();
  const tiers = await db.getAllAsync<LifetimeTierRow>(
    'SELECT id, tier_order, rank_name, stars_required FROM tiers ORDER BY tier_order',
  );
  const restoreIfAhead = async (
    transactionDb: Pick<SQLiteDatabase, 'getFirstAsync' | 'runAsync'>,
  ): Promise<void> => {
    // Crossings are intentionally discarded: this restores previously earned
    // progress and must not replay a celebration for an old tier.
    assertActive();
    const localStars = await readLocalLifetimeStars(transactionDb, userId);
    assertActive();
    if (remoteStars <= localStars) return;
    await applyLifetimeStarsDelta(transactionDb, userId, remoteStars - localStars, tiers);
    // Throwing here rolls back the surrounding transaction if cancellation
    // arrived while the read-modify-write was in progress.
    assertActive();
  };

  // The regular async transaction can be interleaved with unrelated async
  // queries on expo-sqlite. Use a dedicated exclusive connection for this
  // read-modify-write so a concurrent activity log cannot be overshot. The
  // fallback keeps older/web test adapters usable; production Android uses the
  // exclusive path.
  if (typeof db.withExclusiveTransactionAsync === 'function') {
    await db.withExclusiveTransactionAsync(async transactionDb => {
      await restoreIfAhead(transactionDb);
    });
  } else {
    await db.withTransactionAsync(async () => {
      await restoreIfAhead(db);
    });
  }
}

/** Establish the short-lived Supabase session required by RLS before syncing.
 * Google owns the fresh ID token; Supabase sessions intentionally are not
 * persisted on-device. */
const SESSION_EXPIRY_SKEW_SECONDS = 60;

type SessionActivityGuard = () => boolean;
const alwaysActive: SessionActivityGuard = () => true;
type ExpectedGoogleSubject = string | undefined;

type SupabaseIdentityUser = {
  email?: string | null;
  identities?: Array<{ provider?: string; identity_data?: Record<string, unknown> }>;
  user_metadata?: Record<string, unknown>;
};

type SupabaseSession = {
  access_token?: string | null;
  expires_at?: number | null;
  user?: SupabaseIdentityUser;
};

let inFlightSessionRefresh: {
  userEmail: string;
  expectedGoogleSub: ExpectedGoogleSubject;
  promise: Promise<void>;
  isActive: SessionActivityGuard;
  releaseSessionOperation?: () => void;
} | null = null;
let inFlightGoogleTokenSignIn: {
  userEmail: string;
  idToken: string;
  expectedGoogleSub: ExpectedGoogleSubject;
  promise: Promise<void>;
  isActive: SessionActivityGuard;
  releaseSessionOperation?: () => void;
} | null = null;

// Supabase keeps one process-wide auth session. Serialize session-changing
// operations with protected RPCs so a sign-in/sign-out cannot swap the token
// between the ownership check and the request that follows it.
let sessionOperationTail: Promise<void> = Promise.resolve();

async function withSessionOperation<T>(
  operation: () => Promise<T>,
  onReleaseAvailable?: (release: () => void) => void,
): Promise<T> {
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    releaseTail();
  };
  let releaseTail!: () => void;
  const previous = sessionOperationTail;
  sessionOperationTail = new Promise<void>(resolve => { releaseTail = resolve; });
  onReleaseAvailable?.(release);
  await previous;
  try {
    return await operation();
  } finally {
    release();
  }
}

function normalizedAccountEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizedExpectedGoogleSub(userEmail: string, expectedGoogleSub?: ExpectedGoogleSubject): string | undefined {
  const subject = expectedGoogleSub?.trim();
  if (!subject || normalizedAccountEmail(subject) === normalizedAccountEmail(userEmail)) {
    // Legacy stored identities used the email as a placeholder subject. It is
    // useful for local row lookup, but it is not a Google OIDC `sub` and must
    // not be compared with Supabase's verified provider subject.
    return undefined;
  }
  return subject;
}

function googleSubjectFromSupabaseUser(user: SupabaseIdentityUser | null | undefined): string | null {
  const googleIdentity = user?.identities?.find(identity => identity.provider === 'google');
  const subject = googleIdentity?.identity_data?.sub ?? user?.user_metadata?.sub;
  return typeof subject === 'string' && subject.trim() ? subject.trim() : null;
}

function hasFreshSessionForAccount(
  session: SupabaseSession | null,
  userEmail: string,
  expectedGoogleSub?: ExpectedGoogleSubject,
): boolean {
  const normalizedSubject = normalizedExpectedGoogleSub(userEmail, expectedGoogleSub);
  return session != null
    && typeof session.access_token === 'string'
    && session.access_token.trim().length > 0
    && typeof session.expires_at === 'number'
    && Number.isFinite(session.expires_at)
    && session.expires_at > Math.floor(Date.now() / 1000) + SESSION_EXPIRY_SKEW_SECONDS
    && normalizedAccountEmail(session.user?.email ?? '') === normalizedAccountEmail(userEmail)
    && (!normalizedSubject || googleSubjectFromSupabaseUser(session.user) === normalizedSubject);
}

function assertSessionActive(isActive: SessionActivityGuard): void {
  if (!isActive()) throw new Error('Supabase session restore cancelled');
}

function isSessionRestoreCancellation(error: unknown): boolean {
  return error instanceof Error && error.message === 'Supabase session restore cancelled';
}

const SESSION_RESTORE_TIMEOUT_MS = 15_000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function isRetryableAuthExchangeError(error: unknown): boolean {
  const details = error && typeof error === 'object'
    ? error as { code?: unknown; message?: unknown; details?: unknown; status?: unknown }
    : {};
  const text = [details.code, details.message, details.details, String(error)]
    .filter(value => value != null)
    .join(' ')
    .toLowerCase();
  const status = typeof details.status === 'number' ? details.status : undefined;

  // GoTrue may expose either the PostgreSQL constraint, its generic 500 wrapper,
  // or an infrastructure 5xx. One bounded retry is safe: if another request
  // won the user insert race, GoTrue now finds that request's Google identity;
  // if the token/provider is actually invalid, the 4xx response is surfaced.
  return (status != null && status >= 500 && status <= 599)
    || text.includes('users_email_partial_key')
    || text.includes('database error saving new user')
    || text.includes('23505');
}

type TokenExchangeResult = {
  returnedEmail: string;
  returnedGoogleSub: string | null;
  accessToken: string | null;
  refreshToken: string | null;
};

async function signInWithGoogleTokenRequest(idToken: string): Promise<TokenExchangeResult> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data, error } = await supabase!.auth.signInWithIdToken({ provider: 'google', token: idToken });
    if (!error) {
      const accessToken = data?.session?.access_token;
      const expiresAt = data?.session?.expires_at;
      if (
        typeof accessToken !== 'string'
        || !accessToken.trim()
        || typeof expiresAt !== 'number'
        || !Number.isFinite(expiresAt)
        || expiresAt <= Math.floor(Date.now() / 1000) + SESSION_EXPIRY_SKEW_SECONDS
      ) {
        throw new Error('Supabase sign-in did not return a usable session');
      }
      return {
        returnedEmail: data?.user?.email ?? '',
        returnedGoogleSub: googleSubjectFromSupabaseUser(data?.user),
        accessToken,
        refreshToken: typeof data?.session?.refresh_token === 'string' && data.session.refresh_token.trim()
          ? data.session.refresh_token
          : null,
      };
    }

    lastError = error;
    if (attempt === 0 && isRetryableAuthExchangeError(error)) continue;
    throw error;
  }

  throw lastError;
}

let lastAcceptedGoogleSession: { accessToken: string; refreshToken: string; email: string } | null = null;

async function clearSupabaseSessionForAccount(ownedAccessToken: string | null): Promise<void> {
  if (!ownedAccessToken) return;
  try {
    const { data: { session } } = await supabase!.auth.getSession();
    if (session?.access_token === ownedAccessToken) {
      const newerSession = lastAcceptedGoogleSession;
      if (newerSession && newerSession.accessToken !== ownedAccessToken) {
        const setSession = (supabase!.auth as unknown as {
          setSession?: (value: { access_token: string; refresh_token: string }) => Promise<unknown>;
        }).setSession;
        if (setSession) {
          await setSession({ access_token: newerSession.accessToken, refresh_token: newerSession.refreshToken });
          return;
        }
      }
      await supabase!.auth.signOut();
    }
  } catch {
    // Cancellation cleanup is best-effort; the caller must still fail closed.
  }
}

/**
 * Establish the non-persistent Supabase session for a Google identity.
 * Direct sign-in and background rehydration share this gate so they cannot
 * race GoTrue into two auth.users inserts for the same email.
 */
function signInWithGoogleTokenInternal(
  userEmail: string,
  idToken: string,
  isActive: SessionActivityGuard = alwaysActive,
  expectedGoogleSub?: ExpectedGoogleSubject,
  lockSession = false,
  skipSessionRefreshWait = false,
): Promise<void> {
  if (typeof idToken !== 'string' || !idToken.trim()) {
    return Promise.reject(new Error('Google ID token is required'));
  }
  if (isQaSandboxActive() || !supabase) return Promise.resolve();

  const activeRefresh = inFlightSessionRefresh;
  if (!skipSessionRefreshWait && activeRefresh && activeRefresh.isActive()) {
    return activeRefresh.promise.then(
      () => signInWithGoogleTokenInternal(userEmail, idToken, isActive, expectedGoogleSub, lockSession),
      () => signInWithGoogleTokenInternal(userEmail, idToken, isActive, expectedGoogleSub, lockSession),
    );
  }

  const accountKey = normalizedAccountEmail(userEmail);
  const normalizedSubject = normalizedExpectedGoogleSub(userEmail, expectedGoogleSub);
  let active = inFlightGoogleTokenSignIn;
  if (active && normalizedAccountEmail(active.userEmail) === accountKey) {
    if (!active.isActive()) {
      active.releaseSessionOperation?.();
      inFlightGoogleTokenSignIn = null;
      active = null;
    }
  }
  if (active && normalizedAccountEmail(active.userEmail) === accountKey) {
    const sameExpectedSubject = (active.expectedGoogleSub?.trim() || null) === (normalizedSubject || null);
    if (active.idToken === idToken && sameExpectedSubject) {
      return active.promise.catch(error => {
        if (isSessionRestoreCancellation(error)) {
          return signInWithGoogleTokenInternal(userEmail, idToken, isActive, normalizedSubject, lockSession, skipSessionRefreshWait);
        }
        throw error;
      });
    }
    return active.promise.then(
      () => signInWithGoogleTokenInternal(userEmail, idToken, isActive, normalizedSubject, lockSession, skipSessionRefreshWait),
      () => signInWithGoogleTokenInternal(userEmail, idToken, isActive, normalizedSubject, lockSession, skipSessionRefreshWait),
    );
  }

  const waitForPrevious = active?.promise.catch(() => undefined) ?? Promise.resolve();
  const operation = waitForPrevious
    .then(async () => {
      assertSessionActive(isActive);
      const { data: { session }, error: sessionError } = await supabase!.auth.getSession();
      if (sessionError) throw sessionError;
      assertSessionActive(isActive);
      if (hasFreshSessionForAccount(session, userEmail, expectedGoogleSub)) return;
      let exchangeCompleted = false;
      let exchangeAccessToken: string | null = null;
      let exchangeRefreshToken: string | null = null;
      let cleanupRequired = false;
      try {
        const exchange = await signInWithGoogleTokenRequest(idToken);
        exchangeCompleted = true;
        exchangeAccessToken = exchange.accessToken;
        exchangeRefreshToken = exchange.refreshToken;
        if (normalizedAccountEmail(exchange.returnedEmail) !== normalizedAccountEmail(userEmail)) {
          cleanupRequired = true;
          throw new Error('Google token does not match the signed-in user');
        }
        if (normalizedSubject && exchange.returnedGoogleSub !== normalizedSubject) {
          cleanupRequired = true;
          throw new Error('Google token does not match the signed-in Google account');
        }
        assertSessionActive(isActive);
        if (exchangeAccessToken && exchangeRefreshToken) {
          lastAcceptedGoogleSession = {
            accessToken: exchangeAccessToken,
            refreshToken: exchangeRefreshToken,
            email: normalizedAccountEmail(userEmail),
          };
        }
      } catch (error) {
        if (exchangeCompleted && (cleanupRequired || !isActive())) {
          await clearSupabaseSessionForAccount(exchangeAccessToken);
        }
        throw error;
      }
    });
  let trackedPromise!: Promise<void>;
  let releaseSessionOperation: (() => void) | undefined;
  const sessionOperation = lockSession
    ? withSessionOperation(() => operation, release => { releaseSessionOperation = release; })
    : operation;
  trackedPromise = sessionOperation
    .finally(() => {
      if (inFlightGoogleTokenSignIn?.promise === trackedPromise) {
        inFlightGoogleTokenSignIn = null;
      }
    });
  inFlightGoogleTokenSignIn = {
    userEmail,
    idToken,
    expectedGoogleSub: normalizedSubject,
    promise: trackedPromise,
    isActive,
    releaseSessionOperation,
  };
  return trackedPromise;
}

export function signInWithGoogleToken(
  userEmail: string,
  idToken: string,
  isActive: SessionActivityGuard = alwaysActive,
  expectedGoogleSub?: ExpectedGoogleSubject,
): Promise<void> {
  return signInWithGoogleTokenInternal(userEmail, idToken, isActive, expectedGoogleSub, true);
}

async function refreshSupabaseSession(
  userEmail: string,
  isActive: SessionActivityGuard,
  expectedGoogleSub?: ExpectedGoogleSubject,
): Promise<void> {
  assertSessionActive(isActive);
  // require at call-time: preserves the native-module loading guard used by auth.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { GoogleSignin, isNoSavedCredentialFoundResponse } = require('@react-native-google-signin/google-signin') as typeof import('@react-native-google-signin/google-signin');
  GoogleSignin.configure({ webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID });
  // getTokens() only reads the cached ID token. signInSilently() refreshes the
  // native account before the token is sent to Supabase.
  const silent = await withTimeout(
    GoogleSignin.signInSilently(),
    SESSION_RESTORE_TIMEOUT_MS,
    'Supabase session restore timed out',
  );
  assertSessionActive(isActive);
  if (isNoSavedCredentialFoundResponse(silent)) {
    throw new NoSavedGoogleCredentialError();
  }
  const { idToken } = await withTimeout(
    GoogleSignin.getTokens(),
    SESSION_RESTORE_TIMEOUT_MS,
    'Supabase session restore timed out',
  );
  if (!idToken) throw new Error('Google did not provide an ID token for Supabase sync');
  assertSessionActive(isActive);
  await signInWithGoogleTokenInternal(userEmail, idToken, isActive, expectedGoogleSub, false, true);
}

function refreshSupabaseSessionOnce(
  userEmail: string,
  isActive: SessionActivityGuard,
  expectedGoogleSub?: ExpectedGoogleSubject,
  sessionOperationRelease?: () => (() => void) | undefined,
): Promise<void> {
  const normalizedSubject = normalizedExpectedGoogleSub(userEmail, expectedGoogleSub);
  let activeRefresh = inFlightSessionRefresh;
  if (activeRefresh) {
    if (
      normalizedAccountEmail(activeRefresh.userEmail) === normalizedAccountEmail(userEmail)
      && (activeRefresh.expectedGoogleSub?.trim() || null) === (normalizedSubject || null)
    ) {
      if (!activeRefresh.isActive()) {
        inFlightSessionRefresh = null;
        activeRefresh = null;
      } else {
        return activeRefresh.promise.catch(error => {
          if (isSessionRestoreCancellation(error)) {
            return refreshSupabaseSessionOnce(userEmail, isActive, normalizedSubject, sessionOperationRelease);
          }
          throw error;
        });
      }
    }
    if (activeRefresh) return activeRefresh.promise
      .catch(() => undefined)
      .then(() => refreshSupabaseSessionOnce(userEmail, isActive, normalizedSubject, sessionOperationRelease));
  }

  let trackedPromise: Promise<void>;
  trackedPromise = refreshSupabaseSession(userEmail, isActive, normalizedSubject).finally(() => {
    if (inFlightSessionRefresh?.promise === trackedPromise) {
      inFlightSessionRefresh = null;
    }
  });
  inFlightSessionRefresh = {
    userEmail,
    expectedGoogleSub: normalizedSubject,
    promise: trackedPromise,
    isActive,
    releaseSessionOperation: sessionOperationRelease?.(),
  };
  return trackedPromise;
}

/** Evict canceled native-auth gates so a later attempt cannot inherit stale work. */
export function cancelSupabaseSessionRestore(): void {
  if (inFlightSessionRefresh && !inFlightSessionRefresh.isActive()) {
    inFlightSessionRefresh.releaseSessionOperation?.();
    inFlightSessionRefresh = null;
  }
  if (inFlightGoogleTokenSignIn && !inFlightGoogleTokenSignIn.isActive()) {
    inFlightGoogleTokenSignIn.releaseSessionOperation?.();
    inFlightGoogleTokenSignIn = null;
  }
}

async function ensureSupabaseSessionUnlocked(
  userEmail: string,
  isActive: SessionActivityGuard = alwaysActive,
  expectedGoogleSub?: ExpectedGoogleSubject,
  sessionOperationRelease?: () => (() => void) | undefined,
): Promise<void> {
  if (isQaSandboxActive() || !supabase) return;
  const normalizedSubject = normalizedExpectedGoogleSub(userEmail, expectedGoogleSub);
  assertSessionActive(isActive);
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  assertSessionActive(isActive);
  // getSession() only reports whether a session object is cached in memory —
  // with autoRefreshToken: false it never refreshes, so a session held across
  // an hour-long app session is stale JWT that Supabase will 401 on. Check
  // expires_at explicitly instead of trusting presence alone.
  const sessionIsFresh = session != null
    && typeof session.access_token === 'string'
    && session.access_token.trim().length > 0
    && typeof session.expires_at === 'number'
    && Number.isFinite(session.expires_at)
    && session.expires_at > Math.floor(Date.now() / 1000) + SESSION_EXPIRY_SKEW_SECONDS;
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
    if (normalizedSubject && googleSubjectFromSupabaseUser(session.user) !== normalizedSubject) {
      // A cached session with no matching Google identity must not be reused
      // for a different local OIDC subject; force a fresh token exchange.
      await refreshSupabaseSessionOnce(userEmail, isActive, normalizedSubject, sessionOperationRelease);
      return;
    }
    return;
  }

  await refreshSupabaseSessionOnce(userEmail, isActive, normalizedSubject, sessionOperationRelease);
}

async function getOwnedSupabaseSession(
  userEmail: string,
  expectedGoogleSub?: ExpectedGoogleSubject,
  isActive: SessionActivityGuard = alwaysActive,
): Promise<SupabaseSession> {
  assertSessionActive(isActive);
  const { data: { session }, error: sessionError } = await supabase!.auth.getSession();
  if (sessionError) throw sessionError;
  assertSessionActive(isActive);
  if (!session || !hasFreshSessionForAccount(session, userEmail, expectedGoogleSub)) {
    throw new Error('Supabase session is unavailable or does not match the signed-in Google account');
  }
  return session;
}

export async function ensureSupabaseSession(
  userEmail: string,
  isActive: SessionActivityGuard = alwaysActive,
  expectedGoogleSub?: ExpectedGoogleSubject,
): Promise<void> {
  if (isQaSandboxActive() || !supabase) return;
  let releaseSessionOperation: (() => void) | undefined;
  await withSessionOperation(
    () => ensureSupabaseSessionUnlocked(
      userEmail,
      isActive,
      expectedGoogleSub,
      () => releaseSessionOperation,
    ),
    release => { releaseSessionOperation = release; },
  );
}

/** Run one protected Supabase operation while holding the owned session lease. */
export async function withSupabaseSession<T>(
  userEmail: string,
  expectedGoogleSub: ExpectedGoogleSubject,
  operation: () => Promise<T>,
  isActive: SessionActivityGuard = alwaysActive,
): Promise<T> {
  if (isQaSandboxActive() || !supabase) return operation();
  let releaseSessionOperation: (() => void) | undefined;
  return withSessionOperation(async () => {
    await ensureSupabaseSessionUnlocked(
      userEmail,
      isActive,
      expectedGoogleSub,
      () => releaseSessionOperation,
    );
    const ownedSession = await getOwnedSupabaseSession(userEmail, expectedGoogleSub, isActive);
    const result = await operation();
    const currentSession = await getOwnedSupabaseSession(userEmail, expectedGoogleSub, isActive);
    if (currentSession.access_token !== ownedSession.access_token) {
      throw new Error('Supabase session changed during the protected operation');
    }
    return result;
  }, release => { releaseSessionOperation = release; });
}

/** Sign out through the same process-wide session lease as protected RPCs. */
export async function signOutSupabaseSession(): Promise<void> {
  if (!supabase) return;
  await withSessionOperation(async () => {
    await supabase!.auth.signOut();
  });
}

/**
 * Push new local rows to Supabase. Silent no-op when credentials absent.
 * Only the signed-in user's own rows are pushed. Safe to call after every
 * log — batches 100 rows at a time.
 */
export async function syncToSupabase(userSub: string, userEmail: string): Promise<void> {
  if (isQaSandboxActive() || !supabase) return;
  await runAccountSync(userEmail, async (assertActive) => {
    const sessionActive: SessionActivityGuard = () => {
      assertActive();
      return true;
    };
    await withSupabaseSession(userEmail, userSub, async () => {
      assertActive();
      const db = await getDb();
      const userId = await resolveUserId(db, userSub, userEmail);
      if (userId == null) return;
      await syncPendingActivityDeletes(userId, userEmail, assertActive);
      await Promise.all([
        syncActivity(db, userId, userEmail, assertActive),
        syncFund(db, userId, userEmail, assertActive),
      ]);
      // Publish the local social projection only after activity upload so remote
      // progress and freshness converge within this serialized account sync.
      await syncUserProfile(db, userId, assertActive);
      let remoteStars = await syncLifetimeStars(assertActive);
      const localStars = await readLocalLifetimeStars(db, userId);
      if (remoteStars !== null && remoteStars < localStars) {
        // A stale or advanced local cursor must never leave the backend frozen.
        // Re-upload only this caller's append-only local source of truth, then
        // let the protected RPC recalculate rank; no client total is written to
        // `public.users`, and no other account's rows are touched.
        await syncActivity(db, userId, userEmail, assertActive, true);
        remoteStars = await syncLifetimeStars(assertActive);
      }
      // A returning device can be behind even after its local rows are fully
      // uploaded; pull the higher server-derived value down so Rank and the
      // authenticated leaderboard agree.
      if (remoteStars !== null && remoteStars > localStars) {
        await pullLifetimeStarsIntoLocal(db, userId, remoteStars, assertActive);
      }
    }, sessionActive);
  });
}

/**
 * Pull this account's current activity-derived lifetime-star total down from
 * Supabase into local SQLite, advancing `current_tier_id` to match. Normal
 * sync uploads local rows first, so a fresh local install -- reinstall, new
 * device, cleared app data -- can recover the server's activity mirror even
 * though the activity rows themselves are not downloaded here. Only ever
 * raises the local total during restore; normal activity sync handles local
 * decreases from the user's own transaction.
 * Best-effort: swallows and reports every failure rather than blocking sign-in.
 */
export async function restoreLifetimeStarsFromSupabase(
  userId: number,
  userEmail: string,
  isActive: SessionActivityGuard = alwaysActive,
  expectedGoogleSub?: ExpectedGoogleSubject,
): Promise<void> {
  if (isQaSandboxActive() || !supabase) return;
  try {
    await runAccountSync(userEmail, async (assertActive) => {
      const assertRestoreActive = () => {
        assertActive();
        assertSessionActive(isActive);
      };
      const sessionActive: SessionActivityGuard = () => {
        assertRestoreActive();
        return true;
      };
      await withSupabaseSession(userEmail, expectedGoogleSub, async () => {
        assertRestoreActive();
        const { data, error } = await supabase!.rpc('sync_lifetime_stars');
        if (error) throw error;
        const remoteStars = Number(data);
        if (!Number.isFinite(remoteStars) || remoteStars <= 0) return;

        assertRestoreActive();
        const db = await getDb();
        await pullLifetimeStarsIntoLocal(db, userId, remoteStars, assertRestoreActive);
      }, sessionActive);
    });
  } catch (error) {
    if (!isSessionRestoreCancellation(error)) Sentry.captureException(error);
  }
}

/** Sync all pending rows for the currently stored Google account. */
export async function syncCurrentUserToSupabase(): Promise<void> {
  if (isQaSandboxActive()) return;
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
export async function syncUserStreak(
  userEmail: string,
  currentStreak: number,
  expectedGoogleSub?: ExpectedGoogleSubject,
): Promise<void> {
  if (isQaSandboxActive() || !supabase) return;
  await runAccountSync(userEmail, async (assertActive) => {
    assertActive();
    await withSupabaseSession(
      userEmail,
      expectedGoogleSub,
      async () => {
        assertActive();
        const { error } = await supabase!.rpc('sync_user_profile', { p_current_streak: currentStreak });
        if (error) throw error;
      },
      () => {
        assertActive();
        return true;
      },
    );
  });
}

/** Reset the remote progress mirror before clearing local lifetime rank data. */
export async function resetUserProgressInSupabase(userEmail: string, expectedGoogleSub?: ExpectedGoogleSubject): Promise<void> {
  if (isQaSandboxActive() || !supabase) return;
  await withSupabaseSession(userEmail, expectedGoogleSub, async () => {
    const { error } = await supabase!.rpc('reset_my_progress');
    if (error) throw error;
  });
}

/**
 * Permanently delete all of this user's rows from Supabase.
 * Call during account deletion BEFORE clearing local state so the
 * Supabase Auth session is still active (required when RLS is enabled).
 */
export async function deleteUserFromSupabase(userEmail: string, expectedGoogleSub?: ExpectedGoogleSubject): Promise<void> {
  if (isQaSandboxActive() || !supabase) return;
  await withSupabaseSession(userEmail, expectedGoogleSub, async () => {
    const { error } = await supabase!.rpc('delete_my_account_data');
    if (error) throw error;
  });
}
