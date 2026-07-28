jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  PENDING_LEVELUP_KEY, readPendingLevelUpQueue, writePendingLevelUpQueue, enqueuePendingLevelUps,
} from '../src/game/pendingLevelUpQueue';
import type { LifetimeTierCrossing } from '../src/game/lifetimeRank';

const crossing = (tierId: number, tierOrder: number, rankName: string, starsAtCrossing: number): LifetimeTierCrossing =>
  ({ tierId, tierOrder, rankName, starsAtCrossing });

afterEach(async () => {
  await AsyncStorage.clear();
});

test('reading an empty store returns an empty queue', async () => {
  expect(await readPendingLevelUpQueue()).toEqual([]);
});

test('enqueue appends crossings and persists them', async () => {
  await enqueuePendingLevelUps([crossing(1, 1, 'Delulu', 5)]);
  const queue = await readPendingLevelUpQueue();
  expect(queue).toEqual([{ tierOrder: 1, tierName: 'Delulu', starsAtCrossing: 5 }]);
});

test('enqueue called twice accumulates onto the existing queue', async () => {
  await enqueuePendingLevelUps([crossing(1, 1, 'Delulu', 5)]);
  await enqueuePendingLevelUps([crossing(2, 2, 'Mewing', 10)]);
  const queue = await readPendingLevelUpQueue();
  expect(queue.map(q => q.tierOrder)).toEqual([1, 2]);
});

test('enqueue with an empty crossings list is a no-op that still returns the existing queue', async () => {
  await enqueuePendingLevelUps([crossing(1, 1, 'Delulu', 5)]);
  const queue = await enqueuePendingLevelUps([]);
  expect(queue).toHaveLength(1);
});

test('writing an empty queue clears the AsyncStorage key entirely', async () => {
  await enqueuePendingLevelUps([crossing(1, 1, 'Delulu', 5)]);
  await writePendingLevelUpQueue([]);
  expect(await AsyncStorage.getItem(PENDING_LEVELUP_KEY)).toBeNull();
});

test('legacy single-object shape (pre-queue) is parsed into a one-item queue', async () => {
  await AsyncStorage.setItem(PENDING_LEVELUP_KEY, JSON.stringify({ tierOrder: 3, tierName: 'Rizz', weekStart: '2026-05-25' }));
  const queue = await readPendingLevelUpQueue();
  expect(queue).toEqual([{ tierOrder: 3, tierName: 'Rizz', starsAtCrossing: 0 }]);
});

test('corrupted JSON in storage is treated as an empty queue, not a crash', async () => {
  await AsyncStorage.setItem(PENDING_LEVELUP_KEY, '{not valid json');
  expect(await readPendingLevelUpQueue()).toEqual([]);
});

test('malformed array entries (missing fields) are filtered out', async () => {
  await AsyncStorage.setItem(PENDING_LEVELUP_KEY, JSON.stringify([
    { tierOrder: 1, tierName: 'Delulu', starsAtCrossing: 5 },
    { tierOrder: 'not-a-number', tierName: 'Bad' },
    {},
  ]));
  const queue = await readPendingLevelUpQueue();
  expect(queue).toEqual([{ tierOrder: 1, tierName: 'Delulu', starsAtCrossing: 5 }]);
});
