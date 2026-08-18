import { parseOnboarded, parseGoogleUser, restoreStoredGoogleSession, getAuthStateAfterRestoreFailure } from '../src/hooks/useAuth';
import { NoSavedGoogleCredentialError } from '../src/api/syncErrors';

describe('parseOnboarded', () => {
  test('null → false', () => expect(parseOnboarded(null)).toBe(false));
  test('"true" → true', () => expect(parseOnboarded('true')).toBe(true));
  test('"false" → false', () => expect(parseOnboarded('false')).toBe(false));
  test('empty string → false', () => expect(parseOnboarded('')).toBe(false));
});

describe('parseGoogleUser', () => {
  test('null → null', () => expect(parseGoogleUser(null)).toBeNull());
  test('invalid JSON → null', () => expect(parseGoogleUser('not-json')).toBeNull());
  test('missing email field → null', () =>
    expect(parseGoogleUser(JSON.stringify({ name: 'Test' }))).toBeNull());
  test('missing picture field → null', () =>
    expect(parseGoogleUser(JSON.stringify({ email: 'a@b.com', name: 'Test' }))).toBeNull());
  test('valid object with sub → GoogleUser', () => {
    const user = { sub: 'google-uid-123', email: 'a@b.com', name: 'Test User', picture: 'https://pic.jpg' };
    expect(parseGoogleUser(JSON.stringify(user))).toEqual(user);
  });
  test('legacy object without sub → falls back to email as sub', () => {
    const user = { email: 'a@b.com', name: 'Test User', picture: 'https://pic.jpg' };
    expect(parseGoogleUser(JSON.stringify(user))).toEqual({ sub: 'a@b.com', ...user });
  });
});

describe('restoreStoredGoogleSession', () => {
  const storedUser = JSON.stringify({
    sub: 'google-uid-123',
    email: 'a@b.com',
    name: 'Test User',
    picture: 'https://pic.jpg',
  });

  test('marks stale local auth signed out when Google has no saved credential', async () => {
    const ensureSession = jest.fn().mockRejectedValue(new NoSavedGoogleCredentialError());

    await expect(restoreStoredGoogleSession('true', storedUser, ensureSession)).resolves.toEqual({
      isOnboarded: false,
      googleUser: null,
    });
    expect(ensureSession).toHaveBeenCalledWith('a@b.com');
  });

  test('keeps the stored identity after a successful session restore', async () => {
    const ensureSession = jest.fn().mockResolvedValue(undefined);

    await expect(restoreStoredGoogleSession('true', storedUser, ensureSession)).resolves.toEqual({
      isOnboarded: true,
      googleUser: {
        sub: 'google-uid-123',
        email: 'a@b.com',
        name: 'Test User',
        picture: 'https://pic.jpg',
      },
    });
  });

  test('rethrows unexpected session failures', async () => {
    const failure = new Error('Supabase is temporarily unavailable');
    const ensureSession = jest.fn().mockRejectedValue(failure);

    await expect(restoreStoredGoogleSession('true', storedUser, ensureSession)).rejects.toBe(failure);
  });

  test('fails closed after an unexpected startup restore failure', () => {
    expect(getAuthStateAfterRestoreFailure()).toEqual({
      isOnboarded: false,
      googleUser: null,
    });
  });
});
