jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  acknowledgePendingActivityDeletes,
  enqueuePendingActivityDeletes,
  enqueuePendingActivityDeletesForUser,
  importLegacyPendingActivityDeletes,
  readPendingActivityDeletes,
} from '../src/game/pendingActivityDeletes';
import { PendingActivityDeleteTestDb } from './helpers/pendingActivityDeleteDb';

const ACCOUNT_A = 'user@example.com';
const ACCOUNT_B = 'other@example.com';

let db: PendingActivityDeleteTestDb;

beforeEach(async () => {
  db = new PendingActivityDeleteTestDb();
  db.setAccountKey(5, ACCOUNT_A);
  db.setAccountKey(6, ACCOUNT_B);
  await AsyncStorage.clear();
  jest.restoreAllMocks();
});

test('reading an empty outbox returns an empty list', async () => {
  expect(await readPendingActivityDeletes(db.asDatabase(), ACCOUNT_A)).toEqual([]);
});

test('enqueue canonicalizes the account key and persists ids', async () => {
  await enqueuePendingActivityDeletes(db.asDatabase(), ' User@Example.com ', [101, 102]);
  expect(await readPendingActivityDeletes(db.asDatabase(), ACCOUNT_A)).toEqual([101, 102]);
});

test('enqueue called twice accumulates onto the existing outbox without duplicates', async () => {
  await enqueuePendingActivityDeletes(db.asDatabase(), ACCOUNT_A, [101]);
  await enqueuePendingActivityDeletes(db.asDatabase(), ACCOUNT_A, [101, 102]);
  expect(await readPendingActivityDeletes(db.asDatabase(), ACCOUNT_A)).toEqual([101, 102]);
});

test('enqueue for a local user resolves the stable account key before writing', async () => {
  await enqueuePendingActivityDeletesForUser(db.asDatabase(), 5, [101]);

  expect(db.getFirstAsync).toHaveBeenCalledWith(
    'SELECT account_key FROM users WHERE id = ?',
    [5],
  );
  expect(await readPendingActivityDeletes(db.asDatabase(), ACCOUNT_A)).toEqual([101]);
});

test('enqueue for a user fails closed when no stable account mapping exists', async () => {
  await expect(enqueuePendingActivityDeletesForUser(db.asDatabase(), 99, [101]))
    .rejects.toThrow('Stable account key unavailable for local user 99');
  expect(await readPendingActivityDeletes(db.asDatabase(), ACCOUNT_A)).toEqual([]);
});

test('large enqueue batches stay below the SQLite variable limit', async () => {
  const ids = Array.from({ length: 350 }, (_, index) => index + 1);
  await enqueuePendingActivityDeletes(db.asDatabase(), ACCOUNT_A, ids);

  expect(db.runAsync).toHaveBeenCalledTimes(2);
  expect(await readPendingActivityDeletes(db.asDatabase(), ACCOUNT_A, 400)).toEqual(ids);
});

test('corrupted legacy storage cannot overwrite a newly enqueued SQLite id', async () => {
  await AsyncStorage.setItem('pending_activity_deletes:5', '{bad json');
  await enqueuePendingActivityDeletes(db.asDatabase(), ACCOUNT_A, [103]);
  expect(await readPendingActivityDeletes(db.asDatabase(), ACCOUNT_A)).toEqual([103]);
});

test('outboxes are scoped per stable account key', async () => {
  await enqueuePendingActivityDeletes(db.asDatabase(), ACCOUNT_A, [101]);
  await enqueuePendingActivityDeletes(db.asDatabase(), ACCOUNT_B, [201]);
  expect(await readPendingActivityDeletes(db.asDatabase(), ACCOUNT_A)).toEqual([101]);
  expect(await readPendingActivityDeletes(db.asDatabase(), ACCOUNT_B)).toEqual([201]);
});

test('enqueue with an empty id list is a no-op', async () => {
  await enqueuePendingActivityDeletes(db.asDatabase(), ACCOUNT_A, []);
  expect(await readPendingActivityDeletes(db.asDatabase(), ACCOUNT_A)).toEqual([]);
});

test('acknowledge removes only returned ids for the same account', async () => {
  await enqueuePendingActivityDeletes(db.asDatabase(), ACCOUNT_A, [101, 102, 103]);
  await enqueuePendingActivityDeletes(db.asDatabase(), ACCOUNT_B, [102]);
  await acknowledgePendingActivityDeletes(db.asDatabase(), ACCOUNT_A, [102]);
  expect(await readPendingActivityDeletes(db.asDatabase(), ACCOUNT_A)).toEqual([101, 103]);
  expect(await readPendingActivityDeletes(db.asDatabase(), ACCOUNT_B)).toEqual([102]);
});

test('acknowledging every queued id leaves the outbox empty', async () => {
  await enqueuePendingActivityDeletes(db.asDatabase(), ACCOUNT_A, [101, 102]);
  await acknowledgePendingActivityDeletes(db.asDatabase(), ACCOUNT_A, [101, 102]);
  expect(await readPendingActivityDeletes(db.asDatabase(), ACCOUNT_A)).toEqual([]);
});

