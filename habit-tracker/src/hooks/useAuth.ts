import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SQLiteDatabase } from 'expo-sqlite';

export const ONBOARDED_KEY = 'habit_tracker_onboarded';
const GOOGLE_USER_KEY = 'habit_tracker_google_user';

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

export function useAuth() {
  const [isLoading, setIsLoading] = useState(true);
  const [isOnboarded, setIsOnboarded] = useState(false);
  const [googleUser, setGoogleUser] = useState<GoogleUser | null>(null);
  const [userId, setUserId] = useState(1);

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(ONBOARDED_KEY),
      AsyncStorage.getItem(GOOGLE_USER_KEY),
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

  const signInWithGoogle = useCallback(async (user: GoogleUser): Promise<boolean> => {
    await AsyncStorage.multiSet([
      [GOOGLE_USER_KEY, JSON.stringify(user)],
      ['habit_tracker_display_name', user.name],
    ]);
    setGoogleUser(user);
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

  const signOut = useCallback(async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { GoogleSignin } = require('@react-native-google-signin/google-signin') as typeof import('@react-native-google-signin/google-signin');
      await GoogleSignin.signOut();
    } catch {
      // ignore — native sign-out failure doesn't affect local state
    }
    try {
      const { resetSyncCursors } = await import('../services/syncService');
      await resetSyncCursors();
    } catch { }
    try {
      await AsyncStorage.multiRemove([
        ONBOARDED_KEY,
        GOOGLE_USER_KEY,
        'habit_tracker_display_name',
      ]);
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
  };
}
