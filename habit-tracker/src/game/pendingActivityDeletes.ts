import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_PREFIX = 'pending_activity_deletes';
const keyFor = (userId: number) => `${KEY_PREFIX}:${userId}`;

function parseIds(raw: string): number[] {
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed.filter((n): n is number => typeof n === 'number') : [];
}

/**
 * Records local activity_log ids that were hard-deleted (uncheck, backfill
 * edit, challenge reward reversal, task archive) so the next sync can also
 * remove their already-uploaded Supabase twins. Without this, an orphaned
 * remote row keeps counting toward sync_lifetime_stars()'s SUM forever, and
 * re-logging the same activity silently double-counts it there.
 */
export async function enqueuePendingActivityDeletes(userId: number, ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const key = keyFor(userId);
  const raw = await AsyncStorage.getItem(key);
  let existing: number[] = [];
  if (raw) {
    try {
      existing = parseIds(raw);
    } catch {
      existing = [];
    }
  }
  const merged = Array.from(new Set([...existing, ...ids]));
  await AsyncStorage.setItem(key, JSON.stringify(merged));
}

export async function readPendingActivityDeletes(userId: number): Promise<number[]> {
  const raw = await AsyncStorage.getItem(keyFor(userId));
  if (!raw) return [];
  try {
    return parseIds(raw);
  } catch {
    return [];
  }
}

export async function clearPendingActivityDeletes(userId: number, ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const key = keyFor(userId);
  const remaining = (await readPendingActivityDeletes(userId)).filter(id => !ids.includes(id));
  if (remaining.length) {
    await AsyncStorage.setItem(key, JSON.stringify(remaining));
  } else {
    await AsyncStorage.removeItem(key);
  }
}
