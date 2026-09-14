import { useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SQLiteDatabase } from 'expo-sqlite';
import { type GoogleUser, readGoogleUser, writeGoogleUser, deleteGoogleUser, parseGoogleUser, getStoredGoogleUser } from '../lib/googleUserStorage';
import { NO_SAVED_GOOGLE_CREDENTIAL_CODE } from '../api/syncErrors';
import { challengeReminderPrefix } from '../lib/challengeNotificationPlan';
import { invalidateChallengeReminderSync } from '../utils/notifications';
import { queryClient } from '../queries/queryClient';
import {
  isQaSandboxIdentity,
  isQaSandboxBuildAvailable,
  purgeQaSandbox,
  seedQaSandbox,
  setQaSandboxNetworkBlocked,
} from '../qa/qaSandbox';

export type { GoogleUser };
export { parseGoogleUser, getStoredGoogleUser };

const ONBOARDED_KEY = 'habit_tracker_onboarded';
const PENDING_RESET_KEY = 'habit_tracker_pending_progress_reset';
const PENDING_DELETE_KEY = 'habit_tracker_pending_account_delete';

function accountStorageKey(user: Pick<GoogleUser, 'sub' | 'email'>): string {
  return encodeURIComponent(user.email.trim().toLowerCase());
}

function legacyAccountStorageKey(user: Pick<GoogleUser, 'sub' | 'email'>): string {
  return encodeURIComponent((user.sub || user.email).trim());
}

function pendingResetKey(user: Pick<GoogleUser, 'sub' | 'email'>): string {
  return `${PENDING_RESET_KEY}:${accountStorageKey(user)}`;
}

function pendingDeleteKey(user: Pick<GoogleUser, 'sub' | 'email'>): string {
  return `${PENDING_DELETE_KEY}:${accountStorageKey(user)}`;
}

function legacyPendingResetKey(user: Pick<GoogleUser, 'sub' | 'email'>): string {
  return `${PENDING_RESET_KEY}:${legacyAccountStorageKey(user)}`;
}

function legacyPendingDeleteKey(user: Pick<GoogleUser, 'sub' | 'email'>): string {
  return `${PENDING_DELETE_KEY}:${legacyAccountStorageKey(user)}`;
}

// GoogleSignin.signInSilently() is a native-bridge call with no cancellation
// support and no built-in timeout; if it never calls back (flaky Play
// Services, poor network), startup restoration must not block the app on
// the loading spinner forever. Same pattern/timeout as feedbackService.ts's
// SUBMIT_TIMEOUT_MS for the same class of "network call may hang" risk.
const STARTUP_SESSION_RESTORE_TIMEOUT_MS = 15_000;
const INTERACTIVE_GOOGLE_AUTH_TIMEOUT_MS = 15_000;

export function parseOnboarded(val: string | null): boolean {
  return val === 'true';
}

export function getAuthStateAfterRestoreFailure(): { isOnboarded: false; googleUser: null } {
  return { isOnboarded: false, googleUser: null };
}

export async function restoreStoredGoogleSession(
  onboardedValue: string | null,
  userJson: string | null,
  ensureSession: (email: string, googleSub?: string) => Promise<void>,
  isActive: () => boolean = () => true,
): Promise<{ isOnboarded: boolean; googleUser: GoogleUser | null }> {
  const assertActive = () => {
    if (!isActive()) throw new Error('Startup session restore cancelled');
  };
  const isOnboarded = parseOnboarded(onboardedValue);
  const googleUser = parseGoogleUser(userJson);
  if (!isOnboarded || !googleUser) return { isOnboarded, googleUser };

  if (isQaSandboxIdentity(googleUser)) {
    if (!isQaSandboxBuildAvailable()) return { isOnboarded: false, googleUser: null };
    setQaSandboxNetworkBlocked(true);
    return { isOnboarded, googleUser };
  }

  setQaSandboxNetworkBlocked(false);
  assertActive();

  try {
    await ensureSession(googleUser.email, googleUser.sub);
    assertActive();
    return { isOnboarded, googleUser };
  } catch (error) {
    assertActive();
    const code = error && typeof error === 'object' && 'code' in error
      ? (error as { code?: unknown }).code
      : undefined;
    if (code !== NO_SAVED_GOOGLE_CREDENTIAL_CODE) throw error;
    return { isOnboarded: false, googleUser: null };
  }
}

/**
 * Maps a Google identity to a DB user row, creating one if needed.
 * - Existing row with matching google_sub (OIDC sub) → return its id
 * - Legacy row with google_sub = email (pre-M3 fix) → migrate sub in-place, return its id
 * - Legacy anonymous row (id=1, google_sub IS NULL) → claim it with real sub, return 1
 * - Otherwise → insert new row (new device/account), return new id
 * Also seeds default categories for brand-new rows.
 */
