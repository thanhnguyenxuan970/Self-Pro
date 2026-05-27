# Habit Tracker — 3-Day Android MVP Plan

**Target:** Testable Android APK in 3 days  
**Stack:** React Native + Expo SDK 52 · expo-sqlite + drizzle-orm · TanStack Query v5 · React Navigation v6 · victory-native · Jest  
**Approach:** TDD for pure logic (logTask, weeklyReset, checkTierUnlocks) · No component tests in MVP timeline

---

## Constants (from spec)

```typescript
// src/constants.ts
export const STARS_PER_TASK = 1;
export const DAILY_BONUS_THRESHOLD = 50;   // points in a day → +1 star (once/day)
export const DAILY_BONUS_STARS = 1;
export const TIME_UNIT_MINUTES = 30;       // +1 pt per 30 min of time-based task
export const DEFAULT_PENALTY_STARS = 50;  // bad habit star penalty
export const DEFAULT_CURRENCY = 'VND';
export const DEFAULT_TIMEZONE = 'Asia/Ho_Chi_Minh';
```

---

## File Structure

```
habit-tracker/
├── app.json
├── package.json
├── tsconfig.json
├── babel.config.js
├── jest.config.js
│
├── src/
│   ├── constants.ts
│   ├── db/
│   │   ├── client.ts           ← expo-sqlite connection
│   │   ├── schema.ts           ← drizzle table definitions
│   │   └── migrations.ts       ← manual exec DDL runner
│   │
│   ├── logic/
│   │   ├── logTask.ts          ← pure fn: compute row values
│   │   ├── weeklyReset.ts      ← pure fn: finalize + new week
│   │   ├── checkTierUnlocks.ts ← pure fn: tier threshold check
│   │   └── formatters.ts       ← VND format, date helpers
│   │
│   ├── queries/
│   │   ├── queryClient.ts      ← TanStack QueryClient singleton
│   │   ├── useToday.ts         ← today tasks + daily_summary
│   │   ├── useWeek.ts          ← weekly_summary hook
│   │   ├── useFund.ts          ← fund_transactions hook
│   │   └── useProgress.ts      ← aggregated chart data hook
│   │
│   ├── screens/
│   │   ├── TodayScreen.tsx
│   │   ├── ProgressScreen.tsx
│   │   ├── FundScreen.tsx
│   │   └── MeScreen.tsx        ← stub
│   │
│   ├── components/
│   │   ├── TaskRow.tsx
│   │   ├── StarDisplay.tsx
│   │   ├── RankBadge.tsx
│   │   ├── LogTaskModal.tsx
│   │   ├── ManageTasksModal.tsx
│   │   └── FundLedgerRow.tsx
│   │
│   └── navigation/
│       └── RootNavigator.tsx
│
└── __tests__/
    ├── logTask.test.ts
    ├── weeklyReset.test.ts
    └── checkTierUnlocks.test.ts
```

---

## Day 1 — Setup + Schema + logTask() + Today Screen

**Milestone:** End of Day 1 = tap task → star count updates → persists on restart

### Task 1 — Expo project init (30 min)

```bash
npx create-expo-app@latest habit-tracker --template blank-typescript
cd habit-tracker
npx expo install expo-sqlite
npm install drizzle-orm
npm install -D drizzle-kit
npm install @tanstack/react-query
npm install @react-navigation/native @react-navigation/bottom-tabs
npx expo install react-native-screens react-native-safe-area-context
npm install victory-native react-native-svg
npm install -D jest @types/jest ts-jest
```

**`babel.config.js`:**
```js
module.exports = function(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};
```

**`jest.config.js`:**
```js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'tsx', 'js'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  globals: { 'ts-jest': { tsconfig: { jsx: 'react' } } },
};
```

**`package.json` scripts:**
```json
"scripts": {
  "start": "expo start",
  "android": "expo run:android",
  "test": "jest"
}
```

---

### Task 2 — DB schema + migrations (45 min)

**`src/db/schema.ts`:**
```typescript
import { sqliteTable, integer, text, real } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('username').notNull(),
  timezone: text('timezone').notNull().default('Asia/Ho_Chi_Minh'),
  carry_debt: integer('carry_debt', { mode: 'boolean' }).notNull().default(false),
  currency: text('currency').notNull().default('VND'),
});

export const categories = sqliteTable('categories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: integer('user_id').notNull(),
  name: text('name').notNull(),
  icon: text('icon'),
  sort_order: integer('sort_order').notNull().default(0),
  archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
});

export const task_types = sqliteTable('task_types', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: integer('user_id').notNull(),
  name: text('name').notNull(),
  kind: text('kind').notNull(),         // 'GOOD' | 'BAD'
  is_time_based: integer('is_time_based', { mode: 'boolean' }).notNull().default(false),
  base_points: integer('base_points').notNull().default(10),
  star_penalty: integer('star_penalty').notNull().default(50),
  category_id: integer('category_id'),
  icon: text('icon'),
  archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
});

export const activity_log = sqliteTable('activity_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: integer('user_id').notNull(),
  task_type_id: integer('task_type_id'),
  kind: text('kind').notNull(),         // 'GOOD' | 'BAD' | 'DAILY_BONUS' | 'PENALTY'
  duration_min: integer('duration_min'),
  points_earned: integer('points_earned').notNull().default(0),
  stars_delta: real('stars_delta').notNull().default(0),
  source: text('source').notNull(),     // 'TASK' | 'DAILY_BONUS' | 'PENALTY'
  logged_at: integer('logged_at').notNull(), // Unix ms
  local_date: text('local_date').notNull(), // YYYY-MM-DD
  week_start: text('week_start').notNull(), // YYYY-MM-DD (Monday)
  note: text('note'),
});

export const daily_summary = sqliteTable('daily_summary', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: integer('user_id').notNull(),
  local_date: text('local_date').notNull(),
  total_points: integer('total_points').notNull().default(0),
  bonus_star_awarded: integer('bonus_star_awarded', { mode: 'boolean' }).notNull().default(false),
  streak_count: integer('streak_count').notNull().default(0),
});

export const weekly_summary = sqliteTable('weekly_summary', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: integer('user_id').notNull(),
  week_start: text('week_start').notNull(),
  total_points: integer('total_points').notNull().default(0),
  weekly_stars: real('weekly_stars').notNull().default(0),
  peak_stars: real('peak_stars').notNull().default(0),
  current_tier_id: integer('current_tier_id'),
  start_debt: real('start_debt').notNull().default(0),
  finalized: integer('finalized', { mode: 'boolean' }).notNull().default(false),
});

export const tiers = sqliteTable('tiers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tier_order: integer('tier_order').notNull(),
  stars_required: real('stars_required').notNull(),
  rank_name: text('rank_name').notNull(),
  reward_amount: real('reward_amount').notNull(),
  reward_currency: text('reward_currency').notNull().default('VND'),
});

export const reward_unlocks = sqliteTable('reward_unlocks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: integer('user_id').notNull(),
  tier_id: integer('tier_id').notNull(),
  week_start: text('week_start').notNull(),
  stars_at_unlock: real('stars_at_unlock').notNull(),
  reward_amount: real('reward_amount').notNull(),
  claimed: integer('claimed', { mode: 'boolean' }).notNull().default(false),
  claimed_at: integer('claimed_at'),
});

export const fund_transactions = sqliteTable('fund_transactions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: integer('user_id').notNull(),
  type: text('type').notNull(),         // 'DEPOSIT' | 'WITHDRAWAL'
  amount: real('amount').notNull(),
  currency: text('currency').notNull().default('VND'),
  source_unlock_id: integer('source_unlock_id'),
  note: text('note'),
  occurred_at: integer('occurred_at').notNull(), // Unix ms
});
```

