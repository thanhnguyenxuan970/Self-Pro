import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SQLiteDatabase } from 'expo-sqlite';
import { type GoogleUser, readGoogleUser, writeGoogleUser, deleteGoogleUser, parseGoogleUser, getStoredGoogleUser } from '../lib/googleUserStorage';
import { NO_SAVED_GOOGLE_CREDENTIAL_CODE } from '../api/syncErrors';

export type { GoogleUser };
export { parseGoogleUser, getStoredGoogleUser };

const ONBOARDED_KEY = 'habit_tracker_onboarded';

// GoogleSignin.signInSilently() is a native-bridge call with no cancellation
// support and no built-in timeout; if it never calls back (flaky Play
// Services, poor network), startup restoration must not block the app on
// the loading spinner forever. Same pattern/timeout as feedbackService.ts's
// SUBMIT_TIMEOUT_MS for the same class of "network call may hang" risk.
const STARTUP_SESSION_RESTORE_TIMEOUT_MS = 15_000;

export function parseOnboarded(val: string | null): boolean {
  return val === 'true';
}

export function getAuthStateAfterRestoreFailure(): { isOnboarded: false; googleUser: null } {
  return { isOnboarded: false, googleUser: null };
}

export async function restoreStoredGoogleSession(
  onboardedValue: string | null,
  userJson: string | null,
  ensureSession: (email: string) => Promise<void>,
): Promise<{ isOnboarded: boolean; googleUser: GoogleUser | null }> {
  const isOnboarded = parseOnboarded(onboardedValue);
  const googleUser = parseGoogleUser(userJson);
  if (!isOnboarded || !googleUser) return { isOnboarded, googleUser };

  try {
    await ensureSession(googleUser.email);
    return { isOnboarded, googleUser };
  } catch (error) {
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
): Promise<{ id: number; isNew: boolean }> {
  // Primary lookup: stable OIDC sub
  const existing = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM users WHERE google_sub = ?',
    [googleSub]
  );
  if (existing) return { id: existing.id, isNew: false };

  // Migration: legacy install stored email in google_sub — upgrade in-place
  const legacy = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM users WHERE google_sub = ?',
    [googleEmail]
  );
  if (legacy) {
    await db.runAsync('UPDATE users SET google_sub = ? WHERE id = ?', [googleSub, legacy.id]);
    return { id: legacy.id, isNew: false };
  }

  const claimed = await db.runAsync(
    'UPDATE users SET google_sub = ? WHERE id = 1 AND google_sub IS NULL',
    [googleSub]
  );
  if (claimed.changes > 0) return { id: 1, isNew: false };

  // New account on this device — insert a fresh user row and seed their categories
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
    await db.runAsync(
      'INSERT INTO categories (user_id, name, icon, sort_order) VALUES (?, ?, ?, ?)',
      [newUserId, name, icon, order]
    );
  }
  return { id: newUserId, isNew: true };
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
  const rows = await db.getAllAsync<{ notification_id: string | null }>(
    'SELECT notification_id FROM challenges WHERE user_id = ? AND notification_id IS NOT NULL',
    [userId],
  );
  if (!rows.length) return;
  const { cancelChallengeReminder } = await import('../utils/notifications');
  await Promise.all(rows.map(row => cancelChallengeReminder(row.notification_id)));
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

  useEffect(() => {
    let mounted = true;
    Promise.all([
      AsyncStorage.getItem(ONBOARDED_KEY),
      readGoogleUser(),
    ])
      .then(async ([onboarded, userJson]) => {
        const storedUser = parseGoogleUser(userJson);
        let restored = { isOnboarded: parseOnboarded(onboarded), googleUser: storedUser };

        if (restored.isOnboarded && storedUser) {
          // require(), not `await import(...)`: a dynamic import of this module
          // hung indefinitely on startup in testing (never resolved, no error) --
          // matches this project's documented rule (see habit-tracker/AGENTS.md,
          // "Metro And Emulator") that native-module-adjacent code must load via
          // runtime require, not async Metro imports. The Promise.race below is
          // additional defense-in-depth for GoogleSignin.signInSilently() itself,
          // which is a native-bridge call with no timeout of its own.
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const { ensureSupabaseSession } = require('../api/syncService') as typeof import('../api/syncService');
          restored = await Promise.race([
            restoreStoredGoogleSession(onboarded, userJson, ensureSupabaseSession),
            new Promise<never>((_, reject) => {
              setTimeout(
                () => reject(new Error('Startup session restore timed out')),
                STARTUP_SESSION_RESTORE_TIMEOUT_MS,
              );
            }),
          ]);
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
    return () => { mounted = false; };
  }, []);

  const completeOnboarding = useCallback(async () => {
    await AsyncStorage.setItem(ONBOARDED_KEY, 'true');
    setIsOnboarded(true);
  }, []);

  const signInWithGoogle = useCallback(async (user: GoogleUser, idToken?: string): Promise<boolean> => {
    // Resolve the local account before publishing the new identity to React or
    // secure storage. A failed lookup must not leave the app authenticated as
    // the new Google user while still pointing at the previous local user row.
    let result: { id: number; isNew: boolean };
    try {
      const { getDb } = await import('../db/client');
      const db = await getDb();
      result = await resolveUserRow(db, user.sub, user.email);
    } catch (e) {
      if (__DEV__) console.warn('[auth] resolveUserRow failed; sign-in aborted:', e);
      throw e;
    }

    await writeGoogleUser(JSON.stringify(user));
    await AsyncStorage.setItem('habit_tracker_display_name', user.name);
    await (result.isNew ? AsyncStorage.removeItem(ONBOARDED_KEY) : AsyncStorage.setItem(ONBOARDED_KEY, 'true'));
    setUserId(result.id);
    setGoogleUser(user);
    setIsOnboarded(!result.isNew);

    // Establish Supabase Auth session so RLS policies can verify identity.
    if (idToken) {
      try {
        const { supabase } = await import('../api/supabase');
        if (supabase) {
          await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken });
        }
      } catch (e) { if (__DEV__) console.warn('[auth] Supabase signInWithIdToken failed:', e); }
    }
    return result.isNew;
  }, []);

  const resetProgress = useCallback(async (uid: number) => {
    const storedUser = await getStoredGoogleUser();
    const { pauseAccountSync, resetSyncCursors, resetUserProgressInSupabase } = await import('../api/syncService');
    const releaseSync = storedUser ? await pauseAccountSync(storedUser.email) : null;
    try {
      if (storedUser) await resetUserProgressInSupabase(storedUser.email);
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
    }
  }, []);

  const deleteAccount = useCallback(async (uid: number) => {
    // Purge remote Supabase data FIRST while the auth session is still active
    const { deleteUserFromSupabase, pauseAccountSync, resetSyncCursors } = await import('../api/syncService');
    const googleUserJson = await readGoogleUser();
    const gu = parseGoogleUser(googleUserJson);
    if (!gu) throw new Error('Cannot delete account without a signed-in Google identity');
    const releaseSync = await pauseAccountSync(gu.email);
    try {
      await deleteUserFromSupabase(gu.email);
      await resetSyncCursors();
      // Delete all local SQLite rows
      const { getDb } = await import('../db/client');
      const db = await getDb();
      await cancelUserChallengeReminders(db, uid);
      await db.withTransactionAsync(async () => {
        for (const sql of DELETE_ACCOUNT_STATEMENTS) {
          await db.runAsync(sql, [uid]);
        }
        await db.runAsync('DELETE FROM users WHERE id = ?', [uid]);
      });
      // Sign out from Supabase Auth
      try {
        const { supabase } = await import('../api/supabase');
        if (supabase) await supabase.auth.signOut();
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
    const { pauseAccountSync, resetSyncCursors } = await import('../api/syncService');
    const releaseSync = storedUser ? await pauseAccountSync(storedUser.email) : null;
    try {
      try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { GoogleSignin } = require('@react-native-google-signin/google-signin') as typeof import('@react-native-google-signin/google-signin');
      await GoogleSignin.revokeAccess(); // revoke server-side token so next sign-in always prompts
      await GoogleSignin.signOut();
    } catch {
      // ignore — native sign-out failure doesn't affect local state
    }
    try {
      const { supabase } = await import('../api/supabase');
      if (supabase) await supabase.auth.signOut();
    } catch { }
    try {
      const { resetSyncCursors } = await import('../api/syncService');
      await resetSyncCursors();
    } catch { }
      await clearLocalAuthState();
    } finally {
      releaseSync?.();
    }
  }, [clearLocalAuthState]);

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
