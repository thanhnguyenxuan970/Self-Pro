import * as SQLite from 'expo-sqlite';
import { runMigrations } from './migrations';

let _dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (_dbPromise) return _dbPromise;
  _dbPromise = (async () => {
    const db = await SQLite.openDatabaseAsync('habit_tracker.db');
    await runMigrations(db);
    return db;
  })();
  return _dbPromise;
}
