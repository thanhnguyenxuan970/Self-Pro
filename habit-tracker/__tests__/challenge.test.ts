const nodeRequire = require as unknown as {
  (moduleName: string): unknown;
  resolve(moduleName: string): string;
};
const { execFileSync } = nodeRequire('child_process') as {
  execFileSync: (file: string, args: string[], options: {
    cwd: string;
    env: Record<string, string | undefined>;
    stdio: 'pipe';
  }) => void;
};
const jestPackagePath = nodeRequire.resolve('jest/package.json');
const challengeTestPath = nodeRequire.resolve('./challenge.test.ts');
const appRoot = jestPackagePath.replace(/[\\/]node_modules[\\/]jest[\\/]package\.json$/, '');
const jestCliPath = `${appRoot}/node_modules/jest/bin/jest.js`;

import { challengeDate, challengeStreak, completeChallenge, currentDay, currentDayIndex, computeProgress, computeRollover, dateRange, dayCellStates, GRID_CELL_COUNT, isAtRisk, isComplete, logToday, progress, restart, type Challenge, type DayEntry } from '../src/lib/challenge';
import { CHALLENGE_DURATIONS, CHALLENGE_NAME_MAX_LENGTH, challengeCompletionStars, isValidCustomChallengeValue } from '../src/config/challenges.config';
import { canRequestChallengeDelete, challengeDeletePrompt, challengeDetailMenuActions, deleteChallengeAndExit } from '../src/utils/challengeDetail';
import { challengeHubViewState } from '../src/utils/challengeHub';
import { getLocalDateFor } from '../src/utils/formatters';

const challenge: Challenge = {
  id: 4, name: 'Read', taskType: null, targetDays: 7, startDate: '2026-06-17',
  status: 'active', freezesLeft: 1, log: [{ date: '2026-06-17', state: 'done' }],
};

describe('challenge hub view state', () => {
  it('keeps a history-only user out of the blank first-run state', () => {
    expect(challengeHubViewState(false, 0)).toBe('empty');
    expect(challengeHubViewState(false, 1)).toBe('history-only');
    expect(challengeHubViewState(true, 1)).toBe('active');
  });
});

