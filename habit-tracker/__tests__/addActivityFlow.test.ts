import { resolveExistingActivityFlow } from '../src/utils/addActivityFlow';

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
