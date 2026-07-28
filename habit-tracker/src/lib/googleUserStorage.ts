import AsyncStorage from '@react-native-async-storage/async-storage';

const GOOGLE_USER_KEY = 'habit_tracker_google_user';

// Guard: check native module registered BEFORE requiring the JS package.
// Metro's guardedLoadModule intercepts throws from module factories before they
// reach a caller's try-catch, so require('expo-secure-store') must never be
// called when ExpoSecureStore is absent from the native module registry.
function resolveSecureStore(): typeof import('expo-secure-store') | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!(globalThis as any).ExpoModules?.ExpoSecureStore) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('expo-secure-store');
  const store = (mod?.default ?? mod) as typeof import('expo-secure-store') | undefined;
  return typeof store?.getItemAsync === 'function' ? store : null;
}

export async function readGoogleUser(): Promise<string | null> {
  const SecureStore = resolveSecureStore();
  if (SecureStore) {
    try {
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
      if (__DEV__) console.warn('[auth] SecureStore read failed, falling back to AsyncStorage:', e);
    }
  }
  return AsyncStorage.getItem(GOOGLE_USER_KEY);
}
export async function writeGoogleUser(value: string): Promise<void> {
  const SecureStore = resolveSecureStore();
  if (SecureStore) {
    try {
      await SecureStore.setItemAsync(GOOGLE_USER_KEY, value);
      return;
    } catch (e) {
      if (__DEV__) console.warn('[auth] SecureStore write failed, falling back to AsyncStorage:', e);
    }
  }
  await AsyncStorage.setItem(GOOGLE_USER_KEY, value);
}
export async function deleteGoogleUser(): Promise<void> {
  const SecureStore = resolveSecureStore();
  if (SecureStore) {
    try { await SecureStore.deleteItemAsync(GOOGLE_USER_KEY); } catch { }
  }
  await AsyncStorage.removeItem(GOOGLE_USER_KEY).catch(() => {});
}

export interface GoogleUser {
  sub: string;   // stable OIDC subject id (never changes, unlike email)
  email: string;
  name: string;
  picture: string;
}

export function parseGoogleUser(val: string | null): GoogleUser | null {
  if (!val) return null;
  try {
    const parsed = JSON.parse(val);
    if (typeof parsed?.email === 'string' && parsed.email.length > 0 &&
        typeof parsed?.name === 'string' && parsed.name.length > 0 &&
        typeof parsed?.picture === 'string' && parsed.picture.length > 0) {
      // sub may be absent in legacy stored values; fall back to email so old sessions still work
      return { sub: parsed.sub ?? parsed.email, ...parsed } as GoogleUser;
    }
    return null;
  } catch {
    return null;
  }
}

/** Read the stored Google identity without React. Used by non-hook sync code. */
export async function getStoredGoogleUser(): Promise<GoogleUser | null> {
  try {
    return parseGoogleUser(await readGoogleUser());
  } catch {
    return null;
  }
}
