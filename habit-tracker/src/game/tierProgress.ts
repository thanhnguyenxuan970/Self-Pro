import type { Tier } from './tierLookup';

export function getStarsToNextTier(stars: number, tiers: Tier[]): number {
  const sorted = [...tiers].sort((a, b) => a.stars_required - b.stars_required);
  const next = sorted.find((t) => t.stars_required > stars);
  return next ? next.stars_required - stars : 0;
}
