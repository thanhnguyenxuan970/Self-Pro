import {
  extractGoogleUser,
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
