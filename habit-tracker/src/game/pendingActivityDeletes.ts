import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SQLiteDatabase } from 'expo-sqlite';
import { requireNormalizedAccountEmail } from '../lib/accountIdentity';

const PENDING_ACTIVITY_DELETES_KEY_PREFIX = 'pending_activity_deletes:';
const DEFAULT_BATCH_SIZE = 100;
const MAX_IDS_PER_INSERT = 300;

type PendingActivityDeleteDb = Pick<SQLiteDatabase, 'getAllAsync' | 'runAsync'>;
type PendingActivityDeleteUserDb = PendingActivityDeleteDb & Pick<SQLiteDatabase, 'getFirstAsync'>;
type PendingActivityDeleteImportDb = PendingActivityDeleteUserDb &
  Pick<SQLiteDatabase, 'withTransactionAsync'>;

type PendingActivityDeleteRow = {
  local_activity_id: number;
  activity_key?: string | null;
};

type DeleteRemoteBatch = (localActivityIds: number[]) => Promise<unknown>;
type DeleteRemoteIdentityBatch = (rows: PendingActivityDeleteEntry[]) => Promise<unknown>;
type AssertActive = () => void;

export type PendingActivityDeleteEntry = {
  local_activity_id: number;
  activity_key: string | null;
};

export type DrainPendingActivityDeletesOptions = {
  legacyUserId?: number;
  batchSize?: number;
  assertActive?: AssertActive;
};

function getPendingActivityDeletesKey(userId: number): string {
  return `${PENDING_ACTIVITY_DELETES_KEY_PREFIX}${userId}`;
}

function requireAccountKey(value: string): string {
  return requireNormalizedAccountEmail(value);
}

function normalizeIds(ids: readonly unknown[]): number[] {
  return [
    ...new Set(
      ids.filter(
        (id): id is number => typeof id === 'number' && Number.isSafeInteger(id) && id > 0,
      ),
    ),
  ];
}

function parseLegacyIds(raw: string): number[] | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? normalizeIds(parsed) : null;
  } catch {
    return null;
  }
}

async function resolveAccountKeyForUser(
  db: Pick<SQLiteDatabase, 'getFirstAsync'>,
  userId: number,
): Promise<string> {
  const row = await db.getFirstAsync<{ account_key: string | null }>(
    'SELECT account_key FROM users WHERE id = ?',
    [userId],
  );
  if (typeof row?.account_key !== 'string') {
    throw new Error(`Stable account key unavailable for local user ${userId}`);
  }
  const accountKey = requireAccountKey(row.account_key);
  if (accountKey !== row.account_key) {
    throw new Error(`Stable account key is not canonical for local user ${userId}`);
  }
  return accountKey;
}

export async function enqueuePendingActivityDeletes(
  db: PendingActivityDeleteDb,
  accountKeyValue: string,
  localActivityIds: readonly number[],
): Promise<void> {
  const ids = normalizeIds(localActivityIds);
  if (ids.length === 0) return;
  const accountKey = requireAccountKey(accountKeyValue);

  const createdAt = Date.now();
  for (let offset = 0; offset < ids.length; offset += MAX_IDS_PER_INSERT) {
    const chunk = ids.slice(offset, offset + MAX_IDS_PER_INSERT);
    const values = chunk.map(() => '(?, ?, ?)').join(', ');
    const params = chunk.flatMap((localActivityId) => [accountKey, localActivityId, createdAt]);

    await db.runAsync(
      `INSERT OR IGNORE INTO pending_activity_deletes
         (account_key, local_activity_id, created_at)
       VALUES ${values}`,
      params,
    );
  }
}

/**
 * Resolve the canonical account on the same SQLite transaction connection /
 * context supplied by the hard-delete caller, then journal the deleted IDs.
 * Migration v32's delete trigger has already preserved each row's
 * activity_key; imported rows without a confirmed key remain pending until
 * their identity is resolved.
 */
export async function enqueuePendingActivityDeletesForUser(
  db: PendingActivityDeleteUserDb,
  userId: number,
  localActivityIds: readonly number[],
): Promise<void> {
  if (normalizeIds(localActivityIds).length === 0) return;
  const accountKey = await resolveAccountKeyForUser(db, userId);
  await enqueuePendingActivityDeletes(db, accountKey, localActivityIds);
}

