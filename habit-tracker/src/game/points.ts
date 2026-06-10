// Star calculation for duration-based habits.
// Rule: every 30 min = 1★ up to 2h, then half-rate beyond (anti-inflation).

export interface PointConfig {
  minutesPerBlock: number;
  starsPerFullBlock: number;
  fullRateBlocks: number;
  reducedRateDivisor: number;
  dailyCapStars?: number;
  hardCap?: boolean;
}

const DEFAULT_POINT_CONFIG: PointConfig = {
  minutesPerBlock: 30,
  starsPerFullBlock: 1,
  fullRateBlocks: 4,     // 4 × 30min = 2h at full rate
  reducedRateDivisor: 2, // then 1★ per 2 extra blocks (= per extra hour)
  hardCap: false,
};

/**
 * Stars earned for `durationMin` minutes.
 *   full-rate zone (≤2h): 1★ / 30min
 *   beyond:               1★ / 60min  (half-rate) — or 0 if hardCap
 *
 *   30m→1  1h→2  1.5h→3  2h→4  2.5h→4  3h→5  4h→6  8h→10
 */
export function computeStars(
  durationMin: number,
  cfg: PointConfig = DEFAULT_POINT_CONFIG,
): number {
  if (durationMin <= 0) return 0;

  const blocks = Math.floor(durationMin / cfg.minutesPerBlock);
  const fullBlocks = Math.min(blocks, cfg.fullRateBlocks);
  const extraBlocks = Math.max(0, blocks - cfg.fullRateBlocks);

  let stars = fullBlocks * cfg.starsPerFullBlock;
  if (!cfg.hardCap) {
    stars += Math.floor(extraBlocks / cfg.reducedRateDivisor) * cfg.starsPerFullBlock;
  }

  if (cfg.dailyCapStars != null) stars = Math.min(stars, cfg.dailyCapStars);
  return stars;
}

