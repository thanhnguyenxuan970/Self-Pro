const stateSetters: jest.Mock[] = [];
const effectCallbacks: Array<() => void | (() => void)> = [];
const mockReadGoogleUser = jest.fn().mockResolvedValue(null);
const mockGetStoredGoogleUser = jest.fn().mockResolvedValue(null);
const mockWriteGoogleUser = jest.fn().mockResolvedValue(undefined);
const mockDeleteGoogleUser = jest.fn().mockResolvedValue(undefined);
const mockGetItem = jest.fn().mockResolvedValue(null);
const mockSetItem = jest.fn().mockResolvedValue(undefined);
const mockRemoveItem = jest.fn().mockResolvedValue(undefined);
const mockMultiRemove = jest.fn().mockResolvedValue(undefined);
const mockIsQaSandboxIdentity = jest.fn(() => false);
const mockIsQaSandboxBuildAvailable = jest.fn(() => true);
const mockSetQaSandboxNetworkBlocked = jest.fn();
const mockPauseAccountSync = jest.fn().mockResolvedValue(jest.fn());
const mockResetSyncCursors = jest.fn().mockResolvedValue(undefined);
const mockSignOutSupabaseSession = jest.fn().mockResolvedValue(undefined);
const mockDeleteUserFromSupabase = jest.fn().mockResolvedValue(undefined);
const mockResetUserProgressInSupabase = jest.fn().mockResolvedValue(undefined);
const mockMarkBackupRestoreBlocked = jest.fn().mockResolvedValue(undefined);
const mockClearBackupRestoreBlocked = jest.fn().mockResolvedValue(undefined);
const mockSignInWithGoogleToken = jest.fn().mockResolvedValue(undefined);
const mockRestoreUserDataIfNeeded = jest.fn().mockResolvedValue('empty');
const mockRestoreLifetimeStarsFromSupabase = jest.fn().mockResolvedValue(undefined);
const mockEnsureSupabaseSession = jest.fn().mockResolvedValue(undefined);
const mockCancelSupabaseSessionRestore = jest.fn();
const mockSeedQaSandbox = jest.fn().mockResolvedValue(1);
const mockPurgeQaSandbox = jest.fn().mockResolvedValue(undefined);
const mockGoogleRevokeAccess = jest.fn().mockResolvedValue(undefined);
const mockGoogleSignOut = jest.fn().mockResolvedValue(undefined);
const mockGetDb = jest.fn();
const defaultDb = {
  getAllAsync: jest.fn().mockResolvedValue([]),
  getFirstAsync: jest.fn().mockResolvedValue(null),
  runAsync: jest.fn().mockResolvedValue({ changes: 1, lastInsertRowId: 41 }),
  withTransactionAsync: jest.fn(async (callback: () => Promise<void>) => callback()),
};

jest.mock('react', () => ({
  createContext: (defaultValue: unknown) => ({ current: defaultValue }),
  useContext: (context: { current: unknown }) => context.current,
  useState: (initialValue: unknown) => {
    const setter = jest.fn();
    stateSetters.push(setter);
    return [initialValue, setter];
  },
  useEffect: (callback: () => void) => { effectCallbacks.push(callback); },
  useCallback: (callback: unknown) => callback,
  useRef: (initialValue: unknown) => ({ current: initialValue }),
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: mockGetItem,
  setItem: mockSetItem,
  removeItem: mockRemoveItem,
  multiRemove: mockMultiRemove,
}));
jest.mock('../src/lib/googleUserStorage', () => ({
  readGoogleUser: mockReadGoogleUser,
  getStoredGoogleUser: mockGetStoredGoogleUser,
  writeGoogleUser: mockWriteGoogleUser,
  deleteGoogleUser: mockDeleteGoogleUser,
  parseGoogleUser: jest.fn((raw: string | null) => raw ? JSON.parse(raw) : null),
}));
jest.mock('../src/qa/qaSandbox', () => ({
  isQaSandboxIdentity: mockIsQaSandboxIdentity,
  isQaSandboxBuildAvailable: mockIsQaSandboxBuildAvailable,
  setQaSandboxNetworkBlocked: mockSetQaSandboxNetworkBlocked,
  purgeQaSandbox: mockPurgeQaSandbox,
  seedQaSandbox: mockSeedQaSandbox,
}));
jest.mock('../src/lib/challengeNotificationPlan', () => ({
  challengeReminderPrefix: (id: number) => `challenge:${id}`,
}));
jest.mock('../src/utils/notifications', () => ({
  cancelChallengeReminders: jest.fn().mockResolvedValue(undefined),
  invalidateChallengeReminderSync: jest.fn(),
}));
jest.mock('../src/queries/queryClient', () => ({ queryClient: { clear: jest.fn() } }));
jest.mock('../src/api/syncService', () => ({
  pauseAccountSync: mockPauseAccountSync,
  resetSyncCursors: mockResetSyncCursors,
  signOutSupabaseSession: mockSignOutSupabaseSession,
  deleteUserFromSupabase: mockDeleteUserFromSupabase,
  resetUserProgressInSupabase: mockResetUserProgressInSupabase,
  markBackupRestoreBlocked: mockMarkBackupRestoreBlocked,
  clearBackupRestoreBlocked: mockClearBackupRestoreBlocked,
  signInWithGoogleToken: mockSignInWithGoogleToken,
  restoreUserDataIfNeeded: mockRestoreUserDataIfNeeded,
  restoreLifetimeStarsFromSupabase: mockRestoreLifetimeStarsFromSupabase,
  ensureSupabaseSession: mockEnsureSupabaseSession,
  cancelSupabaseSessionRestore: mockCancelSupabaseSessionRestore,
}));
jest.mock('../src/db/client', () => ({ getDb: mockGetDb }));
jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: { revokeAccess: mockGoogleRevokeAccess, signOut: mockGoogleSignOut },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { cancelChallengeReminders } from '../src/utils/notifications';
import {
  cancelUserChallengeReminders,
  resolveUserRow,
  restoreStoredGoogleSession,
  useAuth,
} from '../src/hooks/useAuth';