export async function readPendingActivityDeletes(
  db: PendingActivityDeleteDb,
  accountKeyValue: string,
  limit = DEFAULT_BATCH_SIZE,
): Promise<number[]> {
  const rows = await readPendingActivityDeleteEntries(db, accountKeyValue, limit);
  return rows.map((row) => row.local_activity_id);
}

export async function readPendingActivityDeleteEntries(
  db: PendingActivityDeleteDb,
  accountKeyValue: string,
  limit = DEFAULT_BATCH_SIZE,
): Promise<PendingActivityDeleteEntry[]> {
  const accountKey = requireAccountKey(accountKeyValue);
  const normalizedLimit = Number.isSafeInteger(limit) && limit > 0 ? limit : DEFAULT_BATCH_SIZE;
  const rows = await db.getAllAsync<PendingActivityDeleteRow>(
    `SELECT local_activity_id, activity_key
       FROM pending_activity_deletes
      WHERE account_key = ?
      ORDER BY created_at ASC, local_activity_id ASC
      LIMIT ?`,
    [accountKey, normalizedLimit],
  );

  return rows.map((row) => ({
    local_activity_id: row.local_activity_id,
    activity_key: typeof row.activity_key === 'string' && row.activity_key.length > 0
      ? row.activity_key
      : null,
  }));
}

export async function acknowledgePendingActivityDeletes(
  db: PendingActivityDeleteDb,
  accountKeyValue: string,
  localActivityIds: readonly number[],
): Promise<void> {
  const ids = normalizeIds(localActivityIds);
  if (ids.length === 0) return;
  const accountKey = requireAccountKey(accountKeyValue);

  const placeholders = ids.map(() => '?').join(', ');
  await db.runAsync(
    `DELETE FROM pending_activity_deletes
      WHERE account_key = ?
        AND local_activity_id IN (${placeholders})`,
    [accountKey, ...ids],
  );
}

export async function acknowledgePendingActivityDeleteEntries(
  db: PendingActivityDeleteDb,
  accountKeyValue: string,
  rows: readonly PendingActivityDeleteEntry[],
): Promise<void> {
  const accountKey = requireAccountKey(accountKeyValue);
  const legacyIds = rows
    .filter((row) => row.activity_key === null)
    .map((row) => row.local_activity_id);
  if (legacyIds.length > 0) {
    await acknowledgePendingActivityDeletes(db, accountKey, legacyIds);
  }

  for (const row of rows) {
    if (row.activity_key === null) continue;
    await db.runAsync(
      `DELETE FROM pending_activity_deletes
        WHERE account_key = ?
          AND local_activity_id = ?
          AND activity_key = ?`,
      [accountKey, row.local_activity_id, row.activity_key],
    );
  }
}

export async function importLegacyPendingActivityDeletes(
  db: PendingActivityDeleteImportDb,
  legacyUserId: number,
  expectedAccountKeyValue: string,
): Promise<void> {
  const key = getPendingActivityDeletesKey(legacyUserId);
  const raw = await AsyncStorage.getItem(key);
  if (raw === null) return;

  const ids = parseLegacyIds(raw);
  if (ids === null) return;

  const expectedAccountKey = requireAccountKey(expectedAccountKeyValue);
  const resolvedAccountKey = await resolveAccountKeyForUser(db, legacyUserId);
  if (resolvedAccountKey !== expectedAccountKey) {
    throw new Error('Legacy outbox account mismatch');
  }

  await db.withTransactionAsync(async () => {
    await enqueuePendingActivityDeletes(db, resolvedAccountKey, ids);
  });
  await AsyncStorage.removeItem(key);
}

/** Discard the legacy queue only after a broader remote reset/delete succeeded. */
export async function discardLegacyPendingActivityDeletes(userId: number): Promise<void> {
  await AsyncStorage.removeItem(getPendingActivityDeletesKey(userId));
}

