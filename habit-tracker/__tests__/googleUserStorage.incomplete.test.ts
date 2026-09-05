jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('expo-secure-store', () => ({}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { readGoogleUser } from '../src/lib/googleUserStorage';

const storedValue = JSON.stringify({
  sub: 'google-sub',
  email: 'user@example.com',
  name: 'Test User',
  picture: 'https://example.com/photo.jpg',
});

beforeEach(async () => {
  await AsyncStorage.clear();
  (globalThis as { ExpoModules?: unknown }).ExpoModules = { ExpoSecureStore: {} };
});

test('falls back when the native registry exists but the JS SecureStore API is incomplete', async () => {
  await AsyncStorage.setItem('habit_tracker_google_user', storedValue);
  await expect(readGoogleUser()).resolves.toBe(storedValue);
});
