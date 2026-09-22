import {
  createActivityKey,
  legacyActivityKey,
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

  it('uses the non-Web-Crypto fallback and rejects malformed legacy keys', () => {
    const previousCrypto = (globalThis as { crypto?: unknown }).crypto;
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: {} });
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1700000000000);
    const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.123456);
    try {
      expect(createActivityKey()).toMatch(/^activity-[a-z0-9]+-[a-z0-9]+$/);
      expect(() => legacyActivityKey(0)).toThrow('positive legacy activity id');
      expect(() => legacyActivityKey(-1)).toThrow('positive legacy activity id');
      expect(legacyActivityKey(42)).toBe('legacy:42');
      expect(isConfirmedActivityIdentity('', 'resolved')).toBe(false);
      expect(isConfirmedActivityIdentity(`activity-${'x'.repeat(129)}`, 'resolved')).toBe(false);
      expect(isConfirmedActivityIdentity(' activity-key', 'resolved')).toBe(false);
      expect(isConfirmedActivityIdentity('activity-key', 'unresolved')).toBe(false);
    } finally {
      nowSpy.mockRestore();
      randomSpy.mockRestore();
      Object.defineProperty(globalThis, 'crypto', { configurable: true, value: previousCrypto });
    }
  });
});
