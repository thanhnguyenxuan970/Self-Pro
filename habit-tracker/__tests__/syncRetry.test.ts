jest.mock('../src/api/syncService', () => ({
  syncCurrentUserToSupabase: jest.fn(),
}));

import { createSyncRetryCoordinator } from '../src/api/syncRetry';

async function flushPersistence(): Promise<void> {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
}

describe('sync retry coordinator', () => {
  it('keeps a local save visibly pending until the next online retry completes', async () => {
    const runSync = jest.fn()
      .mockRejectedValueOnce(new Error('network unavailable'))
      .mockResolvedValueOnce(undefined);
    const persistPending = jest.fn().mockResolvedValue(undefined);
    const coordinator = createSyncRetryCoordinator({
      getAccountKey: jest.fn().mockResolvedValue('account-a'),
      runSync,
      readPending: jest.fn().mockResolvedValue(false),
      persistPending,
    });

    await coordinator.hydrate();
    await coordinator.requestSync();
    await flushPersistence();

    expect(coordinator.getSnapshot()).toBe('pending');
    expect(persistPending).toHaveBeenLastCalledWith('account-a', true);

    await coordinator.retryWhenOnline(true);
    await flushPersistence();

    expect(runSync).toHaveBeenCalledTimes(2);
    expect(coordinator.getSnapshot()).toBe('idle');
    expect(persistPending).toHaveBeenLastCalledWith('account-a', false);
  });

  it('restores a pending local save after restart and does not retry while offline', async () => {
    const runSync = jest.fn().mockResolvedValue(undefined);
    const coordinator = createSyncRetryCoordinator({
      getAccountKey: jest.fn().mockResolvedValue('account-a'),
      runSync,
      readPending: jest.fn().mockResolvedValue(true),
      persistPending: jest.fn().mockResolvedValue(undefined),
    });

    await coordinator.hydrate();
    await coordinator.retryWhenOnline(false);

    expect(coordinator.getSnapshot()).toBe('pending');
    expect(runSync).not.toHaveBeenCalled();

    await coordinator.retryWhenOnline(true);

    expect(runSync).toHaveBeenCalledTimes(1);
    expect(coordinator.getSnapshot()).toBe('idle');
  });

  it('coalesces concurrent retries into one request', async () => {
    let resolveSync: (() => void) | undefined;
    const runSync = jest.fn(() => new Promise<void>(resolve => { resolveSync = resolve; }));
    const coordinator = createSyncRetryCoordinator({
      getAccountKey: jest.fn().mockResolvedValue('account-a'),
      runSync,
      readPending: jest.fn().mockResolvedValue(true),
      persistPending: jest.fn().mockResolvedValue(undefined),
    });
    await coordinator.hydrate();

    const first = coordinator.retryWhenOnline(true);
    const second = coordinator.retryWhenOnline(true);

    await Promise.resolve();
    expect(runSync).toHaveBeenCalledTimes(1);
    resolveSync?.();
    await Promise.all([first, second]);

    expect(coordinator.getSnapshot()).toBe('idle');
  });

  it('uploads a mutation that arrives while the previous snapshot is in flight', async () => {
    let releaseFirst: (() => void) | undefined;
    const runSync = jest.fn()
      .mockImplementationOnce(() => new Promise<void>(resolve => { releaseFirst = resolve; }))
      .mockResolvedValueOnce(undefined);
    const persistPending = jest.fn().mockResolvedValue(undefined);
    const coordinator = createSyncRetryCoordinator({
      getAccountKey: jest.fn().mockResolvedValue('account-a'),
      runSync,
      readPending: jest.fn().mockResolvedValue(false),
      persistPending,
    });

    await coordinator.hydrate();
    const first = coordinator.requestSync();
    await Promise.resolve();
    expect(runSync).toHaveBeenCalledTimes(1);

    const second = coordinator.requestSync();
    expect(coordinator.getSnapshot()).toBe('syncing');
    releaseFirst?.();
    await Promise.all([first, second]);
    await flushPersistence();

    expect(runSync).toHaveBeenCalledTimes(2);
    expect(runSync).toHaveBeenNthCalledWith(1, 'account-a');
    expect(runSync).toHaveBeenNthCalledWith(2, 'account-a');
    expect(coordinator.getSnapshot()).toBe('idle');
    expect(persistPending).toHaveBeenLastCalledWith('account-a', false);
  });

  it('keeps the original account marker pending when the account changes before upload', async () => {
    let currentAccount = 'account-a';
    const getAccountKey = jest.fn(() => Promise.resolve(currentAccount));
    const runSync = jest.fn(async (expectedAccount: string) => {
      if (expectedAccount !== currentAccount) throw new Error('account changed');
    });
    const persistPending = jest.fn().mockResolvedValue(undefined);
    const coordinator = createSyncRetryCoordinator({
      getAccountKey,
      runSync,
      readPending: jest.fn().mockResolvedValue(false),
      persistPending,
    });

    await coordinator.hydrate();
    currentAccount = 'account-b';
    await coordinator.requestSync();
    await flushPersistence();

    expect(runSync).toHaveBeenCalledWith('account-a');
    expect(coordinator.getSnapshot()).toBe('pending');
    expect(persistPending).toHaveBeenLastCalledWith('account-a', true);
    expect(persistPending).not.toHaveBeenCalledWith('account-b', false);
  });

  it('does not duplicate a committed durable-key row after a timeout', async () => {
    const remoteRows = new Map<string, { accountKey: string; payload: string }>();
    let attempt = 0;
    const runSync = jest.fn(async (accountKey: string) => {
      const durableKey = 'activity-device-a-7';
      const payload = JSON.stringify({ activity_key: durableKey, stars_delta: 1 });
      const existing = remoteRows.get(durableKey);
      if (existing && existing.payload !== payload) throw new Error('activity key content conflict');
      if (!existing) remoteRows.set(durableKey, { accountKey, payload });
      attempt += 1;
      if (attempt === 1) throw new Error('timeout after server commit');
    });
    const coordinator = createSyncRetryCoordinator({
      getAccountKey: jest.fn().mockResolvedValue('account-a'),
      runSync,
      readPending: jest.fn().mockResolvedValue(false),
      persistPending: jest.fn().mockResolvedValue(undefined),
    });

    await coordinator.hydrate();
    await coordinator.requestSync();
    expect(coordinator.getSnapshot()).toBe('pending');
    expect(remoteRows.size).toBe(1);

    await coordinator.retryWhenOnline(true);

    expect(runSync).toHaveBeenCalledTimes(2);
    expect(remoteRows.size).toBe(1);
    expect(remoteRows.get('activity-device-a-7')).toEqual({
      accountKey: 'account-a',
      payload: JSON.stringify({ activity_key: 'activity-device-a-7', stars_delta: 1 }),
    });
    expect(coordinator.getSnapshot()).toBe('idle');
  });

  it('does not let a delayed failure marker resurrect after a successful retry', async () => {
    let storedPending = false;
    let releaseDelayedFailure: (() => void) | undefined;
    const persistPending = jest.fn(async (_accountKey: string, pending: boolean) => {
      if (pending) {
        await new Promise<void>(resolve => { releaseDelayedFailure = resolve; });
      }
      storedPending = pending;
    });
    const runSync = jest.fn()
      .mockRejectedValueOnce(new Error('network unavailable'))
      .mockResolvedValueOnce(undefined);
    const coordinator = createSyncRetryCoordinator({
      getAccountKey: jest.fn().mockResolvedValue('account-a'),
      runSync,
      readPending: jest.fn().mockResolvedValue(false),
      persistPending,
    });

    await coordinator.hydrate();
    await coordinator.requestSync();
    await flushPersistence();
    expect(coordinator.getSnapshot()).toBe('pending');

    const retry = coordinator.retryWhenOnline(true);
    await retry;
    expect(coordinator.getSnapshot()).toBe('idle');
    expect(persistPending).not.toHaveBeenCalledWith('account-a', false);

    releaseDelayedFailure?.();
    await flushPersistence();

    expect(storedPending).toBe(false);
  });

  it('notifies subscribers for state transitions and stops after unsubscribe', async () => {
    const listener = jest.fn();
    const coordinator = createSyncRetryCoordinator({
      getAccountKey: jest.fn().mockResolvedValue('account-a'),
      runSync: jest.fn().mockResolvedValue(undefined),
      readPending: jest.fn().mockResolvedValue(false),
      persistPending: jest.fn().mockResolvedValue(undefined),
    });

    const unsubscribe = coordinator.subscribe(listener);
    await coordinator.hydrate();
    await coordinator.requestSync();
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    await coordinator.requestSync();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('fails closed when startup dependencies throw synchronously or during hydration', async () => {
    const syncThrowing = createSyncRetryCoordinator({
      getAccountKey: () => { throw new Error('secure store unavailable'); },
      runSync: jest.fn().mockResolvedValue(undefined),
      readPending: jest.fn().mockResolvedValue(false),
      persistPending: jest.fn().mockResolvedValue(undefined),
    });
    await syncThrowing.requestSync();
    expect(syncThrowing.getSnapshot()).toBe('pending');

    const runThrowing = createSyncRetryCoordinator({
      getAccountKey: jest.fn().mockResolvedValue('account-a'),
      runSync: () => { throw new Error('sync unavailable'); },
      readPending: jest.fn().mockResolvedValue(false),
      persistPending: jest.fn().mockResolvedValue(undefined),
    });
    await runThrowing.requestSync();
    expect(runThrowing.getSnapshot()).toBe('pending');

    const hydrateThrowing = createSyncRetryCoordinator({
      getAccountKey: jest.fn().mockRejectedValue(new Error('corrupt marker')),
      runSync: jest.fn().mockResolvedValue(undefined),
      readPending: jest.fn().mockResolvedValue(false),
      persistPending: jest.fn().mockResolvedValue(undefined),
    });
    await expect(hydrateThrowing.hydrate()).resolves.toBeUndefined();
    expect(hydrateThrowing.getSnapshot()).toBe('idle');
  });

  it('does not upload without an account and rejects an account switch before publishing success', async () => {
    const noAccountSync = jest.fn().mockResolvedValue(undefined);
    const noAccount = createSyncRetryCoordinator({
      getAccountKey: jest.fn().mockResolvedValue(null),
      runSync: noAccountSync,
      readPending: jest.fn().mockResolvedValue(false),
      persistPending: jest.fn().mockResolvedValue(undefined),
    });
    await noAccount.hydrate();
    await noAccount.requestSync();
    await noAccount.retryWhenOnline(true);
    expect(noAccount.getSnapshot()).toBe('idle');
    expect(noAccountSync).toHaveBeenCalledWith('unknown');

    const getAccountKey = jest.fn()
      .mockResolvedValueOnce('account-a')
      .mockResolvedValueOnce('account-b');
    const runSync = jest.fn().mockResolvedValue(undefined);
    const switched = createSyncRetryCoordinator({
      getAccountKey,
      runSync,
      readPending: jest.fn().mockResolvedValue(false),
      persistPending: jest.fn().mockResolvedValue(undefined),
    });
    await switched.hydrate();
    await switched.requestSync();

    expect(runSync).toHaveBeenCalledWith('account-a');
    expect(switched.getSnapshot()).toBe('pending');
  });

  it('keeps the local state retryable when persistence itself fails', async () => {
    const coordinator = createSyncRetryCoordinator({
      getAccountKey: jest.fn().mockResolvedValue('account-a'),
      runSync: jest.fn().mockRejectedValue(new Error('offline')),
      readPending: jest.fn().mockResolvedValue(false),
      persistPending: jest.fn().mockRejectedValue(new Error('storage unavailable')),
    });

    await coordinator.hydrate();
    await coordinator.requestSync();
    await flushPersistence();

    expect(coordinator.getSnapshot()).toBe('pending');
  });

  it('handles a cold-start request race, idempotent hydration, and corrupt pending metadata', async () => {
    let resolveAccount!: (account: string | null) => void;
    const accountRead = new Promise<string | null>(resolve => { resolveAccount = resolve; });
    const runSync = jest.fn().mockResolvedValue(undefined);
    const coordinator = createSyncRetryCoordinator({
      getAccountKey: jest.fn(() => accountRead),
      runSync,
      readPending: jest.fn().mockResolvedValue(false),
      persistPending: jest.fn().mockResolvedValue(undefined),
    });

    const first = coordinator.requestSync();
    const second = coordinator.requestSync();
    resolveAccount(null);
    await Promise.all([first, second]);
    await coordinator.retryWhenOnline(false);
    expect(runSync).toHaveBeenCalledTimes(2);

    const stable = createSyncRetryCoordinator({
      getAccountKey: jest.fn().mockResolvedValue('account-a'),
      runSync: jest.fn().mockResolvedValue(undefined),
      readPending: jest.fn().mockResolvedValue(false),
      persistPending: jest.fn().mockResolvedValue(undefined),
    });
    await stable.hydrate();
    await stable.hydrate();
    expect(stable.getSnapshot()).toBe('idle');

    const corruptMarker = createSyncRetryCoordinator({
      getAccountKey: jest.fn().mockResolvedValue('account-a'),
      runSync: jest.fn().mockResolvedValue(undefined),
      readPending: jest.fn().mockRejectedValue(new Error('marker unavailable')),
      persistPending: jest.fn().mockResolvedValue(undefined),
    });
    await expect(corruptMarker.hydrate()).resolves.toBeUndefined();
    expect(corruptMarker.getSnapshot()).toBe('idle');
  });
});
