jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('@tanstack/react-query', () => ({
  useMutation: jest.fn((options) => options),
  useQuery: jest.fn(),
  useQueryClient: jest.fn(() => ({ invalidateQueries: jest.fn() })),
}));
jest.mock('../src/db/client', () => ({ getDb: jest.fn() }));
jest.mock('../src/hooks/useAuth', () => ({ getStoredGoogleUser: jest.fn() }));
jest.mock('../src/api/syncService', () => ({
  syncCurrentUserToSupabase: jest.fn(() => Promise.resolve()),
  syncUserStreak: jest.fn(),
}));
jest.mock('../src/queries/useChallenge', () => ({
  cancelTerminalChallengeReminders: jest.fn(),
  logActiveChallengeDay: jest.fn(),
  reconcileUnloggedLinkedChallenges: jest.fn(),
  restoreReactivatedChallengeReminders: jest.fn(),
  syncActiveChallengeReminders: jest.fn(),
}));
jest.mock('../src/hooks/useSettings', () => ({ useLanguage: jest.fn(() => ['en']) }));
jest.mock('../src/game/logTask', () => ({ computeLogTaskRows: jest.fn() }));
jest.mock('../src/utils/formatters', () => ({
  getLocalDate: jest.fn(() => '2026-08-17'),
  getLocalDateFor: jest.fn(() => '2026-08-16'),
  getWeekStart: jest.fn(() => '2026-08-17'),
}));
jest.mock('../src/config/constants', () => ({ dailyBonusStarsForPoints: jest.fn() }));
jest.mock('../src/game/streakMilestones', () => ({ crossedStreakMilestone: jest.fn() }));
jest.mock('../src/game/boost', () => ({
  boostEndOfDayMs: jest.fn(),
  isBoostActiveAt: jest.fn(),
  summarizeBoostLogs: jest.fn(),
}));
jest.mock('../src/game/lifetimeRankWrites', () => ({ applyLifetimeStarsDelta: jest.fn() }));
jest.mock('../src/game/pendingLevelUpQueue', () => ({ enqueuePendingLevelUps: jest.fn() }));
jest.mock('../src/lib/rankMascotBridge', () => ({ rankMascotBridge: {} }));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDb } from '../src/db/client';
import {
  reconcileUnloggedLinkedChallenges,
  restoreReactivatedChallengeReminders,
} from '../src/queries/useChallenge';
import { dailyBonusStarsForPoints } from '../src/config/constants';
import { applyLifetimeStarsDelta } from '../src/game/lifetimeRankWrites';
import {
  acknowledgePendingActivityDeletes,
  drainPendingActivityDeletes,
  enqueuePendingActivityDeletes,
  readPendingActivityDeletes,
} from '../src/game/pendingActivityDeletes';
import { useUnlogTask } from '../src/queries/useToday';
import { PendingActivityDeleteTestDb } from './helpers/pendingActivityDeleteDb';

const ACCOUNT_A = 'user@example.com';
const ACCOUNT_B = 'other@example.com';

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: Deferred<T>['resolve'];
  const promise = new Promise<T>(innerResolve => { resolve = innerResolve; });
  return { promise, resolve };
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
});

test('preserves both ids when two enqueue operations overlap after reading the same snapshot', async () => {
  const db = new PendingActivityDeleteTestDb();
  const firstInsertEntered = deferred<void>();
  const releaseFirstInsert = deferred<void>();
  db.beforeRunAsync = async (sql, params) => {
    if (sql.includes('INSERT OR IGNORE INTO pending_activity_deletes') && params[1] === 101) {
      firstInsertEntered.resolve(undefined);
      await releaseFirstInsert.promise;
    }
  };

  const first = enqueuePendingActivityDeletes(db.asDatabase(), ACCOUNT_A, [101]);
  await firstInsertEntered.promise;
  const second = enqueuePendingActivityDeletes(db.asDatabase(), ACCOUNT_A, [202]);
  releaseFirstInsert.resolve(undefined);
  await Promise.all([first, second]);

  expect(await readPendingActivityDeletes(db.asDatabase(), ACCOUNT_A)).toEqual([101, 202]);
});