export async function resolveUserRow(
  db: SQLiteDatabase,
  googleSub: string,
  googleEmail: string,
  isActive: () => boolean = () => true,
  previousGoogleSub?: string,
): Promise<{ id: number; isNew: boolean }> {
  const accountKey = googleEmail.trim().toLowerCase();
  let resolved: { id: number; isNew: boolean } | null = null;
  await db.withTransactionAsync(async () => {
    if (!isActive()) throw new Error('Google sign-in cancelled');

    // Primary lookup: stable OIDC sub
    const existing = await db.getFirstAsync<{ id: number }>(
      'SELECT id FROM users WHERE google_sub = ?',
      [googleSub]
    );
    if (existing) {
      if (!isActive()) throw new Error('Google sign-in cancelled');
      await db.runAsync(
        'UPDATE users SET account_key = ? WHERE id = ?',
        [accountKey, existing.id],
      );
      resolved = { id: existing.id, isNew: false };
      return;
    }

    // Google subjects can change when an account is reprovisioned or the
    // OAuth client/project changes. If this sign-in is for the same verified
    // email as the identity already stored on this device, move that existing
    // local row instead of creating a second empty account. The caller only
    // supplies previousGoogleSub after comparing the two verified emails.
    if (previousGoogleSub && previousGoogleSub !== googleSub) {
      const previous = await db.getFirstAsync<{ id: number }>(
        'SELECT id FROM users WHERE google_sub = ?',
        [previousGoogleSub],
      );
      if (previous) {
        if (!isActive()) throw new Error('Google sign-in cancelled');
        await db.runAsync(
          'UPDATE users SET google_sub = ?, account_key = ? WHERE id = ?',
          [googleSub, accountKey, previous.id],
        );
        resolved = { id: previous.id, isNew: false };
        return;
      }
    }

    // Migration: legacy install stored email in google_sub — upgrade in-place
    const legacy = await db.getFirstAsync<{ id: number }>(
      'SELECT id FROM users WHERE LOWER(TRIM(google_sub)) = LOWER(TRIM(?)) ORDER BY id LIMIT 1',
      [googleEmail]
    );
    if (legacy) {
      if (!isActive()) throw new Error('Google sign-in cancelled');
      await db.runAsync(
        'UPDATE users SET google_sub = ?, account_key = ? WHERE id = ?',
        [googleSub, accountKey, legacy.id],
      );
      resolved = { id: legacy.id, isNew: false };
      return;
    }

    if (!isActive()) throw new Error('Google sign-in cancelled');
    const claimed = await db.runAsync(
      'UPDATE users SET google_sub = ?, account_key = ? WHERE id = 1 AND google_sub IS NULL',
      [googleSub, accountKey]
    );
    if (claimed.changes > 0) {
      resolved = { id: 1, isNew: false };
      return;
    }

    // New account on this device — insert a fresh user row and seed their
    // categories in the same SQLite transaction. A failed seed therefore
    // rolls back the user row instead of leaving a retryable-looking partial
    // account behind.
    if (!isActive()) throw new Error('Google sign-in cancelled');
    const result = await db.runAsync(
      `INSERT INTO users (username, timezone, carry_debt, currency, google_sub, account_key)
       VALUES ('me', 'Asia/Ho_Chi_Minh', 0, 'VND', ?, ?)`,
      [googleSub, accountKey]
    );
    const newUserId = result.lastInsertRowId;
    const catSeed = [
      ['Health', '🏃', 1],
      ['Mind',   '🧠', 2],
      ['Work',   '💼', 3],
      ['Social', '👥', 4],
      ['Other',  '⭐', 5],
    ] as const;
    for (const [name, icon, order] of catSeed) {
      if (!isActive()) throw new Error('Google sign-in cancelled');
      await db.runAsync(
        'INSERT INTO categories (user_id, name, icon, sort_order) VALUES (?, ?, ?, ?)',
        [newUserId, name, icon, order]
      );
    }
    resolved = { id: newUserId, isNew: true };
  });
  if (!resolved) throw new Error('Unable to resolve local Google account');
  return resolved;
}

/**
 * Per-user tables cleared by resetProgress. Intentionally excludes user-config
 * tables (categories, task_types, treats) — "reset progress" keeps the user's
 * custom setup and only clears earned/logged history.
 */
export const RESET_PROGRESS_STATEMENTS = [
  'DELETE FROM challenge_days WHERE challenge_id IN (SELECT id FROM challenges WHERE user_id = ?)',
  'DELETE FROM challenge_log WHERE challenge_id IN (SELECT id FROM challenges WHERE user_id = ?)',
  'DELETE FROM challenges WHERE user_id = ?',
  'DELETE FROM achievements WHERE user_id = ?',
  'DELETE FROM activity_log WHERE user_id = ?',
  'DELETE FROM daily_summary WHERE user_id = ?',
  'DELETE FROM weekly_summary WHERE user_id = ?',
  'DELETE FROM reward_unlocks WHERE user_id = ?',
  'DELETE FROM treat_history WHERE user_id = ?',
  'DELETE FROM streak_freezes WHERE user_id = ?',
  'DELETE FROM fund_transactions WHERE user_id = ?',
  'DELETE FROM milestone_stars WHERE user_id = ?',
  'DELETE FROM boost_events WHERE user_id = ?',
];

