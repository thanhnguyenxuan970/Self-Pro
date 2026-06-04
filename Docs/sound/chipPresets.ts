// chipPresets.ts — personalized duration chips from a user's own history.
// Most-logged durations for an activity float to the front; falls back to
// sensible defaults when history is sparse. No ML — just a frequency query.

import { sql } from 'drizzle-orm';
import type { DB } from './db';            // your Drizzle instance type
import { formatDuration } from './points';

export interface Chip {
  minutes: number;          // 30, 60, 90...  | -1 = the "2h+" escape hatch
  label: string;            // "30m", "1h", "2h+"
  isEscapeHatch?: boolean;
}

const DEFAULT_MINUTES = [30, 60, 90];     // shown to brand-new users
const CHIP_SLOTS = 3;                     // visible chips before the escape hatch
const ESCAPE_HATCH: Chip = { minutes: -1, label: '2h+', isEscapeHatch: true };

/**
 * Top durations this user actually logs for this activity, ranked by
 * frequency then recency. Ties broken by most-recent use so habits that
 * shift over time stay current.
 */
export async function getChipPresets(
  db: DB,
  userId: number,
  taskTypeId: number,
): Promise<Chip[]> {
  const rows = await db.all<{ duration_min: number; freq: number }>(sql`
    SELECT duration_min, COUNT(*) AS freq
    FROM activity_log
    WHERE user_id = ${userId}
      AND task_type_id = ${taskTypeId}
      AND duration_min IS NOT NULL
    GROUP BY duration_min
    ORDER BY freq DESC, MAX(logged_at) DESC
    LIMIT ${CHIP_SLOTS}
  `);

  // Start from history; backfill with defaults the user hasn't "claimed" yet.
  const minutes = rows.map(r => r.duration_min);
  for (const d of DEFAULT_MINUTES) {
    if (minutes.length >= CHIP_SLOTS) break;
    if (!minutes.includes(d)) minutes.push(d);
  }

  const chips: Chip[] = minutes
    .slice(0, CHIP_SLOTS)
    .sort((a, b) => a - b)
    .map(m => ({ minutes: m, label: formatDuration(m) }));

  // If this user habitually goes long, the escape hatch graduates into a real
  // chip (e.g. a "3h" chip) so they don't pay the extra tap every time.
  const hasLongHabit = minutes.some(m => m > 120);
  if (hasLongHabit && !chips.some(c => c.minutes > 120)) {
    chips[chips.length - 1] = { minutes: minutes.find(m => m > 120)!, label: formatDuration(minutes.find(m => m > 120)!) };
  }

  return [...chips, ESCAPE_HATCH];
}