test('journals a locally committed deletion when post-commit reminder restoration fails', async () => {
  jest.mocked(dailyBonusStarsForPoints).mockReturnValue(0);
  jest.mocked(applyLifetimeStarsDelta).mockResolvedValue({ crossings: [] });
  jest.mocked(reconcileUnloggedLinkedChallenges).mockResolvedValue({
    lifetimeCrossings: [],
    reactivatedChallenges: [{
      id: 9,
      name: 'Linked challenge',
      mode: 'streak',
      notificationsEnabled: true,
      reminderToken: 'reactivation:9:1',
      previousNotificationId: 'old-reminder',
    }],
    deletedActivityIds: [],
  });

  const db = new PendingActivityDeleteTestDb();
  db.setAccountKey(5, ACCOUNT_A);
  let transactionCommitted = false;
  let localActivityExists = true;
  db.otherGetAllAsync = async sql => {
    if (sql.includes('FROM tiers')) return [];
    if (sql.includes("source = 'TASK'")) {
      return [{ id: 42, points_earned: 1, stars_delta: 1 }];
    }
    if (sql.includes("source = 'DAILY_BONUS'")) return [];
    return [];
  };
  db.otherGetFirstAsync = async sql => (
    sql.includes('daily_summary') ? { total_points: 1, bonus_star_awarded: 0 } : null
  );
  db.beforeRunAsync = async sql => {
    if (sql.startsWith('DELETE FROM activity_log WHERE id IN')) localActivityExists = false;
  };
  db.withTransactionAsync.mockImplementation(async callback => {
    await callback();
    transactionCommitted = true;
  });
  jest.mocked(getDb).mockResolvedValue(db.asDatabase());
  jest.mocked(restoreReactivatedChallengeReminders).mockImplementation(async () => {
    expect(transactionCommitted).toBe(true);
    throw new Error('POST_COMMIT_REMINDER_STATE_WRITE_FAILED');
  });

  const mutation = useUnlogTask(5) as unknown as {
    mutationFn: (params: { taskTypeId: number; kind: 'GOOD' | 'BAD' }) => Promise<unknown>;
  };

  await expect(mutation.mutationFn({ taskTypeId: 7, kind: 'GOOD' }))
    .rejects.toThrow('POST_COMMIT_REMINDER_STATE_WRITE_FAILED');

  expect(transactionCommitted).toBe(true);
  expect(localActivityExists).toBe(false);
  expect(await readPendingActivityDeletes(db.asDatabase(), ACCOUNT_A)).toEqual([42]);
});

test('preserves ids enqueued while an acknowledgement is in flight', async () => {
  const db = new PendingActivityDeleteTestDb();
  await enqueuePendingActivityDeletes(db.asDatabase(), ACCOUNT_A, [101]);
  const acknowledgementEntered = deferred<void>();
  const releaseAcknowledgement = deferred<void>();
  db.beforeRunAsync = async sql => {
    if (sql.includes('DELETE FROM pending_activity_deletes')) {
      acknowledgementEntered.resolve(undefined);
      await releaseAcknowledgement.promise;
    }
  };

  const acknowledging = acknowledgePendingActivityDeletes(db.asDatabase(), ACCOUNT_A, [101]);
  await acknowledgementEntered.promise;
  await enqueuePendingActivityDeletes(db.asDatabase(), ACCOUNT_A, [202]);
  releaseAcknowledgement.resolve(undefined);
  await acknowledging;

  expect(await readPendingActivityDeletes(db.asDatabase(), ACCOUNT_A)).toEqual([202]);
});

test('rolls back an outbox enqueue with its surrounding SQLite transaction', async () => {
  const db = new PendingActivityDeleteTestDb();

  await expect(db.withTransactionAsync(async () => {
    await enqueuePendingActivityDeletes(db.asDatabase(), ACCOUNT_A, [101]);
    throw new Error('ROLLBACK_DELETE');
  })).rejects.toThrow('ROLLBACK_DELETE');

  expect(await readPendingActivityDeletes(db.asDatabase(), ACCOUNT_A)).toEqual([]);
});