(globalThis as { __DEV__?: boolean }).__DEV__ = true;

const user = {
  sub: 'google-sub',
  email: 'user@example.com',
  name: 'Test User',
  picture: 'photo',
};

beforeEach(() => {
  jest.clearAllMocks();
  stateSetters.length = 0;
  effectCallbacks.length = 0;
  mockReadGoogleUser.mockResolvedValue(null);
  mockGetStoredGoogleUser.mockResolvedValue(null);
  mockGetItem.mockResolvedValue(null);
  mockSetItem.mockResolvedValue(undefined);
  mockRemoveItem.mockResolvedValue(undefined);
  mockMultiRemove.mockResolvedValue(undefined);
  mockIsQaSandboxIdentity.mockReturnValue(false);
  mockIsQaSandboxBuildAvailable.mockReturnValue(true);
  mockPauseAccountSync.mockResolvedValue(jest.fn());
  mockResetUserProgressInSupabase.mockResolvedValue(undefined);
  mockDeleteUserFromSupabase.mockResolvedValue(undefined);
  mockSignInWithGoogleToken.mockResolvedValue(undefined);
  mockRestoreUserDataIfNeeded.mockResolvedValue('empty');
  mockRestoreLifetimeStarsFromSupabase.mockResolvedValue(undefined);
  mockEnsureSupabaseSession.mockResolvedValue(undefined);
  mockGetDb.mockResolvedValue(defaultDb);
  for (const method of Object.values(defaultDb)) method.mockClear();
});

describe('stored-session restore branches', () => {
  test('returns the raw signed-out state when onboarding or identity is incomplete', async () => {
    await expect(restoreStoredGoogleSession('false', JSON.stringify(user), jest.fn())).resolves.toEqual({
      isOnboarded: false,
      googleUser: user,
    });
    await expect(restoreStoredGoogleSession('true', null, jest.fn())).resolves.toEqual({
      isOnboarded: true,
      googleUser: null,
    });
  });

  test('keeps an available QA identity local and blocks network access', async () => {
    mockIsQaSandboxIdentity.mockReturnValue(true);
    await expect(restoreStoredGoogleSession('true', JSON.stringify(user), jest.fn())).resolves.toEqual({
      isOnboarded: true,
      googleUser: user,
    });
    expect(mockSetQaSandboxNetworkBlocked).toHaveBeenCalledWith(true);
  });

  test('fails closed when a QA identity is not available in the current build', async () => {
    mockIsQaSandboxIdentity.mockReturnValue(true);
    mockIsQaSandboxBuildAvailable.mockReturnValue(false);
    await expect(restoreStoredGoogleSession('true', JSON.stringify(user), jest.fn())).resolves.toEqual({
      isOnboarded: false,
      googleUser: null,
    });
  });
});