/** Per-user tables purged by deleteAccount — must cover every table with a user_id column. */
export const DELETE_ACCOUNT_STATEMENTS = [
  'DELETE FROM challenge_days WHERE challenge_id IN (SELECT id FROM challenges WHERE user_id = ?)',
  'DELETE FROM challenge_log WHERE challenge_id IN (SELECT id FROM challenges WHERE user_id = ?)',
  'DELETE FROM challenges WHERE user_id = ?',
  'DELETE FROM achievements WHERE user_id = ?',
  'DELETE FROM activity_log WHERE user_id = ?',
  'DELETE FROM daily_summary WHERE user_id = ?',
  'DELETE FROM weekly_summary WHERE user_id = ?',
  'DELETE FROM reward_unlocks WHERE user_id = ?',
  'DELETE FROM treats WHERE user_id = ?',
  'DELETE FROM treat_history WHERE user_id = ?',
  'DELETE FROM streak_freezes WHERE user_id = ?',
  'DELETE FROM task_types WHERE user_id = ?',
  'DELETE FROM categories WHERE user_id = ?',
  'DELETE FROM fund_transactions WHERE user_id = ?',
  'DELETE FROM milestone_stars WHERE user_id = ?',
  'DELETE FROM boost_events WHERE user_id = ?',
];

async function clearLocalProgressRows(db: SQLiteDatabase, uid: number): Promise<void> {
  await db.withTransactionAsync(async () => {
    for (const sql of RESET_PROGRESS_STATEMENTS) {
      await db.runAsync(sql, [uid]);
    }
    await db.runAsync(
      `UPDATE users SET treat_stars = 0, treat_stars_lifetime = 0, carry_debt = 0,
         lifetime_stars = 0, current_tier_id = NULL WHERE id = ?`,
      [uid],
    );
  });
}

async function purgeLocalAccountRows(db: SQLiteDatabase, uid: number): Promise<void> {
  await db.withTransactionAsync(async () => {
    for (const sql of DELETE_ACCOUNT_STATEMENTS) {
      await db.runAsync(sql, [uid]);
    }
    await db.runAsync('DELETE FROM users WHERE id = ?', [uid]);
  });
}

type PendingProgressReset = { userId: number; email: string; sub: string; operationId: string };
type PendingAccountDelete = PendingProgressReset;

function createDestructiveOperationId(): string {
  const bytes = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.map(byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function isDestructiveOperationId(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function parsePendingProgressReset(value: string | null): PendingProgressReset | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<PendingProgressReset>;
    const userId = parsed.userId;
    if (typeof userId !== 'number' || !Number.isSafeInteger(userId) || userId < 1
        || typeof parsed.email !== 'string' || typeof parsed.sub !== 'string'
        || !isDestructiveOperationId(parsed.operationId)) return null;
    return { userId, email: parsed.email, sub: parsed.sub, operationId: parsed.operationId };
  } catch {
    return null;
  }
}

function parsePendingAccountDelete(value: string | null): PendingAccountDelete | null {
  return parsePendingProgressReset(value);
}

function pendingMarkerIdentityMatches(
  raw: string | null,
  user: Pick<GoogleUser, 'sub' | 'email'>,
): boolean {
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw) as { email?: unknown; sub?: unknown };
    return typeof parsed.email === 'string'
      && typeof parsed.sub === 'string'
      && parsed.email.trim().toLowerCase() === user.email.trim().toLowerCase()
      && parsed.sub.trim() === user.sub.trim();
  } catch {
    return false;
  }
}

export async function cancelUserChallengeReminders(
  db: Pick<SQLiteDatabase, 'getAllAsync'>,
  userId: number,
): Promise<void> {
  const rows = await db.getAllAsync<{ id: number; notification_id: string | null }>(
    'SELECT id, notification_id FROM challenges WHERE user_id = ?',
    [userId],
  );
  if (!rows.length) return;
  const { cancelChallengeReminders } = await import('../utils/notifications');
  await cancelChallengeReminders([
    ...rows.map(row => row.notification_id),
    ...rows.map(row => challengeReminderPrefix(row.id)),
  ]);
}

export { GoogleUserContext, UserIdContext, useAuthUser, useGoogleUser } from './authContext';

