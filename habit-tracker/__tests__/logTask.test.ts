import {
  computeLogTaskRows,
  ComputeInput,
} from '../src/game/logTask';
import { dailyBonusGoal } from '../src/config/constants';

const baseGoodTask: ComputeInput = {
  userId: 1,
  taskTypeId: 1,
  kind: 'GOOD',
  isTimeBased: false,
  basePoints: 10,
  starPenalty: 50,
  durationMin: undefined,
  currentDayPoints: 0,
  bonusStarsAwarded: 0,
  loggedAt: new Date('2025-05-27T10:00:00Z'),
  localDate: '2025-05-27',
  weekStart: '2025-05-26',
};

test('GOOD non-time task: always earns 5 points and one star', () => {
  const result = computeLogTaskRows(baseGoodTask);
  expect(result.activityRow.points_earned).toBe(5);
  expect(result.activityRow.stars_delta).toBe(1);
  expect(result.activityRow.source).toBe('TASK');
  expect(result.bonusRow).toBeNull();
});

test('GOOD time-based task: 60 minutes earns two points and one star', () => {
  const result = computeLogTaskRows({
    ...baseGoodTask,
    isTimeBased: true,
    durationMin: 60,
  });
  expect(result.activityRow.points_earned).toBe(2);
  expect(result.activityRow.stars_delta).toBe(1);
});

test('time points round each partial 30-minute block up', () => {
  const pointsFor = (durationMin: number) => computeLogTaskRows({
    ...baseGoodTask, isTimeBased: true, durationMin,
  }).activityRow.points_earned;

  expect(pointsFor(30)).toBe(1);
  expect(pointsFor(40)).toBe(2);
  expect(pointsFor(60)).toBe(2);
  expect(pointsFor(61)).toBe(3);
});

test('time-based activity always earns one star regardless of duration', () => {
  const starsFor = (durationMin: number) => computeLogTaskRows({
    ...baseGoodTask, isTimeBased: true, durationMin,
  }).activityRow.stars_delta;

  expect(starsFor(15)).toBe(1);
  expect(starsFor(60)).toBe(1);
  expect(starsFor(156)).toBe(1);
});

test('GOOD time-based task 15min earns the minimum one point', () => {
  const result = computeLogTaskRows({
    ...baseGoodTask,
    isTimeBased: true,
    durationMin: 15,
  });
  expect(result.activityRow.points_earned).toBe(1);
});

test('BAD task: points=0, stars_delta=-star_penalty', () => {
  const result = computeLogTaskRows({ ...baseGoodTask, kind: 'BAD' });
  expect(result.activityRow.points_earned).toBe(0);
  expect(result.activityRow.stars_delta).toBe(-50);
  expect(result.bonusRow).toBeNull();
});

test('25 daily points awards one bonus star', () => {
  const result = computeLogTaskRows({
    ...baseGoodTask,
    currentDayPoints: 20,
    basePoints: 5,
  });
  expect(result.bonusRow).not.toBeNull();
  expect(result.bonusRow!.source).toBe('DAILY_BONUS');
  expect(result.bonusRow!.task_type_id).toBe(baseGoodTask.taskTypeId);
  expect(result.bonusRow!.stars_delta).toBe(1);
});

test('50 daily points adds two bonus stars after the 25-point reward', () => {
  const result = computeLogTaskRows({
    ...baseGoodTask,
    currentDayPoints: 45,
    basePoints: 10,
    bonusStarsAwarded: 1,
  });
  expect(result.bonusRow!.stars_delta).toBe(2);
});

test('bonus is not awarded twice after reaching 50 points', () => {
  const result = computeLogTaskRows({
    ...baseGoodTask,
    currentDayPoints: 50,
    bonusStarsAwarded: 3,
    basePoints: 10,
  });
  expect(result.bonusRow).toBeNull();
});

test('daily bonus goal changes from 25 to 50 at the first milestone', () => {
  expect(dailyBonusGoal(24)).toBe(25);
  expect(dailyBonusGoal(25)).toBe(50);
});

test('BAD task never triggers bonus regardless of day points', () => {
  const result = computeLogTaskRows({
    ...baseGoodTask,
    kind: 'BAD',
    currentDayPoints: 100,
    bonusStarsAwarded: 0,
  });
  expect(result.bonusRow).toBeNull();
});

test('boost multiplies GOOD task stars but never the daily bonus', () => {
  const result = computeLogTaskRows({
    ...baseGoodTask,
    currentDayPoints: 20,
    multiplier: 3,
  });

  expect(result.activityRow.stars_delta).toBe(3);
  expect(result.bonusRow?.stars_delta).toBe(1);
});

test('boost never changes BAD-log penalties', () => {
  const result = computeLogTaskRows({ ...baseGoodTask, kind: 'BAD', multiplier: 3 });
  expect(result.activityRow.stars_delta).toBe(-50);
});
