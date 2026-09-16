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
