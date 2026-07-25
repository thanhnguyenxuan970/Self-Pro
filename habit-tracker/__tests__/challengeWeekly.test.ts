import {
  weekWindows, currentWeekWindow, weekSessionsDone, computePace, computeWeeklyRollover,
  perfectWeekCount, isOverachieverWeek,
} from '../src/lib/challengeWeekly';
import { computeChallengeReward, weeklyChallengeCompletionStars } from '../src/config/challenges.config';

// Challenge created Wed 2026-07-08 -> every week is a creation-anchored 7-day window.
const START = '2026-07-08';

describe('weekWindows', () => {
  it('starts every seven-day window on the creation-day offset', () => {
    const windows = weekWindows(START, 3);
    expect(windows).toEqual([
      { weekIndex: 1, start: '2026-07-08', end: '2026-07-14' },
      { weekIndex: 2, start: '2026-07-15', end: '2026-07-21' },
      { weekIndex: 3, start: '2026-07-22', end: '2026-07-28' },
    ]);
  });

  it('keeps a Saturday start instead of snapping to Monday', () => {
    const windows = weekWindows('2026-07-11', 2);
    expect(windows[0]).toEqual({ weekIndex: 1, start: '2026-07-11', end: '2026-07-17' });
  });
});

describe('currentWeekWindow', () => {
  it('finds the window containing today', () => {
    const windows = weekWindows(START, 3);
    expect(currentWeekWindow(START, 3, '2026-07-15')).toEqual(windows[1]);
  });

  it('returns null once past the last window', () => {
    expect(currentWeekWindow(START, 3, '2026-08-01')).toBeNull();
  });
});

describe('weekSessionsDone', () => {
  it('counts only dates within the window', () => {
    const done = new Set(['2026-07-08', '2026-07-11', '2026-07-13']);
    expect(weekSessionsDone(done, { start: '2026-07-08', end: '2026-07-12' })).toBe(2);
  });
});

describe('computePace', () => {
  it('is on_pace on day 1 with the full week ahead (the empty-state case)', () => {
    const result = computePace({ weeklyTarget: 4, sessionsDone: 0, today: '2026-07-08', weekEnd: '2026-07-12' });
    expect(result.state).toBe('on_pace');
  });

  it('is behind when every remaining day is now required (zero slack)', () => {
    // 2 sessions done, target 4 -> 2 remaining; today 07-11, weekEnd 07-12 -> 2 days remaining (11,12)
    const result = computePace({ weeklyTarget: 4, sessionsDone: 2, today: '2026-07-11', weekEnd: '2026-07-12' });
    expect(result).toEqual({ state: 'behind', sessionsRemaining: 2, daysRemaining: 2 });
  });

  it('is impossible once the quota can no longer be reached', () => {
    const result = computePace({ weeklyTarget: 4, sessionsDone: 0, today: '2026-07-12', weekEnd: '2026-07-12' });
    expect(result).toEqual({ state: 'impossible', sessionsRemaining: 4, daysRemaining: 1 });
  });
});

describe('computeWeeklyRollover', () => {
  const base = { startDate: START, totalWeeks: 3, weeklyTarget: 4 };

  it('does nothing while the current week is still in progress', () => {
    const result = computeWeeklyRollover({
      ...base, today: '2026-07-10', doneDates: new Set(['2026-07-08']),
    });
    expect(result.outcomes).toEqual([]);
    expect(result.fillWeeks).toEqual([]);
  });

  it('fails when the creation-anchored week misses its target', () => {
    const result = computeWeeklyRollover({
      ...base, today: '2026-07-15', doneDates: new Set(['2026-07-08']),
    });
    expect(result.outcomes).toEqual([{ weekIndex: 1, weekEnd: '2026-07-14', hit: false, sessionsDone: 1, sessionsRequired: 4 }]);
    expect(result.fillWeeks).toEqual([{ weekEnd: '2026-07-14', state: 'reset' }]);
    expect(result.failedAtWeek).toBe(1);
  });

  it('fails without evaluating a later window when week 1 did not pass', () => {
    const result = computeWeeklyRollover({
      ...base, today: '2026-07-22', doneDates: new Set(['2026-07-08']),
    });
    expect(result.failed).toBe(true);
    expect(result.failedAtWeek).toBe(1);
    expect(result.fillWeeks).toEqual([{ weekEnd: '2026-07-14', state: 'reset' }]);
  });

  it('marks the challenge done once every week has elapsed without failing', () => {
    const doneDates = new Set(['2026-07-08', '2026-07-09', '2026-07-10', '2026-07-11',
      '2026-07-15', '2026-07-16', '2026-07-17', '2026-07-18',
      '2026-07-22', '2026-07-23', '2026-07-24', '2026-07-25']);
    const result = computeWeeklyRollover({ ...base, today: '2026-07-29', doneDates });
    expect(result.done).toBe(true);
    expect(result.failed).toBe(false);
    expect(perfectWeekCount(result.outcomes)).toBe(3);
  });

  it('requires the cumulative target in week 2 after week 1 passes', () => {
    const result = computeWeeklyRollover({
      ...base,
      today: '2026-07-22',
      doneDates: new Set(['2026-07-08', '2026-07-09', '2026-07-10', '2026-07-11', '2026-07-15', '2026-07-16', '2026-07-17']),
    });
    expect(result.outcomes).toEqual([
      { weekIndex: 1, weekEnd: '2026-07-14', hit: true, sessionsDone: 4, sessionsRequired: 4 },
      { weekIndex: 2, weekEnd: '2026-07-21', hit: false, sessionsDone: 7, sessionsRequired: 8 },
    ]);
    expect(result.failedAtWeek).toBe(2);
  });
});

describe('isOverachieverWeek', () => {
  it('is true only when sessions exceed (not just meet) the target', () => {
    expect(isOverachieverWeek(4, 4)).toBe(false);
    expect(isOverachieverWeek(5, 4)).toBe(true);
  });
});

describe('computeChallengeReward', () => {
  it('uses the curated weekly table for a known combo', () => {
    expect(weeklyChallengeCompletionStars(4, 8)).toBe(80);
    expect(computeChallengeReward({ mode: 'weekly', weeklyTarget: 4, totalWeeks: 8 })).toEqual({ stars: 80 });
  });

  it('falls back to a formula for an out-of-table combo', () => {
    expect(weeklyChallengeCompletionStars(3, 3)).toBe(Math.floor((3 * 3) / 2));
  });

  it('matches the existing streak reward table', () => {
    expect(computeChallengeReward({ mode: 'streak', targetDays: 60 })).toEqual({ stars: 120 });
  });
});
