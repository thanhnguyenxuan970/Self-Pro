import {
  weekWindows, currentWeekWindow, weekSessionsDone, computePace, computeWeeklyRollover,
  perfectWeekCount, isOverachieverWeek,
} from '../src/lib/challengeWeekly';
import { computeChallengeReward, weeklyChallengeCompletionStars } from '../src/config/challenges.config';

// Challenge created Wed 2026-07-08 -> week 1 is the partial calendar week
// (Wed-Sun), week 2+ are full Mon-Sun windows.
const START = '2026-07-08';

describe('weekWindows', () => {
  it('week 1 is a partial calendar week (creation day -> following Sunday)', () => {
    const windows = weekWindows(START, 3);
    expect(windows).toEqual([
      { weekIndex: 1, start: '2026-07-08', end: '2026-07-12' },
      { weekIndex: 2, start: '2026-07-13', end: '2026-07-19' },
      { weekIndex: 3, start: '2026-07-20', end: '2026-07-26' },
    ]);
  });

  it('a challenge created on a Monday has a full-length week 1', () => {
    const windows = weekWindows('2026-07-13', 2);
    expect(windows[0]).toEqual({ weekIndex: 1, start: '2026-07-13', end: '2026-07-19' });
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
  const base = { startDate: START, totalWeeks: 3, weeklyTarget: 4, freezesLeft: 1 };

  it('does nothing while the current week is still in progress', () => {
    const result = computeWeeklyRollover({
      ...base, today: '2026-07-10', doneDates: new Set(['2026-07-08']), markedWeekEnds: new Set(),
    });
    expect(result.outcomes).toEqual([]);
    expect(result.fillWeeks).toEqual([]);
  });

  it('consumes a freeze on a missed week and keeps the challenge active', () => {
    const result = computeWeeklyRollover({
      ...base, today: '2026-07-13', doneDates: new Set(['2026-07-08']), markedWeekEnds: new Set(),
    });
    expect(result.outcomes).toEqual([{ weekIndex: 1, weekEnd: '2026-07-12', hit: false, sessionsDone: 1 }]);
    expect(result.fillWeeks).toEqual([{ weekEnd: '2026-07-12', state: 'freeze' }]);
    expect(result.freezesLeft).toBe(0);
    expect(result.failed).toBe(false);
  });

  it('fails the challenge on a second missed week with no freeze left', () => {
    const result = computeWeeklyRollover({
      ...base, freezesLeft: 0, today: '2026-07-13', doneDates: new Set(['2026-07-08']), markedWeekEnds: new Set(),
    });
    expect(result.failed).toBe(true);
    expect(result.failedAtWeek).toBe(1);
    expect(result.fillWeeks).toEqual([{ weekEnd: '2026-07-12', state: 'reset' }]);
  });

  it('is idempotent -- a week already marked is not re-processed on a later call', () => {
    const result = computeWeeklyRollover({
      ...base, today: '2026-07-20', doneDates: new Set(['2026-07-08']),
      markedWeekEnds: new Set(['2026-07-12']), // week 1's miss already recorded
    });
    // week 1 skipped (already marked); week 2 (07-13..07-19) is a fresh miss
    expect(result.fillWeeks).toEqual([{ weekEnd: '2026-07-19', state: 'freeze' }]);
    expect(result.freezesLeft).toBe(0);
  });

  it('marks the challenge done once every week has elapsed without failing', () => {
    const doneDates = new Set(['2026-07-08', '2026-07-09', '2026-07-10', '2026-07-11',
      '2026-07-13', '2026-07-14', '2026-07-15', '2026-07-16',
      '2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23']);
    const result = computeWeeklyRollover({ ...base, today: '2026-07-27', doneDates, markedWeekEnds: new Set() });
    expect(result.done).toBe(true);
    expect(result.failed).toBe(false);
    expect(perfectWeekCount(result.outcomes)).toBe(3);
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
