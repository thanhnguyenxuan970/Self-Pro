jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import {
  drainPendingActivityDeletes,
  drainPendingActivityDeleteEntries,
  enqueuePendingActivityDeletesForUser,
  readPendingActivityDeleteEntries,
} from '../src/game/pendingActivityDeletes';
import { PendingActivityDeleteTestDb } from './helpers/pendingActivityDeleteDb';

const account = 'user@example.com';
const pending = { local_activity_id: 7, activity_key: 'durable-key' };

test.each([
  ['non-array', null],
  ['empty', []],
  ['duplicate', [7, 7]],
  ['invalid', [-1]],
  ['foreign', [8]],
] as const)('legacy numeric drain rejects %s without deleting pending data', async (_label, receipt) => {
  const db = new PendingActivityDeleteTestDb();
  db.getAllAsync.mockResolvedValue([pending]);
  await expect(drainPendingActivityDeletes(db.asDatabase(), account, async () => receipt))
    .rejects.toThrow('Invalid activity delete acknowledgement');
  expect(db.runAsync).not.toHaveBeenCalled();
});

test.each([
  ['null response', null],
  ['object response', {}],
  ['empty response', []],
  ['null item', [null]],
  ['primitive item', [7]],
  ['missing id', [{ activity_key: 'durable-key' }]],
  ['negative id', [{ ...pending, local_activity_id: -1 }]],
  ['fractional id', [{ ...pending, local_activity_id: 7.5 }]],
  ['empty key', [{ ...pending, activity_key: '' }]],
  ['non-string key', [{ ...pending, activity_key: 42 }]],
  ['wrong id', [{ ...pending, local_activity_id: 8 }]],
  ['wrong key', [{ ...pending, activity_key: 'another-key' }]],
  ['missing key', [{ local_activity_id: 7 }]],
  ['null key', [{ ...pending, activity_key: null }]],
  ['duplicate receipt', [pending, pending]],
] as const)('identity drain rejects %s without acknowledging any row', async (_label, response) => {
  const db = new PendingActivityDeleteTestDb();
  db.getAllAsync.mockResolvedValue([{ ...pending }]);
  const remote = jest.fn().mockResolvedValue(response);

  await expect(drainPendingActivityDeleteEntries(db.asDatabase(), account, remote))
    .rejects.toThrow('Invalid activity delete acknowledgement');

  expect(remote).toHaveBeenCalledTimes(1);
  expect(remote).toHaveBeenCalledWith([pending]);
  expect(db.runAsync).not.toHaveBeenCalled();
});

test.each([null, undefined])('legacy identity receipt accepts %s only for a requested legacy row', async key => {
  const db = new PendingActivityDeleteTestDb();
  db.getAllAsync.mockResolvedValueOnce([{ local_activity_id: 7, activity_key: null }])
    .mockResolvedValueOnce([]);
  await drainPendingActivityDeleteEntries(db.asDatabase(), account,
    async () => [{ local_activity_id: 7, activity_key: key }]);
  expect(db.runAsync).toHaveBeenCalledTimes(1);
  expect(db.runAsync).toHaveBeenCalledWith(expect.stringContaining('local_activity_id IN'), [account, 7]);
});

test('identity acknowledgement binds both id and key in its SQLite delete', async () => {
  const db = new PendingActivityDeleteTestDb();
  db.getAllAsync.mockResolvedValueOnce([pending]).mockResolvedValueOnce([]);
  await drainPendingActivityDeleteEntries(db.asDatabase(), account, async rows => rows);
  expect(db.runAsync).toHaveBeenCalledWith(
    expect.stringMatching(/local_activity_id = \?[\s\S]*activity_key = \?/),
    [account, 7, 'durable-key'],
  );
});

test('cancellation after remote success leaves the receipt pending for replay', async () => {
  const db = new PendingActivityDeleteTestDb();
  db.getAllAsync.mockResolvedValue([pending]);
  let cancelled = false;
  await expect(drainPendingActivityDeleteEntries(db.asDatabase(), account, async rows => {
    cancelled = true;
    return rows;
  }, { assertActive: () => { if (cancelled) throw new Error('cancelled'); } }))
    .rejects.toThrow('cancelled');
  expect(db.runAsync).not.toHaveBeenCalled();
});

test.each([0, -1, 1.5, NaN, Infinity])('invalid batch limit %s falls back to a bounded batch', async limit => {
  const db = new PendingActivityDeleteTestDb();
  await readPendingActivityDeleteEntries(db.asDatabase(), account, limit);
  expect(db.getAllAsync).toHaveBeenCalledWith(expect.any(String), [account, 100]);
});

test('empty user enqueue does not resolve an account or write', async () => {
  const db = new PendingActivityDeleteTestDb();
  await enqueuePendingActivityDeletesForUser(db.asDatabase(), 7, []);
  expect(db.getFirstAsync).not.toHaveBeenCalled();
  expect(db.runAsync).not.toHaveBeenCalled();
});

test('noncanonical stored account fails closed before enqueue', async () => {
  const db = new PendingActivityDeleteTestDb();
  db.setAccountKey(7, ' User@Example.com ');
  await expect(enqueuePendingActivityDeletesForUser(db.asDatabase(), 7, [7]))
    .rejects.toThrow('Stable account key is not canonical');
  expect(db.runAsync).not.toHaveBeenCalled();
});