**`src/db/migrations.ts`:**
```typescript
import { SQLiteDatabase } from 'expo-sqlite';

export async function runMigrations(db: SQLiteDatabase) {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      timezone TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
      carry_debt INTEGER NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'VND'
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      icon TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      archived INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS task_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      kind TEXT NOT NULL,
      is_time_based INTEGER NOT NULL DEFAULT 0,
      base_points INTEGER NOT NULL DEFAULT 10,
      star_penalty INTEGER NOT NULL DEFAULT 50,
      category_id INTEGER,
      icon TEXT,
      archived INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      task_type_id INTEGER,
      kind TEXT NOT NULL,
      duration_min INTEGER,
      points_earned INTEGER NOT NULL DEFAULT 0,
      stars_delta REAL NOT NULL DEFAULT 0,
      source TEXT NOT NULL,
      logged_at INTEGER NOT NULL,
      local_date TEXT NOT NULL,
      week_start TEXT NOT NULL,
      note TEXT
    );

    CREATE TABLE IF NOT EXISTS daily_summary (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      local_date TEXT NOT NULL,
      total_points INTEGER NOT NULL DEFAULT 0,
      bonus_star_awarded INTEGER NOT NULL DEFAULT 0,
      streak_count INTEGER NOT NULL DEFAULT 0,
      UNIQUE(user_id, local_date)
    );

    CREATE TABLE IF NOT EXISTS weekly_summary (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      week_start TEXT NOT NULL,
      total_points INTEGER NOT NULL DEFAULT 0,
      weekly_stars REAL NOT NULL DEFAULT 0,
      peak_stars REAL NOT NULL DEFAULT 0,
      current_tier_id INTEGER,
      start_debt REAL NOT NULL DEFAULT 0,
      finalized INTEGER NOT NULL DEFAULT 0,
      UNIQUE(user_id, week_start)
    );

    CREATE TABLE IF NOT EXISTS tiers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tier_order INTEGER NOT NULL,
      stars_required REAL NOT NULL,
      rank_name TEXT NOT NULL,
      reward_amount REAL NOT NULL,
      reward_currency TEXT NOT NULL DEFAULT 'VND'
    );

    CREATE TABLE IF NOT EXISTS reward_unlocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      tier_id INTEGER NOT NULL,
      week_start TEXT NOT NULL,
      stars_at_unlock REAL NOT NULL,
      reward_amount REAL NOT NULL,
      claimed INTEGER NOT NULL DEFAULT 0,
      claimed_at INTEGER,
      UNIQUE(user_id, tier_id, week_start)
    );

    CREATE TABLE IF NOT EXISTS fund_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'VND',
      source_unlock_id INTEGER,
      note TEXT,
      occurred_at INTEGER NOT NULL
    );
  `);

  // Seed default tiers if empty
  const tierCount = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM tiers'
  );
  if (!tierCount || tierCount.count === 0) {
    await db.execAsync(`
      INSERT INTO tiers (tier_order, stars_required, rank_name, reward_amount, reward_currency) VALUES
      (1, 10,  'Newbie',        50000,  'VND'),
      (2, 25,  'Grinder',       100000, 'VND'),
      (3, 50,  'No Life',       150000, 'VND'),
      (4, 100, 'Sigma',         200000, 'VND'),
      (5, 200, 'Gigachad',      300000, 'VND'),
      (6, 350, 'Menace',        500000, 'VND'),
      (7, 500, 'Goat',          750000, 'VND'),
      (8, 750, 'Legendary NPC', 1000000,'VND');
    `);
  }

  // Seed default user if empty
  const userCount = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM users'
  );
  if (!userCount || userCount.count === 0) {
    await db.execAsync(
      `INSERT INTO users (username, timezone, carry_debt, currency)
       VALUES ('me', 'Asia/Ho_Chi_Minh', 0, 'VND')`
    );
  }
}
```

**`src/db/client.ts`:**
```typescript
import * as SQLite from 'expo-sqlite';
import { runMigrations } from './migrations';

let _db: SQLite.SQLiteDatabase | null = null;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('habit_tracker.db');
  await runMigrations(_db);
  return _db;
}
```

---

### Task 3 — logTask() business logic + tests (90 min)

**`__tests__/logTask.test.ts` — write first (TDD):**
```typescript
import {
  computeLogTaskRows,
  ComputeInput,
} from '../src/logic/logTask';

const baseGoodTask: ComputeInput = {
  userId: 1,
  taskTypeId: 1,
  kind: 'GOOD',
  isTimeBased: false,
  basePoints: 10,
  starPenalty: 50,
  durationMin: undefined,
  currentDayPoints: 0,
  bonusAlreadyAwarded: false,
  loggedAt: new Date('2025-05-27T10:00:00Z'),
  localDate: '2025-05-27',
  weekStart: '2025-05-26',
};

test('GOOD non-time task: base_points=10, stars_delta=+1', () => {
  const result = computeLogTaskRows(baseGoodTask);
  expect(result.activityRow.points_earned).toBe(10);
  expect(result.activityRow.stars_delta).toBe(1);
  expect(result.activityRow.source).toBe('TASK');
  expect(result.bonusRow).toBeNull();
});

test('GOOD time-based task 60min: points=2', () => {
  const result = computeLogTaskRows({
    ...baseGoodTask,
    isTimeBased: true,
    durationMin: 60,
  });
  expect(result.activityRow.points_earned).toBe(2);
});

test('GOOD time-based task 15min: min 1 point', () => {
  const result = computeLogTaskRows({
    ...baseGoodTask,
    isTimeBased: true,
    durationMin: 15,
  });
  expect(result.activityRow.points_earned).toBe(1);
});

test('BAD task: points=0, stars_delta=-star_penalty', () => {
  const result = computeLogTaskRows({ ...baseGoodTask, kind: 'BAD' });
  expect(result.activityRow.points_earned).toBe(0);
  expect(result.activityRow.stars_delta).toBe(-50);
  expect(result.bonusRow).toBeNull();
});

test('GOOD task pushes day over 50pts: bonus row created', () => {
  const result = computeLogTaskRows({
    ...baseGoodTask,
    currentDayPoints: 45,
    bonusAlreadyAwarded: false,
  });
  expect(result.bonusRow).not.toBeNull();
  expect(result.bonusRow!.source).toBe('DAILY_BONUS');
  expect(result.bonusRow!.stars_delta).toBe(1);
});

test('Bonus not awarded twice in same day', () => {
  const result = computeLogTaskRows({
    ...baseGoodTask,
    currentDayPoints: 45,
    bonusAlreadyAwarded: true,
  });
  expect(result.bonusRow).toBeNull();
});
```

**`src/logic/logTask.ts`:**
```typescript
import {
  STARS_PER_TASK,
  DAILY_BONUS_THRESHOLD,
  DAILY_BONUS_STARS,
  TIME_UNIT_MINUTES,
} from '../constants';

export interface ComputeInput {
  userId: number;
  taskTypeId: number | null;
  kind: 'GOOD' | 'BAD';
  isTimeBased: boolean;
  basePoints: number;
  starPenalty: number;
  durationMin?: number;
  currentDayPoints: number;
  bonusAlreadyAwarded: boolean;
  loggedAt: Date;
  localDate: string;
  weekStart: string;
}

interface ActivityRow {
  user_id: number;
  task_type_id: number | null;
  kind: string;
  duration_min: number | null;
  points_earned: number;
  stars_delta: number;
  source: string;
  logged_at: number;
  local_date: string;
  week_start: string;
}

interface ComputeResult {
  activityRow: ActivityRow;
  bonusRow: ActivityRow | null;
}