function validateAcknowledgedIds(requestedIds: readonly number[], value: unknown): number[] {
  if (!Array.isArray(value)) throw new Error('Invalid activity delete acknowledgement');
  const acknowledgedIds = normalizeIds(value);
  if (acknowledgedIds.length !== value.length || acknowledgedIds.length === 0) {
    throw new Error('Invalid activity delete acknowledgement');
  }
  const requested = new Set(requestedIds);
  if (acknowledgedIds.some(id => !requested.has(id))) {
    throw new Error('Invalid activity delete acknowledgement');
  }
  return acknowledgedIds;
}

export async function drainPendingActivityDeletes(
  db: PendingActivityDeleteImportDb,
  accountKeyValue: string,
  deleteRemoteBatch: DeleteRemoteBatch,
  options: DrainPendingActivityDeletesOptions = {},
): Promise<void> {
  const accountKey = requireAccountKey(accountKeyValue);
  if (options.legacyUserId !== undefined) {
    await importLegacyPendingActivityDeletes(db, options.legacyUserId, accountKey);
  }

  const assertActive = options.assertActive ?? (() => undefined);
  while (true) {
    assertActive();
    const ids = await readPendingActivityDeletes(db, accountKey, options.batchSize);
    if (ids.length === 0) return;

    assertActive();
    const acknowledgedIds = validateAcknowledgedIds(ids, await deleteRemoteBatch(ids));
    assertActive();
    await acknowledgePendingActivityDeletes(db, accountKey, acknowledgedIds);
  }
}

function validateAcknowledgedEntries(
  requestedRows: readonly PendingActivityDeleteEntry[],
  value: unknown,
): PendingActivityDeleteEntry[] {
  if (!Array.isArray(value)) throw new Error('Invalid activity delete acknowledgement');
  const requested = new Map(
    requestedRows.map((row) => [`${row.local_activity_id}:${row.activity_key ?? ''}`, row]),
  );
  const acknowledged: PendingActivityDeleteEntry[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') {
      throw new Error('Invalid activity delete acknowledgement');
    }
    const candidate = item as { local_activity_id?: unknown; activity_key?: unknown };
    if (!Number.isSafeInteger(candidate.local_activity_id) || (candidate.local_activity_id as number) <= 0) {
      throw new Error('Invalid activity delete acknowledgement');
    }
    const activityKey = candidate.activity_key === null || candidate.activity_key === undefined
      ? null
      : typeof candidate.activity_key === 'string' && candidate.activity_key.length > 0
        ? candidate.activity_key
        : undefined;
    if (activityKey === undefined) throw new Error('Invalid activity delete acknowledgement');
    const key = `${candidate.local_activity_id}:${activityKey ?? ''}`;
    const row = requested.get(key);
    if (!row || acknowledged.some((item) => item.local_activity_id === row.local_activity_id)) {
      throw new Error('Invalid activity delete acknowledgement');
    }
    acknowledged.push(row);
  }
  if (acknowledged.length === 0) throw new Error('Invalid activity delete acknowledgement');
  return acknowledged;
}

/**
 * Identity-aware drain used after the stable activity-key migration. The
 * legacy numeric drain remains above so old callers and imported queues keep
 * their original contract during rollout.
 */
export async function drainPendingActivityDeleteEntries(
  db: PendingActivityDeleteImportDb,
  accountKeyValue: string,
  deleteRemoteBatch: DeleteRemoteIdentityBatch,
  options: DrainPendingActivityDeletesOptions = {},
): Promise<void> {
  const accountKey = requireAccountKey(accountKeyValue);
  if (options.legacyUserId !== undefined) {
    await importLegacyPendingActivityDeletes(db, options.legacyUserId, accountKey);
  }

  const assertActive = options.assertActive ?? (() => undefined);
  while (true) {
    assertActive();
    const rows = await readPendingActivityDeleteEntries(db, accountKey, options.batchSize);
    if (rows.length === 0) return;

    assertActive();
    const acknowledgedRows = validateAcknowledgedEntries(rows, await deleteRemoteBatch(rows));
    assertActive();
    await acknowledgePendingActivityDeleteEntries(db, accountKey, acknowledgedRows);
  }
}
