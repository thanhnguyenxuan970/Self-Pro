import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SQLiteDatabase } from 'expo-sqlite';

export const ONBOARDED_KEY = 'habit_tracker_onboarded';
const GOOGLE_USER_KEY = 'habit_tracker_google_user';

// Lazy require — prevents requireNativeModule('ExpoSecureStore') at bundle load time.
// Falls back to AsyncStorage if SecureStore native module is unavailable.
async function readGoogleUser(): Promise<string | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const SecureStore = require('expo-secure-store') as typeof import('expo-secure-store');
    const secure = await SecureStore.getItemAsync(GOOGLE_USER_KEY);
    if (secure !== null) return secure;
    // Migrate legacy AsyncStorage value on first run after upgrade
    const legacy = await AsyncStorage.getItem(GOOGLE_USER_KEY);
    if (legacy !== null) {
      await SecureStore.setItemAsync(GOOGLE_USER_KEY, legacy).catch(() => {});
      await AsyncStorage.removeItem(GOOGLE_USER_KEY).catch(() => {});
    }
    return legacy;
  } catch (e) {
    console.warn('[auth] SecureStore unavailable, falling back to AsyncStorage:', e);
    return AsyncStorage.getItem(GOOGLE_USER_KEY);
  }
}
async function writeGoogleUser(value: string): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const SecureStore = require('expo-secure-store') as typeof import('expo-secure-store');
    await SecureStore.setItemAsync(GOOGLE_USER_KEY, value);
  } catch (e) {
    console.warn('[auth] SecureStore unavailable, falling back to AsyncStorage:', e);
    await AsyncStorage.setItem(GOOGLE_USER_KEY, value);
  }
}
async function deleteGoogleUser(): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const SecureStore = require('expo-secure-store') as typeof import('expo-secure-store');
    await SecureStore.deleteItemAsync(GOOGLE_USER_KEY);
  } catch (e) {
    console.warn('[auth] SecureStore unavailable on delete, skipping:', e);
  }
  await AsyncStorage.removeItem(GOOGLE_USER_KEY).catch(() => {}); // remove legacy if present
}

export interface GoogleUser {
  email: string;
  name: string;
  picture: string;
}

export function parseOnboarded(val: string | null): boolean {
  return val === 'true';
}