export function computeLogTaskRows(input: ComputeInput): ComputeResult {
  const ts = input.loggedAt.getTime();

  let pointsEarned: number;
  let starsDelta: number;

  if (input.kind === 'GOOD') {
    if (input.isTimeBased) {
      pointsEarned = Math.max(1, Math.floor((input.durationMin ?? 0) / TIME_UNIT_MINUTES));
    } else {
      pointsEarned = input.basePoints;
    }
    starsDelta = STARS_PER_TASK;
  } else {
    pointsEarned = 0;
    starsDelta = -input.starPenalty;
  }

  const activityRow: ActivityRow = {
    user_id: input.userId,
    task_type_id: input.taskTypeId,
    kind: input.kind,
    duration_min: input.durationMin ?? null,
    points_earned: pointsEarned,
    stars_delta: starsDelta,
    source: 'TASK',
    logged_at: ts,
    local_date: input.localDate,
    week_start: input.weekStart,
  };

  let bonusRow: ActivityRow | null = null;
  const newDayPoints = input.currentDayPoints + pointsEarned;
  if (
    input.kind === 'GOOD' &&
    !input.bonusAlreadyAwarded &&
    newDayPoints >= DAILY_BONUS_THRESHOLD
  ) {
    bonusRow = {
      user_id: input.userId,
      task_type_id: null,
      kind: 'DAILY_BONUS',
      duration_min: null,
      points_earned: 0,
      stars_delta: DAILY_BONUS_STARS,
      source: 'DAILY_BONUS',
      logged_at: ts,
      local_date: input.localDate,
      week_start: input.weekStart,
    };
  }

  return { activityRow, bonusRow };
}
```

Run test: `npm test -- logTask`

---

### Task 4 — Today Screen UI (120 min)

**`src/queries/useToday.ts`:**
```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getDb } from '../db/client';
import { computeLogTaskRows } from '../logic/logTask';
import { getLocalDate, getWeekStart } from '../logic/formatters';

export function useTodayTasks(userId: number) {
  return useQuery({
    queryKey: ['today', 'tasks', userId],
    queryFn: async () => {
      const db = await getDb();
      return db.getAllAsync<{
        id: number; name: string; kind: string; is_time_based: number;
        base_points: number; star_penalty: number; icon: string | null;
      }>(
        `SELECT id, name, kind, is_time_based, base_points, star_penalty, icon
         FROM task_types WHERE user_id = ? AND archived = 0 ORDER BY kind, name`,
        [userId]
      );
    },
  });
}

export function useDailySummary(userId: number) {
  const today = getLocalDate();
  return useQuery({
    queryKey: ['today', 'summary', userId, today],
    queryFn: async () => {
      const db = await getDb();
      return db.getFirstAsync<{
        total_points: number; bonus_star_awarded: number; streak_count: number;
      }>(
        `SELECT total_points, bonus_star_awarded, streak_count
         FROM daily_summary WHERE user_id = ? AND local_date = ?`,
        [userId, today]
      );
    },
  });
}

export function useWeeklySummary(userId: number) {
  const weekStart = getWeekStart();
  return useQuery({
    queryKey: ['week', userId, weekStart],
    queryFn: async () => {
      const db = await getDb();
      return db.getFirstAsync<{
        weekly_stars: number; peak_stars: number; current_tier_id: number | null;
      }>(
        `SELECT weekly_stars, peak_stars, current_tier_id
         FROM weekly_summary WHERE user_id = ? AND week_start = ?`,
        [userId, weekStart]
      );
    },
  });
}

export function useLogTask(userId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      taskTypeId: number;
      kind: 'GOOD' | 'BAD';
      isTimeBased: boolean;
      basePoints: number;
      starPenalty: number;
      durationMin?: number;
    }) => {
      const db = await getDb();
      const today = getLocalDate();
      const weekStart = getWeekStart();
      const now = new Date();

      const daily = await db.getFirstAsync<{
        total_points: number; bonus_star_awarded: number;
      }>(
        `SELECT total_points, bonus_star_awarded FROM daily_summary
         WHERE user_id = ? AND local_date = ?`,
        [userId, today]
      );

      const { activityRow, bonusRow } = computeLogTaskRows({
        userId,
        taskTypeId: params.taskTypeId,
        kind: params.kind,
        isTimeBased: params.isTimeBased,
        basePoints: params.basePoints,
        starPenalty: params.starPenalty,
        durationMin: params.durationMin,
        currentDayPoints: daily?.total_points ?? 0,
        bonusAlreadyAwarded: !!daily?.bonus_star_awarded,
        loggedAt: now,
        localDate: today,
        weekStart,
      });

      await db.runAsync(
        `INSERT INTO activity_log (user_id, task_type_id, kind, duration_min, points_earned, stars_delta, source, logged_at, local_date, week_start)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [activityRow.user_id, activityRow.task_type_id, activityRow.kind,
         activityRow.duration_min, activityRow.points_earned, activityRow.stars_delta,
         activityRow.source, activityRow.logged_at, activityRow.local_date, activityRow.week_start]
      );

      const newDayPts = (daily?.total_points ?? 0) + activityRow.points_earned;
      let totalStarsDelta = activityRow.stars_delta;

      if (bonusRow) {
        await db.runAsync(
          `INSERT INTO activity_log (user_id, task_type_id, kind, duration_min, points_earned, stars_delta, source, logged_at, local_date, week_start)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [bonusRow.user_id, bonusRow.task_type_id, bonusRow.kind, bonusRow.duration_min,
           bonusRow.points_earned, bonusRow.stars_delta, bonusRow.source,
           bonusRow.logged_at, bonusRow.local_date, bonusRow.week_start]
        );
        totalStarsDelta += bonusRow.stars_delta;
      }

      // Upsert daily_summary
      await db.runAsync(
        `INSERT INTO daily_summary (user_id, local_date, total_points, bonus_star_awarded, streak_count)
         VALUES (?, ?, ?, ?, 1)
         ON CONFLICT(user_id, local_date) DO UPDATE SET
           total_points = total_points + ?,
           bonus_star_awarded = CASE WHEN ? THEN 1 ELSE bonus_star_awarded END`,
        [userId, today, newDayPts, bonusRow ? 1 : 0, activityRow.points_earned, bonusRow ? 1 : 0]
      );

      // Upsert weekly_summary
      await db.runAsync(
        `INSERT INTO weekly_summary (user_id, week_start, total_points, weekly_stars, peak_stars)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(user_id, week_start) DO UPDATE SET
           total_points = total_points + ?,
           weekly_stars = weekly_stars + ?,
           peak_stars = MAX(peak_stars, weekly_stars + ?)`,
        [userId, weekStart, activityRow.points_earned, totalStarsDelta,
         Math.max(0, totalStarsDelta),
         activityRow.points_earned, totalStarsDelta, totalStarsDelta]
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['today'] });
      qc.invalidateQueries({ queryKey: ['week'] });
      qc.invalidateQueries({ queryKey: ['fund'] });
    },
  });
}
```

**`src/logic/formatters.ts`:**
```typescript
export function getLocalDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function getWeekStart(): string {
  const d = new Date();
  const dow = d.getDay(); // 0=Sun
  const diff = dow === 0 ? 6 : dow - 1; // Monday=0
  d.setDate(d.getDate() - diff);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function formatVND(amount: number): string {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(amount);
}
```

**`src/screens/TodayScreen.tsx`:**
```tsx
import React, { useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator, Modal, TextInput, Alert,
} from 'react-native';
import { useTodayTasks, useDailySummary, useWeeklySummary, useLogTask } from '../queries/useToday';

const USER_ID = 1; // single-user MVP

export function TodayScreen() {
  const { data: tasks, isLoading } = useTodayTasks(USER_ID);
  const { data: daily } = useDailySummary(USER_ID);
  const { data: weekly } = useWeeklySummary(USER_ID);
  const logTask = useLogTask(USER_ID);

  const [modalTask, setModalTask] = useState<typeof tasks extends Array<infer T> ? T : never | null>(null);
  const [duration, setDuration] = useState('');

  async function handleLog(task: NonNullable<typeof tasks>[0]) {
    if (task.is_time_based) {
      setModalTask(task as any);
      return;
    }
    await logTask.mutateAsync({
      taskTypeId: task.id,
      kind: task.kind as 'GOOD' | 'BAD',
      isTimeBased: false,
      basePoints: task.base_points,
      starPenalty: task.star_penalty,
    });
  }

  async function handleLogTime() {
    if (!modalTask) return;
    const mins = parseInt(duration, 10);
    if (isNaN(mins) || mins <= 0) {
      Alert.alert('Enter valid minutes');
      return;
    }
    await logTask.mutateAsync({
      taskTypeId: (modalTask as any).id,
      kind: (modalTask as any).kind as 'GOOD' | 'BAD',
      isTimeBased: true,
      basePoints: (modalTask as any).base_points,
      starPenalty: (modalTask as any).star_penalty,
      durationMin: mins,
    });
    setModalTask(null);
    setDuration('');
  }

  if (isLoading) return <ActivityIndicator style={{ flex: 1 }} />;

  return (
    <View style={styles.container}>
      {/* Header stats */}
      <View style={styles.header}>
        <Text style={styles.stars}>⭐ {(weekly?.weekly_stars ?? 0).toFixed(0)}</Text>
        <Text style={styles.points}>{daily?.total_points ?? 0} pts today</Text>
        {daily?.bonus_star_awarded ? <Text style={styles.bonus}>🎯 Bonus awarded!</Text> : null}
      </View>

      {/* Task list */}
      <FlatList
        data={tasks}
        keyExtractor={(t) => String(t.id)}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.row, item.kind === 'BAD' && styles.badRow]}
            onPress={() => handleLog(item)}
            disabled={logTask.isPending}
          >
            <Text style={styles.icon}>{item.icon ?? (item.kind === 'GOOD' ? '✅' : '❌')}</Text>
            <Text style={styles.taskName}>{item.name}</Text>
            <Text style={styles.pts}>
              {item.kind === 'GOOD'
                ? `+${item.is_time_based ? '1pt/30m' : item.base_points + 'pt'}`
                : `-${item.star_penalty}⭐`}
            </Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>No tasks yet. Add some in the Me tab.</Text>
        }
      />

      {/* Duration modal for time-based tasks */}
      <Modal visible={!!modalTask} transparent animationType="slide">
        <View style={styles.modalBg}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>How many minutes?</Text>
            <TextInput
              style={styles.input}
              keyboardType="number-pad"
              value={duration}
              onChangeText={setDuration}
              placeholder="e.g. 45"
              autoFocus
            />
            <TouchableOpacity style={styles.btn} onPress={handleLogTime}>
              <Text style={styles.btnText}>Log</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setModalTask(null); setDuration(''); }}>
              <Text style={styles.cancel}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f0f' },
  header: { padding: 20, backgroundColor: '#1a1a2e', alignItems: 'center' },
  stars: { fontSize: 32, color: '#FFD700', fontWeight: 'bold' },
  points: { fontSize: 16, color: '#aaa', marginTop: 4 },
  bonus: { fontSize: 14, color: '#4CAF50', marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderColor: '#222' },
  badRow: { backgroundColor: '#1a0a0a' },
  icon: { fontSize: 24, marginRight: 12 },
  taskName: { flex: 1, fontSize: 16, color: '#fff' },
  pts: { fontSize: 14, color: '#888' },
  empty: { textAlign: 'center', color: '#555', marginTop: 40, fontSize: 16 },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalBox: { backgroundColor: '#1a1a2e', padding: 24, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  modalTitle: { fontSize: 18, color: '#fff', marginBottom: 16 },
  input: { backgroundColor: '#222', color: '#fff', padding: 12, borderRadius: 8, fontSize: 18, marginBottom: 16 },
  btn: { backgroundColor: '#6C63FF', padding: 14, borderRadius: 8, alignItems: 'center', marginBottom: 8 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  cancel: { textAlign: 'center', color: '#888', padding: 8 },
});
```

**`src/navigation/RootNavigator.tsx`:**
```tsx
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { TodayScreen } from '../screens/TodayScreen';
import { ProgressScreen } from '../screens/ProgressScreen';
import { FundScreen } from '../screens/FundScreen';
import { MeScreen } from '../screens/MeScreen';

