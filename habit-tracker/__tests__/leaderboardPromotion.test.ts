import {
  countPending,
  boardRowsWithCurrentUserFallback,
  isRowStillAhead,
  passedRowRange,
  promotionCountSteps,
  ranksClimbed,
  shouldAnimatePromotion,
} from '../src/lib/leaderboardPromotion';

describe('shouldAnimatePromotion', () => {
  test('a mount (no previous snapshot) never animates, even if stars are already high', () => {
    expect(shouldAnimatePromotion(null, { stars: 500, rank: 3 }, false)).toBe(false);
  });

  test('reduced motion suppresses the climb regardless of a real star increase', () => {
    expect(shouldAnimatePromotion({ stars: 10, rank: 5 }, { stars: 20, rank: 4 }, true)).toBe(false);
  });

  test('a star increase between two mounted renders animates', () => {
    expect(shouldAnimatePromotion({ stars: 10, rank: 5 }, { stars: 11, rank: 5 }, false)).toBe(true);
  });

  test('an unchanged or falling total never animates — a drop is never played as a climb', () => {
    expect(shouldAnimatePromotion({ stars: 10, rank: 5 }, { stars: 10, rank: 5 }, false)).toBe(false);
    expect(shouldAnimatePromotion({ stars: 10, rank: 5 }, { stars: 9, rank: 6 }, false)).toBe(false);
  });
});

describe('boardRowsWithCurrentUserFallback', () => {
  test('keeps a nonzero local user visible when the remote board is unexpectedly empty', () => {
    const fallback = { playerId: 'me', isCurrentUser: true };
    expect(boardRowsWithCurrentUserFallback([], fallback, false)).toEqual([fallback]);
  });

  test('keeps the zero-star CTA empty instead of rendering a fallback row', () => {
    const fallback = { playerId: 'me', isCurrentUser: true };
    expect(boardRowsWithCurrentUserFallback([], fallback, true)).toEqual([]);
  });
});

describe('promotionCountSteps', () => {
  test('a small climb ticks one star at a time and always lands on the exact target', () => {
    expect(promotionCountSteps(10, 13)).toEqual([11, 12, 13]);
  });

  test('a climb of zero or negative span produces no steps', () => {
    expect(promotionCountSteps(10, 10)).toEqual([]);
    expect(promotionCountSteps(10, 5)).toEqual([]);
  });

  test('a huge jump (e.g. a multi-day backfill) is capped so it still animates in bounded time', () => {
    const steps = promotionCountSteps(0, 5000, 12);
    expect(steps).toHaveLength(12);
    expect(steps[steps.length - 1]).toBe(5000);
    // strictly increasing, no duplicate/backwards ticks
    for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeGreaterThan(steps[i - 1]);
  });
});

describe('ranksClimbed', () => {
  test('a lower rank number is a climb', () => {
    expect(ranksClimbed(12, 9)).toBe(3);
  });
  test('a drop or unchanged rank never reports a negative climb', () => {
    expect(ranksClimbed(9, 12)).toBe(0);
    expect(ranksClimbed(9, 9)).toBe(0);
  });
});

describe('passedRowRange', () => {
  test('no climb means no passed rows', () => {
    expect(passedRowRange(5, 0, 15)).toBeNull();
  });
  test('the caller missing from the list means nothing to animate', () => {
    expect(passedRowRange(-1, 2, 15)).toBeNull();
  });
  test('the passed range sits directly below the caller, one row per rank climbed', () => {
    expect(passedRowRange(4, 2, 15)).toEqual({ from: 5, to: 6 });
  });
  test('a climb near the end of the board clamps to the last real row instead of an out-of-bounds index', () => {
    expect(passedRowRange(13, 5, 15)).toEqual({ from: 14, to: 14 });
  });
  test('clamping to the very last row (already at the bottom) yields no range', () => {
    expect(passedRowRange(14, 3, 15)).toBeNull();
  });
});

describe('isRowStillAhead + countPending', () => {
  const range = { from: 5, to: 7 };

  test('a row outside the passed range is never "still ahead"', () => {
    expect(isRowStillAhead(4, range, 0, 100)).toBe(false);
    expect(isRowStillAhead(8, range, 0, 100)).toBe(false);
  });

  test('a passed row stays ahead until the animated count reaches its total', () => {
    expect(isRowStillAhead(6, range, 50, 100)).toBe(true);
    expect(isRowStillAhead(6, range, 100, 100)).toBe(false);
    expect(isRowStillAhead(6, range, 150, 100)).toBe(false);
  });

  test('pending counts only the passed rows the animated total has not yet reached', () => {
    const starsAt = (i: number) => ({ 5: 10, 6: 20, 7: 30 }[i] ?? 0);
    expect(countPending(range, 5, starsAt)).toBe(3);
    expect(countPending(range, 15, starsAt)).toBe(2);
    expect(countPending(range, 25, starsAt)).toBe(1);
    expect(countPending(range, 30, starsAt)).toBe(0);
  });

  test('no range means nothing is ever pending', () => {
    expect(countPending(null, 0, () => 0)).toBe(0);
  });
});
