import type { SQLiteDatabase } from 'expo-sqlite';

type OutboxRow = {
  account_key: string;
  local_activity_id: number;
  created_at: number;
  activity_key?: string | null;
};

export class PendingActivityDeleteTestDb {
  private rows = new Map<string, OutboxRow>();
  private userAccountKeys = new Map<number, string>();
  beforeRunAsync?: (sql: string, params: readonly unknown[]) => Promise<void>;
  otherGetAllAsync?: (sql: string, params: readonly unknown[]) => Promise<unknown[]>;
  otherGetFirstAsync?: (sql: string, params: readonly unknown[]) => Promise<unknown>;

  private key(accountKey: string, localActivityId: number): string {
    return `${accountKey}:${localActivityId}`;
  }

  setAccountKey(userId: number, accountKey: string): void {
    this.userAccountKeys.set(userId, accountKey);
  }

  setActivityKey(accountKey: string, localActivityId: number, activityKey: string): void {
    const row = this.rows.get(this.key(accountKey, localActivityId));
    if (!row) throw new Error(`Missing outbox row ${accountKey}:${localActivityId}`);
    row.activity_key = activityKey;
  }

  getAllAsync = jest.fn(async (sql: string, params: readonly unknown[] = []) => {
    if (!sql.includes('FROM pending_activity_deletes')) {
      return this.otherGetAllAsync?.(sql, params) ?? [];
    }
    const accountKey = String(params[0]);
    const limit = Number(params[1] ?? Number.MAX_SAFE_INTEGER);
    return [...this.rows.values()]
      .filter(row => row.account_key === accountKey)
      .sort((left, right) => left.created_at - right.created_at
        || left.local_activity_id - right.local_activity_id)
      .slice(0, limit)
      .map(row => ({ local_activity_id: row.local_activity_id, activity_key: row.activity_key ?? null }));
  });

  getFirstAsync = jest.fn(async (sql: string, params: readonly unknown[] = []) => {
    if (sql === 'SELECT account_key FROM users WHERE id = ?') {
      const accountKey = this.userAccountKeys.get(Number(params[0]));
      return accountKey === undefined ? null : { account_key: accountKey };
    }
    return this.otherGetFirstAsync?.(sql, params) ?? null;
  });

  runAsync = jest.fn(async (sql: string, params: readonly unknown[] = []) => {
    await this.beforeRunAsync?.(sql, params);
    if (sql.includes('INSERT OR IGNORE INTO pending_activity_deletes')) {
      for (let index = 0; index < params.length; index += 3) {
        const row = {
          account_key: String(params[index]),
          local_activity_id: Number(params[index + 1]),
          created_at: Number(params[index + 2]),
        };
        const key = this.key(row.account_key, row.local_activity_id);
        if (!this.rows.has(key)) this.rows.set(key, row);
      }
      return { changes: 1, lastInsertRowId: 0 };
    }
    if (sql.includes('DELETE FROM pending_activity_deletes')) {
      const accountKey = String(params[0]);
      for (const id of params.slice(1)) this.rows.delete(this.key(accountKey, Number(id)));
      return { changes: Math.max(0, params.length - 1), lastInsertRowId: 0 };
    }
    return { changes: 1, lastInsertRowId: 0 };
  });

  withTransactionAsync = jest.fn(async (callback: () => Promise<void>) => {
    const snapshot = new Map(this.rows);
    try {
      await callback();
    } catch (error) {
      this.rows = snapshot;
      throw error;
    }
  });

  asDatabase(): SQLiteDatabase {
    return this as unknown as SQLiteDatabase;
  }
}
