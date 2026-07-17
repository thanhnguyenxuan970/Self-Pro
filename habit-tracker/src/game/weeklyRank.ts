export type WeeklyRankTier = { id: number; tier_order: number; stars_required: number };

export function resolveWeeklyRank(previousTierId: number | null, previousStars: number, tiers: WeeklyRankTier[]) {
  const sorted = [...tiers].sort((a, b) => a.tier_order - b.tier_order);
  const lowest = sorted[0];
  if (previousTierId === null) {
    return lowest && previousStars >= lowest.stars_required
      ? { tierId: lowest.id, promotedTierId: lowest.id }
      : { tierId: null, promotedTierId: null };
  }
  const current = sorted.find(tier => tier.id === previousTierId) ?? lowest;
  if (!current) return { tierId: null, promotedTierId: null };
  const next = sorted.find(tier => tier.tier_order === current.tier_order + 1);
  if (next && previousStars >= next.stars_required) return { tierId: next.id, promotedTierId: next.id };
  if (previousStars === 0) return { tierId: sorted.find(tier => tier.tier_order === current.tier_order - 1)?.id ?? lowest.id, promotedTierId: null };
  return { tierId: current.id, promotedTierId: null };
}
