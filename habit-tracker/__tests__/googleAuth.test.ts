import {
  extractGoogleUser,
  getGoogleSignInFailureMessage,
  getGoogleSignInFailureKind,
  getGoogleSignInErrorCode,
  isGoogleSignInCancelledResponse,
} from '../src/lib/googleAuth';
import { GOOGLE_PICTURE_PLACEHOLDER } from '../src/lib/googleUserStorage';

describe('extractGoogleUser', () => {
  const completeResponse = {
    data: {
      user: {
        id: 'google-sub-1',
        email: 'user@example.com',
        name: 'Test User',
        photo: 'https://example.com/photo.jpg',
      },
      idToken: 'google-id-token',
    },
  };

  it('rejects a Google profile that has no ID token', () => {
    expect(extractGoogleUser({
      data: { ...completeResponse.data, idToken: null },
    })).toBeNull();
  });

  it('rejects a Google profile without a stable subject', () => {
    expect(extractGoogleUser({
      data: { ...completeResponse.data, user: { ...completeResponse.data.user, id: '  ' } },
    })).toBeNull();
    expect(extractGoogleUser({
      data: { ...completeResponse.data, user: { ...completeResponse.data.user, id: 42 as never } },
    } as never)).toBeNull();
  });

  it('rejects blank required profile fields', () => {
    expect(extractGoogleUser({
      data: { ...completeResponse.data, user: { ...completeResponse.data.user, email: ' ' } },
    })).toBeNull();
    expect(extractGoogleUser({
      data: { ...completeResponse.data, user: { ...completeResponse.data.user, name: '' } },
    })).toBeNull();
  });

  it('accepts a profile with no avatar and preserves a safe empty picture', () => {
    expect(extractGoogleUser({
      data: { ...completeResponse.data, user: { ...completeResponse.data.user, photo: null } },
    })).toMatchObject({
      googleUser: { sub: 'google-sub-1', picture: GOOGLE_PICTURE_PLACEHOLDER },
      idToken: 'google-id-token',
    });
  });

  it('extracts a complete profile and its required ID token', () => {
    expect(extractGoogleUser(completeResponse)).toEqual({
      googleUser: {
        sub: 'google-sub-1',
        email: 'user@example.com',
        name: 'Test User',
        picture: 'https://example.com/photo.jpg',
      },
      idToken: 'google-id-token',
    });
  });
});

describe('isGoogleSignInCancelledResponse', () => {
  it('recognizes a native cancellation response without surfacing a missing-info error', () => {
    expect(isGoogleSignInCancelledResponse({ type: 'cancelled', data: null })).toBe(true);
    expect(isGoogleSignInCancelledResponse({ type: 'success', data: null })).toBe(false);
  });
});

describe('getGoogleSignInErrorCode', () => {
  it('keeps only a short safe native error code', () => {
    expect(getGoogleSignInErrorCode({ code: '10' })).toBe('10');
    expect(getGoogleSignInErrorCode({ code: 'DEVELOPER_ERROR' })).toBe('DEVELOPER_ERROR');
  });

  it('does not expose arbitrary error messages or malformed codes', () => {
    expect(getGoogleSignInErrorCode({ code: 'token=secret; email=user@example.com' })).toBeNull();
    expect(getGoogleSignInErrorCode({ code: { message: 'secret' } })).toBeNull();
    expect(getGoogleSignInErrorCode(new Error('secret'))).toBeNull();
    expect(getGoogleSignInErrorCode(null)).toBeNull();
  });
});

describe('getGoogleSignInFailureKind', () => {
  test('classifies guarded cloud restore failures separately from provider failures', () => {
    expect(getGoogleSignInFailureKind('RESTORE_DIVERGED')).toBe('account_recovery');
    expect(getGoogleSignInFailureKind('RESTORE_TIMEOUT')).toBe('account_recovery');
    expect(getGoogleSignInFailureKind('DEVELOPER_ERROR')).toBe('provider_configuration');
    expect(getGoogleSignInFailureKind('10')).toBe('provider_configuration');
    expect(getGoogleSignInFailureKind('RESTORE_PROVIDER_ERROR')).toBe('unknown');
    expect(getGoogleSignInFailureKind('GOOGLE_ID_TOKEN_EXPIRED')).toBe('unknown');
    expect(getGoogleSignInFailureKind('SIGN_IN_CANCELLED')).toBe('unknown');
    expect(getGoogleSignInFailureKind(null)).toBe('unknown');
  });
});

describe('getGoogleSignInFailureMessage', () => {
  const messages = {
    signInNoPlayServices: 'no play services',
    signInRecoveryFailed: 'recovery failed',
    signInConfigError: 'config error',
    signInFailed: 'sign-in failed',
  };
  const base = {
    cancelledCode: 'SIGN_IN_CANCELLED',
    playServicesUnavailableCode: 'PLAY_SERVICES_NOT_AVAILABLE',
    diagnosticsEnabled: false,
    messages,
  };

  test('maps cancellation, Play Services, recovery, and provider failures to safe messages', () => {
    expect(getGoogleSignInFailureMessage({ ...base, code: 'SIGN_IN_CANCELLED' })).toBeNull();
    expect(getGoogleSignInFailureMessage({ ...base, code: 'PLAY_SERVICES_NOT_AVAILABLE' })).toBe('no play services');
    expect(getGoogleSignInFailureMessage({ ...base, code: 'RESTORE_DIVERGED' })).toBe('recovery failed');
    expect(getGoogleSignInFailureMessage({ ...base, code: 'DEVELOPER_ERROR' })).toBe('config error');
    expect(getGoogleSignInFailureMessage({ ...base, code: 'RESTORE_PROVIDER_ERROR' })).toBe('sign-in failed');
  });

  test('shows a validated diagnostic code only when diagnostics are enabled', () => {
    expect(getGoogleSignInFailureMessage({ ...base, code: 'UNKNOWN_CODE' })).toBe('sign-in failed');
    expect(getGoogleSignInFailureMessage({ ...base, code: 'UNKNOWN_CODE', diagnosticsEnabled: true }))
      .toBe('sign-in failed (UNKNOWN_CODE)');
    expect(getGoogleSignInFailureMessage({ ...base, code: null, diagnosticsEnabled: true })).toBe('sign-in failed');
  });
});
