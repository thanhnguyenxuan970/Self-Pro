export type LinkedThreshold = { minDuration: number | null; minCount: number | null };

/** Clamps a user-supplied threshold to a sane bound (>= 1). A negative or
 *  zero min_duration/min_count would silently defeat the threshold -- every
 *  log would "complete" the day regardless of how little was actually done. */
export function clampThreshold(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value) || value < 1) return null;
  return Math.floor(value);
}

export type ActivityLogRow = { localDate: string; durationMin: number | null };

/**
 * Derives which local_dates count as "done" for a linked challenge from raw
 * activity_log rows, applying min_duration/min_count thresholds. Query-time
 * only -- a linked challenge has no persisted challenge_log/challenge_days
 * write for its completion; editing or deleting a past activity_log row
 * changes the derived result on the next read, by construction (there is no
 * separate source of truth to fall out of sync with).
 */
export function deriveLinkedDoneDates(
  rows: ActivityLogRow[],
  threshold: LinkedThreshold,
  startDate: string,
): string[] {
  const byDate = new Map<string, ActivityLogRow[]>();
  for (const row of rows) {
    if (row.localDate < startDate) continue; // only count logs from start_date forward
    if (!byDate.has(row.localDate)) byDate.set(row.localDate, []);
    byDate.get(row.localDate)!.push(row);
  }

  const minDuration = clampThreshold(threshold.minDuration);
  const minCount = clampThreshold(threshold.minCount);
  const doneDates: string[] = [];

  for (const [date, dayRows] of byDate) {
    const countOk = minCount == null || dayRows.length >= minCount;
    const durationOk = minDuration == null || dayRows.some(r => (r.durationMin ?? 0) >= minDuration);
    if (countOk && durationOk) doneDates.push(date);
  }

  const sorted = doneDates.sort();
  if (typeof __DEV__ !== 'undefined' && __DEV__ && sorted.length === 0 && rows.length > 0) {
    // eslint-disable-next-line no-console
    console.warn('[challengeLinked] deriveLinkedDoneDates: logs exist but zero days qualify', {
      totalRows: rows.length, minDuration, minCount, startDate,
    });
  }
  return sorted;
}