const Tab = createBottomTabNavigator();

export function RootNavigator() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={{
          tabBarStyle: { backgroundColor: '#1a1a2e', borderTopColor: '#333' },
          tabBarActiveTintColor: '#6C63FF',
          tabBarInactiveTintColor: '#666',
          headerStyle: { backgroundColor: '#1a1a2e' },
          headerTintColor: '#fff',
        }}
      >
        <Tab.Screen name="Today" component={TodayScreen} options={{ tabBarLabel: '📅 Today' }} />
        <Tab.Screen name="Progress" component={ProgressScreen} options={{ tabBarLabel: '📈 Progress' }} />
        <Tab.Screen name="Fund" component={FundScreen} options={{ tabBarLabel: '💰 Fund' }} />
        <Tab.Screen name="Me" component={MeScreen} options={{ tabBarLabel: '👤 Me' }} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
```

**`App.tsx`:**
```tsx
import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './src/queries/queryClient';
import { RootNavigator } from './src/navigation/RootNavigator';

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RootNavigator />
    </QueryClientProvider>
  );
}
```

**`src/queries/queryClient.ts`:**
```typescript
import { QueryClient } from '@tanstack/react-query';
export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 1000 * 30 } },
});
```

**Stub screens (create these empty, fill Day 2–3):**

`src/screens/ProgressScreen.tsx` — `export function ProgressScreen() { return <View><Text>Progress</Text></View>; }`  
`src/screens/FundScreen.tsx` — `export function FundScreen() { return <View><Text>Fund</Text></View>; }`  
`src/screens/MeScreen.tsx` — `export function MeScreen() { return <View><Text>Me</Text></View>; }`  

**End of Day 1 test:**
```bash
npm test -- logTask       # all 6 tests pass
npx expo start --android  # tap task → star count increments
```

---

## Day 2 — weeklyReset() + checkTierUnlocks() + Fund Screen + ManageTasks

**Milestone:** Fund balance updates when tier unlocked, tasks can be created/edited

### Task 5 — weeklyReset() + tests (60 min)

**`__tests__/weeklyReset.test.ts`:**
```typescript
import { computeWeeklyReset, ResetInput } from '../src/logic/weeklyReset';

test('No previous week: create new week only', () => {
  const result = computeWeeklyReset({
    userId: 1,
    currentWeekStart: '2025-05-26',
    previousWeek: null,
    carryDebt: false,
  });
  expect(result.newWeek).toMatchObject({
    week_start: '2025-05-26',
    weekly_stars: 0,
    start_debt: 0,
  });
  expect(result.finalizeWeek).toBeNull();
});

test('Previous week not finalized: finalize it', () => {
  const result = computeWeeklyReset({
    userId: 1,
    currentWeekStart: '2025-05-26',
    previousWeek: { week_start: '2025-05-19', weekly_stars: 30, finalized: false },
    carryDebt: false,
  });
  expect(result.finalizeWeek).toBe('2025-05-19');
});

test('Carry debt: negative stars carry to new week', () => {
  const result = computeWeeklyReset({
    userId: 1,
    currentWeekStart: '2025-05-26',
    previousWeek: { week_start: '2025-05-19', weekly_stars: -15, finalized: false },
    carryDebt: true,
  });
  expect(result.newWeek?.weekly_stars).toBe(-15);
  expect(result.newWeek?.start_debt).toBe(15);
});

test('No carry debt: new week starts at 0 regardless', () => {
  const result = computeWeeklyReset({
    userId: 1,
    currentWeekStart: '2025-05-26',
    previousWeek: { week_start: '2025-05-19', weekly_stars: -15, finalized: false },
    carryDebt: false,
  });
  expect(result.newWeek?.weekly_stars).toBe(0);
  expect(result.newWeek?.start_debt).toBe(0);
});
```

**`src/logic/weeklyReset.ts`:**
```typescript
export interface ResetInput {
  userId: number;
  currentWeekStart: string;
  previousWeek: { week_start: string; weekly_stars: number; finalized: boolean } | null;
  carryDebt: boolean;
}