export function parseGoogleUser(val: string | null): GoogleUser | null {
  if (!val) return null;
  try {
    const parsed = JSON.parse(val);
    if (typeof parsed?.email === 'string' && typeof parsed?.name === 'string' && typeof parsed?.picture === 'string') {
      return parsed as GoogleUser;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Maps a Google email to a DB user row, creating one if needed.
 * - Existing row with matching google_sub → return its id
 * - Legacy anonymous row (id=1, google_sub IS NULL) → claim it, return 1
 * - Otherwise → insert new row (new device/account), return new id
 * Also seeds default categories for brand-new rows.
 */
export async function resolveUserRow(db: SQLiteDatabase, googleEmail: string): Promise<{ id: number; isNew: boolean }> {
  const existing = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM users WHERE google_sub = ?',
    [googleEmail]
  );
  if (existing) return { id: existing.id, isNew: false };

  const claimed = await db.runAsync(
    'UPDATE users SET google_sub = ? WHERE id = 1 AND google_sub IS NULL',
    [googleEmail]
  );
  if (claimed.changes > 0) return { id: 1, isNew: false };

  // New account on this device — insert a fresh user row and seed their categories
  const result = await db.runAsync(
    `INSERT INTO users (username, timezone, carry_debt, currency, google_sub)
     VALUES ('me', 'Asia/Ho_Chi_Minh', 0, 'VND', ?)`,
    [googleEmail]
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
    Promise.all([
      AsyncStorage.getItem(ONBOARDED_KEY),
      readGoogleUser(),
    ])
      .then(([onboarded, userJson]) => {
        setIsOnboarded(parseOnboarded(onboarded));
        setGoogleUser(parseGoogleUser(userJson));
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  const completeOnboarding = useCallback(async () => {
    await AsyncStorage.setItem(ONBOARDED_KEY, 'true');
    setIsOnboarded(true);
  }, []);

  const signInWithGoogle = useCallback(async (user: GoogleUser, idToken?: string): Promise<boolean> => {
    await writeGoogleUser(JSON.stringify(user));
    await AsyncStorage.setItem('habit_tracker_display_name', user.name);
    setGoogleUser(user);
    // Establish Supabase Auth session so RLS policies can verify identity
    if (idToken) {
      try {
        const { supabase } = await import('../lib/supabase');
        if (supabase) {
          await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken });
        }
      } catch (e) { console.warn('[auth] Supabase signInWithIdToken failed:', e); }
    }
    // Resolve DB row immediately so userId is ready before onboarding renders
    let isNew = true;
    try {
      const { getDb } = await import('../db/client');
      const db = await getDb();
      const result = await resolveUserRow(db, user.email);
      setUserId(result.id);
      isNew = result.isNew;
      // Returning user: auto-complete onboarding so they skip the onboarding screen
      if (!isNew) {
        await AsyncStorage.setItem(ONBOARDED_KEY, 'true');
        setIsOnboarded(true);
      }
    } catch (e) { console.warn('[auth] resolveUserRow failed, defaulting to userId=1:', e); }
    return isNew;
  }, []);

  const deleteAccount = useCallback(async (uid: number) => {
    // Purge remote Supabase data FIRST while the auth session is still active
    try {
      const { deleteUserFromSupabase, resetSyncCursors } = await import('../services/syncService');
      const googleUserJson = await readGoogleUser();
      const gu = parseGoogleUser(googleUserJson);
      if (gu) await deleteUserFromSupabase(gu.email);
      await resetSyncCursors();
    } catch (e) { console.warn('[auth] deleteUserFromSupabase failed (remote data may remain):', e); }
    // Delete all local SQLite rows
    const { getDb } = await import('../db/client');
    const db = await getDb();
    await db.withTransactionAsync(async () => {
      for (const table of [
        'activity_log', 'daily_summary', 'weekly_summary',
        'reward_unlocks', 'treats', 'treat_history', 'streak_freezes',
        'task_types', 'categories', 'fund_transactions',
      ]) {
        await db.runAsync(`DELETE FROM ${table} WHERE user_id = ?`, [uid]);
      }
      await db.runAsync('DELETE FROM users WHERE id = ?', [uid]);
    });
    // Sign out from Supabase Auth
    try {
      const { supabase } = await import('../lib/supabase');
      if (supabase) await supabase.auth.signOut();
    } catch { }
    // Revoke Google session
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { GoogleSignin } = require('@react-native-google-signin/google-signin') as typeof import('@react-native-google-signin/google-signin');
      await GoogleSignin.revokeAccess();
      await GoogleSignin.signOut();
    } catch { }
    try {
      await deleteGoogleUser();
      await AsyncStorage.multiRemove([ONBOARDED_KEY, 'habit_tracker_display_name']);
    } finally {
      setIsOnboarded(false);
      setGoogleUser(null);
      setUserId(1);
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { GoogleSignin } = require('@react-native-google-signin/google-signin') as typeof import('@react-native-google-signin/google-signin');
      await GoogleSignin.revokeAccess(); // revoke server-side token so next sign-in always prompts
      await GoogleSignin.signOut();
    } catch {
      // ignore — native sign-out failure doesn't affect local state
    }
    try {
      const { supabase } = await import('../lib/supabase');
      if (supabase) await supabase.auth.signOut();
    } catch { }
    try {
      const { resetSyncCursors } = await import('../services/syncService');
      await resetSyncCursors();
    } catch { }
    try {
      await deleteGoogleUser();
      await AsyncStorage.multiRemove([ONBOARDED_KEY, 'habit_tracker_display_name']);
    } finally {
      setIsOnboarded(false);
      setGoogleUser(null);
      setUserId(1);
    }
  }, []);

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
  };
}
