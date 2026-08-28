import type { SQLiteBindValue, SQLiteDatabase } from 'expo-sqlite';
import { getWeekStartFor } from '../utils/formatters';
import {
  filterRowsByActivityStartDate,
  isActivityDateIncluded,
  sumPositiveStarsFromRows,
} from './accountActivityBoundary';

export const CLOUD_BACKUP_SCHEMA_VERSION = 1 as const;

type BackupRow = Record<string, unknown>;

export type CloudBackupPayload = {
  schema_version: typeof CLOUD_BACKUP_SCHEMA_VERSION;
  user: BackupRow | null;
  categories: BackupRow[];
  task_types: BackupRow[];
  activity_log: BackupRow[];
  daily_summary: BackupRow[];
  weekly_summary: BackupRow[];
  reward_unlocks: BackupRow[];
  fund_transactions: BackupRow[];
  streak_freezes: BackupRow[];
  treats: BackupRow[];
  treat_history: BackupRow[];
  challenges: BackupRow[];
  challenge_log: BackupRow[];
  challenge_days: BackupRow[];
  achievements: BackupRow[];
  milestone_stars: BackupRow[];
  boost_events: BackupRow[];
};

/**
 * Keep the raw local audit trail intact while preventing a confirmed fake-data
 * period from entering the cloud snapshot or being restored into a new device.
 * Derived activity tables use the same inclusive start date so their totals do
 * not drift back when a backup is restored.
 */
export function filterCloudBackupPayload(
  payload: CloudBackupPayload,
  activityStartDate: string | null,
): CloudBackupPayload {
  if (activityStartDate === null) return payload;

  const activityLog = filterRowsByActivityStartDate(payload.activity_log, activityStartDate);
  return {
    ...payload,
    user: payload.user
      ? {
          ...payload.user,
          lifetime_stars: sumPositiveStarsFromRows(activityLog),
          // The stored tier is a high-water value from the unfiltered history.
          // Restore recalculates it from the filtered lifetime total, and a
          // null value keeps local/cloud CAS views comparable before that.
          current_tier_id: null,
        }
      : null,
    activity_log: activityLog,
    daily_summary: filterRowsByActivityStartDate(payload.daily_summary, activityStartDate),
    weekly_summary: payload.weekly_summary.filter(row => (
      typeof row.week_start === 'string'
      && isActivityDateIncluded(row.week_start, activityStartDate)
    )),
  };
}

export type BackupQueryDb = Pick<SQLiteDatabase, 'getFirstAsync' | 'getAllAsync' | 'runAsync'>;
type BackupDb = BackupQueryDb & Pick<SQLiteDatabase, 'withTransactionAsync'> & {
  withExclusiveTransactionAsync?: (task: (transactionDb: BackupQueryDb) => Promise<void>) => Promise<void>;
};

type AssertActive = () => void;

const alwaysActive: AssertActive = () => undefined;

async function rows<T extends BackupRow>(
  db: BackupQueryDb,
  sql: string,
  userId: number,
  assertActive: AssertActive,
): Promise<T[]> {
  assertActive();
  const result = await db.getAllAsync<T>(sql, [userId]);
  assertActive();
  return result;
}

/** Read every user-owned local table that must survive an app reinstall. */
export async function buildUserDataBackup(
  db: BackupDb,
  userId: number,
  assertActive: AssertActive = alwaysActive,
  activityStartDate: string | null = null,
): Promise<CloudBackupPayload> {
  let backup!: CloudBackupPayload;
  const readSnapshot = async (readDb: BackupQueryDb): Promise<void> => {
    assertActive();
    const user = await readDb.getFirstAsync<BackupRow>(
      `SELECT username, timezone, carry_debt, currency, last_seen_week_start,
              notification_time, notification_time_2, notification_time_3,
              treat_stars, treat_stars_lifetime, value_per_star,
              penalty_hits_treats, lifetime_stars, current_tier_id
         FROM users WHERE id = ?`,
      [userId],
    );

    backup = {
    schema_version: CLOUD_BACKUP_SCHEMA_VERSION,
    user: user ?? null,
    categories: await rows(readDb, 'SELECT id, name, icon, sort_order, archived FROM categories WHERE user_id = ? ORDER BY id', userId, assertActive),
    task_types: await rows(readDb, `SELECT id, name, kind, is_time_based, base_points, star_penalty,
                                      category_id, icon, archived, sort_order, is_pinned, is_template
                                 FROM task_types WHERE user_id = ? ORDER BY id`, userId, assertActive),
    activity_log: await rows(readDb, `SELECT id, task_type_id, kind, duration_min, points_earned,
                                        stars_delta, source, logged_at, local_date, week_start,
                                        note, is_backfill, is_clock_suspect
                                   FROM activity_log WHERE user_id = ? ORDER BY id`, userId, assertActive),
    daily_summary: await rows(readDb, `SELECT id, local_date, total_points, bonus_star_awarded, streak_count
                                    FROM daily_summary WHERE user_id = ? ORDER BY id`, userId, assertActive),
    weekly_summary: await rows(readDb, `SELECT id, week_start, total_points, weekly_stars, peak_stars,
                                           current_tier_id, start_debt, finalized
                                      FROM weekly_summary WHERE user_id = ? ORDER BY id`, userId, assertActive),
    reward_unlocks: await rows(readDb, `SELECT id, tier_id, week_start, stars_at_unlock, reward_amount,
                                          claimed, claimed_at
                                     FROM reward_unlocks WHERE user_id = ? ORDER BY id`, userId, assertActive),
    fund_transactions: await rows(readDb, `SELECT id, type, amount, currency, source_unlock_id, note, occurred_at
                                         FROM fund_transactions WHERE user_id = ? ORDER BY id`, userId, assertActive),
    streak_freezes: await rows(readDb, `SELECT id, local_date, purchased_at
                                      FROM streak_freezes WHERE user_id = ? ORDER BY id`, userId, assertActive),
    treats: await rows(readDb, `SELECT id, name, icon, target_stars, approx_amount, currency, status,
                                  sort_order, reached_at, enjoyed_at, created_at
                             FROM treats WHERE user_id = ? ORDER BY id`, userId, assertActive),
    treat_history: await rows(readDb, `SELECT id, treat_id, name, stars_spent, amount, currency, enjoyed_at
                                    FROM treat_history WHERE user_id = ? ORDER BY id`, userId, assertActive),
    challenges: await rows(readDb, `SELECT id, name, task_type_id, mode, target_days, weekly_target, total_weeks,
                                       start_date, status, freezes_left, freeze_used, streak_current,
                                       completed_at, before_photo, after_photo, notifications_enabled,
                                       notification_id, min_duration, min_count, created_at
                                  FROM challenges WHERE user_id = ? ORDER BY id`, userId, assertActive),
    challenge_log: await rows(readDb, `SELECT cl.id, cl.challenge_id, cl.local_date, cl.state
                                     FROM challenge_log cl
                                     JOIN challenges c ON c.id = cl.challenge_id
                                    WHERE c.user_id = ? ORDER BY cl.id`, userId, assertActive),
    challenge_days: await rows(readDb, `SELECT cd.id, cd.challenge_id, cd.local_date, cd.logged_at
                                      FROM challenge_days cd
                                      JOIN challenges c ON c.id = cd.challenge_id
                                     WHERE c.user_id = ? ORDER BY cd.id`, userId, assertActive),
    achievements: await rows(readDb, `SELECT id, key, rarity, earned_at, source_type, source_id
                                    FROM achievements WHERE user_id = ? ORDER BY id`, userId, assertActive),
    milestone_stars: await rows(readDb, `SELECT id, milestone_days, stars, awarded_at
                                       FROM milestone_stars WHERE user_id = ? ORDER BY id`, userId, assertActive),
    boost_events: await rows(readDb, `SELECT id, local_date, multiplier, claim_deadline, claimed_at,
                                        expires_at, dismissed_at, created_at
                                   FROM boost_events WHERE user_id = ? ORDER BY id`, userId, assertActive),
    };
    assertActive();
  };

  // A transaction gives every table read one SQLite snapshot. Test doubles
  // and older bridges may not expose the transaction helper, so the fallback
  // keeps the function usable while production Expo SQLite remains atomic.
  if (typeof db.withExclusiveTransactionAsync === 'function') {
    await db.withExclusiveTransactionAsync(readSnapshot);
  } else if (typeof db.withTransactionAsync === 'function') {
    await db.withTransactionAsync(() => readSnapshot(db));
  } else {
    // Minimal test/web adapters may expose only the query methods. Android
    // production uses the exclusive transaction branch above.
    await readSnapshot(db);
  }
  return filterCloudBackupPayload(backup, activityStartDate);
}

