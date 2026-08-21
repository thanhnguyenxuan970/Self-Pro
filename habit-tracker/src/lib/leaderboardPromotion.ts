/**
 * Pure policy + math for the Rank Board's "promotion" animation: when the
 * caller's own lifetime stars climb between two leaderboard fetches while
 * the screen stays mounted, their row counts up from the old total and the
 * rows it temporarily passes visually yield until the count catches them.
 *
 * The row list itself never reorders — the query already returns rows in
 * final, correct rank order. Only the transform offsets applied on top (by
 * the caller) make the transition look like a climb instead of a snap.
 */

export type PromoSnapshot = { stars: number; rank: number };

/** Keep local progress visible when a transient/empty remote response omits it. */
export function boardRowsWithCurrentUserFallback<T>(
  rows: readonly T[],
  fallback: T,
  isZero: boolean,
): T[] {
  if (rows.length > 0 || isZero) return [...rows];
  return [fallback];
}

/**
 * A mount is not an event: `prev` is `null` on first render (or after the
 * board remounts, e.g. switching away from and back to the Global segment),
 * and that must render the final truthful state, never replay a climb.
 */
export function shouldAnimatePromotion(
  prev: PromoSnapshot | null,
  next: PromoSnapshot,
  reduceMotion: boolean,
): boolean {
  return !reduceMotion && prev != null && next.stars > prev.stars;
}

/**
 * Intermediate values the star counter ticks through from `start` to
 * `target` (last entry is always exactly `target`). Bounded to `maxSteps` so
 * a large jump (e.g. a multi-day backfill) still animates in a bounded
 * number of ticks instead of counting one star at a time.
 */
export function promotionCountSteps(start: number, target: number, maxSteps = 12): number[] {
  const span = target - start;
  if (span <= 0) return [];
  const steps = Math.min(maxSteps, span);
  const out: number[] = [];
  for (let i = 1; i <= steps; i++) {
    out.push(i === steps ? target : Math.round(start + (span * i) / steps));
  }
  return out;
}

/** Rank positions climbed by this promotion. Never negative — a drop is never animated as a climb. */
export function ranksClimbed(startRank: number, targetRank: number): number {
  return Math.max(0, startRank - targetRank);
}

export type PromoRange = { from: number; to: number };

/**
 * Index range (in the final, already-sorted row list) of the rows this
 * promotion passed — the ones directly below the caller's final slot, one
 * per rank climbed. `null` when there was no climb, or when the caller's
 * row isn't present in the list at all.
 */
export function passedRowRange(youIndex: number, climbed: number, rowCount: number): PromoRange | null {
  if (climbed <= 0 || youIndex < 0) return null;
  const to = Math.min(youIndex + climbed, rowCount - 1);
  if (to <= youIndex) return null;
  return { from: youIndex + 1, to };
}

/**
 * True while a passed row is still holding its old visual slot — the
 * animated count hasn't reached its star total yet, so it hasn't been
 * "caught" and shouldn't snap back into the list's true order yet.
 */
export function isRowStillAhead(rowIndex: number, range: PromoRange | null, displayStars: number, rowStars: number): boolean {
  if (!range || rowIndex < range.from || rowIndex > range.to) return false;
  return displayStars < rowStars;
}

/** Count of passed rows still holding their old slot — how far the caller's own row must yield downward to avoid overlapping them. */
export function countPending(range: PromoRange | null, displayStars: number, starsAt: (index: number) => number): number {
  if (!range) return 0;
  let pending = 0;
  for (let i = range.from; i <= range.to; i++) {
    if (isRowStillAhead(i, range, displayStars, starsAt(i))) pending++;
  }
  return pending;
}
