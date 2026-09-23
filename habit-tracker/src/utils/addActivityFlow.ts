import { PickerTask, resolvePresetTask } from './activityPicker';

/**
 * Choosing an existing habit in the global Add Activity sheet means “log it”,
 * not “upsert it again”. A parent-owned sheet (Backfill) receives the choice
 * instead. The saved task configuration is authoritative: a timed task always
 * requires the user's duration input, even when the user taps “No timer”.
 */
export type ExistingActivityFlow = 'quick-log' | 'duration' | null;

/**
 * A challenge preset is an instruction to log one already-existing task.  It
 * must not be treated as a name for a task that may be created while the
 * picker query is incomplete.  Keep this state machine outside the sheet so
 * the UI and its action guard share one, testable definition.
 */
export type PresetTaskResolution =
  | { status: 'none' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'not-found' }
  | { status: 'resolved'; task: PickerTask };

export function resolvePresetTaskResolution({
  hasPreset,
  isFetching,
  isError,
  tasks,
  presetName,
  presetTaskId,
}: {
  hasPreset: boolean;
  isFetching: boolean;
  isError: boolean;
  tasks: PickerTask[];
  presetName: string | null | undefined;
  presetTaskId?: number | null;
}): PresetTaskResolution {
  if (!hasPreset) return { status: 'none' };
  // A refetch can retain an old task list. Do not let that stale list identify
  // a task for the currently opened preset.
  if (isFetching) return { status: 'loading' };
  if (isError) return { status: 'error' };

  const task = resolvePresetTask(tasks, presetName ?? '', presetTaskId);
  return task ? { status: 'resolved', task } : { status: 'not-found' };
}

export function isPresetTaskActionBlocked(resolution: PresetTaskResolution): boolean {
  return resolution.status !== 'none' && resolution.status !== 'resolved';
}

/** A resolved preset always logs its existing task; it never enters task creation. */
export function resolveChallengePresetActivityFlow(
  resolution: PresetTaskResolution,
  requestedTimeBased: boolean,
): 'blocked' | 'quick-log' | 'duration' {
  if (resolution.status !== 'resolved') return 'blocked';
  return resolution.task.is_time_based === 1 || requestedTimeBased ? 'duration' : 'quick-log';
}

export function resolveExistingActivityFlow({
  hasExistingTask,
  isExistingTaskTimeBased,
  requestedTimeBased,
  hasActivityAddedHandler,
}: {
  hasExistingTask: boolean;
  isExistingTaskTimeBased: boolean;
  requestedTimeBased: boolean;
  hasActivityAddedHandler: boolean;
}): ExistingActivityFlow {
  if (!hasExistingTask || hasActivityAddedHandler) return null;
  return isExistingTaskTimeBased || requestedTimeBased ? 'duration' : 'quick-log';
}
