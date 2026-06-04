export interface TreatRow {
  id: number;
  user_id: number;
  name: string;
  icon: string;
  target_stars: number;
  approx_amount: number;
  currency: string;
  status: 'ACTIVE' | 'ENJOYED' | 'ARCHIVED';
  sort_order: number;
  reached_at: string | null;
  enjoyed_at: string | null;
  created_at: string;
}

export interface DecoratedTreat extends TreatRow {
  unlockable: boolean;
  starsToUnlock: number;
  progressPct: number;
}

export type EnjoyCheckResult =
  | { allowed: true }
  | { allowed: false; reason: 'NOT_ENOUGH_STARS' | 'ALREADY_ENJOYED' };

export function canEnjoyTreat(treat: TreatRow, treatStars: number): EnjoyCheckResult {
  if (treat.status !== 'ACTIVE') return { allowed: false, reason: 'ALREADY_ENJOYED' };
  if (treatStars < treat.target_stars) return { allowed: false, reason: 'NOT_ENOUGH_STARS' };
  return { allowed: true };
}

export function decorateTreat(treat: TreatRow, treatStars: number): DecoratedTreat {
  return {
    ...treat,
    unlockable: treat.status === 'ACTIVE' && treatStars >= treat.target_stars,
    starsToUnlock: Math.max(0, treat.target_stars - treatStars),
    progressPct: treat.target_stars === 0
      ? 100
      : Math.min(100, Math.round((treatStars / treat.target_stars) * 100)),
  };
}
