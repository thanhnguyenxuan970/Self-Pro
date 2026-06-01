export type FreezePurchaseParams = {
  treatStars: number;
  existingFreeze: boolean;
  existingActivity: boolean;
  currentStreak: number;
};

export type FreezeCheckResult =
  | { allowed: true }
  | { allowed: false; reason: 'INSUFFICIENT_FUNDS' | 'ALREADY_FROZEN' | 'HAS_ACTIVITY' | 'NO_STREAK' };

export function canPurchaseFreeze(params: FreezePurchaseParams, cost: number): FreezeCheckResult {
  if (params.existingActivity) return { allowed: false, reason: 'HAS_ACTIVITY' };
  if (params.existingFreeze)   return { allowed: false, reason: 'ALREADY_FROZEN' };
  if (params.currentStreak === 0) return { allowed: false, reason: 'NO_STREAK' };
  if (params.treatStars < cost) return { allowed: false, reason: 'INSUFFICIENT_FUNDS' };
  return { allowed: true };
}