export function useAuth() {
  const [isLoading, setIsLoading] = useState(true);
  const [isOnboarded, setIsOnboarded] = useState(false);
  const [googleUser, setGoogleUser] = useState<GoogleUser | null>(null);
  const [userId, setUserId] = useState(1);
  const signInInFlight = useRef<Promise<boolean> | null>(null);

  useEffect(() => {
    let mounted = true;
    let restoreActive = true;
    let restoreTimeout: ReturnType<typeof setTimeout> | null = null;
    let cancelSessionRestore: (() => void) | null = null;
    Promise.all([
      AsyncStorage.getItem(ONBOARDED_KEY),
      readGoogleUser(),
    ])
      .then(async ([onboarded, userJson]) => {
        let storedUser = parseGoogleUser(userJson);
        if (storedUser && isQaSandboxIdentity(storedUser) && !isQaSandboxBuildAvailable()) {
          // A QA identity must never survive into a production build, even if
          // a developer installed a release build over the debug app.
          await deleteGoogleUser();
          await AsyncStorage.removeItem(ONBOARDED_KEY);
          storedUser = null;
        }
        if (storedUser && isQaSandboxIdentity(storedUser)) setQaSandboxNetworkBlocked(true);
        else setQaSandboxNetworkBlocked(false);
        let restored = { isOnboarded: parseOnboarded(onboarded), googleUser: storedUser };

        if (restored.isOnboarded && storedUser && !isQaSandboxIdentity(storedUser) && restoreActive) {
          // require(), not `await import(...)`: a dynamic import of this module
          // hung indefinitely on startup in testing (never resolved, no error) --
          // matches this project's documented rule (see habit-tracker/AGENTS.md,
          // "Metro And Emulator") that native-module-adjacent code must load via
          // runtime require, not async Metro imports. The Promise.race below is
          // additional defense-in-depth for GoogleSignin.signInSilently() itself,
          // which is a native-bridge call with no timeout of its own.
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const { ensureSupabaseSession, cancelSupabaseSessionRestore } = require('../api/syncService') as typeof import('../api/syncService');
          cancelSessionRestore = cancelSupabaseSessionRestore;
          try {
            restored = await Promise.race([
              restoreStoredGoogleSession(
                onboarded,
                userJson,
                (email, googleSub) => ensureSupabaseSession(email, () => restoreActive, googleSub),
                () => restoreActive,
              ),
              new Promise<never>((_, reject) => {
                restoreTimeout = setTimeout(() => {
                  restoreActive = false;
                  cancelSessionRestore?.();
                  reject(new Error('Startup session restore timed out'));
                }, STARTUP_SESSION_RESTORE_TIMEOUT_MS);
              }),
            ]);
          } finally {
            restoreActive = false;
            cancelSessionRestore?.();
            if (restoreTimeout) clearTimeout(restoreTimeout);
          }
        }

        if (!restored.googleUser && storedUser) {
          await deleteGoogleUser();
          await AsyncStorage.removeItem(ONBOARDED_KEY);
        }
        if (!mounted) return;
        setIsOnboarded(restored.isOnboarded);
        setGoogleUser(restored.googleUser);
      })
      .catch((e) => {
        // Never keep a stored identity active when startup verification failed.
        // The next launch can retry with the still-preserved secure credential.
        if (__DEV__) console.warn('[useAuth] startup load failed; staying signed out:', e);
        if (!mounted) return;
        const signedOut = getAuthStateAfterRestoreFailure();
        setIsOnboarded(signedOut.isOnboarded);
        setGoogleUser(signedOut.googleUser);
      })
      .finally(() => { if (mounted) setIsLoading(false); });
    return () => {
      mounted = false;
      restoreActive = false;
      cancelSessionRestore?.();
      if (restoreTimeout) clearTimeout(restoreTimeout);
    };
  }, []);

  const completeOnboarding = useCallback(async () => {
    await AsyncStorage.setItem(ONBOARDED_KEY, 'true');
    setIsOnboarded(true);
  }, []);

  const signInWithGoogle = useCallback((user: GoogleUser, idToken?: string): Promise<boolean> => {
    if (signInInFlight.current) return signInInFlight.current;

    const operation = (async (): Promise<boolean> => {
    const remoteIdToken = typeof idToken === 'string' && idToken.trim() ? idToken.trim() : null;
    if (!isQaSandboxIdentity(user)) {
      if (typeof user.sub !== 'string' || !user.sub.trim()) throw new Error('Google account is missing a stable subject');
      if (!remoteIdToken) throw new Error('Google ID token is required');
    }
    const previousUser = await getStoredGoogleUser();
    let releasePreviousSync: (() => void) | null = null;
    if (isQaSandboxIdentity(user) && previousUser && !isQaSandboxIdentity(previousUser)) {
      const { pauseAccountSync } = await import('../api/syncService');
      releasePreviousSync = await pauseAccountSync(previousUser.email);
      try {
        const { getDb } = await import('../db/client');
        const db = await getDb();
        invalidateChallengeReminderSync();
        await cancelUserChallengeReminders(db, userId);
      } catch (error) {
        releasePreviousSync();
        releasePreviousSync = null;
        throw error;
      }
    }

    let remoteAuthActive = true;
    let remoteAuthTimeout: ReturnType<typeof setTimeout> | null = null;
    let cancelSessionRestore: (() => void) | null = null;
    let remoteSyncService: typeof import('../api/syncService') | null = null;
    let remoteAuthDeadline: Promise<never> | null = null;
    try {
    // Verify the provider token and its stable subject before touching SQLite.
    // This prevents a rejected or mismatched token from claiming the anonymous
    // row or creating an orphan local account.
    if (!isQaSandboxIdentity(user)) {
      if (!remoteIdToken) throw new Error('Google ID token is required');
      const remoteAuthPromise = (async () => {
        const syncService = await import('../api/syncService');
        remoteSyncService = syncService;
        cancelSessionRestore = syncService.cancelSupabaseSessionRestore;
        if (!remoteAuthActive) {
          cancelSessionRestore();
          throw new Error('Google sign-in cancelled');
        }
        await syncService.signInWithGoogleToken(user.email, remoteIdToken, () => remoteAuthActive, user.sub);
        if (!remoteAuthActive) throw new Error('Google sign-in cancelled');
      })();
      remoteAuthDeadline = new Promise<never>((_, reject) => {
        remoteAuthTimeout = setTimeout(() => {
          remoteAuthActive = false;
          if (typeof cancelSessionRestore === 'function') cancelSessionRestore();
          reject(new Error('Google sign-in timed out'));
        }, INTERACTIVE_GOOGLE_AUTH_TIMEOUT_MS);
      });
      await Promise.race([remoteAuthPromise, remoteAuthDeadline]);
    }

    // Complete durable reset/delete markers before resolving or creating the
    // local row. Interactive Google sign-in has the same crash surface as
    // cold-start restore and must not bypass that safety gate.
    if (!isQaSandboxIdentity(user)) {
      const pendingDelete = await completePendingDelete(user);
      if (pendingDelete === 'blocked') throw new Error('Account deletion recovery is blocked');
      if (pendingDelete === 'deleted') throw new Error('Account deletion completed; sign in again');
      if (!await completePendingReset(user)) throw new Error('Progress reset recovery is blocked');
    }

    // Resolve the local account before publishing the new identity to React or
    // secure storage. A failed lookup must not leave the app authenticated as
    // the new Google user while still pointing at the previous local user row.
    const resolveLocalAccount = async (): Promise<{ id: number; isNew: boolean }> => {
      try {
        const { getDb } = await import('../db/client');
        const db = await getDb();
        if (isQaSandboxIdentity(user)) {
          if (!isQaSandboxBuildAvailable()) throw new Error('QA sandbox is unavailable in release builds');
          setQaSandboxNetworkBlocked(true);
          const result = { id: await seedQaSandbox(db), isNew: false };
          setQaSandboxNetworkBlocked(true);
          return result;
        }
        setQaSandboxNetworkBlocked(false);
        const previousGoogleSub = previousUser
          && previousUser.email.trim().toLowerCase() === user.email.trim().toLowerCase()
          && previousUser.sub.trim() !== user.sub.trim()
          ? previousUser.sub
          : undefined;
        return resolveUserRow(db, user.sub, user.email, () => remoteAuthActive, previousGoogleSub);
      } catch (e) {
        if (isQaSandboxIdentity(user)) setQaSandboxNetworkBlocked(false);
        if (__DEV__) console.warn('[auth] resolveUserRow failed; sign-in aborted:', e);
        throw e;
      }
    };
    // The interactive deadline covers local DB opening/seeding as well as the
    // native/provider exchange. The loser may finish in the background, but
    // resolveUserRow is fenced by remoteAuthActive and rolls back on timeout.
    const result = remoteAuthDeadline
      ? await Promise.race([resolveLocalAccount(), remoteAuthDeadline])
      : await resolveLocalAccount();

    // The short interactive deadline is for provider exchange and local
    // account resolution. Cloud snapshot hydration has its own bounded
    // restore timeout; keeping the exchange deadline alive here made valid
    // large accounts fail sign-in at exactly 15 seconds.
    if (remoteAuthTimeout) clearTimeout(remoteAuthTimeout);
    remoteAuthTimeout = null;
    remoteAuthDeadline = null;

    // Hydrate a fresh SQLite file before publishing the identity. A reinstall
    // must not treat seeded default rows as the signed-in account's complete
    // state and upload them over the cloud copy.
    if (!isQaSandboxIdentity(user)) {
      if (!remoteSyncService) throw new Error('Google sign-in session unavailable');
      const syncService = remoteSyncService as typeof import('../api/syncService');
      // Interactive sign-in must stay bounded for an already-populated local
      // account. A durable restore block is the exception: retry it here so a
      // fresh/seeded account never gets stranded outside App.tsx's Retry UI.
      // The final flag keeps ordinary populated sign-ins on the fast path;
      // App.tsx's explicit recovery Retry still opts into full reconciliation.
      let restoreFailureReason: string | undefined;
      const restoreResult = await syncService.restoreUserDataIfNeeded(
        result.id,
        user.email,
        user.sub,
        () => remoteAuthActive,
        true,
        undefined,
        true,
        reason => { restoreFailureReason = reason; },
      );
      if (restoreResult === 'unavailable') {
        // The reason is a short, pre-validated code (never raw error text) so
        // SignInScreen's existing opt-in diagnostics can surface it safely —
        // otherwise this failure is invisible in release builds (no Sentry
        // DSN is configured yet).
        throw Object.assign(
          new Error('Cloud data restore is unavailable; sign-in remains blocked for safety'),
          restoreFailureReason ? { code: restoreFailureReason } : {},
        );
      }
      // Restore the server-derived lifetime total after the full snapshot so a
      // current server balance still wins over a stale backup snapshot.
      await syncService.restoreLifetimeStarsFromSupabase(result.id, user.email, () => remoteAuthActive, user.sub);
    }

    await writeGoogleUser(JSON.stringify(user));
    await AsyncStorage.setItem('habit_tracker_display_name', user.name);
    await (result.isNew && !isQaSandboxIdentity(user) ? AsyncStorage.removeItem(ONBOARDED_KEY) : AsyncStorage.setItem(ONBOARDED_KEY, 'true'));
    queryClient.clear();
    setUserId(result.id);
    setGoogleUser(user);
    setIsOnboarded(!result.isNew);

    return result.isNew;
    } finally {
      remoteAuthActive = false;
      const cancel = cancelSessionRestore as (() => void) | null;
      if (cancel) cancel();
      if (remoteAuthTimeout) clearTimeout(remoteAuthTimeout);
      releasePreviousSync?.();
  }
    })();

    signInInFlight.current = operation;
    operation.then(
      () => { if (signInInFlight.current === operation) signInInFlight.current = null; },
      () => { if (signInInFlight.current === operation) signInInFlight.current = null; },
    );
    return operation;
  }, [userId]);

  const resetProgress = useCallback(async (uid: number) => {
    const storedUser = await getStoredGoogleUser();
    const { markBackupRestoreBlocked, clearBackupRestoreBlocked, pauseAccountSync, resetSyncCursors, resetUserProgressInSupabase } = await import('../api/syncService');
    const releaseSync = storedUser ? await pauseAccountSync(storedUser.email) : null;
    const markerKey = storedUser ? pendingResetKey(storedUser) : `${PENDING_RESET_KEY}:local:${uid}`;
    const operationId = createDestructiveOperationId();
    try {
      await AsyncStorage.setItem(markerKey, JSON.stringify({
        userId: uid,
        email: storedUser?.email ?? '',
        sub: storedUser?.sub ?? '',
        operationId,
      } satisfies PendingProgressReset));
      if (storedUser) await markBackupRestoreBlocked(storedUser.email);
      if (storedUser) await resetUserProgressInSupabase(storedUser.email, storedUser.sub, operationId, true);
      const { getDb } = await import('../db/client');
      const db = await getDb();
      await cancelUserChallengeReminders(db, uid);
      await clearLocalProgressRows(db, uid);
      await resetSyncCursors();
      if (storedUser) await clearBackupRestoreBlocked(storedUser.email);
      await AsyncStorage.removeItem(markerKey);
    } catch (error) {
      if (storedUser) await markBackupRestoreBlocked(storedUser.email);
      throw error;
    } finally {
      releaseSync?.();
    }
  }, []);

  /**
   * Finish a reset that may have been interrupted between its remote and
   * local halves. Returning false is deliberately fail-closed: App.tsx must
  * not restore or upload while the reset marker remains unresolved.
  */
  const completePendingReset = useCallback(async (identity?: GoogleUser): Promise<boolean> => {
    const storedUser = identity ?? await getStoredGoogleUser();
    if (!storedUser) return true;
    const scopedKey = pendingResetKey(storedUser);
    let markerKey = scopedKey;
    let rawMarker = await AsyncStorage.getItem(scopedKey);
    // Read the pre-email-key scoped marker once so a release upgrade cannot
    // strand a destructive operation under the old Google-sub namespace.
    if (rawMarker === null) {
      const legacyScopedKey = legacyPendingResetKey(storedUser);
      if (legacyScopedKey !== scopedKey) {
        rawMarker = await AsyncStorage.getItem(legacyScopedKey);
        if (rawMarker !== null) markerKey = legacyScopedKey;
      }
    }
    // Migrate an interrupted reset written by the previous global-marker
    // implementation, but never let another account's marker block startup.
    if (rawMarker === null) {
      const legacyMarker = await AsyncStorage.getItem(PENDING_RESET_KEY);
      const legacyPending = parsePendingProgressReset(legacyMarker);
      if (legacyPending
          && legacyPending.sub === storedUser.sub
          && legacyPending.email.trim().toLowerCase() === storedUser.email.trim().toLowerCase()) {
        rawMarker = legacyMarker;
        markerKey = PENDING_RESET_KEY;
      } else if (legacyMarker !== null && pendingMarkerIdentityMatches(legacyMarker, storedUser)) {
        await import('../api/syncService').then(({ markBackupRestoreBlocked }) => markBackupRestoreBlocked(storedUser.email));
        return false;
      }
    }
    if (rawMarker === null) return true;
    const pending = parsePendingProgressReset(rawMarker);
    if (!pending) {
      await import('../api/syncService').then(({ markBackupRestoreBlocked }) => markBackupRestoreBlocked(storedUser.email));
      return false;
    }
    if (pending.sub !== storedUser.sub
        || pending.email.trim().toLowerCase() !== storedUser.email.trim().toLowerCase()) {
      await import('../api/syncService').then(({ markBackupRestoreBlocked }) => markBackupRestoreBlocked(storedUser.email));
      return false;
    }

    const { markBackupRestoreBlocked, clearBackupRestoreBlocked, pauseAccountSync, resetSyncCursors, resetUserProgressInSupabase } = await import('../api/syncService');
    const releaseSync = await pauseAccountSync(storedUser.email);
    try {
      await resetUserProgressInSupabase(storedUser.email, storedUser.sub, pending.operationId, false);
      const { getDb } = await import('../db/client');
      const db = await getDb();
      await cancelUserChallengeReminders(db, pending.userId);
      await clearLocalProgressRows(db, pending.userId);
      await resetSyncCursors();
      await clearBackupRestoreBlocked(storedUser.email);
      await AsyncStorage.removeItem(markerKey);
      return true;
    } catch (error) {
      await markBackupRestoreBlocked(storedUser.email);
      if (__DEV__) console.warn('[auth] pending progress reset still blocked:', error);
      return false;
    } finally {
      releaseSync();
    }
  }, []);

  const clearLocalAuthState = useCallback(async () => {
    try {
      await deleteGoogleUser();
      await AsyncStorage.multiRemove([ONBOARDED_KEY, 'habit_tracker_display_name', 'habit_gender', 'habit_birth_year']);
    } finally {
      setIsOnboarded(false);
      setGoogleUser(null);
      setUserId(1);
      setQaSandboxNetworkBlocked(false);
      queryClient.clear();
    }
  }, []);

  /**
   * Finish account deletion after a process crash between the remote delete
   * and local SQLite purge. Until this completes, the account stays blocked
   * from snapshot upload so a fresh Google session cannot resurrect old rows.
   */
  const completePendingDelete = useCallback(async (identity?: GoogleUser): Promise<'none' | 'deleted' | 'blocked'> => {
    const storedUser = identity ?? await getStoredGoogleUser();
    if (!storedUser || isQaSandboxIdentity(storedUser)) return 'none';
    const scopedKey = pendingDeleteKey(storedUser);
    let markerKey = scopedKey;
    let rawMarker = await AsyncStorage.getItem(scopedKey);
    if (rawMarker === null) {
      const legacyScopedKey = legacyPendingDeleteKey(storedUser);
      if (legacyScopedKey !== scopedKey) {
        rawMarker = await AsyncStorage.getItem(legacyScopedKey);
        if (rawMarker !== null) markerKey = legacyScopedKey;
      }
    }
    if (rawMarker === null) {
      const legacyGlobalRaw = await AsyncStorage.getItem(PENDING_DELETE_KEY);
      const legacyGlobalMarker = parsePendingAccountDelete(legacyGlobalRaw);
      if (legacyGlobalMarker
          && legacyGlobalMarker.sub === storedUser.sub
          && legacyGlobalMarker.email.trim().toLowerCase() === storedUser.email.trim().toLowerCase()) {
        rawMarker = legacyGlobalRaw;
        markerKey = PENDING_DELETE_KEY;
      } else if (legacyGlobalRaw !== null && pendingMarkerIdentityMatches(legacyGlobalRaw, storedUser)) {
        const { markBackupRestoreBlocked } = await import('../api/syncService');
        await markBackupRestoreBlocked(storedUser.email);
        return 'blocked';
      }
    }
    const marker = parsePendingAccountDelete(rawMarker);
    if (!marker) {
      if (rawMarker === null) return 'none';
      const { markBackupRestoreBlocked } = await import('../api/syncService');
      await markBackupRestoreBlocked(storedUser.email);
      return 'blocked';
    }
    if (marker.sub !== storedUser.sub
        || marker.email.trim().toLowerCase() !== storedUser.email.trim().toLowerCase()) {
      const { markBackupRestoreBlocked } = await import('../api/syncService');
      await markBackupRestoreBlocked(storedUser.email);
      return 'blocked';
    }

    const {
      deleteUserFromSupabase,
      markBackupRestoreBlocked,
      clearBackupRestoreBlocked,
      pauseAccountSync,
      resetSyncCursors,
      signOutSupabaseSession,
    } = await import('../api/syncService');
    const releaseSync = await pauseAccountSync(storedUser.email);
    try {
      await deleteUserFromSupabase(storedUser.email, storedUser.sub, marker.operationId, false);
      const { getDb } = await import('../db/client');
      const db = await getDb();
      invalidateChallengeReminderSync();
      await cancelUserChallengeReminders(db, marker.userId);
      await purgeLocalAccountRows(db, marker.userId);
      await resetSyncCursors();
      await clearBackupRestoreBlocked(storedUser.email);
      try { await signOutSupabaseSession(); } catch { }
      await clearLocalAuthState();
      // Keep the marker until auth/local cleanup has completed. If the
      // process dies before this removal, the next startup can finish the
      // already-idempotent remote/local delete instead of reprovisioning.
      await AsyncStorage.removeItem(markerKey);
      return 'deleted';
    } catch (error) {
      await markBackupRestoreBlocked(storedUser.email);
      if (__DEV__) console.warn('[auth] pending account deletion still blocked:', error);
      return 'blocked';
    } finally {
      releaseSync();
    }
  }, [clearLocalAuthState]);

  const deleteAccount = useCallback(async (uid: number) => {
    const currentUser = await getStoredGoogleUser();
    if (currentUser && isQaSandboxIdentity(currentUser)) {
      const { getDb } = await import('../db/client');
      const db = await getDb();
      invalidateChallengeReminderSync();
      await cancelUserChallengeReminders(db, uid);
      await purgeQaSandbox(db);
      await clearLocalAuthState();
      return;
    }

    // Purge remote Supabase data FIRST while the auth session is still active
    const { deleteUserFromSupabase, markBackupRestoreBlocked, clearBackupRestoreBlocked, pauseAccountSync, resetSyncCursors, signOutSupabaseSession } = await import('../api/syncService');
    const googleUserJson = await readGoogleUser();
    const gu = parseGoogleUser(googleUserJson);
    if (!gu) throw new Error('Cannot delete account without a signed-in Google identity');
    const releaseSync = await pauseAccountSync(gu.email);
    const markerKey = pendingDeleteKey(gu);
    try {
      // Persist the local half before the remote call. If Android kills the
      // process after Supabase deletion, startup can finish the purge instead
      // of treating stale SQLite as authoritative for a fresh JWT.
      await AsyncStorage.setItem(markerKey, JSON.stringify({
        userId: uid,
        email: gu.email,
        sub: gu.sub,
        operationId: createDestructiveOperationId(),
      } satisfies PendingAccountDelete));
      await markBackupRestoreBlocked(gu.email);
      const pendingMarker = parsePendingAccountDelete(await AsyncStorage.getItem(markerKey));
      if (!pendingMarker) throw new Error('Invalid pending account deletion marker');
      await deleteUserFromSupabase(gu.email, gu.sub, pendingMarker.operationId, true);
      await resetSyncCursors();
      // Delete all local SQLite rows
      const { getDb } = await import('../db/client');
      const db = await getDb();
      invalidateChallengeReminderSync();
      await cancelUserChallengeReminders(db, uid);
      await purgeLocalAccountRows(db, uid);
      await clearBackupRestoreBlocked(gu.email);
      // Sign out from Supabase Auth
      try {
        await signOutSupabaseSession();
      } catch { }
      // Revoke Google session
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { GoogleSignin } = require('@react-native-google-signin/google-signin') as typeof import('@react-native-google-signin/google-signin');
        await GoogleSignin.revokeAccess();
        await GoogleSignin.signOut();
      } catch { }
      await clearLocalAuthState();
      // Remove the durable marker only after remote delete, local purge, and
      // auth cleanup have all completed. A crash before this point remains
      // recoverable by completePendingDelete on the next sign-in/startup.
      await AsyncStorage.removeItem(markerKey);
      await AsyncStorage.removeItem(pendingResetKey(gu));
      await AsyncStorage.removeItem(legacyPendingDeleteKey(gu));
      await AsyncStorage.removeItem(legacyPendingResetKey(gu));
    } catch (error) {
      await markBackupRestoreBlocked(gu.email);
      throw error;
    } finally {
      releaseSync();
    }
  }, [clearLocalAuthState]);

  const signOut = useCallback(async () => {
    const storedUser = await getStoredGoogleUser();
    if (storedUser && isQaSandboxIdentity(storedUser)) {
      try {
        const db = await import('../db/client').then(module => module.getDb());
        invalidateChallengeReminderSync();
        await cancelUserChallengeReminders(db, userId);
        await purgeQaSandbox(db);
      } finally {
        await clearLocalAuthState();
      }
      return;
    }
    const { pauseAccountSync, resetSyncCursors, signOutSupabaseSession } = await import('../api/syncService');
    const releaseSync = storedUser ? await pauseAccountSync(storedUser.email) : null;
    try {
      // Invalidate the App foreground reconciler before cancellation. The
      // notification queue then drains any in-flight scheduler before this
      // cleanup, so the old account cannot be re-scheduled after sign-out.
      invalidateChallengeReminderSync();
      // Remove account-scoped Challenge notifications before clearing the
      // identity. App-level lifecycle effects also have an auth guard, but an
      // in-flight foreground reconciliation must not leave the old user's
      // Challenge names visible after sign-out.
      try {
        const db = await import('../db/client').then(module => module.getDb());
        await cancelUserChallengeReminders(db, userId);
      } catch { }
      try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { GoogleSignin } = require('@react-native-google-signin/google-signin') as typeof import('@react-native-google-signin/google-signin');
      await GoogleSignin.revokeAccess(); // revoke server-side token so next sign-in always prompts
      await GoogleSignin.signOut();
    } catch {
      // ignore — native sign-out failure doesn't affect local state
    }
    try {
      await signOutSupabaseSession();
    } catch { }
    try {
      const { resetSyncCursors } = await import('../api/syncService');
      await resetSyncCursors();
    } catch { }
      await clearLocalAuthState();
    } finally {
      releaseSync?.();
    }
  }, [clearLocalAuthState, userId]);

  return {
    isLoading,
    isOnboarded,
    googleUser,
    userId,
    setResolvedUserId: setUserId,
    completeOnboarding,
    signInWithGoogle,
    signOut,
    deleteAccount,
    resetProgress,
    completePendingReset,
    completePendingDelete,
  };
}
