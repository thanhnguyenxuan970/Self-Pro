import {
  computeLogTaskRows,
  ComputeInput,
} from '../src/logic/logTask';

const baseGoodTask: ComputeInput = {
  userId: 1,
  taskTypeId: 1,
  kind: 'GOOD',
  isTimeBased: false,
  basePoints: 10,
  starPenalty: 50,
  durationMin: undefined,
  currentDayPoints: 0,
  bonusAlreadyAwarded: false,
  loggedAt: new Date('2025-05-27T10:00:00Z'),
  localDate: '2025-05-27',
  weekStart: '2025-05-26',
};

test('GOOD non-time task: base_points=10, stars_delta=+1', () => {
  const result = computeLogTaskRows(baseGoodTask);
  expect(result.activityRow.points_earned).toBe(10);
  expect(result.activityRow.stars_delta).toBe(1);
  expect(result.activityRow.source).toBe('TASK');
  expect(result.bonusRow).toBeNull();
});

test('GOOD time-based task 60min: points=2', () => {
  const result = computeLogTaskRows({
    ...baseGoodTask,
    isTimeBased: true,
    durationMin: 60,
  });
  expect(result.activityRow.points_earned).toBe(2);
});

test('GOOD time-based task 15min: min 1 point', () => {
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

test('GOOD task pushes day over 50pts: bonus row created', () => {
  const result = computeLogTaskRows({
    ...baseGoodTask,
    currentDayPoints: 45,
    bonusAlreadyAwarded: false,
  });
  expect(result.bonusRow).not.toBeNull();
  expect(result.bonusRow!.source).toBe('DAILY_BONUS');
  expect(result.bonusRow!.stars_delta).toBe(1);
});

test('Bonus not awarded twice in same day', () => {
  const result = computeLogTaskRows({
    ...baseGoodTask,
    currentDayPoints: 45,
    bonusAlreadyAwarded: true,
  });
  expect(result.bonusRow).toBeNull();
});

test('bonus fires at exact threshold: currentDayPoints=40 + basePoints=10 = 50', () => {
  const result = computeLogTaskRows({
    ...baseGoodTask,
    currentDayPoints: 40,
    bonusAlreadyAwarded: false,
    basePoints: 10,
  });
  expect(result.bonusRow).not.toBeNull();
  expect(result.bonusRow!.stars_delta).toBe(1);
});

test('BAD task never triggers bonus regardless of day points', () => {
  const result = computeLogTaskRows({
    ...baseGoodTask,
    kind: 'BAD',
    currentDayPoints: 100,
    bonusAlreadyAwarded: false,
  });
  expect(result.bonusRow).toBeNull();
});
