export type Tier = {
  id: number;
  tier_order: number;
  stars_required: number;
  rank_name: string;
  reward_amount: number;
};

export function getCurrentTier(stars: number, tiers: Tier[]): Tier | undefined {
  const sorted = [...tiers].sort((a, b) => b.stars_required - a.stars_required);
  return sorted.find((t) => stars >= t.stars_required);
}
