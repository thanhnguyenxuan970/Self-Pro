// Personalized duration chips from user's own logging history.
// Most-logged durations float to front; falls back to defaults for new users.

import { getDb } from '../db/client';
import { formatDuration } from './points';

export interface Chip {
  minutes: number;   // 30, 60, 90... | -1 = escape hatch
  label: string;
  isEscapeHatch?: boolean;
}

const DEFAULT_MINUTES = [30, 45, 60, 90];
const CHIP_SLOTS = 3;
const ESCAPE_HATCH: Chip = { minutes: -1, label: '2h+', isEscapeHatch: true };

/**
 * Top durations this user logs for this activity, ranked by frequency then
 * recency. Ties broken by most-recent use so shifting habits stay current.
 */
export async function getChipPresets(
  userId: number,
  taskTypeId: number,
): Promise<Chip[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ duration_min: number; freq: number }>(
    `SELECT duration_min, COUNT(*) AS freq
     FROM activity_log
     WHERE user_id = ? AND task_type_id = ? AND duration_min IS NOT NULL
     GROUP BY duration_min
     ORDER BY freq DESC, MAX(logged_at) DESC
     LIMIT ?`,
    [userId, taskTypeId, CHIP_SLOTS],
  );

  const minutes = rows.map(r => r.duration_min);
  for (const d of DEFAULT_MINUTES) {
    if (minutes.length >= CHIP_SLOTS) break;
    if (!minutes.includes(d)) minutes.push(d);
  }

  const chips: Chip[] = minutes
    .slice(0, CHIP_SLOTS)
    .sort((a, b) => a - b)
    .map(m => ({ minutes: m, label: formatDuration(m) }));

  // If user habitually logs long sessions, graduate escape hatch into a real chip.
  const longMinute = minutes.find(m => m > 120);
  if (longMinute != null && !chips.some(c => c.minutes > 120)) {
    chips[chips.length - 1] = { minutes: longMinute, label: formatDuration(longMinute) };
  }

  return [...chips, ESCAPE_HATCH];
}
