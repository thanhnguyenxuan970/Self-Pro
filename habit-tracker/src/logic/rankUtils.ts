type Tier = {
  id: number;
  tier_order: number;
  stars_required: number;
  rank_name: string;
  reward_amount: number;
};

export function getCurrentTier(stars: number, tiers: Tier[]): Tier {
  const sorted = [...tiers].sort((a, b) => b.stars_required - a.stars_required);
  return sorted.find((t) => stars >= t.stars_required) ?? sorted[sorted.length - 1];
}

export function getStarsToNextTier(stars: number, tiers: Tier[]): number {
  const sorted = [...tiers].sort((a, b) => a.stars_required - b.stars_required);
  const next = sorted.find((t) => t.stars_required > stars);
  return next ? next.stars_required - stars : 0;
}
