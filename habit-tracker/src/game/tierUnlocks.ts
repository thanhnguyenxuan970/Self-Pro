export interface TierRow {
  id: number;
  tier_order: number;
  stars_required: number;
}

export interface NewUnlock {
  user_id: number;
  tier_id: number;
  week_start: string;
  stars_at_unlock: number;
}

export interface TierUnlockInput {
  userId: number;
  weekStart: string;
  oldStars: number;
  newStars: number;
  tiers: TierRow[];
  alreadyUnlockedTierIds: number[];
  /** tier_order of the tier carried into this week — growth cap = startingTierOrder + 1 */
  startingTierOrder: number;
}

export function computeTierUnlocks(input: TierUnlockInput): NewUnlock[] {
  // At most 1 rank advance per week
  if (input.alreadyUnlockedTierIds.length > 0) return [];

  const qualifying = input.tiers
    .filter(t =>
      t.tier_order > input.startingTierOrder &&   // only tiers above the week-start rank
      input.oldStars < t.stars_required &&
      input.newStars >= t.stars_required,
    )
    .sort((a, b) => a.stars_required - b.stars_required);

  const first = qualifying[0];
  if (!first) return [];

  // Growth cap: max 1 tier advance above the week-start rank
  if (first.tier_order > input.startingTierOrder + 1) return [];

  return [{
    user_id: input.userId,
    tier_id: first.id,
    week_start: input.weekStart,
    stars_at_unlock: input.newStars,
  }];
}
