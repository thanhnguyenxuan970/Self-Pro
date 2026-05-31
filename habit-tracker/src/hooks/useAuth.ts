import AsyncStorage from '@react-native-async-storage/async-storage';
import { useState, useEffect, useCallback } from 'react';

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

export function useAuth() {
  const [isLoading, setIsLoading] = useState(true);
  const [isOnboarded, setIsOnboarded] = useState(false);
  const [googleUser, setGoogleUser] = useState<GoogleUser | null>(null);

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

  const signInWithGoogle = useCallback(async (user: GoogleUser) => {
    await AsyncStorage.multiSet([
      [GOOGLE_USER_KEY, JSON.stringify(user)],
      ['habit_tracker_display_name', user.name],
    ]);
    setGoogleUser(user);
  }, []);

  const signOut = useCallback(async () => {
    await AsyncStorage.multiRemove([
      ONBOARDED_KEY,
      GOOGLE_USER_KEY,
      'habit_tracker_display_name',
    ]);
    setIsOnboarded(false);
    setGoogleUser(null);
  }, []);

  return { isLoading, isOnboarded, googleUser, completeOnboarding, signInWithGoogle, signOut };
}