describe('auth cleanup contracts', () => {
  test('does nothing when the account has no Challenge rows', async () => {
    const db = { getAllAsync: jest.fn().mockResolvedValue([]) };
    await cancelUserChallengeReminders(db as never, 5);
    expect(cancelChallengeReminders).not.toHaveBeenCalled();
  });

  test('cancels stored and deterministic reminders for an account', async () => {
    const db = { getAllAsync: jest.fn().mockResolvedValue([{ id: 7, notification_id: 'old-reminder' }, { id: 8, notification_id: null }]) };
    await cancelUserChallengeReminders(db as never, 5);
    expect(cancelChallengeReminders).toHaveBeenCalledWith(['old-reminder', null, 'challenge:7', 'challenge:8']);
  });
});

describe('useAuth lifecycle actions', () => {
  test('restores an empty local auth state and exposes onboarding/reset/delete guards', async () => {
    const auth = useAuth();
    expect(effectCallbacks).toHaveLength(1);
    effectCallbacks[0]();
    for (let i = 0; i < 6; i++) await Promise.resolve();
    expect(stateSetters[1]).toHaveBeenCalledWith(false);
    expect(stateSetters[2]).toHaveBeenCalledWith(null);
    expect(stateSetters[0]).toHaveBeenCalledWith(false);

    await expect(auth.completeOnboarding()).resolves.toBeUndefined();
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('habit_tracker_onboarded', 'true');
    await expect(auth.completePendingReset()).resolves.toBe(true);
    await expect(auth.completePendingDelete()).resolves.toBe('none');
    await expect(auth.deleteAccount(1)).rejects.toThrow('Cannot delete account');
  });

  test('signs out a normal stored account after best-effort native cleanup', async () => {
    mockGetStoredGoogleUser.mockResolvedValue(user);
    const auth = useAuth();
    await expect(auth.signOut()).resolves.toBeUndefined();
    expect(mockPauseAccountSync).toHaveBeenCalledWith(user.email);
    expect(mockResetSyncCursors).toHaveBeenCalled();
    expect(mockSignOutSupabaseSession).toHaveBeenCalled();
    expect(mockDeleteGoogleUser).toHaveBeenCalled();
    expect(stateSetters[1]).toHaveBeenCalledWith(false);
    expect(stateSetters[2]).toHaveBeenCalledWith(null);
  });
});

const operationId = '123e4567-e89b-42d3-a456-426614174000';

function installStorage(values: Record<string, string | null>): void {
  mockGetItem.mockImplementation(async (key: string) => values[key] ?? null);
  mockSetItem.mockImplementation(async (key: string, value: string) => { values[key] = value; });
  mockRemoveItem.mockImplementation(async (key: string) => { delete values[key]; });
}