function isRecord(value: unknown): value is BackupRow {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

const BACKUP_ARRAY_KEYS = [
  'categories', 'task_types', 'activity_log', 'daily_summary', 'weekly_summary',
  'reward_unlocks', 'fund_transactions', 'streak_freezes', 'treats', 'treat_history',
  'challenges', 'challenge_log', 'challenge_days', 'achievements', 'milestone_stars',
  'boost_events',
] as const;

type BackupFieldRule = {
  kind: 'number' | 'integer' | 'string' | 'date' | 'timestamp';
  optional?: boolean;
  nullable?: boolean;
  min?: number;
  max?: number;
  maxLength?: number;
  nonEmpty?: boolean;
  values?: readonly string[];
};

const MAX_BACKUP_NUMBER = 1_000_000_000_000;
const MAX_BACKUP_TIMESTAMP = 32_503_680_000_000; // 3000-01-01 UTC
const MAX_BACKUP_TEXT_LENGTH = 1_048_576;
const dateField = (options: Partial<BackupFieldRule> = {}): BackupFieldRule => ({ kind: 'date', ...options });
const timestampField = (options: Partial<BackupFieldRule> = {}): BackupFieldRule => ({ kind: 'timestamp', ...options });
const integerField = (options: Partial<BackupFieldRule> = {}): BackupFieldRule => ({ kind: 'integer', ...options });
const numberField = (options: Partial<BackupFieldRule> = {}): BackupFieldRule => ({ kind: 'number', ...options });
const stringField = (options: Partial<BackupFieldRule> = {}): BackupFieldRule => ({ kind: 'string', maxLength: MAX_BACKUP_TEXT_LENGTH, ...options });

const BACKUP_ROW_RULES: Record<string, Record<string, BackupFieldRule>> = {
  categories: {
    name: stringField({ nonEmpty: true }), icon: stringField({ optional: true, nullable: true }),
    sort_order: integerField({ optional: true, min: -MAX_BACKUP_NUMBER, max: MAX_BACKUP_NUMBER }),
    archived: integerField({ optional: true, min: 0, max: 1 }),
  },
  task_types: {
    name: stringField({ nonEmpty: true }), kind: stringField({ optional: true, nonEmpty: true, values: ['GOOD', 'BAD'] }),
    is_time_based: integerField({ optional: true, min: 0, max: 1 }),
    base_points: numberField({ optional: true, min: 0, max: MAX_BACKUP_NUMBER }),
    star_penalty: numberField({ optional: true, min: 0, max: MAX_BACKUP_NUMBER }),
    category_id: integerField({ optional: true, nullable: true, min: 1, max: Number.MAX_SAFE_INTEGER }),
    icon: stringField({ optional: true, nullable: true }),
    archived: integerField({ optional: true, min: 0, max: 1 }),
    sort_order: integerField({ optional: true, min: -MAX_BACKUP_NUMBER, max: MAX_BACKUP_NUMBER }),
    is_pinned: integerField({ optional: true, min: 0, max: 1 }),
    is_template: integerField({ optional: true, min: 0, max: 1 }),
  },
  activity_log: {
    task_type_id: integerField({ optional: true, nullable: true, min: 1, max: Number.MAX_SAFE_INTEGER }),
    kind: stringField({ optional: true, nonEmpty: true }),
    duration_min: integerField({ optional: true, nullable: true, min: 0, max: MAX_BACKUP_NUMBER }),
    points_earned: integerField({ optional: true, min: 0, max: MAX_BACKUP_NUMBER }),
    stars_delta: integerField({ optional: true, min: -MAX_BACKUP_NUMBER, max: MAX_BACKUP_NUMBER }),
    source: stringField({ optional: true, nonEmpty: true }),
    logged_at: timestampField({ optional: true, min: 0, max: MAX_BACKUP_TIMESTAMP }),
    local_date: dateField(), week_start: dateField(),
    note: stringField({ optional: true, nullable: true }),
    is_backfill: integerField({ optional: true, min: 0, max: 1 }),
    is_clock_suspect: integerField({ optional: true, min: 0, max: 1 }),
  },
  daily_summary: {
    local_date: dateField(),
    total_points: integerField({ optional: true, min: 0, max: MAX_BACKUP_NUMBER }),
    bonus_star_awarded: integerField({ optional: true, min: 0, max: 1 }),
    streak_count: integerField({ optional: true, min: 0, max: MAX_BACKUP_NUMBER }),
  },
  weekly_summary: {
    week_start: dateField(),
    total_points: integerField({ optional: true, min: 0, max: MAX_BACKUP_NUMBER }),
    weekly_stars: numberField({ optional: true, min: -MAX_BACKUP_NUMBER, max: MAX_BACKUP_NUMBER }),
    peak_stars: numberField({ optional: true, min: 0, max: MAX_BACKUP_NUMBER }),
    current_tier_id: integerField({ optional: true, nullable: true, min: 1, max: Number.MAX_SAFE_INTEGER }),
    start_debt: numberField({ optional: true, min: -MAX_BACKUP_NUMBER, max: MAX_BACKUP_NUMBER }),
    finalized: integerField({ optional: true, min: 0, max: 1 }),
  },
  reward_unlocks: {
    tier_id: integerField({ optional: true, min: 1, max: Number.MAX_SAFE_INTEGER }),
    week_start: dateField(), stars_at_unlock: numberField({ optional: true, min: 0, max: MAX_BACKUP_NUMBER }),
    reward_amount: numberField({ optional: true, min: 0, max: MAX_BACKUP_NUMBER }),
    claimed: integerField({ optional: true, min: 0, max: 1 }),
    claimed_at: timestampField({ optional: true, nullable: true, min: 0, max: MAX_BACKUP_TIMESTAMP }),
  },
  fund_transactions: {
    type: stringField({ nonEmpty: true }), amount: numberField({ optional: true, min: -MAX_BACKUP_NUMBER, max: MAX_BACKUP_NUMBER }),
    currency: stringField({ optional: true, nonEmpty: true, maxLength: 32 }),
    source_unlock_id: integerField({ optional: true, nullable: true, min: 1, max: Number.MAX_SAFE_INTEGER }),
    note: stringField({ optional: true, nullable: true }),
    occurred_at: timestampField({ optional: true, min: 0, max: MAX_BACKUP_TIMESTAMP }),
  },
  streak_freezes: {
    local_date: dateField(), purchased_at: timestampField({ optional: true, min: 0, max: MAX_BACKUP_TIMESTAMP }),
  },
  treats: {
    name: stringField({ nonEmpty: true }), icon: stringField({ optional: true, nonEmpty: true }),
    target_stars: integerField({ optional: true, min: 0, max: MAX_BACKUP_NUMBER }),
    approx_amount: numberField({ optional: true, min: 0, max: MAX_BACKUP_NUMBER }),
    currency: stringField({ optional: true, nonEmpty: true, maxLength: 32 }),
    status: stringField({ optional: true, nonEmpty: true, values: ['ACTIVE', 'ENJOYED', 'ARCHIVED'] }),
    sort_order: integerField({ optional: true, min: -MAX_BACKUP_NUMBER, max: MAX_BACKUP_NUMBER }),
    reached_at: stringField({ optional: true, nullable: true, maxLength: 128 }),
    enjoyed_at: stringField({ optional: true, nullable: true, maxLength: 128 }),
    created_at: stringField({ nonEmpty: true, maxLength: 128 }),
  },
  treat_history: {
    treat_id: integerField({ optional: true, min: 1, max: Number.MAX_SAFE_INTEGER }),
    name: stringField({ nonEmpty: true }), stars_spent: numberField({ optional: true, min: 0, max: MAX_BACKUP_NUMBER }),
    amount: numberField({ optional: true, min: 0, max: MAX_BACKUP_NUMBER }),
    currency: stringField({ optional: true, nonEmpty: true, maxLength: 32 }),
    enjoyed_at: stringField({ nonEmpty: true, maxLength: 128 }),
  },
  challenges: {
    name: stringField({ nonEmpty: true }), task_type_id: integerField({ optional: true, nullable: true, min: 1, max: Number.MAX_SAFE_INTEGER }),
    mode: stringField({ optional: true, nonEmpty: true, values: ['streak', 'weekly'] }),
    target_days: integerField({ optional: true, min: 1, max: 10_000 }),
    weekly_target: numberField({ optional: true, nullable: true, min: 1, max: MAX_BACKUP_NUMBER }),
    total_weeks: integerField({ optional: true, nullable: true, min: 1, max: 10_000 }),
    start_date: dateField(), status: stringField({ optional: true, nonEmpty: true, values: ['active', 'done', 'failed'] }),
    freezes_left: integerField({ optional: true, min: 0, max: MAX_BACKUP_NUMBER }),
    freeze_used: integerField({ optional: true, min: 0, max: 1 }),
    streak_current: integerField({ optional: true, min: 0, max: MAX_BACKUP_NUMBER }),
    completed_at: stringField({ optional: true, nullable: true, maxLength: 128 }),
    before_photo: stringField({ optional: true, nullable: true }), after_photo: stringField({ optional: true, nullable: true }),
    notifications_enabled: integerField({ optional: true, min: 0, max: 1 }), notification_id: stringField({ optional: true, nullable: true, maxLength: 256 }),
    min_duration: numberField({ optional: true, nullable: true, min: 0, max: MAX_BACKUP_NUMBER }),
    min_count: numberField({ optional: true, nullable: true, min: 0, max: MAX_BACKUP_NUMBER }),
    created_at: stringField({ nonEmpty: true, maxLength: 128 }),
  },
  challenge_log: {
    challenge_id: integerField({ optional: true, min: 1, max: Number.MAX_SAFE_INTEGER }),
    local_date: dateField(), state: stringField({ optional: true, nonEmpty: true, values: ['done', 'reset', 'freeze'] }),
  },
  challenge_days: {
    challenge_id: integerField({ optional: true, min: 1, max: Number.MAX_SAFE_INTEGER }),
    local_date: dateField(), logged_at: timestampField({ optional: true, min: 0, max: MAX_BACKUP_TIMESTAMP }),
  },
  achievements: {
    key: stringField({ nonEmpty: true }), rarity: stringField({ optional: true, nonEmpty: true, values: ['common', 'rare', 'legendary'] }),
    earned_at: stringField({ nonEmpty: true, maxLength: 128 }), source_type: stringField({ optional: true, nonEmpty: true, values: ['challenge', 'streak', 'rank', 'record'] }),
    source_id: integerField({ optional: true, nullable: true, min: 1, max: Number.MAX_SAFE_INTEGER }),
  },
  milestone_stars: {
    milestone_days: integerField({ optional: true, min: 1, max: MAX_BACKUP_NUMBER }),
    stars: numberField({ optional: true, min: 0, max: MAX_BACKUP_NUMBER }),
    awarded_at: timestampField({ optional: true, min: 0, max: MAX_BACKUP_TIMESTAMP }),
  },
  boost_events: {
    local_date: dateField(), multiplier: numberField({ optional: true, min: 1, max: 100 }),
    claim_deadline: timestampField({ optional: true, min: 0, max: MAX_BACKUP_TIMESTAMP }),
    claimed_at: timestampField({ optional: true, nullable: true, min: 0, max: MAX_BACKUP_TIMESTAMP }),
    expires_at: timestampField({ optional: true, nullable: true, min: 0, max: MAX_BACKUP_TIMESTAMP }),
    dismissed_at: timestampField({ optional: true, nullable: true, min: 0, max: MAX_BACKUP_TIMESTAMP }),
    created_at: timestampField({ optional: true, min: 0, max: MAX_BACKUP_TIMESTAMP }),
  },
};

function hasOwn(row: BackupRow, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(row, key);
}

function isValidCalendarDate(candidate: unknown): candidate is string {
  if (typeof candidate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return false;
  const [year, month, day] = candidate.split('-').map(Number);
  if (year < 1000 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

function isValidBackupField(raw: unknown, rule: BackupFieldRule): boolean {
  if (raw === null || raw === undefined) return Boolean(rule.nullable);
  if (rule.kind === 'string') {
    return typeof raw === 'string'
      && raw.length <= (rule.maxLength ?? MAX_BACKUP_TEXT_LENGTH)
      && (!rule.nonEmpty || (raw.trim().length > 0 && raw === raw.trim()))
      && (!rule.values || rule.values.includes(raw));
  }
  if (rule.kind === 'date') return isValidCalendarDate(raw);
  if (rule.kind === 'timestamp') {
    return typeof raw === 'number' && Number.isSafeInteger(raw)
      && raw >= (rule.min ?? 0) && raw <= (rule.max ?? MAX_BACKUP_TIMESTAMP);
  }
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return false;
  if (rule.kind === 'integer' && !Number.isSafeInteger(raw)) return false;
  return raw >= (rule.min ?? -MAX_BACKUP_NUMBER) && raw <= (rule.max ?? MAX_BACKUP_NUMBER);
}

function isValidBackupRow(row: BackupRow, rules: Record<string, BackupFieldRule>): boolean {
  return Object.entries(rules).every(([key, rule]) => {
    if (!hasOwn(row, key)) return Boolean(rule.optional);
    return isValidBackupField(row[key], rule);
  });
}

export function isCloudBackupPayload(value: unknown): value is CloudBackupPayload {
  if (!isRecord(value) || value.schema_version !== CLOUD_BACKUP_SCHEMA_VERSION) return false;
  if (value.user !== null && (!isRecord(value.user) || !isValidBackupRow(value.user, {
    username: stringField({ optional: true, nonEmpty: true, maxLength: 256 }),
    timezone: stringField({ optional: true, nonEmpty: true, maxLength: 128 }),
    carry_debt: integerField({ optional: true, min: 0, max: 1 }), currency: stringField({ optional: true, nonEmpty: true, maxLength: 32 }),
    last_seen_week_start: dateField({ optional: true, nullable: true }), notification_time: stringField({ optional: true, nullable: true, maxLength: 32 }),
    notification_time_2: stringField({ optional: true, nullable: true, maxLength: 32 }), notification_time_3: stringField({ optional: true, nullable: true, maxLength: 32 }),
    treat_stars: numberField({ optional: true, min: 0, max: MAX_BACKUP_NUMBER }), treat_stars_lifetime: numberField({ optional: true, min: 0, max: MAX_BACKUP_NUMBER }),
    value_per_star: numberField({ optional: true, min: 0, max: MAX_BACKUP_NUMBER }), penalty_hits_treats: numberField({ optional: true, min: 0, max: MAX_BACKUP_NUMBER }),
    lifetime_stars: numberField({ optional: true, min: 0, max: MAX_BACKUP_NUMBER }), current_tier_id: integerField({ optional: true, nullable: true, min: 1, max: Number.MAX_SAFE_INTEGER }),
  }))) return false;

  let rowCount = 0;
  for (const key of BACKUP_ARRAY_KEYS) {
    const table = value[key];
    if (!Array.isArray(table) || table.some(row => !isRecord(row) || !isPositiveInteger(row.id)
      || !isValidBackupRow(row, BACKUP_ROW_RULES[key]))) return false;
    const ids = table.map(row => numericId(row.id));
    if (new Set(ids).size !== ids.length) return false;
    rowCount += table.length;
    if (rowCount > 100_000) return false;
  }

  const backup = value as CloudBackupPayload;

  // INSERT OR REPLACE also collapses rows on composite UNIQUE indexes. A
  // duplicate primary key check alone is not enough: silently replacing one
  // summary/freeze/challenge row with another would make a valid-looking
  // restore lose history.
  if (hasDuplicateLogicalKey(backup.task_types, ['name'])
      || hasDuplicateLogicalKey(backup.daily_summary, ['local_date'])
      || hasDuplicateLogicalKey(backup.weekly_summary, ['week_start'])
      || hasDuplicateLogicalKey(backup.reward_unlocks, ['tier_id', 'week_start'])
      || hasDuplicateLogicalKey(backup.streak_freezes, ['local_date'])
      || hasDuplicateLogicalKey(backup.challenge_log, ['challenge_id', 'local_date'])
      || hasDuplicateLogicalKey(backup.challenge_days, ['challenge_id', 'local_date'])
      || hasDuplicateLogicalKey(backup.achievements, ['key', 'source_type', 'source_id'])
      || hasDuplicateLogicalKey(backup.milestone_stars, ['milestone_days'])
      || hasDuplicateLogicalKey(backup.boost_events, ['local_date'])) return false;

  // Reject malformed relationship graphs before restore can clear any local
  // rows. The payload is produced by this app, but it is still untrusted JSON
  // once it has crossed the network boundary.
  const categoryIds = new Set(backup.categories.map(row => numericId(row.id)));
  const taskTypeIds = new Set(backup.task_types.map(row => numericId(row.id)));
  const challengeIds = new Set(backup.challenges.map(row => numericId(row.id)));
  const treatIds = new Set(backup.treats.map(row => numericId(row.id)));
  const rewardUnlockIds = new Set(backup.reward_unlocks.map(row => numericId(row.id)));
  if (backup.task_types.some(row => !isNullableRelationship(row.category_id, categoryIds))) return false;
  if (backup.activity_log.some(row => !isNullableRelationship(row.task_type_id, taskTypeIds))) return false;
  if (backup.challenges.some(row => !isNullableRelationship(row.task_type_id, taskTypeIds))) return false;
  if (backup.fund_transactions.some(row => !isNullableRelationship(row.source_unlock_id, rewardUnlockIds))) return false;
  if (backup.achievements.some(row => row.source_type === 'challenge'
      && !relationshipExists(row.source_id, challengeIds))) return false;
  if (backup.challenge_log.some(row => !relationshipExists(row.challenge_id, challengeIds))) return false;
  if (backup.challenge_days.some(row => !relationshipExists(row.challenge_id, challengeIds))) return false;
  if (backup.treat_history.some(row => !relationshipExists(row.treat_id, treatIds))) return false;
  return true;
}

function numericId(candidate: unknown): number {
  return typeof candidate === 'number' ? candidate : Number.NaN;
}

function isPositiveInteger(candidate: unknown): boolean {
  const numeric = numericId(candidate);
  return Number.isSafeInteger(numeric) && numeric > 0;
}

function isNullish(candidate: unknown): boolean {
  return candidate === null || candidate === undefined;
}

function relationshipExists(candidate: unknown, ids: Set<number>): boolean {
  return isPositiveInteger(candidate) && ids.has(numericId(candidate));
}

function isNullableRelationship(candidate: unknown, ids: Set<number>): boolean {
  return isNullish(candidate) || relationshipExists(candidate, ids);
}

function hasDuplicateLogicalKey(rows: BackupRow[], fields: string[]): boolean {
  const keys = new Set<string>();
  for (const row of rows) {
    const key = JSON.stringify(fields.map(field => hasOwn(row, field) ? row[field] : null));
    if (keys.has(key)) return true;
    keys.add(key);
  }
  return false;
}

function value(row: BackupRow, key: string, fallback: unknown = null): unknown {
  return hasOwn(row, key) ? row[key] : fallback;
}

function numberValue(row: BackupRow, key: string, fallback = 0): number {
  if (!hasOwn(row, key)) return fallback;
  const raw = row[key];
  if (typeof raw !== 'number' || !Number.isFinite(raw)) throw new Error(`Invalid backup number field: ${key}`);
  return raw;
}

function nullableNumberValue(row: BackupRow, key: string): number | null {
  if (!hasOwn(row, key) || row[key] === null) return null;
  const raw = row[key];
  if (typeof raw !== 'number' || !Number.isFinite(raw)) throw new Error(`Invalid backup number field: ${key}`);
  return raw;
}

async function tierIdForExactStars(
  db: Pick<SQLiteDatabase, 'getAllAsync'>,
  stars: number,
): Promise<number | null> {
  const tiers = await db.getAllAsync<{ id: number; tier_order: number; stars_required: number }>(
    'SELECT id, tier_order, stars_required FROM tiers ORDER BY tier_order',
  );
  return [...tiers]
    .sort((left, right) => left.tier_order - right.tier_order)
    .reverse()
    .find(tier => tier.stars_required <= stars)?.id ?? null;
}

function stringValue(row: BackupRow, key: string, fallback = ''): string {
  if (!hasOwn(row, key)) return fallback;
  const raw = row[key];
  if (typeof raw !== 'string') throw new Error(`Invalid backup string field: ${key}`);
  return raw;
}

function nullableStringValue(row: BackupRow, key: string): string | null {
  if (!hasOwn(row, key) || row[key] === null) return null;
  const raw = row[key];
  if (typeof raw !== 'string') throw new Error(`Invalid backup string field: ${key}`);
  return raw;
}

function strictLegacyNumberValue(row: BackupRow, key: string): number;
function strictLegacyNumberValue(row: BackupRow, key: string, nullable: true): number | null;
function strictLegacyNumberValue(row: BackupRow, key: string, nullable = false): number | null {
  const raw = value(row, key);
  if (raw === null || raw === undefined) {
    if (nullable) return null;
    throw new Error(`Invalid legacy activity field: ${key}`);
  }
  if (typeof raw !== 'number' || !Number.isFinite(raw)) throw new Error(`Invalid legacy activity field: ${key}`);
  return raw;
}

async function insertRows(
  db: BackupQueryDb,
  sql: string,
  table: BackupRow[],
  paramsForRow: (row: BackupRow) => SQLiteBindValue[],
  assertActive: AssertActive,
): Promise<void> {
  for (const row of table) {
    assertActive();
    await db.runAsync(sql, paramsForRow(row));
  }
}

const BACKUP_OWNED_ID_TABLES = [
  ['categories', 'categories'],
  ['task_types', 'task_types'],
  ['activity_log', 'activity_log'],
  ['daily_summary', 'daily_summary'],
  ['weekly_summary', 'weekly_summary'],
  ['reward_unlocks', 'reward_unlocks'],
  ['fund_transactions', 'fund_transactions'],
  ['streak_freezes', 'streak_freezes'],
  ['treats', 'treats'],
  ['treat_history', 'treat_history'],
  ['challenges', 'challenges'],
  ['achievements', 'achievements'],
  ['milestone_stars', 'milestone_stars'],
  ['boost_events', 'boost_events'],
] as const;

const BACKUP_CHILD_ID_TABLES = [
  ['challenge_log', 'challenge_log'],
  ['challenge_days', 'challenge_days'],
] as const;

/**
 * SQLite ids are global even though the rows are user-scoped. A device can
 * retain another account's rows after sign-out, so INSERT OR REPLACE would
 * otherwise delete that account's row before assigning it to the restored
 * account. Fail closed before the destructive transaction instead.
 */
async function assertNoCrossAccountIdConflicts(
  db: BackupQueryDb,
  userId: number,
  payload: CloudBackupPayload,
  assertActive: AssertActive,
): Promise<void> {
  const batchSize = 400;
  for (const [key, table] of BACKUP_OWNED_ID_TABLES) {
    const ids = [...new Set(payload[key].map(row => numericId(row.id)))];
    for (let start = 0; start < ids.length; start += batchSize) {
      assertActive();
      const batch = ids.slice(start, start + batchSize);
      const placeholders = batch.map(() => '?').join(', ');
      const conflicts = await db.getAllAsync<{ id: number }>(
        `SELECT id FROM ${table} WHERE id IN (${placeholders}) AND user_id <> ? LIMIT 1`,
        [...batch, userId],
      );
      if (conflicts.length) {
        throw new Error(`Cloud restore conflicts with another local account in ${table}`);
      }
    }
  }

  // Child primary keys are also global. Check their owning challenge rather
  // than trusting the payload's parent id, which may itself be malformed.
  for (const [key, table] of BACKUP_CHILD_ID_TABLES) {
    const ids = [...new Set(payload[key].map(row => numericId(row.id)))];
    for (let start = 0; start < ids.length; start += batchSize) {
      assertActive();
      const batch = ids.slice(start, start + batchSize);
      const placeholders = batch.map(() => '?').join(', ');
      const conflicts = await db.getAllAsync<{ id: number }>(
        `SELECT child.id
           FROM ${table} child
           JOIN challenges parent ON parent.id = child.challenge_id
          WHERE child.id IN (${placeholders}) AND parent.user_id <> ?
          LIMIT 1`,
        [...batch, userId],
      );
      if (conflicts.length) {
        throw new Error(`Cloud restore conflicts with another local account in ${table}`);
      }
    }
  }
}

async function hasCrossAccountActivityIdConflict(
  db: BackupQueryDb,
  userId: number,
  activityIds: number[],
  assertActive: AssertActive,
): Promise<boolean> {
  const batchSize = 400;
  const ids = [...new Set(activityIds)];
  for (let start = 0; start < ids.length; start += batchSize) {
    assertActive();
    const batch = ids.slice(start, start + batchSize);
    const placeholders = batch.map(() => '?').join(', ');
      const conflictRows = await db.getAllAsync<{ id: number }>(
        `SELECT id FROM activity_log
          WHERE id IN (${placeholders}) AND user_id <> ?
          LIMIT 1`,
        [...batch, userId],
      );
      if (conflictRows.length) return true;
  }
  return false;
}

async function assertNoCrossAccountActivityIdConflicts(
  db: BackupQueryDb,
  userId: number,
  activityIds: number[],
  assertActive: AssertActive,
): Promise<void> {
  if (await hasCrossAccountActivityIdConflict(db, userId, activityIds, assertActive)) {
    throw new Error('Legacy activity restore conflicts with another local account');
  }
}

/** Replace a fresh local account with a validated cloud snapshot. */
export async function restoreUserDataBackup(
  db: BackupDb,
  userId: number,
  payload: CloudBackupPayload,
  googleSub?: string,
  assertActive: AssertActive = alwaysActive,
  isFresh?: (transactionDb: BackupQueryDb) => Promise<boolean>,
  activityStartDate: string | null = null,
): Promise<boolean> {
  if (!isCloudBackupPayload(payload)) throw new Error('Invalid cloud backup payload');
  payload = filterCloudBackupPayload(payload, activityStartDate);

  let restored = true;
  const restore = async (transactionDb: BackupQueryDb = db): Promise<void> => {
    const db = transactionDb;
    assertActive();
    if (isFresh && !await isFresh(db)) {
      restored = false;
      return;
    }

    await assertNoCrossAccountIdConflicts(db, userId, payload, assertActive);

    const dateScopedDelete = (table: 'activity_log' | 'daily_summary' | 'weekly_summary', column: 'local_date' | 'week_start') => ({
      sql: `DELETE FROM ${table} WHERE user_id = ?${activityStartDate === null ? '' : ` AND ${column} >= ?`}`,
      params: activityStartDate === null ? [userId] : [userId, activityStartDate],
    });
    const deleteStatements = [
      { sql: 'DELETE FROM challenge_days WHERE challenge_id IN (SELECT id FROM challenges WHERE user_id = ?)', params: [userId] },
      { sql: 'DELETE FROM challenge_log WHERE challenge_id IN (SELECT id FROM challenges WHERE user_id = ?)', params: [userId] },
      { sql: 'DELETE FROM challenges WHERE user_id = ?', params: [userId] },
      { sql: 'DELETE FROM treat_history WHERE user_id = ?', params: [userId] },
      { sql: 'DELETE FROM achievements WHERE user_id = ?', params: [userId] },
      dateScopedDelete('activity_log', 'local_date'),
      dateScopedDelete('daily_summary', 'local_date'),
      dateScopedDelete('weekly_summary', 'week_start'),
      { sql: 'DELETE FROM reward_unlocks WHERE user_id = ?', params: [userId] },
      { sql: 'DELETE FROM streak_freezes WHERE user_id = ?', params: [userId] },
      { sql: 'DELETE FROM treats WHERE user_id = ?', params: [userId] },
      { sql: 'DELETE FROM fund_transactions WHERE user_id = ?', params: [userId] },
      { sql: 'DELETE FROM milestone_stars WHERE user_id = ?', params: [userId] },
      { sql: 'DELETE FROM boost_events WHERE user_id = ?', params: [userId] },
      { sql: 'DELETE FROM task_types WHERE user_id = ?', params: [userId] },
      { sql: 'DELETE FROM categories WHERE user_id = ?', params: [userId] },
    ];
    for (const { sql, params } of deleteStatements) {
      assertActive();
      await db.runAsync(sql, params);
    }

    if (payload.user) {
      const user = payload.user;
      const restoredTierId = activityStartDate === null
        ? nullableNumberValue(user, 'current_tier_id')
        : await tierIdForExactStars(db, numberValue(user, 'lifetime_stars'));
      await db.runAsync(
        `UPDATE users SET username = ?, timezone = ?, carry_debt = ?, currency = ?,
          last_seen_week_start = ?, notification_time = ?, notification_time_2 = ?,
          notification_time_3 = ?, treat_stars = ?, treat_stars_lifetime = ?,
          value_per_star = ?, penalty_hits_treats = ?, lifetime_stars = ?,
          current_tier_id = ?, google_sub = COALESCE(google_sub, ?)
         WHERE id = ?`,
        [
          stringValue(user, 'username', 'me'),
          stringValue(user, 'timezone', 'Asia/Ho_Chi_Minh'),
          numberValue(user, 'carry_debt'),
          stringValue(user, 'currency', 'VND'),
          nullableStringValue(user, 'last_seen_week_start'),
          nullableStringValue(user, 'notification_time'),
          nullableStringValue(user, 'notification_time_2'),
          nullableStringValue(user, 'notification_time_3'),
          numberValue(user, 'treat_stars'),
          numberValue(user, 'treat_stars_lifetime'),
          numberValue(user, 'value_per_star', 1000),
          numberValue(user, 'penalty_hits_treats', 1),
          numberValue(user, 'lifetime_stars'),
          restoredTierId,
          googleSub ?? null,
          userId,
        ],
      );
    }

    await insertRows(
      db,
      'INSERT OR REPLACE INTO categories (id, user_id, name, icon, sort_order, archived) VALUES (?, ?, ?, ?, ?, ?)',
      payload.categories,
      row => [numberValue(row, 'id'), userId, stringValue(row, 'name'), nullableStringValue(row, 'icon'), numberValue(row, 'sort_order'), numberValue(row, 'archived')],
      assertActive,
    );
    await insertRows(
      db,
      `INSERT OR REPLACE INTO task_types
        (id, user_id, name, kind, is_time_based, base_points, star_penalty, category_id,
         icon, archived, sort_order, is_pinned, is_template)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      payload.task_types,
      row => [numberValue(row, 'id'), userId, stringValue(row, 'name'), stringValue(row, 'kind', 'GOOD'), numberValue(row, 'is_time_based'), numberValue(row, 'base_points', 10), numberValue(row, 'star_penalty', 50), nullableNumberValue(row, 'category_id'), nullableStringValue(row, 'icon'), numberValue(row, 'archived'), numberValue(row, 'sort_order'), numberValue(row, 'is_pinned'), numberValue(row, 'is_template')],
      assertActive,
    );
    await insertRows(
      db,
      `INSERT OR REPLACE INTO activity_log
        (id, user_id, task_type_id, kind, duration_min, points_earned, stars_delta,
         source, logged_at, local_date, week_start, note, is_backfill, is_clock_suspect)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      payload.activity_log,
      row => [numberValue(row, 'id'), userId, nullableNumberValue(row, 'task_type_id'), stringValue(row, 'kind', 'GOOD'), nullableNumberValue(row, 'duration_min'), numberValue(row, 'points_earned'), numberValue(row, 'stars_delta'), stringValue(row, 'source', 'TASK'), numberValue(row, 'logged_at'), stringValue(row, 'local_date'), stringValue(row, 'week_start'), nullableStringValue(row, 'note'), numberValue(row, 'is_backfill'), numberValue(row, 'is_clock_suspect')],
      assertActive,
    );
    await insertRows(
      db,
      'INSERT OR REPLACE INTO daily_summary (id, user_id, local_date, total_points, bonus_star_awarded, streak_count) VALUES (?, ?, ?, ?, ?, ?)',
      payload.daily_summary,
      row => [numberValue(row, 'id'), userId, stringValue(row, 'local_date'), numberValue(row, 'total_points'), numberValue(row, 'bonus_star_awarded'), numberValue(row, 'streak_count')],
      assertActive,
    );
    await insertRows(
      db,
      `INSERT OR REPLACE INTO weekly_summary
        (id, user_id, week_start, total_points, weekly_stars, peak_stars, current_tier_id, start_debt, finalized)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      payload.weekly_summary,
      row => [numberValue(row, 'id'), userId, stringValue(row, 'week_start'), numberValue(row, 'total_points'), numberValue(row, 'weekly_stars'), numberValue(row, 'peak_stars'), nullableNumberValue(row, 'current_tier_id'), numberValue(row, 'start_debt'), numberValue(row, 'finalized')],
      assertActive,
    );
    await insertRows(
      db,
      `INSERT OR REPLACE INTO reward_unlocks
        (id, user_id, tier_id, week_start, stars_at_unlock, reward_amount, claimed, claimed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      payload.reward_unlocks,
      row => [numberValue(row, 'id'), userId, numberValue(row, 'tier_id'), stringValue(row, 'week_start'), numberValue(row, 'stars_at_unlock'), numberValue(row, 'reward_amount'), numberValue(row, 'claimed'), nullableNumberValue(row, 'claimed_at')],
      assertActive,
    );
    await insertRows(
      db,
      `INSERT OR REPLACE INTO fund_transactions
        (id, user_id, type, amount, currency, source_unlock_id, note, occurred_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      payload.fund_transactions,
      row => [numberValue(row, 'id'), userId, stringValue(row, 'type'), numberValue(row, 'amount'), stringValue(row, 'currency', 'VND'), nullableNumberValue(row, 'source_unlock_id'), nullableStringValue(row, 'note'), numberValue(row, 'occurred_at')],
      assertActive,
    );
    await insertRows(
      db,
      'INSERT OR REPLACE INTO streak_freezes (id, user_id, local_date, purchased_at) VALUES (?, ?, ?, ?)',
      payload.streak_freezes,
      row => [numberValue(row, 'id'), userId, stringValue(row, 'local_date'), numberValue(row, 'purchased_at')],
      assertActive,
    );
    await insertRows(
      db,
      `INSERT OR REPLACE INTO treats
        (id, user_id, name, icon, target_stars, approx_amount, currency, status, sort_order, reached_at, enjoyed_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      payload.treats,
      row => [numberValue(row, 'id'), userId, stringValue(row, 'name'), stringValue(row, 'icon', 'gift'), numberValue(row, 'target_stars'), numberValue(row, 'approx_amount'), stringValue(row, 'currency', 'VND'), stringValue(row, 'status', 'ACTIVE'), numberValue(row, 'sort_order'), nullableStringValue(row, 'reached_at'), nullableStringValue(row, 'enjoyed_at'), stringValue(row, 'created_at')],
      assertActive,
    );
    await insertRows(
      db,
      `INSERT OR REPLACE INTO treat_history
        (id, user_id, treat_id, name, stars_spent, amount, currency, enjoyed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      payload.treat_history,
      row => [numberValue(row, 'id'), userId, numberValue(row, 'treat_id'), stringValue(row, 'name'), numberValue(row, 'stars_spent'), numberValue(row, 'amount'), stringValue(row, 'currency', 'VND'), stringValue(row, 'enjoyed_at')],
      assertActive,
    );
    await insertRows(
      db,
      `INSERT OR REPLACE INTO challenges
        (id, user_id, name, task_type_id, mode, target_days, weekly_target, total_weeks,
         start_date, status, freezes_left, freeze_used, streak_current, completed_at,
         before_photo, after_photo, notifications_enabled, notification_id, min_duration, min_count, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      payload.challenges,
      row => [numberValue(row, 'id'), userId, stringValue(row, 'name'), nullableNumberValue(row, 'task_type_id'), stringValue(row, 'mode', 'streak'), numberValue(row, 'target_days', 7), nullableNumberValue(row, 'weekly_target'), nullableNumberValue(row, 'total_weeks'), stringValue(row, 'start_date'), stringValue(row, 'status', 'active'), numberValue(row, 'freezes_left', 1), numberValue(row, 'freeze_used'), numberValue(row, 'streak_current'), nullableStringValue(row, 'completed_at'), nullableStringValue(row, 'before_photo'), nullableStringValue(row, 'after_photo'), numberValue(row, 'notifications_enabled', 1), null, nullableNumberValue(row, 'min_duration'), nullableNumberValue(row, 'min_count'), stringValue(row, 'created_at')],
      assertActive,
    );
    await insertRows(
      db,
      'INSERT OR REPLACE INTO challenge_log (id, challenge_id, local_date, state) VALUES (?, ?, ?, ?)',
      payload.challenge_log,
      row => [numberValue(row, 'id'), numberValue(row, 'challenge_id'), stringValue(row, 'local_date'), stringValue(row, 'state', 'done')],
      assertActive,
    );
    await insertRows(
      db,
      'INSERT OR REPLACE INTO challenge_days (id, challenge_id, local_date, logged_at) VALUES (?, ?, ?, ?)',
      payload.challenge_days,
      row => [numberValue(row, 'id'), numberValue(row, 'challenge_id'), stringValue(row, 'local_date'), numberValue(row, 'logged_at')],
      assertActive,
    );
    await insertRows(
      db,
      'INSERT OR REPLACE INTO achievements (id, user_id, key, rarity, earned_at, source_type, source_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      payload.achievements,
      row => [numberValue(row, 'id'), userId, stringValue(row, 'key'), stringValue(row, 'rarity', 'common'), stringValue(row, 'earned_at'), stringValue(row, 'source_type', 'record'), nullableNumberValue(row, 'source_id')],
      assertActive,
    );
    await insertRows(
      db,
      'INSERT OR REPLACE INTO milestone_stars (id, user_id, milestone_days, stars, awarded_at) VALUES (?, ?, ?, ?, ?)',
      payload.milestone_stars,
      row => [numberValue(row, 'id'), userId, numberValue(row, 'milestone_days'), numberValue(row, 'stars'), numberValue(row, 'awarded_at')],
      assertActive,
    );
    await insertRows(
      db,
      `INSERT OR REPLACE INTO boost_events
        (id, user_id, local_date, multiplier, claim_deadline, claimed_at, expires_at, dismissed_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      payload.boost_events,
      row => [numberValue(row, 'id'), userId, stringValue(row, 'local_date'), numberValue(row, 'multiplier'), numberValue(row, 'claim_deadline'), nullableNumberValue(row, 'claimed_at'), nullableNumberValue(row, 'expires_at'), nullableNumberValue(row, 'dismissed_at'), numberValue(row, 'created_at')],
      assertActive,
    );

    assertActive();
  };

  if (typeof db.withExclusiveTransactionAsync === 'function') {
    await db.withExclusiveTransactionAsync(restore);
  } else {
    throw new Error('Exclusive SQLite restore transaction unavailable');
  }
  return restored;
}

export type LegacyActivityMirrorRow = BackupRow;
export type LegacyActivityRestoreResult = { count: number; maxId: number } | 'not_needed';
type LegacyActivityRestoreFinalizer = (
  transactionDb: BackupQueryDb,
  restoredMaxId: number,
) => Promise<void>;

function validDateKey(row: BackupRow, key: string): string | null {
  const candidate = value(row, key);
  return isValidCalendarDate(candidate) ? candidate : null;
}

function dateDistance(left: string, right: string): number {
  return Math.round((Date.parse(`${left}T00:00:00Z`) - Date.parse(`${right}T00:00:00Z`)) / 86_400_000);
}

/**
 * Older releases mirrored only activity_log to Supabase. Recover that mirror
 * on a genuinely empty install so the heatmap and progress history do not
 * disappear while the complete snapshot path is adopted by newer releases.
 * Custom tasks and challenges cannot be reconstructed from this legacy table.
 */
export async function restoreLegacyActivityMirror(
  db: BackupDb,
  userId: number,
  remoteRows: LegacyActivityMirrorRow[],
  assertActive: AssertActive = alwaysActive,
  isFresh?: (transactionDb: BackupQueryDb) => Promise<boolean>,
  remapConflictingIds = false,
  finalizeRestore?: LegacyActivityRestoreFinalizer,
  activityStartDate: string | null = null,
): Promise<LegacyActivityRestoreResult> {
  const activities = remoteRows
    // LOGIN rows were telemetry in the legacy mirror, not user habit logs.
    // Restoring them would create false heatmap days and streak continuity.
    .filter(row => stringValue(row, 'source', 'TASK') !== 'LOGIN')
    .map((row) => {
      const id = strictLegacyNumberValue(row, 'local_id');
      const localDate = validDateKey(row, 'local_date');
      const rawWeekStart = value(row, 'week_start');
      const weekStart = rawWeekStart === null || rawWeekStart === undefined
        ? localDate ? getWeekStartFor(new Date(`${localDate}T12:00:00`)) : null
        : validDateKey(row, 'week_start');
      const durationMin = strictLegacyNumberValue(row, 'duration_min', true);
      const pointsEarned = strictLegacyNumberValue(row, 'points_earned');
      const starsDelta = strictLegacyNumberValue(row, 'stars_delta');
      const loggedAt = strictLegacyNumberValue(row, 'logged_at');
      if (!Number.isSafeInteger(id) || id < 1 || pointsEarned === null
          || starsDelta === null || loggedAt === null || !localDate || !weekStart
          || (durationMin !== null && (!Number.isSafeInteger(durationMin) || durationMin < 0 || durationMin > MAX_BACKUP_NUMBER))
          || !Number.isSafeInteger(pointsEarned) || pointsEarned < 0 || pointsEarned > MAX_BACKUP_NUMBER
          || !Number.isSafeInteger(starsDelta) || starsDelta < -MAX_BACKUP_NUMBER || starsDelta > MAX_BACKUP_NUMBER
          || !Number.isSafeInteger(loggedAt) || loggedAt < 0 || loggedAt > MAX_BACKUP_TIMESTAMP) {
        throw new Error('Invalid legacy activity row');
      }
      const kind = stringValue(row, 'kind', 'GOOD');
      const source = stringValue(row, 'source', 'TASK');
      const note = nullableStringValue(row, 'note');
      if (!kind.trim() || kind !== kind.trim() || kind.length > 64
          || !source.trim() || source !== source.trim() || source.length > 64
          || (note !== null && note.length > MAX_BACKUP_TEXT_LENGTH)) {
        throw new Error('Invalid legacy activity row');
      }
      if (activityStartDate !== null && !isActivityDateIncluded(localDate, activityStartDate)) {
        return null;
      }
      return {
        id,
        kind,
        durationMin,
        pointsEarned,
        starsDelta,
        source,
        loggedAt,
        localDate,
        weekStart,
        // The legacy mirror never carried task definitions. A raw task id may
        // belong to a different local account after switching accounts, so it
        // must not be reattached to the restored activity.
        taskTypeId: null,
        note,
      };
    })
    .filter((activity): activity is NonNullable<typeof activity> => activity !== null)
    .sort((left, right) => left.localDate.localeCompare(right.localDate) || left.id - right.id);

  if (new Set(activities.map(activity => activity.id)).size !== activities.length) {
    throw new Error('Duplicate legacy activity ids');
  }

  const daily = new Map<string, { totalPoints: number; bonusStars: number }>();
  const weekly = new Map<string, { totalPoints: number; stars: number; peakStars: number }>();
  for (const activity of activities) {
    const day = daily.get(activity.localDate) ?? { totalPoints: 0, bonusStars: 0 };
    day.totalPoints += activity.pointsEarned;
    if (activity.source === 'DAILY_BONUS') day.bonusStars += Math.max(0, activity.starsDelta);
    daily.set(activity.localDate, day);

    const week = weekly.get(activity.weekStart) ?? { totalPoints: 0, stars: 0, peakStars: 0 };
    week.totalPoints += activity.pointsEarned;
    week.stars += activity.starsDelta;
    week.peakStars = Math.max(week.peakStars, Math.max(0, activity.starsDelta));
    weekly.set(activity.weekStart, week);
  }

  let restored = true;
  let activitiesToInsert = activities;
  const restore = async (transactionDb: BackupQueryDb = db): Promise<void> => {
    assertActive();
    if (isFresh && !await isFresh(transactionDb)) {
      restored = false;
      return;
    }
    // Keep the conflict check in the same exclusive transaction as the
    // inserts. A second local account cannot appear between preflight and
    // restore and turn INSERT OR REPLACE into a cross-account overwrite.
    if (remapConflictingIds) {
      const hasConflict = await hasCrossAccountActivityIdConflict(
        transactionDb,
        userId,
        activities.map(activity => activity.id),
        assertActive,
      );
      if (hasConflict) {
        const maxExisting = await transactionDb.getFirstAsync<{ max_id: number | null }>(
          'SELECT COALESCE(MAX(id), 0) AS max_id FROM activity_log',
        );
        const maxIncoming = activities.reduce((max, activity) => Math.max(max, activity.id), 0);
        let nextId = Math.max(Number(maxExisting?.max_id) || 0, maxIncoming);
        if (!Number.isSafeInteger(nextId) || nextId > Number.MAX_SAFE_INTEGER - activities.length) {
          throw new Error('Legacy activity id remap exceeds SQLite integer safety');
        }
        activitiesToInsert = activities.map(activity => ({ ...activity, id: ++nextId }));
      }
    } else {
      await assertNoCrossAccountActivityIdConflicts(
        transactionDb,
        userId,
        activities.map(activity => activity.id),
        assertActive,
      );
    }
    const activityColumns = '(id, user_id, task_type_id, kind, duration_min, points_earned, stars_delta, source, logged_at, local_date, week_start, note, is_backfill, is_clock_suspect)';
    const activityValues = '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)';
    const activityBatchSize = 50;
    for (let start = 0; start < activitiesToInsert.length; start += activityBatchSize) {
      assertActive();
      const batch = activitiesToInsert.slice(start, start + activityBatchSize);
      await transactionDb.runAsync(
        `INSERT OR REPLACE INTO activity_log ${activityColumns}
         VALUES ${batch.map(() => activityValues).join(', ')}`,
        batch.flatMap(activity => [
          activity.id, userId, activity.taskTypeId, activity.kind, activity.durationMin,
          activity.pointsEarned, activity.starsDelta, activity.source, activity.loggedAt,
          activity.localDate, activity.weekStart, activity.note,
        ]),
      );
    }

    let previousDate: string | null = null;
    let streak = 0;
    for (const [localDate, summary] of [...daily.entries()].sort(([left], [right]) => left.localeCompare(right))) {
      streak = previousDate && dateDistance(localDate, previousDate) === 1 ? streak + 1 : 1;
      previousDate = localDate;
      assertActive();
      await transactionDb.runAsync(
        `INSERT OR REPLACE INTO daily_summary
          (user_id, local_date, total_points, bonus_star_awarded, streak_count)
         VALUES (?, ?, ?, ?, ?)`,
        [userId, localDate, summary.totalPoints, summary.bonusStars, streak],
      );
    }

    for (const [weekStart, summary] of [...weekly.entries()].sort(([left], [right]) => left.localeCompare(right))) {
      assertActive();
      await transactionDb.runAsync(
        `INSERT OR REPLACE INTO weekly_summary
          (user_id, week_start, total_points, weekly_stars, peak_stars, finalized)
         VALUES (?, ?, ?, ?, ?, 0)`,
        [userId, weekStart, summary.totalPoints, summary.stars, summary.peakStars],
      );
    }

    if (finalizeRestore && activitiesToInsert.length) {
      assertActive();
      const restoredMaxId = activitiesToInsert.reduce(
        (max, activity) => Math.max(max, activity.id),
        0,
      );
      await finalizeRestore(
        transactionDb,
        restoredMaxId,
      );
    }

    assertActive();
  };

  if (typeof db.withExclusiveTransactionAsync === 'function') {
    await db.withExclusiveTransactionAsync(restore);
  } else {
    throw new Error('Exclusive SQLite restore transaction unavailable');
  }

  const restoredMaxId = activitiesToInsert.reduce(
    (max, activity) => Math.max(max, activity.id),
    0,
  );
  return restored
    ? {
      count: activities.length,
      maxId: restoredMaxId,
    }
    : 'not_needed';
}
