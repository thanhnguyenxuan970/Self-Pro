export type LifetimeTierRow = { id: number; tier_order: number; rank_name: string; stars_required: number };

export type LifetimeTierCrossing = {
  tierId: number;
  tierOrder: number;
  rankName: string;
  /** Stars shown on that tier's celebration — the tier's own threshold, not the running total. */
  starsAtCrossing: number;
};

export type LifetimeTierResult = {
  crossings: LifetimeTierCrossing[];
  finalTierId: number | null;
};

/**
 * High-water-mark tier crossing: current_tier_id only ever advances. Walks every
 * tier threshold newly cleared by oldStars -> newStars (not just the next one),
 * so one large star gain can queue multiple celebrations in a single action.
 */
export function computeLifetimeTierCrossings(
  oldStars: number,
  newStars: number,
  currentTierId: number | null,
  tiers: LifetimeTierRow[],
): LifetimeTierResult {
  if (newStars <= oldStars) return { crossings: [], finalTierId: currentTierId };

  const sorted = [...tiers].sort((a, b) => a.tier_order - b.tier_order);
  const currentOrder = currentTierId
    ? (sorted.find(t => t.id === currentTierId)?.tier_order ?? 0)
    : 0;

  const crossed = sorted.filter(t =>
    t.tier_order > currentOrder && oldStars < t.stars_required && newStars >= t.stars_required,
  );

  if (crossed.length === 0) return { crossings: [], finalTierId: currentTierId };

  return {
    crossings: crossed.map(t => ({
      tierId: t.id,
      tierOrder: t.tier_order,
      rankName: t.rank_name,
      starsAtCrossing: t.stars_required,
    })),
    finalTierId: crossed[crossed.length - 1].id,
  };
}