export interface ResetResult {
  newWeek: {
    user_id: number;
    week_start: string;
    weekly_stars: number;
    start_debt: number;
    total_points: number;
    peak_stars: number;
    finalized: boolean;
  } | null;
  finalizeWeek: string | null; // week_start to finalize
}

export function computeWeeklyReset(input: ResetInput): ResetResult {
  const finalizeWeek =
    input.previousWeek && !input.previousWeek.finalized
      ? input.previousWeek.week_start
      : null;

  let startingStars = 0;
  let startDebt = 0;

  if (input.carryDebt && input.previousWeek && input.previousWeek.weekly_stars < 0) {
    startingStars = input.previousWeek.weekly_stars;
    startDebt = Math.abs(input.previousWeek.weekly_stars);
  }

  return {
    newWeek: {
      user_id: input.userId,
      week_start: input.currentWeekStart,
      weekly_stars: startingStars,
      start_debt: startDebt,
      total_points: 0,
      peak_stars: 0,
      finalized: false,
    },
    finalizeWeek,
  };
}
```

Run: `npm test -- weeklyReset`

---

### Task 6 — checkTierUnlocks() + tests (60 min)

**`__tests__/checkTierUnlocks.test.ts`:**
```typescript
import { computeTierUnlocks } from '../src/logic/checkTierUnlocks';

const TIERS = [
  { id: 1, tier_order: 1, stars_required: 10, rank_name: 'Newbie', reward_amount: 50000 },
  { id: 2, tier_order: 2, stars_required: 25, rank_name: 'Grinder', reward_amount: 100000 },
  { id: 3, tier_order: 3, stars_required: 50, rank_name: 'No Life', reward_amount: 150000 },
];

test('12 peak stars: unlock tier 1 only', () => {
  const result = computeTierUnlocks({
    userId: 1, weekStart: '2025-05-26',
    peakStars: 12, tiers: TIERS, existingUnlockTierIds: [],
  });
  expect(result).toHaveLength(1);
  expect(result[0].tier_id).toBe(1);
  expect(result[0].reward_amount).toBe(50000);
});

test('30 peak stars: unlock tiers 1+2', () => {
  const result = computeTierUnlocks({
    userId: 1, weekStart: '2025-05-26',
    peakStars: 30, tiers: TIERS, existingUnlockTierIds: [],
  });
  expect(result).toHaveLength(2);
});

test('Already unlocked tier 1: only new tiers returned', () => {
  const result = computeTierUnlocks({
    userId: 1, weekStart: '2025-05-26',
    peakStars: 30, tiers: TIERS, existingUnlockTierIds: [1],
  });
  expect(result).toHaveLength(1);
  expect(result[0].tier_id).toBe(2);
});

test('5 stars: no unlocks', () => {
  const result = computeTierUnlocks({
    userId: 1, weekStart: '2025-05-26',
    peakStars: 5, tiers: TIERS, existingUnlockTierIds: [],
  });
  expect(result).toHaveLength(0);
});
```

**`src/logic/checkTierUnlocks.ts`:**
```typescript
interface Tier {
  id: number;
  tier_order: number;
  stars_required: number;
  rank_name: string;
  reward_amount: number;
}

interface UnlockRow {
  user_id: number;
  tier_id: number;
  week_start: string;
  stars_at_unlock: number;
  reward_amount: number;
}

interface Input {
  userId: number;
  weekStart: string;
  peakStars: number;
  tiers: Tier[];
  existingUnlockTierIds: number[];
}

export function computeTierUnlocks(input: Input): UnlockRow[] {
  const newUnlocks: UnlockRow[] = [];
  for (const tier of input.tiers) {
    if (
      input.peakStars >= tier.stars_required &&
      !input.existingUnlockTierIds.includes(tier.id)
    ) {
      newUnlocks.push({
        user_id: input.userId,
        tier_id: tier.id,
        week_start: input.weekStart,
        stars_at_unlock: input.peakStars,
        reward_amount: tier.reward_amount,
      });
    }
  }
  return newUnlocks;
}
```

Run: `npm test -- checkTierUnlocks`

---

### Task 7 — Fund Screen (90 min)

**`src/queries/useFund.ts`:**
```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getDb } from '../db/client';

export function useFundBalance(userId: number) {
  return useQuery({
    queryKey: ['fund', 'balance', userId],
    queryFn: async () => {
      const db = await getDb();
      const row = await db.getFirstAsync<{ balance: number }>(
        `SELECT COALESCE(SUM(CASE WHEN type='DEPOSIT' THEN amount ELSE -amount END), 0) as balance
         FROM fund_transactions WHERE user_id = ?`,
        [userId]
      );
      return row?.balance ?? 0;
    },
  });
}

export function useFundTransactions(userId: number) {
  return useQuery({
    queryKey: ['fund', 'transactions', userId],
    queryFn: async () => {
      const db = await getDb();
      return db.getAllAsync<{
        id: number; type: string; amount: number; note: string | null; occurred_at: number;
      }>(
        `SELECT id, type, amount, note, occurred_at
         FROM fund_transactions WHERE user_id = ?
         ORDER BY occurred_at DESC LIMIT 50`,
        [userId]
      );
    },
  });
}

export function useWithdrawFund(userId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { amount: number; note: string }) => {
      const db = await getDb();
      await db.runAsync(
        `INSERT INTO fund_transactions (user_id, type, amount, currency, note, occurred_at)
         VALUES (?, 'WITHDRAWAL', ?, 'VND', ?, ?)`,
        [userId, params.amount, params.note, Date.now()]
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fund'] }),
  });
}

export function usePendingUnlocks(userId: number) {
  return useQuery({
    queryKey: ['fund', 'unlocks', userId],
    queryFn: async () => {
      const db = await getDb();
      return db.getAllAsync<{
        id: number; rank_name: string; reward_amount: number; week_start: string;
      }>(
        `SELECT ru.id, t.rank_name, ru.reward_amount, ru.week_start
         FROM reward_unlocks ru
         JOIN tiers t ON t.id = ru.tier_id
         WHERE ru.user_id = ? AND ru.claimed = 0
         ORDER BY ru.id DESC`,
        [userId]
      );
    },
  });
}

export function useClaimUnlock(userId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (unlockId: number) => {
      const db = await getDb();
      const unlock = await db.getFirstAsync<{ reward_amount: number }>(
        `SELECT reward_amount FROM reward_unlocks WHERE id = ? AND user_id = ?`,
        [unlockId, userId]
      );
      if (!unlock) throw new Error('Unlock not found');
      await db.runAsync(
        `UPDATE reward_unlocks SET claimed = 1, claimed_at = ? WHERE id = ?`,
        [Date.now(), unlockId]
      );
      await db.runAsync(
        `INSERT INTO fund_transactions (user_id, type, amount, currency, source_unlock_id, occurred_at)
         VALUES (?, 'DEPOSIT', ?, 'VND', ?, ?)`,
        [userId, unlock.reward_amount, unlockId, Date.now()]
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fund'] }),
  });
}
```

**`src/screens/FundScreen.tsx`:**
```tsx
import React, { useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Modal, TextInput, Alert,
} from 'react-native';
import { useFundBalance, useFundTransactions, useWithdrawFund, usePendingUnlocks, useClaimUnlock } from '../queries/useFund';
import { formatVND } from '../logic/formatters';

const USER_ID = 1;

