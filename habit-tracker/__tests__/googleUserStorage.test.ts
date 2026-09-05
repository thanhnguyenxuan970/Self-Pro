jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import {
  deleteGoogleUser,
  getStoredGoogleUser,
  parseGoogleUser,
  readGoogleUser,
  writeGoogleUser,
} from '../src/lib/googleUserStorage';

(globalThis as { __DEV__?: boolean }).__DEV__ = true;

const storedValue = JSON.stringify({
  sub: 'google-sub',
  email: 'user@example.com',
  name: 'Test User',
  picture: 'https://example.com/photo.jpg',
});

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
  delete (globalThis as { ExpoModules?: unknown }).ExpoModules;
});

describe('AsyncStorage fallback', () => {
  test('reads, writes, and deletes the legacy storage value when SecureStore is unavailable', async () => {
    await writeGoogleUser(storedValue);
    expect(await readGoogleUser()).toBe(storedValue);
    await deleteGoogleUser();
    expect(await readGoogleUser()).toBeNull();
  });

  test('returns null from getStoredGoogleUser for malformed storage', async () => {
    await AsyncStorage.setItem('habit_tracker_google_user', '{bad json');
    await expect(getStoredGoogleUser()).resolves.toBeNull();
  });

  test('swallows a legacy delete failure during cleanup', async () => {
    await AsyncStorage.setItem('habit_tracker_google_user', storedValue);
    (AsyncStorage.removeItem as jest.Mock).mockRejectedValueOnce(new Error('storage unavailable'));
    await expect(deleteGoogleUser()).resolves.toBeUndefined();
  });
});

describe('SecureStore migration and fallback', () => {
  beforeEach(() => {
    (globalThis as { ExpoModules?: unknown }).ExpoModules = { ExpoSecureStore: {} };
  });

  test('prefers the secure value', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce(storedValue);
    await expect(readGoogleUser()).resolves.toBe(storedValue);
    expect(AsyncStorage.getItem).not.toHaveBeenCalled();
  });

  test('writes directly to secure storage when available', async () => {
    await writeGoogleUser(storedValue);
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('habit_tracker_google_user', storedValue);
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  test('migrates a legacy value when secure storage is empty', async () => {
    await AsyncStorage.setItem('habit_tracker_google_user', storedValue);
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce(null);

    await expect(readGoogleUser()).resolves.toBe(storedValue);
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('habit_tracker_google_user', storedValue);
    expect(AsyncStorage.getItem).toHaveBeenCalledWith('habit_tracker_google_user');
    expect(AsyncStorage.getItem).toHaveBeenCalledTimes(1);
  });

  test('falls back to AsyncStorage when SecureStore read or write fails', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    (SecureStore.getItemAsync as jest.Mock).mockRejectedValueOnce(new Error('secure read failed'));
    await AsyncStorage.setItem('habit_tracker_google_user', storedValue);
    await expect(readGoogleUser()).resolves.toBe(storedValue);

    (SecureStore.setItemAsync as jest.Mock).mockRejectedValueOnce(new Error('secure write failed'));
    await expect(writeGoogleUser(storedValue)).resolves.toBeUndefined();
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('habit_tracker_google_user', storedValue);
    warn.mockRestore();
  });

  test('deletes from both stores even when SecureStore delete fails', async () => {
    (SecureStore.deleteItemAsync as jest.Mock).mockRejectedValueOnce(new Error('already deleted'));
    await expect(deleteGoogleUser()).resolves.toBeUndefined();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('habit_tracker_google_user');
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('habit_tracker_google_user');
  });

  test('deletes from both stores when SecureStore deletion succeeds', async () => {
    (SecureStore.deleteItemAsync as jest.Mock).mockResolvedValueOnce(undefined);
    await expect(deleteGoogleUser()).resolves.toBeUndefined();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('habit_tracker_google_user');
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('habit_tracker_google_user');
  });

  test('returns null when both secure and legacy reads fail', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockRejectedValueOnce(new Error('secure read failed'));
    (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error('legacy read failed'));
    await expect(getStoredGoogleUser()).resolves.toBeNull();
  });

});

describe('parseGoogleUser validation', () => {
  test.each([
    [JSON.stringify({ email: ' ', name: 'Name', picture: 'photo' })],
    [JSON.stringify({ email: 'user@example.com', name: ' ', picture: 'photo' })],
    [JSON.stringify({ email: 'user@example.com', name: 'Name' })],
    [JSON.stringify({ email: 'user@example.com', name: 'Name', picture: 42 })],
  ])('rejects an incomplete stored identity: %s', (value) => {
    expect(parseGoogleUser(value)).toBeNull();
  });

  test('trims the stable subject and identity fields', () => {
    expect(parseGoogleUser(JSON.stringify({
      sub: '  subject  ',
      email: '  user@example.com  ',
      name: '  Test User  ',
      picture: 'photo',
    }))).toEqual({ sub: 'subject', email: 'user@example.com', name: 'Test User', picture: 'photo' });
  });
});
