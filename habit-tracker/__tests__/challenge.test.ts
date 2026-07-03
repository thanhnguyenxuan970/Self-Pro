import { challengeDate, completeChallenge, currentDay, currentDayIndex, computeProgress, computeRollover, dateRange, isComplete, logToday, progress, restart, type Challenge } from '../src/lib/challenge';

const challenge: Challenge = {
  id: 4, name: 'Read', taskType: null, targetDays: 7, startDate: '2026-06-17',
  status: 'active', freezesLeft: 1, log: [{ date: '2026-06-17', state: 'done' }],
};

describe('ICT challenge clock', () => {
  it('rolls to the next day at midnight in Ho Chi Minh City', () => {
    expect(challengeDate(new Date('2026-06-17T16:59:59Z'))).toBe('2026-06-17');
    expect(challengeDate(new Date('2026-06-17T17:00:00Z'))).toBe('2026-06-18');
    expect(currentDay(challenge, new Date('2026-06-18T05:00:00Z'))).toBe(1);
  });
});

it('derives progress and a clean restart from a challenge', () => {
  expect(progress(challenge)).toEqual({ fraction: 1 / 7, daysLeft: 6 });
  expect(restart({ ...challenge, status: 'failed' }, '2026-07-01')).toMatchObject({
    id: 0, status: 'active', startDate: '2026-07-01', freezesLeft: 1, log: [],
  });
});

it('logs once and completes with a celebration reward at the target', () => {
  const nearlyDone = { ...challenge, targetDays: 2 };
  const done = logToday(nearlyDone, '2026-06-18');
  expect(done.status).toBe('done');
  expect(logToday(done, '2026-06-18').log).toHaveLength(2);
  expect(completeChallenge(done)).toMatchObject({ celebrate: true, reward: 'completion' });
});

describe('dateRange', () => {
  it('inclusive range, single day', () => {
    expect(dateRange('2026-06-17', '2026-06-17')).toEqual(['2026-06-17']);
  });
  it('spans a leap day (2028 is a leap year)', () => {
    const range = dateRange('2028-02-27', '2028-03-01');
    expect(range).toEqual(['2028-02-27', '2028-02-28', '2028-02-29', '2028-03-01']);
  });
});

describe('currentDayIndex', () => {
  it('day 0 on start date', () => {
    expect(currentDayIndex('2026-06-17', '2026-06-17')).toBe(0);
  });
  it('day N after N days', () => {
    expect(currentDayIndex('2026-06-17', '2026-06-24')).toBe(7);
  });
});

describe('computeProgress', () => {
  it('caps fraction at 1 even if daysDone exceeds targetDays', () => {
    expect(computeProgress(10, 7)).toEqual({ fraction: 1, daysLeft: 0 });
  });
  it('computes partial progress', () => {
    expect(computeProgress(3, 21)).toEqual({ fraction: 3 / 21, daysLeft: 18 });
  });
});

describe('isComplete', () => {
  it('true when daysDone meets targetDays', () => {
    expect(isComplete(7, 7)).toBe(true);
  });
  it('false when short', () => {
    expect(isComplete(6, 7)).toBe(false);
  });
});

describe('computeRollover', () => {
  it('no gap when today is the start date', () => {
    const result = computeRollover({
      startDate: '2026-06-17',
      today: '2026-06-17',
      loggedDates: new Set(),
      freezesLeft: 1,
    });
    expect(result).toEqual({ fillDays: [], freezesLeft: 1, failed: false });
  });

  it('no gap when every prior day is logged', () => {
    const result = computeRollover({
      startDate: '2026-06-17',
      today: '2026-06-19',
      loggedDates: new Set(['2026-06-17', '2026-06-18']),
      freezesLeft: 1,
    });
    expect(result).toEqual({ fillDays: [], freezesLeft: 1, failed: false });
  });

  it('consumes a freeze for a single-day gap', () => {
    const result = computeRollover({
      startDate: '2026-06-17',
      today: '2026-06-19',
      loggedDates: new Set(['2026-06-17']),
      freezesLeft: 1,
    });
    expect(result).toEqual({
      fillDays: [{ date: '2026-06-18', state: 'freeze' }],
      freezesLeft: 0,
      failed: false,
    });
  });

  it('fails immediately on a gap with zero freezes left', () => {
    const result = computeRollover({
      startDate: '2026-06-17',
      today: '2026-06-19',
      loggedDates: new Set(['2026-06-17']),
      freezesLeft: 0,
    });
    expect(result).toEqual({
      fillDays: [{ date: '2026-06-18', state: 'reset' }],
      freezesLeft: 0,
      failed: true,
      failDate: '2026-06-18',
    });
  });

  it('a multi-day gap exceeding freeze count fails on the first uncovered day', () => {
    const result = computeRollover({
      startDate: '2026-06-17',
      today: '2026-06-21',
      loggedDates: new Set(['2026-06-17']),
      freezesLeft: 1,
    });
    expect(result).toEqual({
      fillDays: [
        { date: '2026-06-18', state: 'freeze' },
        { date: '2026-06-19', state: 'reset' },
      ],
      freezesLeft: 0,
      failed: true,
      failDate: '2026-06-19',
    });
  });

  it('a backfilled day (present in loggedDates with any state) is treated as covered, not a gap', () => {
    // Backfilled days do not earn challenge credit at the write layer, but if the
    // caller still records them in challenge_log (e.g. state: 'reset' explicitly
    // excluded), they must not be silently re-evaluated as a fresh gap here.
    const result = computeRollover({
      startDate: '2026-06-17',
      today: '2026-06-19',
      loggedDates: new Set(['2026-06-17', '2026-06-18']),
      freezesLeft: 0,
    });
    expect(result.failed).toBe(false);
    expect(result.fillDays).toEqual([]);
  });
});
