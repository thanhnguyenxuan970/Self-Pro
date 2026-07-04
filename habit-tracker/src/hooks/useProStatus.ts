/**
 * Stub Pro-entitlement check. Always returns not-pro until RevenueCat is wired in
 * (see TODOS.md — PaywallScreen exists but isn't registered/connected to a
 * subscription hook yet). Pro-gated features should treat `isPro: false` as the
 * only state today; do not add bypasses.
 */
export function useProStatus(): { isPro: boolean } {
  return { isPro: false };
}
