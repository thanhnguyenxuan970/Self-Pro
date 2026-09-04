const mockSetState = jest.fn();
const mockReadGoogleUser = jest.fn().mockResolvedValue(null);
const mockWriteGoogleUser = jest.fn().mockResolvedValue(undefined);
const mockDeleteGoogleUser = jest.fn().mockResolvedValue(undefined);
const mockGetStoredGoogleUser = jest.fn().mockResolvedValue(null);
const mockGetItem = jest.fn().mockResolvedValue(null);
const mockSetItem = jest.fn().mockResolvedValue(undefined);
const mockRemoveItem = jest.fn().mockResolvedValue(undefined);
const mockSignInWithGoogleToken = jest.fn().mockResolvedValue(undefined);
const mockRestoreUserDataIfNeeded = jest.fn().mockResolvedValue('empty');
const mockRestoreLifetimeStarsFromSupabase = jest.fn().mockResolvedValue(undefined);
const mockCancelSupabaseSessionRestore = jest.fn();

jest.mock('react', () => ({
  createContext: (defaultValue: unknown) => ({ defaultValue }),
  useContext: jest.fn(),
  useState: (initialValue: unknown) => [initialValue, mockSetState],
  useEffect: jest.fn(),
  useCallback: (callback: unknown) => callback,
  useRef: (initialValue: unknown) => ({ current: initialValue }),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: mockGetItem,
  setItem: mockSetItem,
  removeItem: mockRemoveItem,
}));

jest.mock('../src/lib/googleUserStorage', () => ({
  readGoogleUser: mockReadGoogleUser,
  writeGoogleUser: mockWriteGoogleUser,
  deleteGoogleUser: mockDeleteGoogleUser,
  getStoredGoogleUser: mockGetStoredGoogleUser,
  parseGoogleUser: jest.fn(),
}));

jest.mock('../src/api/syncErrors', () => ({
  NO_SAVED_GOOGLE_CREDENTIAL_CODE: 'no_saved_credential_found',
}));

jest.mock('../src/lib/challengeNotificationPlan', () => ({
  challengeReminderPrefix: jest.fn((id: number) => `challenge:${id}`),
}));

jest.mock('../src/utils/notifications', () => ({
  invalidateChallengeReminderSync: jest.fn(),
}));

jest.mock('../src/queries/queryClient', () => ({
  queryClient: { clear: jest.fn() },
}));

jest.mock('../src/qa/qaSandbox', () => ({
  isQaSandboxIdentity: jest.fn(() => false),
  isQaSandboxBuildAvailable: jest.fn(() => true),
  purgeQaSandbox: jest.fn(),
  seedQaSandbox: jest.fn(),
  setQaSandboxNetworkBlocked: jest.fn(),
}));

jest.mock('../src/api/syncService', () => ({
  signInWithGoogleToken: mockSignInWithGoogleToken,
  restoreUserDataIfNeeded: mockRestoreUserDataIfNeeded,
  restoreLifetimeStarsFromSupabase: mockRestoreLifetimeStarsFromSupabase,
  cancelSupabaseSessionRestore: mockCancelSupabaseSessionRestore,
}));

jest.mock('../src/db/client', () => ({
  getDb: jest.fn().mockResolvedValue({
    withTransactionAsync: async (operation: () => Promise<void>) => operation(),
    getFirstAsync: jest.fn().mockResolvedValue(null),
    runAsync: jest.fn().mockResolvedValue({ changes: 1, lastInsertRowId: 1 }),
  }),
}));

(globalThis as { __DEV__?: boolean }).__DEV__ = true;

import { useAuth } from '../src/hooks/useAuth';

describe('interactive Google sign-in recovery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetStoredGoogleUser.mockResolvedValue(null);
    mockGetItem.mockResolvedValue(null);
    mockRestoreUserDataIfNeeded.mockResolvedValue('empty');
  });

  it('keeps ordinary interactive sign-in on the fast path while allowing blocked recovery', async () => {
    const auth = useAuth();
    const user = {
      sub: 'google-sub',
      email: 'user@example.com',
      name: 'Test User',
      picture: 'https://example.com/photo.jpg',
    };

    await expect(auth.signInWithGoogle(user, 'google-id-token')).resolves.toBe(false);

    expect(mockRestoreUserDataIfNeeded).toHaveBeenCalledWith(
      1,
      user.email,
      user.sub,
      expect.any(Function),
      true,
      undefined,
      true,
      expect.any(Function),
    );
  });

  it('does not publish the Google identity when restore remains unavailable', async () => {
    mockRestoreUserDataIfNeeded.mockResolvedValue('unavailable');
    const auth = useAuth();
    const user = {
      sub: 'google-sub',
      email: 'user@example.com',
      name: 'Test User',
      picture: 'https://example.com/photo.jpg',
    };

    await expect(auth.signInWithGoogle(user, 'google-id-token'))
      .rejects.toThrow('Cloud data restore is unavailable');

    expect(mockWriteGoogleUser).not.toHaveBeenCalled();
    expect(mockSetState).not.toHaveBeenCalled();
    expect(mockRestoreLifetimeStarsFromSupabase).not.toHaveBeenCalled();
  });

  it('keeps a divergent restore blocked and tags its failure reason', async () => {
    mockRestoreUserDataIfNeeded.mockImplementation(async (...args: unknown[]) => {
      const onFailureReason = args[7] as ((reason: string) => void) | undefined;
      onFailureReason?.('RESTORE_DIVERGED');
      return 'unavailable';
    });
    const auth = useAuth();
    const user = {
      sub: 'google-sub',
      email: 'user@example.com',
      name: 'Test User',
      picture: 'https://example.com/photo.jpg',
    };

    let caught: unknown;
    try {
      await auth.signInWithGoogle(user, 'google-id-token');
    } catch (error) {
      caught = error;
    }

    expect((caught as { code?: string }).code).toBe('RESTORE_DIVERGED');
    expect(mockWriteGoogleUser).not.toHaveBeenCalled();
    expect(mockSetState).not.toHaveBeenCalled();
    expect(mockRestoreLifetimeStarsFromSupabase).not.toHaveBeenCalled();
  });

  it('tags a generic restore failure with the short failure-reason code', async () => {
    mockRestoreUserDataIfNeeded.mockImplementation(async (...args: unknown[]) => {
      const onFailureReason = args[7] as ((reason: string) => void) | undefined;
      onFailureReason?.('RESTORE_ERROR');
      return 'unavailable';
    });
    const auth = useAuth();
    const user = {
      sub: 'google-sub',
      email: 'user@example.com',
      name: 'Test User',
      picture: 'https://example.com/photo.jpg',
    };

    let caught: unknown;
    try {
      await auth.signInWithGoogle(user, 'google-id-token');
    } catch (error) {
      caught = error;
    }

    expect((caught as { code?: string }).code).toBe('RESTORE_ERROR');
  });
});
