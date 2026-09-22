/**
 * Choosing an existing habit in the global Add Activity sheet means “log it”,
 * not “upsert it again”. A parent-owned sheet (Backfill) receives the choice
 * instead. The saved task configuration is authoritative: a timed task always
 * requires the user's duration input, even when the user taps “No timer”.
 */
export type ExistingActivityFlow = 'quick-log' | 'duration' | null;

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
