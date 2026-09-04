const stateSetters: jest.Mock[] = [];
const effectCallbacks: Array<() => void> = [];
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