describe('account lifecycle safety branches', () => {
  test('covers cancellation fences while resolving a local Google account', async () => {
    const db = {
      getFirstAsync: jest.fn().mockResolvedValue(null),
      runAsync: jest.fn().mockResolvedValue({ changes: 0, lastInsertRowId: 9 }),
      withTransactionAsync: jest.fn(async (callback: () => Promise<void>) => callback()),
    };
    let active = false;
    await expect(resolveUserRow(db as never, user.sub, user.email, () => active))
      .rejects.toThrow('Google sign-in cancelled');

    active = true;
    let checks = 0;
    const cancelAfterLookup = {
      getFirstAsync: jest.fn().mockImplementation(async () => {
        checks += 1;
        active = checks < 2;
        return null;
      }),
      runAsync: jest.fn().mockResolvedValue({ changes: 0, lastInsertRowId: 9 }),
      withTransactionAsync: jest.fn(async (callback: () => Promise<void>) => callback()),
    };
    await expect(resolveUserRow(cancelAfterLookup as never, user.sub, user.email, () => active))
      .rejects.toThrow('Google sign-in cancelled');
  });

  test('updates a previous subject and migrates a legacy email subject', async () => {
    const previousDb = {
      getFirstAsync: jest.fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 4 }),
      runAsync: jest.fn().mockResolvedValue({ changes: 1 }),
      withTransactionAsync: jest.fn(async (callback: () => Promise<void>) => callback()),
    };
    await expect(resolveUserRow(previousDb as never, 'new-sub', user.email, undefined, 'old-sub'))
      .resolves.toEqual({ id: 4, isNew: false });

    const legacyDb = {
      getFirstAsync: jest.fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 5 }),
      runAsync: jest.fn().mockResolvedValue({ changes: 1 }),
      withTransactionAsync: jest.fn(async (callback: () => Promise<void>) => callback()),
    };
    await expect(resolveUserRow(legacyDb as never, 'new-sub', user.email))
      .resolves.toEqual({ id: 5, isNew: false });
    expect(legacyDb.runAsync).toHaveBeenCalledWith(
      'UPDATE users SET google_sub = ? WHERE id = ?', ['new-sub', 5],
    );
  });

  test('resets local progress for a signed-out local account and clears every cursor', async () => {
    const auth = useAuth();
    await expect(auth.resetProgress(7)).resolves.toBeUndefined();
    expect(defaultDb.withTransactionAsync).toHaveBeenCalled();
    expect(defaultDb.runAsync.mock.calls.filter(([sql]) => String(sql).startsWith('DELETE FROM '))).toHaveLength(13);
    expect(defaultDb.runAsync).toHaveBeenCalledWith(expect.stringContaining('UPDATE users SET'), [7]);
    expect(mockResetSyncCursors).toHaveBeenCalled();
  });

  test('persists a reset marker, completes the remote/local reset, and removes it', async () => {
    mockGetStoredGoogleUser.mockResolvedValue(user);
    const values: Record<string, string | null> = {
      'habit_tracker_pending_progress_reset:user%40example.com': JSON.stringify({
        userId: 7, email: user.email, sub: user.sub, operationId,
      }),
    };
    installStorage(values);
    const release = jest.fn();
    mockPauseAccountSync.mockResolvedValue(release);
    const auth = useAuth();

    await expect(auth.completePendingReset()).resolves.toBe(true);
    expect(mockResetUserProgressInSupabase).toHaveBeenCalledWith(user.email, user.sub, operationId, false);
    expect(mockClearBackupRestoreBlocked).toHaveBeenCalledWith(user.email);
    expect(mockRemoveItem).toHaveBeenCalledWith('habit_tracker_pending_progress_reset:user%40example.com');
    expect(release).toHaveBeenCalled();
  });

  test('blocks malformed, mismatched, and failed pending resets', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockGetStoredGoogleUser.mockResolvedValue(user);
    const values: Record<string, string | null> = {
      'habit_tracker_pending_progress_reset:user%40example.com': '{bad json',
    };
    installStorage(values);
    const auth = useAuth();
    await expect(auth.completePendingReset()).resolves.toBe(false);

    values['habit_tracker_pending_progress_reset:user%40example.com'] = JSON.stringify({
      userId: 7, email: 'other@example.com', sub: user.sub, operationId,
    });
    await expect(auth.completePendingReset()).resolves.toBe(false);

    values['habit_tracker_pending_progress_reset:user%40example.com'] = JSON.stringify({
      userId: 7, email: user.email, sub: user.sub, operationId,
    });
    mockResetUserProgressInSupabase.mockRejectedValueOnce(new Error('remote reset failed'));
    await expect(auth.completePendingReset()).resolves.toBe(false);
    expect(mockMarkBackupRestoreBlocked).toHaveBeenCalledWith(user.email);
    warn.mockRestore();
  });

  test('deletes a pending account after remote deletion and local purge', async () => {
    mockGetStoredGoogleUser.mockResolvedValue(user);
    installStorage({
      'habit_tracker_pending_account_delete:user%40example.com': JSON.stringify({
        userId: 7, email: user.email, sub: user.sub, operationId,
      }),
    });
    const auth = useAuth();
    await expect(auth.completePendingDelete()).resolves.toBe('deleted');
    expect(mockDeleteUserFromSupabase).toHaveBeenCalledWith(user.email, user.sub, operationId, false);
    expect(defaultDb.runAsync).toHaveBeenCalledWith('DELETE FROM users WHERE id = ?', [7]);
    expect(mockMultiRemove).toHaveBeenCalled();
    expect(stateSetters[1]).toHaveBeenCalledWith(false);
  });

  test('fail-closes pending deletion and isolates QA deletion from remote calls', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockGetStoredGoogleUser.mockResolvedValue(user);
    installStorage({
      'habit_tracker_pending_account_delete:user%40example.com': JSON.stringify({
        userId: 7, email: user.email, sub: user.sub, operationId,
      }),
    });
    mockDeleteUserFromSupabase.mockRejectedValueOnce(new Error('remote delete failed'));
    const auth = useAuth();
    await expect(auth.completePendingDelete()).resolves.toBe('blocked');
    expect(mockMarkBackupRestoreBlocked).toHaveBeenCalledWith(user.email);

    mockIsQaSandboxIdentity.mockReturnValue(true);
    await expect(auth.completePendingDelete(user)).resolves.toBe('none');
    expect(mockDeleteUserFromSupabase).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  test('completes ordinary and QA interactive sign-in only after local/cloud preparation', async () => {
    const existingDb = {
      ...defaultDb,
      getFirstAsync: jest.fn().mockResolvedValue({ id: 3 }),
    };
    mockGetDb.mockResolvedValue(existingDb);
    const auth = useAuth();
    await expect(auth.signInWithGoogle(user, ' token ')).resolves.toBe(false);
    expect(mockSignInWithGoogleToken).toHaveBeenCalledWith(user.email, 'token', expect.any(Function), user.sub);
    expect(mockRestoreUserDataIfNeeded).toHaveBeenCalledWith(3, user.email, user.sub, expect.any(Function), true, undefined, true, expect.any(Function));
    expect(mockWriteGoogleUser).toHaveBeenCalledWith(JSON.stringify(user));
    expect(stateSetters[2]).toHaveBeenCalledWith(user);

    const qaUser = { ...user, email: 'qa@example.com', sub: 'qa-sub' };
    mockIsQaSandboxIdentity.mockReturnValue(true);
    mockGetStoredGoogleUser.mockResolvedValue(null);
    mockGetDb.mockResolvedValue(defaultDb);
    await expect(auth.signInWithGoogle(qaUser)).resolves.toBe(false);
    expect(mockSeedQaSandbox).toHaveBeenCalledWith(defaultDb);
    expect(mockSetQaSandboxNetworkBlocked).toHaveBeenCalledWith(true);
  });

  test('rejects missing Google credentials and shares one in-flight sign-in operation', async () => {
    const auth = useAuth();
    await expect(auth.signInWithGoogle({ ...user, sub: '' }, 'token')).rejects.toThrow('stable subject');
    await expect(auth.signInWithGoogle(user)).rejects.toThrow('ID token is required');

    let resolveToken!: () => void;
    mockSignInWithGoogleToken.mockImplementationOnce(() => new Promise<void>(resolve => { resolveToken = resolve; }));
    const first = auth.signInWithGoogle(user, 'token');
    const second = auth.signInWithGoogle(user, 'token');
    expect(second).toBe(first);
    for (let i = 0; i < 4; i++) await Promise.resolve();
    resolveToken();
    await expect(first).resolves.toBe(false);
  });
});

