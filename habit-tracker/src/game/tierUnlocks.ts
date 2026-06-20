export interface TierRow {
  id: number;
  stars_required: number;
  reward_amount: number;
  reward_currency: string;
}

export interface NewUnlock {
  user_id: number;
  tier_id: number;
  week_start: string;
  stars_at_unlock: number;
  reward_amount: number;
  reward_currency: string;
}

export interface TierUnlockInput {
  userId: number;
  weekStart: string;
  oldStars: number;
  newStars: number;
  tiers: TierRow[];
  alreadyUnlockedTierIds: number[];
}

export function computeTierUnlocks(input: TierUnlockInput): NewUnlock[] {
  // Cap: at most 1 rank advance per week
  if (input.alreadyUnlockedTierIds.length > 0) return [];

  const qualifying = input.tiers
    .filter(t => input.oldStars < t.stars_required && input.newStars >= t.stars_required)
    .sort((a, b) => a.stars_required - b.stars_required);

  const first = qualifying[0];
  if (!first) return [];

  return [{
    user_id: input.userId,
    tier_id: first.id,
    week_start: input.weekStart,
    stars_at_unlock: input.newStars,
    reward_amount: first.reward_amount,
    reward_currency: first.reward_currency,
  }];
}