test('acknowledging an empty id list is a no-op', async () => {
  await enqueuePendingActivityDeletes(db.asDatabase(), ACCOUNT_A, [101]);
  await acknowledgePendingActivityDeletes(db.asDatabase(), ACCOUNT_A, []);
  expect(await readPendingActivityDeletes(db.asDatabase(), ACCOUNT_A)).toEqual([101]);
});

test('corrupted JSON in legacy storage is ignored without deleting it', async () => {
  await AsyncStorage.setItem('pending_activity_deletes:5', '{not valid json');
  await importLegacyPendingActivityDeletes(db.asDatabase(), 5, ACCOUNT_A);
  expect(await readPendingActivityDeletes(db.asDatabase(), ACCOUNT_A)).toEqual([]);
  expect(await AsyncStorage.getItem('pending_activity_deletes:5')).toBe('{not valid json');
});

test('malformed legacy array entries are filtered during import', async () => {
  await AsyncStorage.setItem('pending_activity_deletes:5', JSON.stringify([101, 'not-a-number', null]));
  await importLegacyPendingActivityDeletes(db.asDatabase(), 5, ACCOUNT_A);
  expect(await readPendingActivityDeletes(db.asDatabase(), ACCOUNT_A)).toEqual([101]);
});

test('a valid JSON object is not treated as a legacy pending-id array', async () => {
  await AsyncStorage.setItem('pending_activity_deletes:5', JSON.stringify({ ids: [101] }));
  await importLegacyPendingActivityDeletes(db.asDatabase(), 5, ACCOUNT_A);
  expect(await readPendingActivityDeletes(db.asDatabase(), ACCOUNT_A)).toEqual([]);
});

test('legacy import resolves and verifies userId to account key before SQLite insert', async () => {
  const key = 'pending_activity_deletes:5';
  await AsyncStorage.setItem(key, JSON.stringify([101]));

  await expect(importLegacyPendingActivityDeletes(db.asDatabase(), 5, ACCOUNT_B))
    .rejects.toThrow('Legacy outbox account mismatch');

  expect(await AsyncStorage.getItem(key)).toBe(JSON.stringify([101]));
  expect(await readPendingActivityDeletes(db.asDatabase(), ACCOUNT_A)).toEqual([]);
  expect(await readPendingActivityDeletes(db.asDatabase(), ACCOUNT_B)).toEqual([]);
});

test('legacy import is idempotent and removes the key only after SQLite commit', async () => {
  const key = 'pending_activity_deletes:5';
  await AsyncStorage.setItem(key, JSON.stringify([101, 102]));
  await importLegacyPendingActivityDeletes(db.asDatabase(), 5, ACCOUNT_A);
  expect(await readPendingActivityDeletes(db.asDatabase(), ACCOUNT_A)).toEqual([101, 102]);
  expect(await AsyncStorage.getItem(key)).toBeNull();

  await AsyncStorage.setItem(key, JSON.stringify([101, 102]));
  await importLegacyPendingActivityDeletes(db.asDatabase(), 5, ACCOUNT_A);
  expect(await readPendingActivityDeletes(db.asDatabase(), ACCOUNT_A)).toEqual([101, 102]);
});

test('legacy import keeps the AsyncStorage key when the SQLite transaction fails', async () => {
  const key = 'pending_activity_deletes:5';
  await AsyncStorage.setItem(key, JSON.stringify([101]));
  db.beforeRunAsync = async sql => {
    if (sql.includes('INSERT OR IGNORE INTO pending_activity_deletes')) throw new Error('SQLITE_FULL');
  };

  await expect(importLegacyPendingActivityDeletes(db.asDatabase(), 5, ACCOUNT_A)).rejects.toThrow('SQLITE_FULL');
  expect(await AsyncStorage.getItem(key)).toBe(JSON.stringify([101]));
  expect(await readPendingActivityDeletes(db.asDatabase(), ACCOUNT_A)).toEqual([]);
});

test('legacy remove failure replays idempotently without losing SQLite rows', async () => {
  const key = 'pending_activity_deletes:5';
  await AsyncStorage.setItem(key, JSON.stringify([101]));
  jest.spyOn(AsyncStorage, 'removeItem').mockRejectedValueOnce(new Error('STORAGE_REMOVE_FAILED'));

  await expect(importLegacyPendingActivityDeletes(db.asDatabase(), 5, ACCOUNT_A))
    .rejects.toThrow('STORAGE_REMOVE_FAILED');
  expect(await readPendingActivityDeletes(db.asDatabase(), ACCOUNT_A)).toEqual([101]);
  expect(await AsyncStorage.getItem(key)).toBe(JSON.stringify([101]));

  await importLegacyPendingActivityDeletes(db.asDatabase(), 5, ACCOUNT_A);
  expect(await readPendingActivityDeletes(db.asDatabase(), ACCOUNT_A)).toEqual([101]);
  expect(await AsyncStorage.getItem(key)).toBeNull();
});