describe('auth recovery and cleanup edge branches', () => {
  test('restores a normal stored session and marks an available QA session as offline', async () => {
    mockReadGoogleUser.mockResolvedValue(JSON.stringify(user));
    mockGetItem.mockResolvedValue('true');
    mockEnsureSupabaseSession.mockResolvedValue(undefined);
    const auth = useAuth();
    effectCallbacks[0]();
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(mockEnsureSupabaseSession).toHaveBeenCalledWith(user.email, expect.any(Function), user.sub);
    expect(stateSetters[1]).toHaveBeenCalledWith(true);
    expect(stateSetters[2]).toHaveBeenCalledWith(user);
    expect(stateSetters[0]).toHaveBeenCalledWith(false);
    void auth;

    jest.clearAllMocks();
    stateSetters.length = 0;
    effectCallbacks.length = 0;
    mockReadGoogleUser.mockResolvedValue(JSON.stringify(user));
    mockGetItem.mockResolvedValue('true');
    mockIsQaSandboxIdentity.mockReturnValue(true);
    const qaAuth = useAuth();
    effectCallbacks[0]();
    for (let i = 0; i < 6; i++) await Promise.resolve();
    expect(mockSetQaSandboxNetworkBlocked).toHaveBeenCalledWith(true);
    expect(stateSetters[2]).toHaveBeenCalledWith(user);
    void qaAuth;
  });

  test('removes a QA identity that is loaded by an unavailable production build', async () => {
    mockReadGoogleUser.mockResolvedValue(JSON.stringify(user));
    mockGetItem.mockResolvedValue('true');
    mockIsQaSandboxIdentity.mockReturnValue(true);
    mockIsQaSandboxBuildAvailable.mockReturnValue(false);
    const auth = useAuth();
    effectCallbacks[0]();
    for (let i = 0; i < 8; i++) await Promise.resolve();
    expect(mockDeleteGoogleUser).toHaveBeenCalled();
    expect(mockRemoveItem).toHaveBeenCalledWith('habit_tracker_onboarded');
    expect(stateSetters[2]).toHaveBeenCalledWith(null);
    void auth;
  });

  test('fails closed when cold-start session restoration has no saved credential', async () => {
    mockReadGoogleUser.mockResolvedValue(JSON.stringify(user));
    mockGetItem.mockResolvedValue('true');
    mockEnsureSupabaseSession.mockRejectedValue({ code: 'NO_SAVED_GOOGLE_CREDENTIAL' });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const auth = useAuth();
    effectCallbacks[0]();
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(stateSetters[1]).toHaveBeenCalledWith(false);
    expect(stateSetters[2]).toHaveBeenCalledWith(null);
    expect(stateSetters[0]).toHaveBeenCalledWith(false);
    warn.mockRestore();
    void auth;
  });

  test('covers local account resolution for existing, claimed, new, and missing results', async () => {
    const existing = {
      getFirstAsync: jest.fn().mockResolvedValueOnce({ id: 2 }),
      runAsync: jest.fn(),
      withTransactionAsync: jest.fn(async (callback: () => Promise<void>) => callback()),
    };
    await expect(resolveUserRow(existing as never, user.sub, user.email)).resolves.toEqual({ id: 2, isNew: false });

    const claimed = {
      getFirstAsync: jest.fn().mockResolvedValue(null),
      runAsync: jest.fn().mockResolvedValue({ changes: 1, lastInsertRowId: 0 }),
      withTransactionAsync: jest.fn(async (callback: () => Promise<void>) => callback()),
    };
    await expect(resolveUserRow(claimed as never, user.sub, user.email)).resolves.toEqual({ id: 1, isNew: false });

    const fresh = {
      getFirstAsync: jest.fn().mockResolvedValue(null),
      runAsync: jest.fn()
        .mockResolvedValueOnce({ changes: 0, lastInsertRowId: 0 })
        .mockResolvedValueOnce({ changes: 0, lastInsertRowId: 19 })
        .mockResolvedValue({ changes: 1 }),
      withTransactionAsync: jest.fn(async (callback: () => Promise<void>) => callback()),
    };
    await expect(resolveUserRow(fresh as never, user.sub, user.email)).resolves.toEqual({ id: 19, isNew: true });
    expect(fresh.runAsync).toHaveBeenCalledTimes(7);

    const unresolved = {
      getFirstAsync: jest.fn().mockResolvedValue(null),
      runAsync: jest.fn(),
      withTransactionAsync: jest.fn(async () => undefined),
    };
    await expect(resolveUserRow(unresolved as never, user.sub, user.email)).rejects.toThrow('Unable to resolve local Google account');
  });

  test('uses legacy and global reset markers only for the matching account', async () => {
    mockGetStoredGoogleUser.mockResolvedValue(user);
    const legacyKey = 'habit_tracker_pending_progress_reset:google-sub';
    installStorage({ [legacyKey]: JSON.stringify({ userId: 4, email: user.email, sub: user.sub, operationId }) });
    const auth = useAuth();
    await expect(auth.completePendingReset()).resolves.toBe(true);
    expect(mockRemoveItem).toHaveBeenCalledWith(legacyKey);

    const globalKey = 'habit_tracker_pending_progress_reset';
    installStorage({ [globalKey]: JSON.stringify({ userId: 4, email: user.email, sub: user.sub, operationId }) });
    await expect(auth.completePendingReset()).resolves.toBe(true);
    expect(mockRemoveItem).toHaveBeenCalledWith(globalKey);

    installStorage({ [globalKey]: JSON.stringify({ email: user.email, sub: user.sub }) });
    await expect(auth.completePendingReset()).resolves.toBe(false);
    expect(mockMarkBackupRestoreBlocked).toHaveBeenCalledWith(user.email);
  });

  test('handles legacy, malformed, and mismatched pending deletion markers', async () => {
    mockGetStoredGoogleUser.mockResolvedValue(user);
    const auth = useAuth();
    const legacyKey = 'habit_tracker_pending_account_delete:google-sub';
    installStorage({ [legacyKey]: JSON.stringify({ userId: 8, email: user.email, sub: user.sub, operationId }) });
    await expect(auth.completePendingDelete()).resolves.toBe('deleted');
    expect(mockRemoveItem).toHaveBeenCalledWith(legacyKey);

    installStorage({ 'habit_tracker_pending_account_delete:user%40example.com': '{bad json' });
    await expect(auth.completePendingDelete()).resolves.toBe('blocked');
    installStorage({ 'habit_tracker_pending_account_delete': JSON.stringify({ email: user.email, sub: user.sub }) });
    await expect(auth.completePendingDelete()).resolves.toBe('blocked');
    installStorage({ 'habit_tracker_pending_account_delete:user%40example.com': JSON.stringify({ userId: 8, email: 'other@example.com', sub: user.sub, operationId }) });
    await expect(auth.completePendingDelete()).resolves.toBe('blocked');
  });

  test('deletes a normal account and isolates QA account deletion', async () => {
    mockReadGoogleUser.mockResolvedValue(JSON.stringify(user));
    mockGetStoredGoogleUser.mockResolvedValue(user);
    installStorage({});
    const auth = useAuth();
    await expect(auth.deleteAccount(7)).resolves.toBeUndefined();
    expect(mockDeleteUserFromSupabase).toHaveBeenCalledWith(user.email, user.sub, expect.any(String), true);
    expect(mockGoogleRevokeAccess).toHaveBeenCalled();
    expect(mockGoogleSignOut).toHaveBeenCalled();

    mockIsQaSandboxIdentity.mockReturnValue(true);
    await expect(auth.deleteAccount(7)).resolves.toBeUndefined();
    expect(mockPurgeQaSandbox).toHaveBeenCalledWith(defaultDb);
  });

  test('continues local sign-out when native, Supabase, cursor, or challenge cleanup fails', async () => {
    mockGetStoredGoogleUser.mockResolvedValue(user);
    mockGoogleRevokeAccess.mockRejectedValue(new Error('native revoke failed'));
    mockSignOutSupabaseSession.mockRejectedValue(new Error('supabase signout failed'));
    mockResetSyncCursors.mockRejectedValue(new Error('cursor failed'));
    mockGetDb.mockRejectedValue(new Error('db unavailable'));
    const auth = useAuth();
    await expect(auth.signOut()).resolves.toBeUndefined();
    expect(mockDeleteGoogleUser).toHaveBeenCalled();

    mockGetStoredGoogleUser.mockResolvedValue(user);
    mockIsQaSandboxIdentity.mockReturnValue(true);
    mockGetDb.mockResolvedValue(defaultDb);
    mockPurgeQaSandbox.mockRejectedValue(new Error('qa purge failed'));
    await expect(auth.signOut()).rejects.toThrow('qa purge failed');
    expect(mockDeleteGoogleUser).toHaveBeenCalled();
  });

  test('blocks interactive sign-in when restore is unavailable and clears a failed reset marker', async () => {
    mockGetDb.mockResolvedValue({ ...defaultDb, getFirstAsync: jest.fn().mockResolvedValue({ id: 4 }) });
    mockRestoreUserDataIfNeeded.mockResolvedValue('unavailable');
    const auth = useAuth();
    await expect(auth.signInWithGoogle(user, 'token')).rejects.toThrow('Cloud data restore is unavailable');

    mockGetStoredGoogleUser.mockResolvedValue(user);
    installStorage({
      'habit_tracker_pending_progress_reset:user%40example.com': JSON.stringify({ userId: 7, email: user.email, sub: user.sub, operationId }),
    });
    mockSetItem.mockRejectedValueOnce(new Error('marker write failed'));
    await expect(auth.resetProgress(7)).rejects.toThrow('marker write failed');
    expect(mockMarkBackupRestoreBlocked).toHaveBeenCalledWith(user.email);
  });

  test('fails closed at every local-account cancellation fence', async () => {
    const cancellationDb = (secondLookup: unknown, runResults: unknown[] = []) => {
      let activeChecks = 0;
      const runAsync = jest.fn()
        .mockImplementation(async () => runResults.shift() ?? { changes: 0, lastInsertRowId: 19 });
      return {
        getFirstAsync: jest.fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(secondLookup),
        runAsync,
        withTransactionAsync: jest.fn(async (callback: () => Promise<void>) => callback()),
        isActive: () => ++activeChecks < 2,
      };
    };

    const previous = cancellationDb({ id: 4 });
    await expect(resolveUserRow(previous as never, 'new-sub', user.email, previous.isActive, 'old-sub'))
      .rejects.toThrow('Google sign-in cancelled');

    let legacyChecks = 0;
    const legacy = {
      getFirstAsync: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 5 }),
      runAsync: jest.fn(),
      withTransactionAsync: jest.fn(async (callback: () => Promise<void>) => callback()),
      isActive: () => ++legacyChecks < 2,
    };
    await expect(resolveUserRow(legacy as never, 'new-sub', user.email, legacy.isActive))
      .rejects.toThrow('Google sign-in cancelled');

    let insertChecks = 0;
    const beforeInsert = {
      getFirstAsync: jest.fn().mockResolvedValue(null),
      runAsync: jest.fn().mockResolvedValue({ changes: 0 }),
      withTransactionAsync: jest.fn(async (callback: () => Promise<void>) => callback()),
      isActive: () => ++insertChecks < 3,
    };
    await expect(resolveUserRow(beforeInsert as never, 'new-sub', user.email, beforeInsert.isActive))
      .rejects.toThrow('Google sign-in cancelled');

    let seedChecks = 0;
    const duringSeed = {
      getFirstAsync: jest.fn().mockResolvedValue(null),
      runAsync: jest.fn()
        .mockResolvedValueOnce({ changes: 0, lastInsertRowId: 0 })
        .mockResolvedValueOnce({ changes: 0, lastInsertRowId: 19 }),
      withTransactionAsync: jest.fn(async (callback: () => Promise<void>) => callback()),
      isActive: () => ++seedChecks < 4,
    };
    await expect(resolveUserRow(duringSeed as never, 'new-sub', user.email, duringSeed.isActive))
      .rejects.toThrow('Google sign-in cancelled');
  });

  test('covers mounted cleanup and account-scoped marker recovery', async () => {
    mockResetSyncCursors.mockResolvedValue(undefined);
    mockSignOutSupabaseSession.mockResolvedValue(undefined);
    let releaseRead!: (value: string | null) => void;
    mockReadGoogleUser.mockReturnValueOnce(new Promise(resolve => { releaseRead = resolve; }));
    const auth = useAuth();
    const cleanup = effectCallbacks[0]();
    if (typeof cleanup === 'function') cleanup();
    releaseRead(null);
    for (let i = 0; i < 6; i++) await Promise.resolve();
    void auth;

    mockGetStoredGoogleUser.mockResolvedValue(user);
    installStorage({
      'habit_tracker_pending_account_delete': JSON.stringify({ userId: 7, email: user.email, sub: user.sub, operationId }),
    });
    const recovered = useAuth();
    await expect(recovered.completePendingDelete()).resolves.toBe('deleted');
    expect(mockRemoveItem).toHaveBeenCalledWith('habit_tracker_pending_account_delete');
  });

  test('covers reset cleanup, deletion cleanup failures, and sign-out without an identity', async () => {
    mockResetSyncCursors.mockResolvedValue(undefined);
    mockSignOutSupabaseSession.mockResolvedValue(undefined);
    mockGetStoredGoogleUser.mockResolvedValue(user);
    const release = jest.fn();
    mockPauseAccountSync.mockResolvedValue(release);
    const values: Record<string, string | null> = {};
    installStorage(values);
    const auth = useAuth();
    await expect(auth.resetProgress(7)).resolves.toBeUndefined();
    expect(mockMarkBackupRestoreBlocked).toHaveBeenCalledWith(user.email);
    expect(mockClearBackupRestoreBlocked).toHaveBeenCalledWith(user.email);

    mockSignOutSupabaseSession.mockRejectedValueOnce(new Error('supabase signout failed'));
    mockGoogleRevokeAccess.mockRejectedValueOnce(new Error('revoke failed'));
    mockReadGoogleUser.mockResolvedValue(JSON.stringify(user));
    await expect(auth.deleteAccount(7)).resolves.toBeUndefined();

    mockGetStoredGoogleUser.mockResolvedValue(null);
    await expect(auth.signOut()).resolves.toBeUndefined();
  });

  test('handles invalid delete markers, unavailable QA builds, and new-account onboarding', async () => {
    mockReadGoogleUser.mockResolvedValue(JSON.stringify(user));
    mockGetStoredGoogleUser.mockResolvedValue(null);
    mockGetItem.mockResolvedValue(null);
    const auth = useAuth();
    await expect(auth.deleteAccount(7)).rejects.toThrow('Invalid pending account deletion marker');

    mockIsQaSandboxIdentity.mockReturnValue(true);
    mockIsQaSandboxBuildAvailable.mockReturnValue(false);
    await expect(auth.signInWithGoogle({ ...user, sub: 'qa-sub' })).rejects.toThrow('QA sandbox is unavailable');

    mockIsQaSandboxIdentity.mockReturnValue(false);
    mockGetDb.mockResolvedValue({
      ...defaultDb,
      getFirstAsync: jest.fn().mockResolvedValue(null),
      runAsync: jest.fn()
        .mockResolvedValueOnce({ changes: 0, lastInsertRowId: 0 })
        .mockResolvedValueOnce({ changes: 0, lastInsertRowId: 19 })
        .mockResolvedValue({ changes: 1 }),
    });
    mockRestoreUserDataIfNeeded.mockResolvedValue('empty');
    await expect(auth.signInWithGoogle(user, 'token')).resolves.toBe(true);
    expect(mockRemoveItem).toHaveBeenCalledWith('habit_tracker_onboarded');
  });

  test('times out an interactive provider exchange and releases the native restore gate', async () => {
    jest.useFakeTimers();
    mockSignInWithGoogleToken.mockImplementationOnce(() => new Promise<void>(() => {}));
    const auth = useAuth();
    const pending = auth.signInWithGoogle(user, 'token');
    await Promise.resolve();
    jest.advanceTimersByTime(15_000);
    await expect(pending).rejects.toThrow('Google sign-in timed out');
    expect(mockCancelSupabaseSessionRestore).toHaveBeenCalled();
    jest.useRealTimers();
  });
});