export function FundScreen() {
  const { data: balance = 0 } = useFundBalance(USER_ID);
  const { data: transactions = [] } = useFundTransactions(USER_ID);
  const { data: unlocks = [] } = usePendingUnlocks(USER_ID);
  const withdraw = useWithdrawFund(USER_ID);
  const claim = useClaimUnlock(USER_ID);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  async function handleWithdraw() {
    const amt = parseInt(amount.replace(/\D/g, ''), 10);
    if (isNaN(amt) || amt <= 0) { Alert.alert('Invalid amount'); return; }
    if (amt > balance) { Alert.alert('Insufficient balance'); return; }
    await withdraw.mutateAsync({ amount: amt, note });
    setShowWithdraw(false);
    setAmount('');
    setNote('');
  }

  return (
    <View style={styles.container}>
      {/* Balance */}
      <View style={styles.balanceBox}>
        <Text style={styles.balanceLabel}>Self-Treat Fund</Text>
        <Text style={styles.balance}>{formatVND(balance)}</Text>
      </View>

      {/* Pending unlocks */}
      {unlocks.length > 0 && (
        <View style={styles.unlocksBox}>
          <Text style={styles.sectionTitle}>🎁 New Rewards!</Text>
          {unlocks.map(u => (
            <TouchableOpacity
              key={u.id}
              style={styles.unlockRow}
              onPress={() => claim.mutate(u.id)}
            >
              <Text style={styles.unlockText}>{u.rank_name} — {formatVND(u.reward_amount)}</Text>
              <Text style={styles.claimBtn}>Claim →</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Withdraw button */}
      <TouchableOpacity
        style={[styles.withdrawBtn, balance === 0 && styles.disabled]}
        onPress={() => setShowWithdraw(true)}
        disabled={balance === 0}
      >
        <Text style={styles.withdrawText}>Spend 🛍</Text>
      </TouchableOpacity>

      {/* Transaction history */}
      <Text style={styles.sectionTitle}>History</Text>
      <FlatList
        data={transactions}
        keyExtractor={t => String(t.id)}
        renderItem={({ item }) => (
          <View style={styles.txRow}>
            <Text style={[styles.txType, item.type === 'DEPOSIT' ? styles.deposit : styles.withdrawal]}>
              {item.type === 'DEPOSIT' ? '↑' : '↓'}
            </Text>
            <Text style={styles.txNote}>{item.note ?? (item.type === 'DEPOSIT' ? 'Reward' : 'Spent')}</Text>
            <Text style={[styles.txAmount, item.type === 'DEPOSIT' ? styles.deposit : styles.withdrawal]}>
              {item.type === 'DEPOSIT' ? '+' : '-'}{formatVND(item.amount)}
            </Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No transactions yet</Text>}
      />

      {/* Withdraw modal */}
      <Modal visible={showWithdraw} transparent animationType="slide">
        <View style={styles.modalBg}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Spend from Fund</Text>
            <Text style={styles.modalBalance}>Available: {formatVND(balance)}</Text>
            <TextInput
              style={styles.input}
              keyboardType="number-pad"
              placeholder="Amount (VND)"
              placeholderTextColor="#666"
              value={amount}
              onChangeText={setAmount}
            />
            <TextInput
              style={styles.input}
              placeholder="What did you buy? (optional)"
              placeholderTextColor="#666"
              value={note}
              onChangeText={setNote}
            />
            <TouchableOpacity style={styles.btn} onPress={handleWithdraw}>
              <Text style={styles.btnText}>Confirm</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowWithdraw(false)}>
              <Text style={styles.cancel}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f0f' },
  balanceBox: { padding: 24, backgroundColor: '#1a1a2e', alignItems: 'center' },
  balanceLabel: { fontSize: 14, color: '#aaa' },
  balance: { fontSize: 36, fontWeight: 'bold', color: '#FFD700', marginTop: 4 },
  unlocksBox: { margin: 12, backgroundColor: '#1a2e1a', borderRadius: 12, padding: 12 },
  unlockRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  unlockText: { color: '#4CAF50', fontSize: 15 },
  claimBtn: { color: '#6C63FF', fontSize: 15, fontWeight: 'bold' },
  withdrawBtn: { margin: 12, backgroundColor: '#6C63FF', padding: 14, borderRadius: 12, alignItems: 'center' },
  disabled: { opacity: 0.4 },
  withdrawText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  sectionTitle: { paddingHorizontal: 16, paddingVertical: 8, color: '#888', fontSize: 13 },
  txRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderColor: '#222' },
  txType: { fontSize: 20, marginRight: 8, width: 24 },
  txNote: { flex: 1, color: '#ccc', fontSize: 14 },
  txAmount: { fontSize: 14, fontWeight: 'bold' },
  deposit: { color: '#4CAF50' },
  withdrawal: { color: '#f44336' },
  empty: { textAlign: 'center', color: '#555', marginTop: 20 },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalBox: { backgroundColor: '#1a1a2e', padding: 24, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  modalTitle: { fontSize: 18, color: '#fff', marginBottom: 4 },
  modalBalance: { color: '#888', marginBottom: 16 },
  input: { backgroundColor: '#222', color: '#fff', padding: 12, borderRadius: 8, fontSize: 16, marginBottom: 12 },
  btn: { backgroundColor: '#6C63FF', padding: 14, borderRadius: 8, alignItems: 'center', marginBottom: 8 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  cancel: { textAlign: 'center', color: '#888', padding: 8 },
});
```

---

### Task 8 — ManageTasksModal in MeScreen (60 min)

**`src/screens/MeScreen.tsx`:**
```tsx
import React, { useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Modal, TextInput, Switch, Alert,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getDb } from '../db/client';

const USER_ID = 1;

function useTaskTypes() {
  return useQuery({
    queryKey: ['taskTypes', USER_ID],
    queryFn: async () => {
      const db = await getDb();
      return db.getAllAsync<{
        id: number; name: string; kind: string;
        is_time_based: number; base_points: number; star_penalty: number; icon: string | null;
      }>(
        `SELECT id, name, kind, is_time_based, base_points, star_penalty, icon
         FROM task_types WHERE user_id = ? AND archived = 0 ORDER BY kind, name`,
        [USER_ID]
      );
    },
  });
}

function useAddTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      name: string; kind: 'GOOD' | 'BAD'; isTimeBased: boolean;
      basePoints: number; starPenalty: number; icon: string;
    }) => {
      const db = await getDb();
      await db.runAsync(
        `INSERT INTO task_types (user_id, name, kind, is_time_based, base_points, star_penalty, icon)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [USER_ID, params.name, params.kind, params.isTimeBased ? 1 : 0,
         params.basePoints, params.starPenalty, params.icon]
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['taskTypes'] });
      qc.invalidateQueries({ queryKey: ['today'] });
    },
  });
}

function useArchiveTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const db = await getDb();
      await db.runAsync(`UPDATE task_types SET archived = 1 WHERE id = ?`, [id]);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['taskTypes'] });
      qc.invalidateQueries({ queryKey: ['today'] });
    },
  });
}

export function MeScreen() {
  const { data: tasks = [] } = useTaskTypes();
  const addTask = useAddTask();
  const archiveTask = useArchiveTask();
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'GOOD' | 'BAD'>('GOOD');
  const [isTimeBased, setIsTimeBased] = useState(false);
  const [basePoints, setBasePoints] = useState('10');
  const [icon, setIcon] = useState('');

  async function handleAdd() {
    if (!name.trim()) { Alert.alert('Enter task name'); return; }
    await addTask.mutateAsync({
      name: name.trim(), kind, isTimeBased,
      basePoints: parseInt(basePoints, 10) || 10,
      starPenalty: 50,
      icon: icon.trim() || (kind === 'GOOD' ? '✅' : '❌'),
    });
    setShowAdd(false);
    setName(''); setKind('GOOD'); setIsTimeBased(false); setBasePoints('10'); setIcon('');
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>My Tasks</Text>
      <FlatList
        data={tasks}
        keyExtractor={t => String(t.id)}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.rowIcon}>{item.icon ?? '•'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowName}>{item.name}</Text>
              <Text style={styles.rowMeta}>
                {item.kind} · {item.is_time_based ? '⏱ time-based' : `${item.base_points}pt`}
              </Text>
            </View>
            <TouchableOpacity onPress={() => Alert.alert('Archive?', item.name, [
              { text: 'Cancel' },
              { text: 'Archive', style: 'destructive', onPress: () => archiveTask.mutate(item.id) },
            ])}>
              <Text style={styles.del}>✕</Text>
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No tasks. Add some below.</Text>}
      />
      <TouchableOpacity style={styles.fab} onPress={() => setShowAdd(true)}>
        <Text style={styles.fabText}>+ Add Task</Text>
      </TouchableOpacity>

      <Modal visible={showAdd} transparent animationType="slide">
        <View style={styles.modalBg}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>New Task</Text>
            <TextInput style={styles.input} placeholder="Task name" placeholderTextColor="#666"
              value={name} onChangeText={setName} />
            <TextInput style={styles.input} placeholder="Icon emoji (optional)" placeholderTextColor="#666"
              value={icon} onChangeText={setIcon} />
            <View style={styles.row2}>
              <TouchableOpacity
                style={[styles.kindBtn, kind === 'GOOD' && styles.kindActive]}
                onPress={() => setKind('GOOD')}
              ><Text style={styles.kindText}>✅ Good</Text></TouchableOpacity>
              <TouchableOpacity
                style={[styles.kindBtn, kind === 'BAD' && styles.kindBadActive]}
                onPress={() => setKind('BAD')}
              ><Text style={styles.kindText}>❌ Bad</Text></TouchableOpacity>
            </View>
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Time-based?</Text>
              <Switch value={isTimeBased} onValueChange={setIsTimeBased} />
            </View>
            {!isTimeBased && (
              <TextInput style={styles.input} placeholder="Points per log (default 10)"
                placeholderTextColor="#666" keyboardType="number-pad"
                value={basePoints} onChangeText={setBasePoints} />
            )}
            <TouchableOpacity style={styles.btn} onPress={handleAdd}>
              <Text style={styles.btnText}>Add</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowAdd(false)}>
              <Text style={styles.cancel}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f0f' },
  title: { fontSize: 20, fontWeight: 'bold', color: '#fff', padding: 16 },
  row: { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderColor: '#222' },
  rowIcon: { fontSize: 22, marginRight: 10 },
  rowName: { color: '#fff', fontSize: 16 },
  rowMeta: { color: '#666', fontSize: 12, marginTop: 2 },
  del: { color: '#555', fontSize: 18, padding: 4 },
  empty: { textAlign: 'center', color: '#555', marginTop: 40 },
  fab: { margin: 16, backgroundColor: '#6C63FF', padding: 14, borderRadius: 12, alignItems: 'center' },
  fabText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalBox: { backgroundColor: '#1a1a2e', padding: 24, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  modalTitle: { fontSize: 18, color: '#fff', marginBottom: 16 },
  input: { backgroundColor: '#222', color: '#fff', padding: 12, borderRadius: 8, fontSize: 15, marginBottom: 10 },
  row2: { flexDirection: 'row', marginBottom: 10, gap: 8 },
  kindBtn: { flex: 1, padding: 10, borderRadius: 8, backgroundColor: '#222', alignItems: 'center' },
  kindActive: { backgroundColor: '#1a3a1a' },
  kindBadActive: { backgroundColor: '#3a1a1a' },
  kindText: { color: '#fff', fontSize: 14 },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  switchLabel: { color: '#ccc', fontSize: 15 },
  btn: { backgroundColor: '#6C63FF', padding: 14, borderRadius: 8, alignItems: 'center', marginBottom: 8, marginTop: 4 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  cancel: { textAlign: 'center', color: '#888', padding: 8 },
});
```

**End of Day 2 test:**
```bash
npm test          # all 3 test suites pass (logTask + weeklyReset + checkTierUnlocks)
npx expo start --android
# → Add task in Me tab → log it in Today → if 10+ stars → Fund shows unclaimed reward → claim it → balance updates
```

---

## Day 3 — Progress Screen + weeklyReset hook + Android device test

**Milestone:** Charts working, app tested on physical Android device, APK exported

### Task 9 — Progress Screen (120 min)

**`src/queries/useProgress.ts`:**
```typescript
import { useQuery } from '@tanstack/react-query';
import { getDb } from '../db/client';

export function useDailyChart(userId: number, days: number = 30) {
  return useQuery({
    queryKey: ['progress', 'daily', userId, days],
    queryFn: async () => {
      const db = await getDb();
      return db.getAllAsync<{ local_date: string; total_points: number }>(
        `SELECT local_date, SUM(points_earned) as total_points
         FROM activity_log WHERE user_id = ?
         GROUP BY local_date ORDER BY local_date DESC LIMIT ?`,
        [userId, days]
      );
    },
  });
}

export function useWeeklyChart(userId: number, weeks: number = 12) {
  return useQuery({
    queryKey: ['progress', 'weekly', userId, weeks],
    queryFn: async () => {
      const db = await getDb();
      return db.getAllAsync<{ week_start: string; weekly_stars: number; total_points: number }>(
        `SELECT week_start, weekly_stars, total_points
         FROM weekly_summary WHERE user_id = ?
         ORDER BY week_start DESC LIMIT ?`,
        [userId, weeks]
      );
    },
  });
}

export function useStreakStats(userId: number) {
  return useQuery({
    queryKey: ['progress', 'streak', userId],
    queryFn: async () => {
      const db = await getDb();
      const row = await db.getFirstAsync<{
        max_streak: number; active_days: number;
      }>(
        `SELECT MAX(streak_count) as max_streak, COUNT(*) as active_days
         FROM daily_summary WHERE user_id = ?`,
        [userId]
      );
      return row ?? { max_streak: 0, active_days: 0 };
    },
  });
}
```

**`src/screens/ProgressScreen.tsx`:**
```tsx
import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { VictoryBar, VictoryChart, VictoryAxis, VictoryLine } from 'victory-native';
import { useDailyChart, useWeeklyChart, useStreakStats } from '../queries/useProgress';

const USER_ID = 1;
const W = Dimensions.get('window').width;
type Tab = 'daily' | 'weekly';

export function ProgressScreen() {
  const [tab, setTab] = useState<Tab>('daily');
  const { data: dailyData = [] } = useDailyChart(USER_ID, 30);
  const { data: weeklyData = [] } = useWeeklyChart(USER_ID, 12);
  const { data: streak } = useStreakStats(USER_ID);

  const dailyChartData = [...dailyData].reverse().slice(-14).map((d, i) => ({
    x: i + 1, y: d.total_points,
    label: d.local_date.slice(5),
  }));

  const weeklyChartData = [...weeklyData].reverse().slice(-8).map((d, i) => ({
    x: i + 1, y: d.weekly_stars,
    label: d.week_start.slice(5),
  }));

  return (
    <ScrollView style={styles.container}>
      {/* Stat pills */}
      <View style={styles.stats}>
        <View style={styles.pill}>
          <Text style={styles.pillVal}>{streak?.active_days ?? 0}</Text>
          <Text style={styles.pillLabel}>Active Days</Text>
        </View>
        <View style={styles.pill}>
          <Text style={styles.pillVal}>{streak?.max_streak ?? 0}</Text>
          <Text style={styles.pillLabel}>Best Streak</Text>
        </View>
        <View style={styles.pill}>
          <Text style={styles.pillVal}>{weeklyData[0]?.weekly_stars?.toFixed(0) ?? 0}⭐</Text>
          <Text style={styles.pillLabel}>This Week</Text>
        </View>
      </View>

      {/* Tab switch */}
      <View style={styles.tabs}>
        <TouchableOpacity style={[styles.tabBtn, tab === 'daily' && styles.tabActive]} onPress={() => setTab('daily')}>
          <Text style={[styles.tabText, tab === 'daily' && styles.tabActiveText]}>Daily Points</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabBtn, tab === 'weekly' && styles.tabActive]} onPress={() => setTab('weekly')}>
          <Text style={[styles.tabText, tab === 'weekly' && styles.tabActiveText]}>Weekly Stars</Text>
        </TouchableOpacity>
      </View>

      {/* Chart */}
      {tab === 'daily' ? (
        dailyChartData.length > 0 ? (
          <VictoryChart width={W - 16} height={240} padding={{ top: 20, bottom: 40, left: 40, right: 16 }}>
            <VictoryAxis style={{ tickLabels: { fill: '#888', fontSize: 9, angle: -45 } }} />
            <VictoryAxis dependentAxis style={{ tickLabels: { fill: '#888', fontSize: 10 } }} />
            <VictoryBar
              data={dailyChartData}
              style={{ data: { fill: '#6C63FF' } }}
              cornerRadius={{ top: 3 }}
            />
          </VictoryChart>
        ) : <Text style={styles.empty}>No data yet — log some tasks!</Text>
      ) : (
        weeklyChartData.length > 0 ? (
          <VictoryChart width={W - 16} height={240} padding={{ top: 20, bottom: 40, left: 40, right: 16 }}>
            <VictoryAxis style={{ tickLabels: { fill: '#888', fontSize: 9 } }} />
            <VictoryAxis dependentAxis style={{ tickLabels: { fill: '#888', fontSize: 10 } }} />
            <VictoryLine
              data={weeklyChartData}
              style={{ data: { stroke: '#FFD700', strokeWidth: 2 } }}
            />
          </VictoryChart>
        ) : <Text style={styles.empty}>No weekly data yet</Text>
      )}

      {/* Weekly history table */}
      <Text style={styles.sectionTitle}>Weekly History</Text>
      {weeklyData.map(w => (
        <View key={w.week_start} style={styles.weekRow}>
          <Text style={styles.weekDate}>Week of {w.week_start}</Text>
          <Text style={styles.weekStars}>{w.weekly_stars?.toFixed(0)} ⭐</Text>
          <Text style={styles.weekPts}>{w.total_points} pts</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f0f' },
  stats: { flexDirection: 'row', padding: 16, gap: 8 },
  pill: { flex: 1, backgroundColor: '#1a1a2e', borderRadius: 12, padding: 12, alignItems: 'center' },
  pillVal: { fontSize: 22, fontWeight: 'bold', color: '#FFD700' },
  pillLabel: { fontSize: 11, color: '#888', marginTop: 2 },
  tabs: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 8, borderRadius: 8, overflow: 'hidden', backgroundColor: '#1a1a2e' },
  tabBtn: { flex: 1, padding: 10, alignItems: 'center' },
  tabActive: { backgroundColor: '#6C63FF' },
  tabText: { color: '#888', fontSize: 14 },
  tabActiveText: { color: '#fff', fontWeight: 'bold' },
  empty: { textAlign: 'center', color: '#555', margin: 32 },
  sectionTitle: { paddingHorizontal: 16, paddingVertical: 8, color: '#888', fontSize: 13 },
  weekRow: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderColor: '#222' },
  weekDate: { flex: 1, color: '#ccc', fontSize: 14 },
  weekStars: { color: '#FFD700', fontSize: 14, marginRight: 12 },
  weekPts: { color: '#888', fontSize: 14 },
});
```

---

### Task 10 — weeklyReset on app open (30 min)

Wire `weeklyReset` to run when app opens. Add to `App.tsx`:

```tsx
import React, { useEffect } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './src/queries/queryClient';
import { RootNavigator } from './src/navigation/RootNavigator';
import { getDb } from './src/db/client';
import { computeWeeklyReset } from './src/logic/weeklyReset';
import { getWeekStart } from './src/logic/formatters';

const USER_ID = 1;

async function runWeeklyResetOnOpen() {
  const db = await getDb();
  const currentWeek = getWeekStart();
  const user = await db.getFirstAsync<{ carry_debt: number }>(
    `SELECT carry_debt FROM users WHERE id = ?`, [USER_ID]
  );

  const existing = await db.getFirstAsync<{ id: number }>(
    `SELECT id FROM weekly_summary WHERE user_id = ? AND week_start = ?`,
    [USER_ID, currentWeek]
  );
  if (existing) return; // already have this week

  const prev = await db.getFirstAsync<{ week_start: string; weekly_stars: number; finalized: number }>(
    `SELECT week_start, weekly_stars, finalized FROM weekly_summary
     WHERE user_id = ? ORDER BY week_start DESC LIMIT 1`,
    [USER_ID]
  );

  const { newWeek, finalizeWeek } = computeWeeklyReset({
    userId: USER_ID,
    currentWeekStart: currentWeek,
    previousWeek: prev ? { ...prev, finalized: !!prev.finalized } : null,
    carryDebt: !!(user?.carry_debt),
  });

  if (finalizeWeek) {
    await db.runAsync(
      `UPDATE weekly_summary SET finalized = 1 WHERE user_id = ? AND week_start = ?`,
      [USER_ID, finalizeWeek]
    );
  }

  if (newWeek) {
    await db.runAsync(
      `INSERT OR IGNORE INTO weekly_summary (user_id, week_start, total_points, weekly_stars, peak_stars, start_debt, finalized)
       VALUES (?, ?, ?, ?, ?, ?, 0)`,
      [USER_ID, newWeek.week_start, 0, newWeek.weekly_stars, 0, newWeek.start_debt]
    );
  }

  queryClient.invalidateQueries({ queryKey: ['week'] });
  queryClient.invalidateQueries({ queryKey: ['today'] });
}

export default function App() {
  useEffect(() => { runWeeklyResetOnOpen(); }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <RootNavigator />
    </QueryClientProvider>
  );
}
```

---

### Task 11 — Android device build + test (90 min)

```bash
# Install EAS CLI
npm install -g eas-cli

# Configure for Android local build
npx eas build:configure

# OR for direct USB test without EAS account:
npx expo run:android   # needs Android Studio + connected device/emulator

# Run all tests before building
npm test

# Check bundle size
npx expo export --platform android
```

**Manual test checklist:**
- [ ] App opens → no crash
- [ ] Add 2+ tasks in Me tab (1 GOOD, 1 BAD)
- [ ] Log GOOD task → star count +1 in Today header
- [ ] Log same GOOD task until 50pts → bonus star fires (header shows "🎯 Bonus awarded!")
- [ ] Log BAD task → stars decrease
- [ ] Check Fund tab → balance = 0 (no tier reached yet)
- [ ] Force stars to 10 (log 10 tasks) → Fund shows unclaimed reward → tap Claim → balance updates
- [ ] Progress tab → bar chart shows today's points
- [ ] Kill app → reopen → data persists
- [ ] Check weekly reset: change phone date to next Monday → reopen → new week created

---

## Commit Strategy

```bash
# End of Day 1
git add src/ __tests__/logTask.test.ts app.json package.json tsconfig.json babel.config.js jest.config.js
git commit -m "feat(habit-tracker): day 1 — expo setup, schema, logTask(), Today screen"

# End of Day 2
git add src/logic/weeklyReset.ts src/logic/checkTierUnlocks.ts \
        __tests__/weeklyReset.test.ts __tests__/checkTierUnlocks.test.ts \
        src/screens/FundScreen.tsx src/screens/MeScreen.tsx src/queries/useFund.ts
git commit -m "feat(habit-tracker): day 2 — weeklyReset, checkTierUnlocks, Fund screen, ManageTasks"

# End of Day 3
git add src/screens/ProgressScreen.tsx src/queries/useProgress.ts App.tsx
git commit -m "feat(habit-tracker): day 3 — Progress charts, weeklyReset on open, Android tested"
```

---

## Risk / Mitigation

| Risk | Mitigation |
|------|-----------|
| expo-sqlite API differences in SDK 52 | Use `openDatabaseAsync` + `execAsync`/`runAsync`/`getAllAsync`/`getFirstAsync` (SDK 52 new API) |
| victory-native peer dep conflicts | Pin `"victory-native": "^36"` with `"react-native-svg": "^15"` |
| TanStack Query cache stale on DB write | `invalidateQueries` in every `mutationFn.onSuccess` |
| WeeklyReset fires multiple times | `INSERT OR IGNORE` with UNIQUE constraint on `(user_id, week_start)` |
| checkTierUnlocks double-deposits | `INSERT OR IGNORE` with UNIQUE constraint on `(user_id, tier_id, week_start)` |