test('rolls back both the local hard-delete and outbox row when enqueue fails', async () => {
  jest.mocked(dailyBonusStarsForPoints).mockReturnValue(0);
  jest.mocked(applyLifetimeStarsDelta).mockResolvedValue({ crossings: [] });
  jest.mocked(reconcileUnloggedLinkedChallenges).mockResolvedValue({
    lifetimeCrossings: [], reactivatedChallenges: [], deletedActivityIds: [],
  });

  const db = new PendingActivityDeleteTestDb();
  db.setAccountKey(5, ACCOUNT_A);
  let localActivityExists = true;
  db.otherGetAllAsync = async sql => {
    if (sql.includes('FROM tiers')) return [];
    if (sql.includes("source = 'TASK'")) {
      return [{ id: 42, points_earned: 1, stars_delta: 1 }];
    }
    return [];
  };
  db.otherGetFirstAsync = async sql => (
    sql.includes('daily_summary') ? { total_points: 1, bonus_star_awarded: 0 } : null
  );
  db.beforeRunAsync = async sql => {
    if (sql.startsWith('DELETE FROM activity_log WHERE id IN')) localActivityExists = false;
    if (sql.includes('INSERT OR IGNORE INTO pending_activity_deletes')) {
      throw new Error('SQLITE_FULL');
    }
  };
  const runOutboxTransaction = db.withTransactionAsync.getMockImplementation();
  if (!runOutboxTransaction) throw new Error('Missing test transaction implementation');
  db.withTransactionAsync.mockImplementation(async callback => {
    const localSnapshot = localActivityExists;
    try {
      await runOutboxTransaction(callback);
    } catch (error) {
      localActivityExists = localSnapshot;
      throw error;
    }
  });
  jest.mocked(getDb).mockResolvedValue(db.asDatabase());

  const mutation = useUnlogTask(5) as unknown as {
    mutationFn: (params: { taskTypeId: number; kind: 'GOOD' | 'BAD' }) => Promise<unknown>;
  };
  await expect(mutation.mutationFn({ taskTypeId: 7, kind: 'GOOD' }))
    .rejects.toThrow('SQLITE_FULL');

  expect(localActivityExists).toBe(true);
  expect(await readPendingActivityDeletes(db.asDatabase(), ACCOUNT_A)).toEqual([]);
});

test('replays a remote delete after success followed by acknowledgement failure', async () => {
  const db = new PendingActivityDeleteTestDb();
  await enqueuePendingActivityDeletes(db.asDatabase(), ACCOUNT_A, [101]);
  let failAcknowledgement = true;
  db.beforeRunAsync = async sql => {
    if (failAcknowledgement && sql.includes('DELETE FROM pending_activity_deletes')) {
      throw new Error('PROCESS_DIED_BEFORE_ACK');
    }
  };
  const deleteRemoteBatch = jest.fn(async (ids: number[]) => ids);

  await expect(drainPendingActivityDeletes(db.asDatabase(), ACCOUNT_A, deleteRemoteBatch))
    .rejects.toThrow('PROCESS_DIED_BEFORE_ACK');
  expect(await readPendingActivityDeletes(db.asDatabase(), ACCOUNT_A)).toEqual([101]);

  failAcknowledgement = false;
  await drainPendingActivityDeletes(db.asDatabase(), ACCOUNT_A, deleteRemoteBatch);
  expect(deleteRemoteBatch).toHaveBeenNthCalledWith(1, [101]);
  expect(deleteRemoteBatch).toHaveBeenNthCalledWith(2, [101]);
  expect(await readPendingActivityDeletes(db.asDatabase(), ACCOUNT_A)).toEqual([]);
});

