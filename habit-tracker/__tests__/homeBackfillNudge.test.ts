import { getHomeBackfillNudge } from '../src/game/homeBackfillNudge';

const base = {
  today: '2026-07-17',
  weekStart: '2026-07-13',
  activeDates: [] as string[],
  freezeDates: new Set<string>(),
  backfillsUsedThisWeek: 0,
};

describe('getHomeBackfillNudge', () => {
  it('shows only eligible misses in the current week', () => {
    const nudge = getHomeBackfillNudge({ ...base, activeDates: ['2026-07-13'] });
    expect(nudge).toMatchObject({ pendingDates: ['2026-07-14', '2026-07-15', '2026-07-16'], remaining: 2, state: 'PROMPT_CAPPED', reconnectable: false });
  });

  it('hides when quota is exhausted, all days are active, or a day has a freeze', () => {
    expect(getHomeBackfillNudge({ ...base, backfillsUsedThisWeek: 2 }).state).toBe('HIDDEN');
    expect(getHomeBackfillNudge({ ...base, activeDates: ['2026-07-13', '2026-07-14', '2026-07-15', '2026-07-16'] }).state).toBe('HIDDEN');
    expect(getHomeBackfillNudge({ ...base, freezeDates: new Set(['2026-07-13']) }).pendingDates).not.toContain('2026-07-13');
  });

  it('promises a reconnected streak only when every broken day is eligible', () => {
    expect(getHomeBackfillNudge({ ...base, activeDates: ['2026-07-13', '2026-07-14'] }).reconnectable).toBe(true);
    expect(getHomeBackfillNudge(base).reconnectable).toBe(false);
  });
});
