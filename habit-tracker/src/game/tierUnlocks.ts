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
  return input.tiers
    .filter(
      t =>
        !input.alreadyUnlockedTierIds.includes(t.id) &&
        input.oldStars < t.stars_required &&
        input.newStars >= t.stars_required
    )
    .map(t => ({
      user_id: input.userId,
      tier_id: t.id,
      week_start: input.weekStart,
      stars_at_unlock: input.newStars,
      reward_amount: t.reward_amount,
      reward_currency: t.reward_currency,
    }));
}
