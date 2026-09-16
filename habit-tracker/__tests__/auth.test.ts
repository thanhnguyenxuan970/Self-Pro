import {
  parseOnboarded,
  parseGoogleUser,
  restoreStoredGoogleSession,
  getAuthStateAfterRestoreFailure,
  classifyStartupRestoreFailure,
} from '../src/hooks/useAuth';
import { NoSavedGoogleCredentialError } from '../src/api/syncErrors';
import { GOOGLE_PICTURE_PLACEHOLDER } from '../src/lib/googleUserStorage';

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
  test('empty stored subject falls back to the email identity', () => {
    const user = { sub: '', email: 'a@b.com', name: 'Test User', picture: GOOGLE_PICTURE_PLACEHOLDER };
    expect(parseGoogleUser(JSON.stringify(user))).toEqual({ ...user, sub: 'a@b.com' });
  });
  test('rejects a stored identity without a non-empty avatar field', () => {
    const user = { sub: 'google-uid-123', email: 'a@b.com', name: 'Test User', picture: '' };
    expect(parseGoogleUser(JSON.stringify(user))).toBeNull();
  });
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
    expect(ensureSession).toHaveBeenCalledWith('a@b.com', 'google-uid-123');
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

  test('does not publish a restored identity after the startup operation is invalidated', async () => {
    let releaseEnsure!: () => void;
    const ensureSession = jest.fn(() => new Promise<void>((resolve) => { releaseEnsure = resolve; }));
    let active = true;
    const restoring = restoreStoredGoogleSession('true', storedUser, ensureSession, () => active);

    await Promise.resolve();
    active = false;
    releaseEnsure();

    await expect(restoring).rejects.toThrow('cancelled');
  });

  test('does not turn a late no-saved response into a signed-out state after cancellation', async () => {
    let rejectEnsure!: (error: unknown) => void;
    const ensureSession = jest.fn(() => new Promise<void>((_, reject) => { rejectEnsure = reject; }));
    let active = true;
    const restoring = restoreStoredGoogleSession('true', storedUser, ensureSession, () => active);

    await Promise.resolve();
    active = false;
    rejectEnsure(new NoSavedGoogleCredentialError());

    await expect(restoring).rejects.toThrow('cancelled');
  });

  test('retains the stored identity for a retryable startup failure', () => {
    const storedIdentity = {
      sub: 'google-uid-123',
      email: 'a@b.com',
      name: 'Test User',
      picture: 'https://pic.jpg',
    };
    const failure = Object.assign(new Error('gateway timeout'), { status: 504 });

    expect(classifyStartupRestoreFailure(failure)).toBe('retryable');
    expect(classifyStartupRestoreFailure(new Error('Startup session restore timed out'))).toBe('retryable');
    expect(getAuthStateAfterRestoreFailure(failure, {
      isOnboarded: true,
      googleUser: storedIdentity,
    })).toEqual({
      state: 'retryable',
      isOnboarded: true,
      googleUser: storedIdentity,
    });
  });

  test('requires reauthentication only for a confirmed missing credential', () => {
    const failure = new NoSavedGoogleCredentialError();

    expect(classifyStartupRestoreFailure(failure)).toBe('reauth_required');
    expect(getAuthStateAfterRestoreFailure(failure, {
      isOnboarded: true,
      googleUser: JSON.parse(storedUser),
    })).toEqual({
      state: 'reauth_required',
      isOnboarded: false,
      googleUser: null,
    });
  });

  test('does not reinterpret a bootstrap or RPC 401 as invalid Google credentials', () => {
    expect(classifyStartupRestoreFailure({ status: 401, source: 'profile_bootstrap' })).toBe('retryable');
    expect(classifyStartupRestoreFailure({ status: 401, source: 'rpc_bootstrap' })).toBe('retryable');
    expect(classifyStartupRestoreFailure({ status: 401, stage: 'auth' })).toBe('retryable');
    expect(getAuthStateAfterRestoreFailure({ status: 401, source: 'rpc_bootstrap' }, {
      isOnboarded: true,
      googleUser: JSON.parse(storedUser),
    })).toEqual({
      state: 'retryable',
      isOnboarded: true,
      googleUser: JSON.parse(storedUser),
    });
  });

  test('requires reauthentication only for a provider/session 401 with provenance', () => {
    expect(classifyStartupRestoreFailure({ status: 401, source: 'supabase_auth' })).toBe('reauth_required');
    expect(classifyStartupRestoreFailure({ status: 401, stage: 'google_credential' })).toBe('reauth_required');
  });
});
