jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  enqueuePendingActivityDeletes, readPendingActivityDeletes, clearPendingActivityDeletes,
} from '../src/game/pendingActivityDeletes';

afterEach(async () => {
  await AsyncStorage.clear();
});

test('reading an empty store returns an empty list', async () => {
  expect(await readPendingActivityDeletes(5)).toEqual([]);
});

test('enqueue records ids and persists them', async () => {
  await enqueuePendingActivityDeletes(5, [101, 102]);
  expect(await readPendingActivityDeletes(5)).toEqual([101, 102]);
});

test('enqueue called twice accumulates onto the existing queue without duplicates', async () => {
  await enqueuePendingActivityDeletes(5, [101]);
  await enqueuePendingActivityDeletes(5, [101, 102]);
  expect(await readPendingActivityDeletes(5)).toEqual([101, 102]);
});

test('enqueue discards a corrupted existing value before merging new ids', async () => {
  await AsyncStorage.setItem('pending_activity_deletes:5', '{bad json');
  await enqueuePendingActivityDeletes(5, [103]);
  expect(await readPendingActivityDeletes(5)).toEqual([103]);
});

test('queues are scoped per user id', async () => {
  await enqueuePendingActivityDeletes(5, [101]);
  await enqueuePendingActivityDeletes(6, [201]);
  expect(await readPendingActivityDeletes(5)).toEqual([101]);
  expect(await readPendingActivityDeletes(6)).toEqual([201]);
});

test('enqueue with an empty id list is a no-op', async () => {
  await enqueuePendingActivityDeletes(5, []);
  expect(await readPendingActivityDeletes(5)).toEqual([]);
});

test('clear removes only the given ids, keeping the rest queued', async () => {
  await enqueuePendingActivityDeletes(5, [101, 102, 103]);
  await clearPendingActivityDeletes(5, [102]);
  expect(await readPendingActivityDeletes(5)).toEqual([101, 103]);
});

test('clearing every queued id removes the storage key entirely', async () => {
  await enqueuePendingActivityDeletes(5, [101, 102]);
  await clearPendingActivityDeletes(5, [101, 102]);
  expect(await AsyncStorage.getItem('pending_activity_deletes:5')).toBeNull();
});

test('clearing an empty id list is a no-op', async () => {
  await enqueuePendingActivityDeletes(5, [101]);
  await clearPendingActivityDeletes(5, []);
  expect(await readPendingActivityDeletes(5)).toEqual([101]);
});

test('corrupted JSON in storage is treated as an empty queue, not a crash', async () => {
  await AsyncStorage.setItem('pending_activity_deletes:5', '{not valid json');
  expect(await readPendingActivityDeletes(5)).toEqual([]);
});

test('malformed array entries (non-numbers) are filtered out', async () => {
  await AsyncStorage.setItem('pending_activity_deletes:5', JSON.stringify([101, 'not-a-number', null]));
  expect(await readPendingActivityDeletes(5)).toEqual([101]);
});

test('a valid JSON object is not treated as a pending-id array', async () => {
  await AsyncStorage.setItem('pending_activity_deletes:5', JSON.stringify({ ids: [101] }));
  expect(await readPendingActivityDeletes(5)).toEqual([]);
});
