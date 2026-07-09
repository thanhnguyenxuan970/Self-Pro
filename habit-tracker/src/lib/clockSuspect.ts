// A row whose client-supplied logged_at is more than this far behind
// Supabase's server-assigned created_at gets flagged is_clock_suspect --
// kept deliberately tight (not "however long the device was offline") since
// the whole point is catching a rolled-back clock, not normal sync latency.
// This is a detection net, not a full clock-authority system: it can't tell
// "clock rolled back" apart from "genuinely offline this long" and accepts
// that false-positive risk (see db/migrations.ts v18 and TODOS.md).
export const CLOCK_SUSPECT_TOLERANCE_MS = 15 * 60 * 1000;

/** Pure predicate: which local_ids from a Supabase upsert response are
 *  clock-suspect (client logged_at implausibly earlier than the server's
 *  created_at). Isolated from the DB write and the Supabase client so it's
 *  testable without mocking expo-sqlite/async-storage/supabase. */
export function selectClockSuspectLocalIds(upserted: Record<string, unknown>[]): number[] {
  const suspectLocalIds: number[] = [];
  for (const row of upserted) {
    const localId = row.local_id;
    const createdAt = row.created_at;
    const loggedAt = row.logged_at;
    if (typeof localId !== 'number' || typeof createdAt !== 'string' || typeof loggedAt !== 'number') continue;
    const createdAtMs = Date.parse(createdAt);
    if (Number.isNaN(createdAtMs)) continue;
    if (createdAtMs - loggedAt > CLOCK_SUSPECT_TOLERANCE_MS) suspectLocalIds.push(localId);
  }
  return suspectLocalIds;
}
