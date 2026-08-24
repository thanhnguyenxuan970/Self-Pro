import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
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
): Promise<{ id: number; isNew: boolean }> {
  let resolved: { id: number; isNew: boolean } | null = null;
  await db.withTransactionAsync(async () => {
    if (!isActive()) throw new Error('Google sign-in cancelled');

    // Primary lookup: stable OIDC sub
    const existing = await db.getFirstAsync<{ id: number }>(
      'SELECT id FROM users WHERE google_sub = ?',
      [googleSub]
    );
    if (existing) {
      resolved = { id: existing.id, isNew: false };
      return;
    }

    // Migration: legacy install stored email in google_sub — upgrade in-place
    const legacy = await db.getFirstAsync<{ id: number }>(
      'SELECT id FROM users WHERE google_sub = ?',
      [googleEmail]
    );
    if (legacy) {
      if (!isActive()) throw new Error('Google sign-in cancelled');
      await db.runAsync('UPDATE users SET google_sub = ? WHERE id = ?', [googleSub, legacy.id]);
      resolved = { id: legacy.id, isNew: false };
      return;
    }

    if (!isActive()) throw new Error('Google sign-in cancelled');
    const claimed = await db.runAsync(
      'UPDATE users SET google_sub = ? WHERE id = 1 AND google_sub IS NULL',
      [googleSub]
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
      `INSERT INTO users (username, timezone, carry_debt, currency, google_sub)
       VALUES ('me', 'Asia/Ho_Chi_Minh', 0, 'VND', ?)`,
      [googleSub]
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

export const UserIdContext = createContext<number>(1);
export function useAuthUser(): number {
  return useContext(UserIdContext);
}

export const GoogleUserContext = createContext<GoogleUser | null>(null);
export function useGoogleUser(): GoogleUser | null {
  return useContext(GoogleUserContext);
}

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
        return resolveUserRow(db, user.sub, user.email, () => remoteAuthActive);
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

    // Restore the server-derived lifetime total before publishing the identity.
    // A fresh local install otherwise renders Home/Rank with a bare local total
    // and nothing tells those screens to re-fetch once the restore lands.
    if (!isQaSandboxIdentity(user)) {
      if (!remoteSyncService || !remoteAuthDeadline) throw new Error('Google sign-in session unavailable');
      const syncService = remoteSyncService as typeof import('../api/syncService');
      await Promise.race([
        syncService.restoreLifetimeStarsFromSupabase(result.id, user.email, () => remoteAuthActive, user.sub),
        remoteAuthDeadline,
      ]);
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
    const { pauseAccountSync, resetSyncCursors, resetUserProgressInSupabase } = await import('../api/syncService');
    const releaseSync = storedUser ? await pauseAccountSync(storedUser.email) : null;
    try {
      if (storedUser) await resetUserProgressInSupabase(storedUser.email, storedUser.sub);
      const { getDb } = await import('../db/client');
      const db = await getDb();
      await cancelUserChallengeReminders(db, uid);
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
      try {
        await resetSyncCursors();
      } catch { }
    } finally {
      releaseSync?.();
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
    const { deleteUserFromSupabase, pauseAccountSync, resetSyncCursors, signOutSupabaseSession } = await import('../api/syncService');
    const googleUserJson = await readGoogleUser();
    const gu = parseGoogleUser(googleUserJson);
    if (!gu) throw new Error('Cannot delete account without a signed-in Google identity');
    const releaseSync = await pauseAccountSync(gu.email);
    try {
      await deleteUserFromSupabase(gu.email, gu.sub);
      await resetSyncCursors();
      // Delete all local SQLite rows
      const { getDb } = await import('../db/client');
      const db = await getDb();
      invalidateChallengeReminderSync();
      await cancelUserChallengeReminders(db, uid);
      await db.withTransactionAsync(async () => {
        for (const sql of DELETE_ACCOUNT_STATEMENTS) {
          await db.runAsync(sql, [uid]);
        }
        await db.runAsync('DELETE FROM users WHERE id = ?', [uid]);
      });
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
  };
}
