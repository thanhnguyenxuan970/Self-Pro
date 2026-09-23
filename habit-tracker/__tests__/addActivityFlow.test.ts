import { isPresetTaskActionBlocked, resolveExistingActivityFlow, resolvePresetTaskResolution } from '../src/utils/addActivityFlow';
import { PickerTask } from '../src/utils/activityPicker';

const pickerTask = (id: number, name = 'Read'): PickerTask => ({
  id, name, kind: 'GOOD', icon: null, is_time_based: 0, base_points: 5,
  star_penalty: 0, archived: 0, is_pinned: 0, is_template: 0, last_used_date: null,
});

describe('resolveExistingActivityFlow', () => {
  it('logs a selected non-timed existing habit in the standalone sheet', () => {
    expect(resolveExistingActivityFlow({
      hasExistingTask: true,
      isExistingTaskTimeBased: false,
      requestedTimeBased: false,
      hasActivityAddedHandler: false,
    })).toBe('quick-log');
  });

  it.each([
    { hasExistingTask: true, isExistingTaskTimeBased: true, requestedTimeBased: false, hasActivityAddedHandler: false },
    { hasExistingTask: true, isExistingTaskTimeBased: false, requestedTimeBased: true, hasActivityAddedHandler: false },
  ])('requires duration when the saved task or the user-selected action is timed: %o', input => {
    expect(resolveExistingActivityFlow(input)).toBe('duration');
  });

  it.each([
    { hasExistingTask: false, isExistingTaskTimeBased: false, requestedTimeBased: false, hasActivityAddedHandler: false },
    { hasExistingTask: true, isExistingTaskTimeBased: false, requestedTimeBased: false, hasActivityAddedHandler: true },
  ])('leaves creation and parent-owned flows unchanged: %o', input => {
    expect(resolveExistingActivityFlow(input)).toBeNull();
  });
});

describe('resolvePresetTaskResolution', () => {
  it('blocks both create and log actions until the initial picker query resolves', () => {
    const resolution = resolvePresetTaskResolution({
      hasPreset: true, isFetching: true, isError: false, tasks: [], presetName: 'Read', presetTaskId: 7,
    });
    expect(resolution).toEqual({ status: 'loading' });
    expect(isPresetTaskActionBlocked(resolution)).toBe(true);
  });

  it('uses the verified preset id, not a same-name task, once the query resolves', () => {
    const matchingId = pickerTask(7, 'Read');
    const resolution = resolvePresetTaskResolution({
      hasPreset: true, isFetching: false, isError: false,
      tasks: [pickerTask(3, 'Read'), matchingId], presetName: 'Read', presetTaskId: 7,
    });
    expect(resolution).toEqual({ status: 'resolved', task: matchingId });
    expect(isPresetTaskActionBlocked(resolution)).toBe(false);
  });

  it.each([
    { isFetching: false, isError: true, tasks: [pickerTask(7)], expected: 'error' },
    { isFetching: false, isError: false, tasks: [pickerTask(3)], expected: 'not-found' },
  ])('blocks creation rather than falling back when the preset is $expected', ({ isFetching, isError, tasks, expected }) => {
    const resolution = resolvePresetTaskResolution({
      hasPreset: true, isFetching, isError, tasks, presetName: 'Read', presetTaskId: 7,
    });
    expect(resolution.status).toBe(expected);
    expect(isPresetTaskActionBlocked(resolution)).toBe(true);
  });

  it('does not reuse an old task when a new preset id is loading or absent', () => {
    const loading = resolvePresetTaskResolution({
      hasPreset: true, isFetching: true, isError: false, tasks: [pickerTask(7)], presetName: 'Run', presetTaskId: 8,
    });
    const absent = resolvePresetTaskResolution({
      hasPreset: true, isFetching: false, isError: false, tasks: [pickerTask(7)], presetName: 'Run', presetTaskId: 8,
    });
    expect(loading.status).toBe('loading');
    expect(absent.status).toBe('not-found');
    expect(isPresetTaskActionBlocked(loading)).toBe(true);
    expect(isPresetTaskActionBlocked(absent)).toBe(true);
  });
});
