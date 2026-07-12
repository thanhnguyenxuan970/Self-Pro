export function shouldShowWeekResetToast(
  currentWeekStart: string,
  lastSeenWeekStart: string | null
): boolean {
  return lastSeenWeekStart !== currentWeekStart;
}

export function getTimeUntilWeeklyReset(now = new Date()) {
  const reset = new Date(now);
  const daysUntilMonday = now.getDay() === 0 ? 1 : now.getDay() === 1 ? 7 : 8 - now.getDay();
  reset.setDate(now.getDate() + daysUntilMonday);
  reset.setHours(0, 0, 0, 0);
  const minutes = Math.max(0, Math.floor((reset.getTime() - now.getTime()) / 60_000));
  return { days: Math.floor(minutes / 1_440), hours: Math.floor(minutes / 60) % 24, minutes: minutes % 60 };
}
