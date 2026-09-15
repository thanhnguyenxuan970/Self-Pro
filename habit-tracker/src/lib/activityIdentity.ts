/**
 * Stable identity for one activity-log event.
 *
 * New rows get an opaque key that survives retries, restore, and a second
 * device. A `legacy:<local_id>` key is constructed only for an explicitly
 * provenance-confirmed mapping; equal local IDs are not evidence of identity.
 */
export function createActivityKey(): string {
  const cryptoObject = (globalThis as typeof globalThis & {
    crypto?: { randomUUID?: () => string };
  }).crypto;
  if (typeof cryptoObject?.randomUUID === 'function') {
    return cryptoObject.randomUUID();
  }

  // React Native versions without Web Crypto still get a collision-resistant
  // opaque key. This is only a fallback; the value is not used as a secret.
  const time = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2);
  return `activity-${time}-${random}`;
}

export type ActivityIdentityStatus = 'resolved' | 'unresolved';

export const ACTIVITY_IDENTITY_RESOLVED: ActivityIdentityStatus = 'resolved';
export const ACTIVITY_IDENTITY_UNRESOLVED: ActivityIdentityStatus = 'unresolved';

export function legacyActivityKey(localId: number): string {
  if (!Number.isSafeInteger(localId) || localId <= 0) {
    throw new Error('A positive legacy activity id is required');
  }
  return `legacy:${localId}`;
}

export function isActivityKey(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= 128
    && value === value.trim();
}

/**
 * A legacy-shaped key is deliberately never treated as proof of identity.
 * The only way to resolve one is an explicit, reviewed provenance mapping.
 */
export function isConfirmedActivityIdentity(
  activityKey: unknown,
  status: unknown = ACTIVITY_IDENTITY_RESOLVED,
): activityKey is string {
  return status === ACTIVITY_IDENTITY_RESOLVED
    && isActivityKey(activityKey)
    && !activityKey.startsWith('legacy:');
}

/** Normalize untrusted backup/restore input without manufacturing an identity. */
export function normalizeStoredActivityIdentity(
  activityKey: unknown,
  status: unknown,
): { activityKey: string | null; status: ActivityIdentityStatus } {
  if (isConfirmedActivityIdentity(
    activityKey,
    status === undefined ? ACTIVITY_IDENTITY_RESOLVED : status,
  )) {
    return { activityKey, status: ACTIVITY_IDENTITY_RESOLVED };
  }
  return { activityKey: null, status: ACTIVITY_IDENTITY_UNRESOLVED };
}

/**
 * Normalize a key read from the server's legacy activity mirror. The mirror
 * never carried the local `activity_identity_status` column, so its explicit
 * trust rule is based on the cloud-owned durable key itself. This policy is
 * intentionally separate from backup restoration: arbitrary backup JSON with
 * a missing status remains unresolved, while a valid non-legacy key already
 * stored in `activity_log` is preserved during mirror hydration.
 */
export function normalizeMirroredActivityIdentity(
  activityKey: unknown,
): { activityKey: string | null; status: ActivityIdentityStatus } {
  if (isConfirmedActivityIdentity(activityKey, ACTIVITY_IDENTITY_RESOLVED)) {
    return { activityKey, status: ACTIVITY_IDENTITY_RESOLVED };
  }
  return { activityKey: null, status: ACTIVITY_IDENTITY_UNRESOLVED };
}
