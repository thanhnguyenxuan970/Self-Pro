export function shouldShowWeekResetToast(
  currentWeekStart: string,
  lastSeenWeekStart: string | null
): boolean {
  return lastSeenWeekStart !== currentWeekStart;
}
