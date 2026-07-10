/**
 * Stub Pro-entitlement check. Always returns not-pro until billing is wired.
 */
export function useProStatus(): { isPro: boolean } {
  return { isPro: false };
}
