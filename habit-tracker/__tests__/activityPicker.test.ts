import { activityGroup, activityMatches, activityPinAccessibilityLabel, buildPresetTaskLogParams, findPresetTask, normalizeActivityName, resolvePresetTask } from '../src/utils/activityPicker';

describe('activity picker matching', () => {
  test('matches Vietnamese names without accents or casing', () => {
    expect(normalizeActivityName('Đá bóng')).toBe('da bong');
    expect(activityMatches({ name: 'Chạy bộ' }, 'CHAY BO')).toBe(true);
  });

  test('infers a useful group for a custom activity', () => {
    expect(activityGroup('Chạy bộ buổi sáng')).toBe('Vận động');
  });

  test('names the task when announcing the pin action', () => {
    expect(activityPinAccessibilityLabel('Pin', 'Read')).toBe('Pin: Read');
  });
});

describe('findPresetTask', () => {
  const tasks = [
    { id: 1, name: 'Chạy bộ' },
    { id: 2, name: 'Đọc sách' },
  ];

  test('resolves a preset name to its existing task regardless of accents/casing', () => {
    expect(findPresetTask(tasks, 'chay bo')).toEqual(tasks[0]);
    expect(findPresetTask(tasks, 'DOC SACH')).toEqual(tasks[1]);
  });

  test('returns null when no task matches the preset name', () => {
    expect(findPresetTask(tasks, 'Bơi lội')).toBeNull();
  });
});

describe('resolvePresetTask', () => {
  // Two distinct tasks whose names collide once normalized (accents/case
  // stripped) -- the exact scenario a name-only lookup gets wrong.
  const collidingTasks = [
    { id: 2, name: 'doc sach' }, // more recently used -> sorts first
    { id: 1, name: 'Đọc sách' }, // the challenge's actual linked task
  ];

  test('prefers the exact task id over a name match when both are given', () => {
    expect(resolvePresetTask(collidingTasks, 'Đọc sách', 1)).toEqual(collidingTasks[1]);
  });

  test('falls back to name matching when no id is given', () => {
    // Documents the known ambiguity: without an id, the first normalized
    // match wins, which may not be the task the caller intended.
    expect(resolvePresetTask(collidingTasks, 'Đọc sách', null)).toEqual(collidingTasks[0]);
    expect(resolvePresetTask(collidingTasks, 'Đọc sách')).toEqual(collidingTasks[0]);
  });

  test('returns null when the given id does not match any task', () => {
    expect(resolvePresetTask(collidingTasks, 'Đọc sách', 999)).toBeNull();
  });
});

describe('buildPresetTaskLogParams', () => {
  test('builds an instant log for a linked challenge preset without changing task settings', () => {
    expect(buildPresetTaskLogParams({
      id: 16,
      kind: 'GOOD',
      base_points: 5,
      star_penalty: 0,
    })).toEqual({
      taskTypeId: 16,
      kind: 'GOOD',
      isTimeBased: false,
      basePoints: 5,
      starPenalty: 0,
    });
  });
});
