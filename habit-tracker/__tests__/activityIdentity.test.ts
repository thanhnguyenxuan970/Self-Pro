import {
  createActivityKey,
  isConfirmedActivityIdentity,
  normalizeMirroredActivityIdentity,
  normalizeStoredActivityIdentity,
} from '../src/lib/activityIdentity';

describe('activity identity rules', () => {
  it('creates an opaque key that is stable when the caller stores it', () => {
    const key = createActivityKey();
    expect(typeof key).toBe('string');
    expect(isConfirmedActivityIdentity(key)).toBe(true);
  });

  it('creates a collision-resistant fallback key without Web Crypto', () => {
    const cryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    const random = jest.spyOn(Math, 'random').mockReturnValue(0.5);
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: undefined });

    try {
      expect(createActivityKey()).toBe('activity-loyw3v28-i');
    } finally {
      now.mockRestore();
      random.mockRestore();
      if (cryptoDescriptor) {
        Object.defineProperty(globalThis, 'crypto', cryptoDescriptor);
      } else {
        delete (globalThis as unknown as { crypto?: unknown }).crypto;
      }
    }
  });

  it('keeps missing and legacy-shaped identities unresolved without manufacturing a key', () => {
    expect(normalizeStoredActivityIdentity(undefined, undefined)).toEqual({
      activityKey: null,
      status: 'unresolved',
    });
    expect(normalizeStoredActivityIdentity('legacy:42', undefined)).toEqual({
      activityKey: null,
      status: 'unresolved',
    });
    expect(isConfirmedActivityIdentity('legacy:42')).toBe(false);
  });

  it('does not resolve a key explicitly marked unresolved', () => {
    expect(normalizeStoredActivityIdentity('activity-device-a-42', 'unresolved')).toEqual({
      activityKey: null,
      status: 'unresolved',
    });
  });

  it('uses the explicit cloud-mirror policy without weakening backup status checks', () => {
    expect(normalizeMirroredActivityIdentity('activity-device-a-42')).toEqual({
      activityKey: 'activity-device-a-42',
      status: 'resolved',
    });
    expect(normalizeMirroredActivityIdentity('legacy:42')).toEqual({
      activityKey: null,
      status: 'unresolved',
    });
  });
});