test('interleaved drains cannot read or acknowledge another account outbox', async () => {
  const db = new PendingActivityDeleteTestDb();
  await enqueuePendingActivityDeletes(db.asDatabase(), ACCOUNT_A, [101]);
  await enqueuePendingActivityDeletes(db.asDatabase(), ACCOUNT_B, [101, 202]);
  const accountFiveRemoteEntered = deferred<void>();
  const releaseAccountFiveRemote = deferred<void>();
  const deleteAccountFiveBatch = jest.fn(async (ids: number[]) => {
    accountFiveRemoteEntered.resolve(undefined);
    await releaseAccountFiveRemote.promise;
    return ids;
  });
  const deleteAccountSixBatch = jest.fn(async (ids: number[]) => ids);

  const accountFiveDrain = drainPendingActivityDeletes(db.asDatabase(), ACCOUNT_A, deleteAccountFiveBatch);
  await accountFiveRemoteEntered.promise;
  await drainPendingActivityDeletes(db.asDatabase(), ACCOUNT_B, deleteAccountSixBatch);

  expect(deleteAccountFiveBatch).toHaveBeenCalledWith([101]);
  expect(deleteAccountSixBatch).toHaveBeenCalledWith([101, 202]);
  expect(await readPendingActivityDeletes(db.asDatabase(), ACCOUNT_A)).toEqual([101]);
  expect(await readPendingActivityDeletes(db.asDatabase(), ACCOUNT_B)).toEqual([]);

  releaseAccountFiveRemote.resolve(undefined);
  await accountFiveDrain;
  expect(await readPendingActivityDeletes(db.asDatabase(), ACCOUNT_A)).toEqual([]);
});

test('does not acknowledge an outbox batch when the remote delete fails', async () => {
  const db = new PendingActivityDeleteTestDb();
  await enqueuePendingActivityDeletes(db.asDatabase(), ACCOUNT_A, [101]);

  await expect(drainPendingActivityDeletes(db.asDatabase(), ACCOUNT_A, async () => {
    throw new Error('REMOTE_DELETE_FAILED');
  })).rejects.toThrow('REMOTE_DELETE_FAILED');

  expect(await readPendingActivityDeletes(db.asDatabase(), ACCOUNT_A)).toEqual([101]);
});

test('does not stale-acknowledge an id enqueued while drain is deleting its snapshot', async () => {
  const db = new PendingActivityDeleteTestDb();
  await enqueuePendingActivityDeletes(db.asDatabase(), ACCOUNT_A, [101]);
  const remoteDeleteEntered = deferred<void>();
  const releaseRemoteDelete = deferred<void>();
  let remoteCalls = 0;
  const deleteRemoteBatch = jest.fn(async (ids: number[]) => {
    remoteCalls += 1;
    if (remoteCalls === 1) {
      remoteDeleteEntered.resolve(undefined);
      await releaseRemoteDelete.promise;
      return ids;
    }
    throw new Error('STOP_AFTER_CONCURRENT_ENQUEUE');
  });

  const draining = drainPendingActivityDeletes(db.asDatabase(), ACCOUNT_A, deleteRemoteBatch);
  await remoteDeleteEntered.promise;
  await enqueuePendingActivityDeletes(db.asDatabase(), ACCOUNT_A, [202]);
  releaseRemoteDelete.resolve(undefined);

  await expect(draining).rejects.toThrow('STOP_AFTER_CONCURRENT_ENQUEUE');
  expect(await readPendingActivityDeletes(db.asDatabase(), ACCOUNT_A)).toEqual([202]);
});

test('same local_activity_id enqueued during drain is the same immutable delete intent and is safely acknowledged once', async () => {
  const db = new PendingActivityDeleteTestDb();
  await enqueuePendingActivityDeletes(db.asDatabase(), ACCOUNT_A, [101]);
  const remoteDeleteEntered = deferred<void>();
  const releaseRemoteDelete = deferred<void>();
  const deleteRemoteBatch = jest.fn(async (ids: number[]) => {
    remoteDeleteEntered.resolve(undefined);
    await releaseRemoteDelete.promise;
    return ids;
  });

  const draining = drainPendingActivityDeletes(db.asDatabase(), ACCOUNT_A, deleteRemoteBatch);
  await remoteDeleteEntered.promise;
  await enqueuePendingActivityDeletes(db.asDatabase(), ACCOUNT_A, [101]);
  releaseRemoteDelete.resolve(undefined);
  await draining;

  expect(deleteRemoteBatch).toHaveBeenCalledTimes(1);
  expect(await readPendingActivityDeletes(db.asDatabase(), ACCOUNT_A)).toEqual([]);
});
