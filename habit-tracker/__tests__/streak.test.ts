describe('streak computation', () => {
  it('no yesterday row → streak = 1', () => {
    const streak = computeStreak(null);
    expect(streak).toBe(1);
  });

  it('yesterday streak = 5 → today = 6', () => {
    const streak = computeStreak({ streak_count: 5 });
    expect(streak).toBe(6);
  });

  it('yesterday streak = 0 → today = 1', () => {
    const streak = computeStreak({ streak_count: 0 });
    expect(streak).toBe(1);
  });
});

// Pure streak formula — no DB dependency
function computeStreak(yesterday: { streak_count: number } | null): number {
  return (yesterday?.streak_count ?? 0) + 1;
}
