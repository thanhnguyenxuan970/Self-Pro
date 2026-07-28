import AsyncStorage from '@react-native-async-storage/async-storage';
import type { LifetimeTierCrossing } from './lifetimeRank';

export const PENDING_LEVELUP_KEY = 'pending_levelup_celebration';

export type PendingLevelUpItem = { tierOrder: number; tierName: string; starsAtCrossing: number };

/** Defensively parses AsyncStorage's stored value — handles the pre-queue single-object shape. */
function parseStoredQueue(raw: string): PendingLevelUpItem[] {
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) {
    return parsed.filter(
      (item): item is PendingLevelUpItem =>
        typeof item?.tierOrder === 'number' && typeof item?.tierName === 'string',
    );
  }
  // Legacy shape from before the queue conversion: a single object, not an array.
  if (typeof parsed?.tierOrder === 'number' && typeof parsed?.tierName === 'string') {
    return [{ tierOrder: parsed.tierOrder, tierName: parsed.tierName, starsAtCrossing: parsed.starsAtCrossing ?? 0 }];
  }
  return [];
}

export async function readPendingLevelUpQueue(): Promise<PendingLevelUpItem[]> {
  const raw = await AsyncStorage.getItem(PENDING_LEVELUP_KEY);
  if (!raw) return [];
  try {
    return parseStoredQueue(raw);
  } catch {
    return [];
  }
}

export async function writePendingLevelUpQueue(queue: PendingLevelUpItem[]): Promise<void> {
  if (queue.length === 0) {
    await AsyncStorage.removeItem(PENDING_LEVELUP_KEY);
    return;
  }
  await AsyncStorage.setItem(PENDING_LEVELUP_KEY, JSON.stringify(queue));
}

/** Appends every newly-crossed tier to the persisted queue — one celebration per tier crossed. */
export async function enqueuePendingLevelUps(crossings: LifetimeTierCrossing[]): Promise<PendingLevelUpItem[]> {
  if (crossings.length === 0) return readPendingLevelUpQueue();
  const existing = await readPendingLevelUpQueue();
  const next = [
    ...existing,
    ...crossings.map(c => ({ tierOrder: c.tierOrder, tierName: c.rankName, starsAtCrossing: c.starsAtCrossing })),
  ];
  await writePendingLevelUpQueue(next);
  return next;
}
