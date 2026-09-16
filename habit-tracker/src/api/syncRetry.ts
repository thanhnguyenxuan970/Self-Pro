import AsyncStorage from '@react-native-async-storage/async-storage';
import { getStoredGoogleUser } from '../lib/googleUserStorage';
import { syncCurrentUserToSupabase } from './syncService';
import { supabase } from './supabase';
import { isQaSandboxActive } from '../qa/qaSandbox';

export type SyncStatus = 'idle' | 'syncing' | 'pending';

type SyncRetryDependencies = {
  getAccountKey: () => Promise<string | null>;
  runSync: (accountKey: string) => Promise<void>;
  readPending: (accountKey: string) => Promise<boolean>;
  persistPending: (accountKey: string, pending: boolean) => Promise<void>;
};

type SyncStatusListener = () => void;

const PENDING_SYNC_KEY = 'habit_sync_pending_v1';

/**
 * Serializes background sync requests and exposes the only user-meaningful
 * states: actively syncing, safely stored locally but pending, and idle.
 */
export function createSyncRetryCoordinator(dependencies: SyncRetryDependencies) {
  let status: SyncStatus = 'idle';
  let hydrated = false;
  let hydratedForAccount: string | null = null;
  let inFlight: Promise<void> | null = null;
  let requestedRevision = 0;
  const listeners = new Set<SyncStatusListener>();

  const publish = (nextStatus: SyncStatus) => {
    if (status === nextStatus) return;
    status = nextStatus;
    listeners.forEach(listener => listener());
  };

  const persist = async (accountKey: string, pending: boolean) => {
    try {
      await dependencies.persistPending(accountKey, pending);
    } catch {
      // A successful cloud write remains successful when this display hint
      // cannot be updated. Retaining a stale pending marker only causes a
      // safe, idempotent retry after a later restart.
    }
  };

  const startSync = (revision: number): Promise<void> => {
    if (inFlight || requestedRevision !== revision) return inFlight ?? Promise.resolve();
    publish('syncing');
    const expectedAccountKey = hydratedForAccount;
    let accountKeyPromise: Promise<string | null>;
    try {
      // Start the account read and upload in the same turn. This keeps a
      // mutation callback from waiting on Secure Store, while the hydrated
      // account key still fences the upload to the expected identity.
      accountKeyPromise = Promise.resolve(dependencies.getAccountKey());
    } catch (error) {
      accountKeyPromise = Promise.reject(error);
    }
    let syncPromise: Promise<void>;
    try {
      syncPromise = dependencies.runSync(expectedAccountKey ?? 'unknown');
    } catch (error) {
      syncPromise = Promise.reject(error);
    }
    const work = (async () => {
      let accountKey: string | null = null;
      try {
        accountKey = await accountKeyPromise;
        if (expectedAccountKey && accountKey !== expectedAccountKey) {
          // The upload was started eagerly for callback latency. Consume its
          // result before rejecting the identity mismatch so a rejected
          // account-fenced upload cannot become an unhandled promise.
          await syncPromise.catch(() => undefined);
          throw new Error('Sync account changed before upload');
        }
        if (!accountKey) {
          await syncPromise;
          publish('idle');
          return;
        }
        hydrated = true;
        hydratedForAccount = accountKey;
        await syncPromise;
        if (requestedRevision === revision) {
          publish('idle');
          void persist(accountKey, false);
        } else {
          publish('syncing');
          void persist(accountKey, true);
        }
      } catch {
        // The local SQLite transaction has already committed. Do not call it
        // cloud-saved; preserve the retryable state instead.
        publish('pending');
        const markerAccount = expectedAccountKey ?? accountKey;
        if (markerAccount) void persist(markerAccount, true);
      } finally {
        inFlight = null;
        if (requestedRevision !== revision) await startSync(requestedRevision);
      }
    })();
    inFlight = work;
    return work;
  };

  const requestSync = (): Promise<void> => {
    const revision = ++requestedRevision;
    if (inFlight) {
      // A mutation that arrives during an upload is not covered by that
      // upload's snapshot. Keep a durable hint when the account is already
      // known; the completion path will run a follow-up upload.
      if (hydratedForAccount) void persist(hydratedForAccount, true);
      return inFlight;
    }
    return startSync(revision);
  };

  return {
    async hydrate(): Promise<void> {
      try {
        const accountKey = await dependencies.getAccountKey();
        if (hydrated && hydratedForAccount === accountKey) return;
        hydrated = true;
        hydratedForAccount = accountKey;
        if (!accountKey) {
          publish('idle');
          return;
        }
        publish((await dependencies.readPending(accountKey)) ? 'pending' : 'idle');
      } catch {
        // A missing/corrupt display hint cannot make persisted activity unsafe.
      }
    },
    requestSync,
    retryWhenOnline(isOnline: boolean): Promise<void> {
      if (!isOnline || status !== 'pending') return Promise.resolve();
      return requestSync();
    },
    getSnapshot(): SyncStatus {
      return status;
    },
    subscribe(listener: SyncStatusListener): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export const syncRetryCoordinator = createSyncRetryCoordinator({
  // Keep a local-only key for the signed-out shell. The sync service itself
  // remains a no-op without an account, while authenticated markers are
  // scoped to the stable Google subject and cannot bleed between accounts.
  getAccountKey: async () => (await getStoredGoogleUser())?.sub ?? 'local-device',
  runSync: async accountKey => {
    const upload = syncCurrentUserToSupabase(accountKey === 'unknown' ? undefined : accountKey);
    await upload;
    const user = await getStoredGoogleUser();
    if (user && !supabase && !isQaSandboxActive()) throw new Error('Sync endpoint is not configured');
    if (user && accountKey !== 'unknown' && user.sub !== accountKey) {
      throw new Error('Sync account changed before upload');
    }
  },
  readPending: async accountKey => (await AsyncStorage.getItem(`${PENDING_SYNC_KEY}:${accountKey}`)) === '1',
  persistPending: async (accountKey, pending) => {
    const key = `${PENDING_SYNC_KEY}:${accountKey}`;
    if (pending) await AsyncStorage.setItem(key, '1');
    else await AsyncStorage.removeItem(key);
  },
});

export const hydrateSyncRetryState = () => syncRetryCoordinator.hydrate();
export const requestCurrentUserSync = () => syncRetryCoordinator.requestSync();
export const retryPendingSyncWhenOnline = (isOnline: boolean) => syncRetryCoordinator.retryWhenOnline(isOnline);
export const getSyncStatus = () => syncRetryCoordinator.getSnapshot();
export const subscribeSyncStatus = (listener: SyncStatusListener) => syncRetryCoordinator.subscribe(listener);