describe('challenge detail menu', () => {
  it('exposes both rename and delete for an active challenge', () => {
    expect(challengeDetailMenuActions('active')).toEqual(['rename', 'delete']);
  });

  it('keeps terminal challenge actions out of the active-only menu', () => {
    expect(challengeDetailMenuActions('done')).toEqual([]);
    expect(challengeDetailMenuActions('failed')).toEqual([]);
  });

  it('blocks delete requests without an id or while a deletion is pending', () => {
    expect(canRequestChallengeDelete(null, false)).toBe(false);
    expect(canRequestChallengeDelete(42, true)).toBe(false);
    expect(canRequestChallengeDelete(42, false)).toBe(true);
  });

  it('builds a cancel-safe destructive confirmation prompt', () => {
    const onConfirm = jest.fn();
    const prompt = challengeDeletePrompt(
      { title: 'Delete?', message: 'This cannot be undone.', cancel: 'Cancel', delete: 'Delete' },
      onConfirm,
    );

    expect(prompt).toMatchObject({
      title: 'Delete?',
      message: 'This cannot be undone.',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive' },
      ],
    });
    expect(prompt.buttons[0].onPress).toBeUndefined();
    prompt.buttons[1].onPress?.();
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('deletes then exits, and stays on screen with an error when deletion fails', async () => {
    const navigateBack = jest.fn();
    const showError = jest.fn();
    const deleteChallenge = jest.fn().mockResolvedValue(undefined);

    await deleteChallengeAndExit(42, deleteChallenge, navigateBack, showError);
    expect(deleteChallenge).toHaveBeenCalledWith(42);
    expect(navigateBack).toHaveBeenCalledTimes(1);
    expect(showError).not.toHaveBeenCalled();

    deleteChallenge.mockRejectedValueOnce(new Error('DB_BUSY'));
    navigateBack.mockClear();
    await deleteChallengeAndExit(42, deleteChallenge, navigateBack, showError);
    expect(navigateBack).not.toHaveBeenCalled();
    expect(showError).toHaveBeenCalledTimes(1);

    showError.mockClear();
    navigateBack.mockImplementationOnce(() => { throw new Error('NO_BACK_ROUTE'); });
    await deleteChallengeAndExit(42, deleteChallenge, navigateBack, showError);
    expect(showError).not.toHaveBeenCalled();
  });
});

describe('device-local challenge clock', () => {
  it('uses the same device-local date as activity_log', () => {
    const instant = new Date('2026-06-17T16:59:59Z');
    expect(challengeDate(instant)).toBe(getLocalDateFor(instant));
  });

  it('keeps the user date at a non-ICT evening boundary', () => {
    if (process.env.HABI_TIMEZONE_TEST_CHILD !== '1') {
      // Jest has already initialized the host timezone, so start a child
      // process under Europe/London to exercise real device-local getters.
      execFileSync(process.execPath, [
        jestCliPath,
        '--runInBand',
        '--runTestsByPath',
        challengeTestPath,
        '--testNamePattern',
        'keeps the user date at a non-ICT evening boundary',
      ], {
        cwd: appRoot,
        env: { ...process.env, TZ: 'Europe/London', HABI_TIMEZONE_TEST_CHILD: '1' },
        stdio: 'pipe',
      });
      return;
    }

    const summerInstant = new Date('2026-08-23T17:30:00Z');
    const winterInstant = new Date('2026-12-20T23:30:00Z');

    // London is still on 2026-08-23 while ICT has already crossed into
    // 2026-08-24, so a hardcoded ICT implementation must fail this test.
    expect(challengeDate(summerInstant)).toBe('2026-08-23');
    expect(currentDay(challenge, summerInstant)).toBe(
      currentDayIndex(challenge.startDate, '2026-08-23'),
    );

    // Repeat the boundary in winter to cover London's DST offset change.
    expect(challengeDate(winterInstant)).toBe('2026-12-20');
  });

  it('uses the device-local date consistently for current-day arithmetic', () => {
    const instant = new Date('2026-06-18T05:00:00Z');
    expect(currentDay(challenge, instant)).toBe(
      currentDayIndex(challenge.startDate, getLocalDateFor(instant)),
    );
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

  it.each([
    [180, 180, 1, 0],
    [179, 180, 179 / 180, 1],
    [30, 30, 1, 0],
    [364, 365, 364 / 365, 1],
    [7, 7, 1, 0],
    [2, 30, 2 / 30, 28],
  ])('keeps end-state boundary %i/%i exact', (done, target, fraction, daysLeft) => {
    expect(computeProgress(done, target)).toEqual({ fraction, daysLeft });
    expect(isComplete(done, target)).toBe(done >= target);
  });
});

describe('challengeCompletionStars', () => {
  it('keeps the create-form boundaries aligned with the supported short challenge', () => {
    expect(CHALLENGE_DURATIONS).toEqual([7, 30, 60, 100]);
    expect(CHALLENGE_NAME_MAX_LENGTH).toBe(72);
  });

  it('uses the new fixed reward tiers for 30, 60, and 100-day challenges', () => {
    expect(challengeCompletionStars(30)).toBe(30);
    expect(challengeCompletionStars(60)).toBe(120);
    expect(challengeCompletionStars(100)).toBe(300);
  });

  it('keeps legacy rewards stable for older challenge durations', () => {
    expect(challengeCompletionStars(7)).toBe(1);
    expect(challengeCompletionStars(21)).toBe(3);
    expect(challengeCompletionStars(66)).toBe(9);
  });

  it('calculates a preview reward for a custom long duration', () => {
    expect(challengeCompletionStars(365)).toBe(1460);
  });

  it.each([
    [7, 'days', true], [365, 'days', true], [6, 'days', false], [366, 'days', false],
    [2, 'weeks', true], [52, 'weeks', true], [1, 'weeks', false], [53, 'weeks', false],
  ] as const)('validates custom %s %s: %s', (value, field, expected) => {
    expect(isValidCustomChallengeValue(value, field)).toBe(expected);
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

describe('challengeStreak', () => {
  const day = (date: string, state: DayEntry['state']): DayEntry => ({ date, state });

  it('empty log → 0', () => {
    expect(challengeStreak([])).toBe(0);
  });
  it('all done → streak equals log length', () => {
    expect(challengeStreak([
      day('2026-06-17', 'done'), day('2026-06-18', 'done'), day('2026-06-19', 'done'),
    ])).toBe(3);
  });
  it('freeze days count toward the streak like done days', () => {
    expect(challengeStreak([
      day('2026-06-17', 'done'), day('2026-06-18', 'freeze'), day('2026-06-19', 'done'),
    ])).toBe(3);
  });
  it('a reset day stops the streak count immediately (not counted itself)', () => {
    expect(challengeStreak([
      day('2026-06-17', 'done'), day('2026-06-18', 'reset'), day('2026-06-19', 'done'), day('2026-06-20', 'done'),
    ])).toBe(2);
  });
  it('trailing reset with nothing after it → 0', () => {
    expect(challengeStreak([
      day('2026-06-17', 'done'), day('2026-06-18', 'reset'),
    ])).toBe(0);
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

describe('isAtRisk', () => {
  it('a streak challenge with no freezes left is at risk', () => {
    expect(isAtRisk('streak', 0)).toBe(true);
  });
  it('a streak challenge with a freeze in reserve is not at risk', () => {
    expect(isAtRisk('streak', 1)).toBe(false);
  });
  it('a weekly challenge is never at risk, even at zero freezes (it has no freeze concept)', () => {
    expect(isAtRisk('weekly', 0)).toBe(false);
  });
});

describe('dayCellStates', () => {
  const day = (date: string, state: DayEntry['state']): DayEntry => ({ date, state });

  it('a short run (< 30 days) windows to the whole run, padding the tail with future cells', () => {
    const cells = dayCellStates('2026-06-17', 7, [
      day('2026-06-17', 'done'), day('2026-06-18', 'done'), day('2026-06-19', 'done'),
    ], '2026-06-20');
    expect(cells).toHaveLength(GRID_CELL_COUNT);
    expect(cells.slice(0, 7)).toEqual([
      { label: 1, state: 'done' }, { label: 2, state: 'done' }, { label: 3, state: 'done' },
      { label: 4, state: 'today' }, { label: 5, state: 'future' }, { label: 6, state: 'future' }, { label: 7, state: 'future' },
    ]);
    expect(cells[7]).toEqual({ label: 8, state: 'future' });
    expect(cells[29]).toEqual({ label: 30, state: 'future' });
  });

  it('a run past 30 days windows to the last 30, with the day numeral carrying the absolute position', () => {
    // day index 50 into a 100-day challenge started 2026-01-01 lands on 2026-02-20.
    const cells = dayCellStates('2026-01-01', 100, [], '2026-02-20');
    expect(cells).toHaveLength(GRID_CELL_COUNT);
    expect(cells[0]).toEqual({ label: 22, state: 'reset' });
    expect(cells[29]).toEqual({ label: 51, state: 'today' });
  });

  it('freeze days windows correctly next to done and reset days', () => {
    const cells = dayCellStates('2026-06-17', 7, [
      day('2026-06-17', 'done'), day('2026-06-18', 'freeze'), day('2026-06-19', 'done'),
    ], '2026-06-21');
    expect(cells.slice(0, 5)).toEqual([
      { label: 1, state: 'done' }, { label: 2, state: 'freeze' }, { label: 3, state: 'done' },
      { label: 4, state: 'reset' }, { label: 5, state: 'today' },
    ]);
  });
});
