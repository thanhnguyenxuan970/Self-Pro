// Star calculation for duration-based habits: every 30 min = 1★.

export interface PointConfig {
  minutesPerBlock: number;
  starsPerFullBlock: number;
  dailyCapStars?: number;
}

const DEFAULT_POINT_CONFIG: PointConfig = {
  minutesPerBlock: 30,
  starsPerFullBlock: 1,
};

/**
 * Stars earned for `durationMin` minutes.
 *   A fraction ≤0.5h adds 1★; a fraction >0.5h rounds stars up to the next hour.
 *   The recorded duration remains unchanged: 1.3h→3, 1.5h→3, 1.6h→4, 2.6h→6.
 */
export function computeStars(
  durationMin: number,
  cfg: PointConfig = DEFAULT_POINT_CONFIG,
): number {
  if (durationMin <= 0) return 0;

  const wholeHours = Math.floor(durationMin / 60);
  const hourFraction = durationMin / 60 - wholeHours;
  const roundedMinutes = (hourFraction > 0.5 ? wholeHours + 1 : wholeHours) * 60;
  const blocks = Math.floor(roundedMinutes / cfg.minutesPerBlock);
  let stars = blocks * cfg.starsPerFullBlock;

  if (hourFraction > 0 && hourFraction <= 0.5) stars += cfg.starsPerFullBlock;

  if (cfg.dailyCapStars != null) stars = Math.min(stars, cfg.dailyCapStars);
  return stars;
}
