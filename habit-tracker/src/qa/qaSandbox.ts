import type { SQLiteDatabase } from 'expo-sqlite';
import type { GoogleUser } from '../lib/googleUserStorage';
import { dailyBonusStarsForPoints } from '../config/constants';
import { getLocalDateFor, getWeekStartFor } from '../utils/formatters';
import { challengeReminderPrefix } from '../lib/challengeNotificationPlan';

/**
 * Reserved identity for the emulator-only QA sandbox.
 *
 * This is deliberately not an email account and must never be accepted by a
 * production build or sent to Supabase. The local row is recreated from
 * fixtures on every app start and purged on QA sign-out.
 */
export const QA_SANDBOX_SUB = 'qa-sandbox-local-v1';
export const QA_SANDBOX_EMAIL = 'qa-sandbox@local.habi';
export const QA_SANDBOX_NAME = 'QA Sandbox';

let qaSandboxNetworkBlocked = false;
let qaSeedInFlight: Promise<number> | null = null;
const QA_SANDBOX_DEV_BUILD = typeof __DEV__ === 'boolean' ? __DEV__ : process.env.NODE_ENV !== 'production';

export class QaSandboxNetworkBlockedError extends Error {
  constructor() {
    super('Supabase network access is disabled in the QA sandbox');
    this.name = 'QaSandboxNetworkBlockedError';
  }
}

export function createQaSandboxUser(): GoogleUser {
  return {
    sub: QA_SANDBOX_SUB,
    email: QA_SANDBOX_EMAIL,
    name: QA_SANDBOX_NAME,
    // A non-empty sentinel keeps the stored GoogleUser shape valid. Profile
    // renders the initials fallback for this reserved identity, so this is
    // never passed to Image or fetched over the network.
    picture: 'qa-sandbox-avatar',
  };
}

export function isQaSandboxIdentity(user: Pick<GoogleUser, 'sub'> | null | undefined): boolean {
  return user?.sub === QA_SANDBOX_SUB;
}

export function isQaSandboxBuildAvailable(): boolean {
  return QA_SANDBOX_DEV_BUILD;
}

export function setQaSandboxNetworkBlocked(blocked: boolean): void {
  qaSandboxNetworkBlocked = QA_SANDBOX_DEV_BUILD && blocked;
}

export function isQaSandboxNetworkBlocked(): boolean {
  return qaSandboxNetworkBlocked;
}

export function isQaSandboxActive(): boolean {
  return QA_SANDBOX_DEV_BUILD && qaSandboxNetworkBlocked;
}

export type QaSandboxLeaderboardRow = {
  player_id: string;
  year_stars: number;
  rank: number;
  is_current_user: boolean;
  current_streak: number;
  rank_delta_7d: number | null;
};

/**
 * In-memory competitors for the local Rank UI. These rows are deliberately
 * not part of the SQLite fixture or any Supabase payload: they exist only to
 * exercise the board's champion, movement, highlighted-row, and scroll states.
 */
const QA_SANDBOX_LEADERBOARD_RIVALS = [
  { player_id: 'qa-rival-01', year_stars: 980, current_streak: 41, rank_delta_7d: 4 },
  { player_id: 'qa-rival-02', year_stars: 860, current_streak: 29, rank_delta_7d: -2 },
  { player_id: 'qa-rival-03', year_stars: 780, current_streak: 24, rank_delta_7d: 0 },
  { player_id: 'qa-rival-04', year_stars: 710, current_streak: 19, rank_delta_7d: null },
  { player_id: 'qa-rival-05', year_stars: 670, current_streak: 17, rank_delta_7d: 3 },
  { player_id: 'qa-rival-06', year_stars: 625, current_streak: 16, rank_delta_7d: -1 },
  { player_id: 'qa-rival-07', year_stars: 590, current_streak: 14, rank_delta_7d: 2 },
  { player_id: 'qa-rival-08', year_stars: 560, current_streak: 13, rank_delta_7d: null },
  { player_id: 'qa-rival-09', year_stars: 530, current_streak: 11, rank_delta_7d: 1 },
  { player_id: 'qa-rival-10', year_stars: 500, current_streak: 10, rank_delta_7d: -3 },
  { player_id: 'qa-rival-11', year_stars: 480, current_streak: 9, rank_delta_7d: 0 },
  { player_id: 'qa-rival-12', year_stars: 455, current_streak: 8, rank_delta_7d: null },
  { player_id: 'qa-rival-13', year_stars: 440, current_streak: 7, rank_delta_7d: 2 },
  { player_id: 'qa-rival-14', year_stars: 430, current_streak: 6, rank_delta_7d: -1 },
  { player_id: 'qa-rival-15', year_stars: 410, current_streak: 5, rank_delta_7d: 1 },
  { player_id: 'qa-rival-16', year_stars: 395, current_streak: 4, rank_delta_7d: null },
  { player_id: 'qa-rival-17', year_stars: 380, current_streak: 3, rank_delta_7d: 0 },
  { player_id: 'qa-rival-18', year_stars: 365, current_streak: 2, rank_delta_7d: -2 },
  { player_id: 'qa-rival-19', year_stars: 345, current_streak: 2, rank_delta_7d: 1 },
  { player_id: 'qa-rival-20', year_stars: 320, current_streak: 1, rank_delta_7d: null },
] as const;

/** Builds a stable, non-persistent board around the sandbox's local total. */
export function buildQaSandboxLeaderboard(currentStars: number): QaSandboxLeaderboardRow[] {
  const safeCurrentStars = Number.isFinite(currentStars) ? Math.max(0, Math.round(currentStars)) : 0;
  const rows = [
    ...QA_SANDBOX_LEADERBOARD_RIVALS,
    { player_id: QA_SANDBOX_SUB, year_stars: safeCurrentStars, current_streak: 13, rank_delta_7d: 3 },
  ];

  return [...rows]
    .sort((a, b) => b.year_stars - a.year_stars || a.player_id.localeCompare(b.player_id))
    .map((row, index) => ({
      ...row,
      rank: index + 1,
      is_current_user: row.player_id === QA_SANDBOX_SUB,
    }));
}

export type QaFixtureTask = {
  key: string;
  name: string;
  kind: 'GOOD' | 'BAD';
  isTimeBased: boolean;
  basePoints: number;
  starPenalty: number;
  categoryKey: string;
  icon: string;
  sortOrder: number;
  isTemplate: boolean;
};

export type QaFixtureActivity = {
  taskKey: string | null;
  kind: string;
  durationMin: number | null;
  pointsEarned: number;
  starsDelta: number;
  source: string;
  loggedAt: number;
  localDate: string;
  weekStart: string;
};

export type QaFixtureDailySummary = {
  localDate: string;
  totalPoints: number;
  bonusStarAwarded: number;
  streakCount: number;
};

export type QaFixtureWeeklySummary = {
  weekStart: string;
  totalPoints: number;
  weeklyStars: number;
};

export type QaFixtureChallenge = {
  key: string;
  name: string;
  taskKey: string | null;
  mode: 'streak' | 'weekly';
  targetDays: number;
  weeklyTarget: number | null;
  totalWeeks: number | null;
  startDate: string;
  status: 'active' | 'done' | 'failed';
  freezesLeft: number;
  freezeUsed: number;
  streakCurrent: number;
  completedAt: string | null;
  minDuration: number | null;
  minCount: number | null;
};

export type QaFixtureChallengeLog = {
  challengeKey: string;
  localDate: string;
  state: 'done' | 'reset' | 'freeze';
};

export type QaFixtureTreat = {
  key: string;
  name: string;
  icon: string;
  targetStars: number;
  approxAmount: number;
  status: 'ACTIVE' | 'ENJOYED' | 'ARCHIVED';
  sortOrder: number;
  reachedAt: string | null;
  enjoyedAt: string | null;
};

export type QaFixtureTreatHistory = {
  treatKey: string;
  name: string;
  starsSpent: number;
  amount: number;
  enjoyedAt: string;
};

export type QaFixture = {
  categories: Array<{ key: string; name: string; icon: string; sortOrder: number }>;
  tasks: QaFixtureTask[];
  activities: QaFixtureActivity[];
  dailySummaries: QaFixtureDailySummary[];
  weeklySummaries: QaFixtureWeeklySummary[];
  challenges: QaFixtureChallenge[];
  challengeLogs: QaFixtureChallengeLog[];
  treats: QaFixtureTreat[];
  treatHistory: QaFixtureTreatHistory[];
  achievements: Array<{ key: string; earnedAt: string }>;
  rewardUnlocks: Array<{ tierOrder: number; weekStart: string; starsAtUnlock: number; rewardAmount: number }>;
  fundTransactions: Array<{ type: 'DEPOSIT' | 'WITHDRAWAL'; amount: number; note: string; occurredAt: number }>;
  milestoneStars: Array<{ milestoneDays: number; stars: number; awardedAt: number }>;
  streakFreezes: Array<{ localDate: string; purchasedAt: number }>;
  boost: { localDate: string; multiplier: number; claimDeadline: number; createdAt: number };
  lifetimeStars: number;
  treatStars: number;
};

function dateAtOffset(now: Date, offset: number, hour: number): Date {
  const date = new Date(now);
  date.setHours(hour, 15, 0, 0);
  date.setDate(date.getDate() + offset);
  return date;
}

function dateText(now: Date, offset: number): string {
  return getLocalDateFor(dateAtOffset(now, offset, 12));
}

function isoAtOffset(now: Date, offset: number, hour: number): string {
  return dateAtOffset(now, offset, hour).toISOString();
}

/**
 * Generates a large, repeatable dataset that exercises current, empty,
 * penalty, long-history, challenge, reward, night, and morning states.
 * Values are relative to the device date so the emulator always has useful
 * current-week/current-month/current-year content without random drift.
 */
export function buildQaSandboxFixture(now: Date = new Date()): QaFixture {
  const categories = [
    { key: 'health', name: 'Health', icon: '🏃', sortOrder: 1 },
    { key: 'mind', name: 'Mind', icon: '🧠', sortOrder: 2 },
    { key: 'work', name: 'Work', icon: '💼', sortOrder: 3 },
    { key: 'home', name: 'Home', icon: '🏠', sortOrder: 4 },
    { key: 'qa', name: 'QA edge cases', icon: '🧪', sortOrder: 5 },
  ];

  const tasks: QaFixtureTask[] = [
    { key: 'running', name: 'Chạy bộ', kind: 'GOOD', isTimeBased: true, basePoints: 1, starPenalty: 0, categoryKey: 'health', icon: '🏃', sortOrder: 1, isTemplate: true },
    { key: 'gym', name: 'Gym', kind: 'GOOD', isTimeBased: true, basePoints: 2, starPenalty: 0, categoryKey: 'health', icon: '💪', sortOrder: 2, isTemplate: true },
    { key: 'reading', name: 'Đọc sách', kind: 'GOOD', isTimeBased: true, basePoints: 1, starPenalty: 0, categoryKey: 'mind', icon: '📖', sortOrder: 3, isTemplate: true },
    { key: 'study', name: 'Ôn bài', kind: 'GOOD', isTimeBased: true, basePoints: 1, starPenalty: 0, categoryKey: 'mind', icon: '📋', sortOrder: 4, isTemplate: true },
    { key: 'work', name: 'Work', kind: 'GOOD', isTimeBased: false, basePoints: 5, starPenalty: 0, categoryKey: 'work', icon: '💼', sortOrder: 5, isTemplate: true },
    { key: 'cleaning', name: 'Dọn dẹp', kind: 'GOOD', isTimeBased: false, basePoints: 5, starPenalty: 0, categoryKey: 'home', icon: '🧹', sortOrder: 6, isTemplate: true },
    { key: 'water', name: 'Drink water', kind: 'GOOD', isTimeBased: false, basePoints: 5, starPenalty: 0, categoryKey: 'health', icon: '💧', sortOrder: 7, isTemplate: false },
    { key: 'scrolling', name: 'Late-night scrolling', kind: 'BAD', isTimeBased: false, basePoints: 0, starPenalty: 2, categoryKey: 'qa', icon: '📱', sortOrder: 8, isTemplate: false },
  ];

  const activities: QaFixtureActivity[] = [];
  const dailySummaries: QaFixtureDailySummary[] = [];
  const weekly = new Map<string, { totalPoints: number; weeklyStars: number }>();
  const today = dateText(now, 0);

  for (let offset = -180; offset <= 0; offset += 1) {
    // Keep the current streak dense while leaving deterministic gaps in the
    // older history for heatmap, empty-state, and date-navigation coverage.
    const active = offset >= -12 || ((Math.abs(offset) + 3) % 11 !== 0);
    if (!active) continue;

    const localDate = dateText(now, offset);
    const weekStart = getWeekStartFor(dateAtOffset(now, offset, 12));
    const count = offset === 0 ? 10 : offset >= -12 ? 2 + (Math.abs(offset) % 2) : 1 + (Math.abs(offset) % 4);
    let totalPoints = 0;
    let bonusAwarded = 0;
    let dayStars = 0;

    for (let index = 0; index < count; index += 1) {
      const forcedToday = offset === 0 ? ['running', 'reading', 'work', 'scrolling'][index] : null;
      const candidate = forcedToday ?? tasks[(Math.abs(offset) * 3 + index * 2) % (tasks.length - 1)].key;
      const task = tasks.find(item => item.key === candidate) ?? tasks[0];
      const durationMin = task.isTimeBased ? [30, 45, 60, 90][(Math.abs(offset) + index) % 4] : null;
      const pointsEarned = task.kind === 'BAD'
        ? 0
        : task.isTimeBased ? Math.max(1, Math.ceil((durationMin ?? 0) / 30)) : 5;
      const starsDelta = task.kind === 'BAD' ? -task.starPenalty : 1;
      const hour = index === 0 ? 7 : index === count - 1 ? 22 : 12 + index;
      const loggedAt = dateAtOffset(now, offset, hour).getTime();
      activities.push({ taskKey: task.key, kind: task.kind, durationMin, pointsEarned, starsDelta, source: 'TASK', loggedAt, localDate, weekStart });
      totalPoints += pointsEarned;
      dayStars += starsDelta;

      const nextBonus = dailyBonusStarsForPoints(totalPoints);
      if (nextBonus > bonusAwarded) {
        const bonusDelta = nextBonus - bonusAwarded;
        activities.push({ taskKey: task.key, kind: 'DAILY_BONUS', durationMin: null, pointsEarned: 0, starsDelta: bonusDelta, source: 'DAILY_BONUS', loggedAt, localDate, weekStart });
        bonusAwarded = nextBonus;
        dayStars += bonusDelta;
      }
    }

    dailySummaries.push({
      localDate,
      totalPoints,
      bonusStarAwarded: bonusAwarded,
      streakCount: offset >= -12 ? 13 + offset : 1,
    });
    const currentWeek = weekly.get(weekStart) ?? { totalPoints: 0, weeklyStars: 0 };
    currentWeek.totalPoints += totalPoints;
    currentWeek.weeklyStars += dayStars;
    weekly.set(weekStart, currentWeek);
  }

  const weeklySummaries = [...weekly.entries()]
    .map(([weekStart, values]) => ({ weekStart, ...values }))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));

  const challenges: QaFixtureChallenge[] = [
    {
      key: 'morning-momentum', name: '30-day morning momentum', taskKey: 'running', mode: 'streak', targetDays: 30,
      weeklyTarget: null, totalWeeks: null, startDate: dateText(now, -24), status: 'active', freezesLeft: 1,
      freezeUsed: 0, streakCurrent: 12, completedAt: null, minDuration: 20, minCount: 1,
    },
    {
      key: 'weekly-focus', name: 'Four focused weeks', taskKey: 'work', mode: 'weekly', targetDays: 28,
      weeklyTarget: 4, totalWeeks: 4, startDate: dateText(now, -35), status: 'done', freezesLeft: 0,
      freezeUsed: 1, streakCurrent: 0, completedAt: isoAtOffset(now, -7, 19), minDuration: null, minCount: 2,
    },
    {
      key: 'reset-recovery', name: 'Reset and recover', taskKey: 'reading', mode: 'streak', targetDays: 7,
      weeklyTarget: null, totalWeeks: null, startDate: dateText(now, -18), status: 'failed', freezesLeft: 0,
      freezeUsed: 1, streakCurrent: 0, completedAt: isoAtOffset(now, -9, 20), minDuration: null, minCount: null,
    },
  ];

  const challengeLogs: QaFixtureChallengeLog[] = [];
  for (let index = 0; index < 12; index += 1) {
    challengeLogs.push({ challengeKey: 'morning-momentum', localDate: dateText(now, -12 + index), state: index === 6 ? 'freeze' : 'done' });
  }
  for (let index = 0; index < 16; index += 1) {
    challengeLogs.push({ challengeKey: 'weekly-focus', localDate: dateText(now, -35 + index * 2), state: 'done' });
  }
  for (let index = 0; index < 4; index += 1) {
    challengeLogs.push({ challengeKey: 'reset-recovery', localDate: dateText(now, -18 + index), state: index === 3 ? 'reset' : 'done' });
  }

  const treats: QaFixtureTreat[] = [
    { key: 'coffee', name: 'Cà phê cuối tuần', icon: '☕', targetStars: 20, approxAmount: 45000, status: 'ACTIVE', sortOrder: 1, reachedAt: dateText(now, -2), enjoyedAt: null },
    { key: 'headphones', name: 'Tai nghe mới', icon: '🎧', targetStars: 80, approxAmount: 1200000, status: 'ACTIVE', sortOrder: 2, reachedAt: null, enjoyedAt: null },
    { key: 'movie', name: 'Movie night', icon: '🎬', targetStars: 35, approxAmount: 180000, status: 'ENJOYED', sortOrder: 3, reachedAt: dateText(now, -24), enjoyedAt: dateText(now, -20) },
  ];
  const treatHistory: QaFixtureTreatHistory[] = [
    { treatKey: 'movie', name: 'Movie night', starsSpent: 35, amount: 180000, enjoyedAt: dateText(now, -20) },
  ];

  const achievements = ['first', 'firstLog', 'streak7', 'challenge14', 'perfectWeek', 'lockedIn', 'earlyBird', 'nightOwl', 'rizz', 'collector', 'overachiever']
    .map((key, index) => ({ key, earnedAt: dateText(now, -Math.max(1, 80 - index * 6)) }));
  const lifetimeStars = Math.max(0, activities.reduce((total, row) => total + row.starsDelta, 0));
  const rewardUnlocks = [1, 2, 3, 4, 5].map(tierOrder => ({
    tierOrder,
    weekStart: dateText(now, -((tierOrder + 1) * 7)),
    starsAtUnlock: tierOrder * 40,
    rewardAmount: tierOrder * 50000,
  }));
  const fundTransactions = [
    ...rewardUnlocks.slice(0, 3).map(reward => ({ type: 'DEPOSIT' as const, amount: reward.rewardAmount, note: `Rank ${reward.tierOrder} unlock`, occurredAt: dateAtOffset(now, -reward.tierOrder * 14, 18).getTime() })),
    { type: 'WITHDRAWAL' as const, amount: 180000, note: 'Movie night', occurredAt: dateAtOffset(now, -20, 20).getTime() },
  ];
  const milestoneStars = [7, 14, 30, 60, 90].map((milestoneDays, index) => ({ milestoneDays, stars: [1, 2, 3, 5, 5][index], awardedAt: dateAtOffset(now, -Math.max(1, 100 - index * 20), 18).getTime() }));
  const streakFreezes = [{ localDate: dateText(now, -6), purchasedAt: dateAtOffset(now, -7, 18).getTime() }];
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);

  return {
    categories,
    tasks,
    activities,
    dailySummaries,
    weeklySummaries,
    challenges,
    challengeLogs,
    treats,
    treatHistory,
    achievements,
    rewardUnlocks,
    fundTransactions,
    milestoneStars,
    streakFreezes,
    boost: { localDate: today, multiplier: 2, claimDeadline: endOfDay.getTime(), createdAt: dateAtOffset(now, 0, 6).getTime() },
    lifetimeStars,
    treatStars: 42,
  };
}

const QA_PURGE_STATEMENTS = [
  'DELETE FROM challenge_days WHERE challenge_id IN (SELECT id FROM challenges WHERE user_id = ?)',
  'DELETE FROM challenge_log WHERE challenge_id IN (SELECT id FROM challenges WHERE user_id = ?)',
  'DELETE FROM challenges WHERE user_id = ?',
  'DELETE FROM achievements WHERE user_id = ?',
  'DELETE FROM activity_log WHERE user_id = ?',
  'DELETE FROM daily_summary WHERE user_id = ?',
  'DELETE FROM weekly_summary WHERE user_id = ?',
  'DELETE FROM reward_unlocks WHERE user_id = ?',
  'DELETE FROM treat_history WHERE user_id = ?',
  'DELETE FROM treats WHERE user_id = ?',
  'DELETE FROM streak_freezes WHERE user_id = ?',
  'DELETE FROM task_types WHERE user_id = ?',
  'DELETE FROM categories WHERE user_id = ?',
  'DELETE FROM fund_transactions WHERE user_id = ?',
  'DELETE FROM milestone_stars WHERE user_id = ?',
  'DELETE FROM boost_events WHERE user_id = ?',
];

/** Purges only rows owned by the reserved QA identity. Real users are untouched. */
export async function purgeQaSandbox(db: SQLiteDatabase, deleteUser = true): Promise<void> {
  const qaUser = await db.getFirstAsync<{ id: number }>('SELECT id FROM users WHERE google_sub = ?', [QA_SANDBOX_SUB]);
  if (!qaUser) return;
  const qaChallenges = await db.getAllAsync<{ id: number; notification_id: string | null }>(
    'SELECT id, notification_id FROM challenges WHERE user_id = ?',
    [qaUser.id],
  );
  if (qaChallenges.length) {
    const { cancelChallengeReminders } = await import('../utils/notifications');
    await cancelChallengeReminders([
      ...qaChallenges.map(row => row.notification_id),
      ...qaChallenges.map(row => challengeReminderPrefix(row.id)),
    ]);
  }
  await db.withTransactionAsync(async () => {
    for (const sql of QA_PURGE_STATEMENTS) await db.runAsync(sql, [qaUser.id]);
    if (deleteUser) await db.runAsync('DELETE FROM users WHERE id = ?', [qaUser.id]);
  });
}

/**
 * Seeds the QA identity and all local fixture tables in one transaction.
 *
 * Auth and startup reconciliation can both request the fixture around the
 * same render. Share the in-flight promise so two callers cannot purge and
 * recreate the reserved rows concurrently.
 */
export function seedQaSandbox(db: SQLiteDatabase, now: Date = new Date()): Promise<number> {
  if (qaSeedInFlight) return qaSeedInFlight;
  qaSeedInFlight = seedQaSandboxInternal(db, now).finally(() => {
    qaSeedInFlight = null;
  });
  return qaSeedInFlight;
}

async function seedQaSandboxInternal(db: SQLiteDatabase, now: Date): Promise<number> {
  setQaSandboxNetworkBlocked(true);
  await purgeQaSandbox(db);
  const fixture = buildQaSandboxFixture(now);
  let userId = 0;

  await db.withTransactionAsync(async () => {
    const userResult = await db.runAsync(
      `INSERT INTO users
       (username, timezone, carry_debt, currency, google_sub, treat_stars,
        treat_stars_lifetime, value_per_star, penalty_hits_treats, lifetime_stars)
       VALUES (?, 'Asia/Ho_Chi_Minh', 0, 'VND', ?, ?, ?, 1000, 1, ?)`,
      [QA_SANDBOX_NAME, QA_SANDBOX_SUB, fixture.treatStars, fixture.lifetimeStars, fixture.lifetimeStars],
    );
    userId = Number(userResult.lastInsertRowId);

    const categoryIds = new Map<string, number>();
    for (const category of fixture.categories) {
      const result = await db.runAsync(
        'INSERT INTO categories (user_id, name, icon, sort_order) VALUES (?, ?, ?, ?)',
        [userId, category.name, category.icon, category.sortOrder],
      );
      categoryIds.set(category.key, Number(result.lastInsertRowId));
    }

    const taskIds = new Map<string, number>();
    for (const task of fixture.tasks) {
      const result = await db.runAsync(
        `INSERT INTO task_types
         (user_id, name, kind, is_time_based, base_points, star_penalty,
          category_id, icon, archived, sort_order, is_pinned, is_template)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
        [userId, task.name, task.kind, task.isTimeBased ? 1 : 0, task.basePoints, task.starPenalty,
          categoryIds.get(task.categoryKey) ?? null, task.icon, task.sortOrder, task.sortOrder <= 3 ? 1 : 0, task.isTemplate ? 1 : 0],
      );
      taskIds.set(task.key, Number(result.lastInsertRowId));
    }

    for (const activity of fixture.activities) {
      await db.runAsync(
        `INSERT INTO activity_log
         (user_id, task_type_id, kind, duration_min, points_earned, stars_delta,
          source, logged_at, local_date, week_start)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, activity.taskKey ? taskIds.get(activity.taskKey) ?? null : null, activity.kind,
          activity.durationMin, activity.pointsEarned, activity.starsDelta, activity.source,
          activity.loggedAt, activity.localDate, activity.weekStart],
      );
    }

    for (const summary of fixture.dailySummaries) {
      await db.runAsync(
        `INSERT INTO daily_summary (user_id, local_date, total_points, bonus_star_awarded, streak_count)
         VALUES (?, ?, ?, ?, ?)`,
        [userId, summary.localDate, summary.totalPoints, summary.bonusStarAwarded, summary.streakCount],
      );
    }
    for (const summary of fixture.weeklySummaries) {
      await db.runAsync(
        `INSERT INTO weekly_summary (user_id, week_start, total_points, weekly_stars)
         VALUES (?, ?, ?, ?)`,
        [userId, summary.weekStart, summary.totalPoints, summary.weeklyStars],
      );
    }

    const tiers = await db.getAllAsync<{ id: number; tier_order: number; stars_required: number }>(
      'SELECT id, tier_order, stars_required FROM tiers ORDER BY tier_order ASC',
    );
    const reachedTier = [...tiers].reverse().find(tier => tier.stars_required <= fixture.lifetimeStars);
    for (const reward of fixture.rewardUnlocks) {
      const tier = tiers.find(item => item.tier_order === reward.tierOrder);
      if (!tier || reward.starsAtUnlock > fixture.lifetimeStars) continue;
      await db.runAsync(
        `INSERT INTO reward_unlocks
         (user_id, tier_id, week_start, stars_at_unlock, reward_amount, claimed)
         VALUES (?, ?, ?, ?, ?, 1)`,
        [userId, tier.id, reward.weekStart, reward.starsAtUnlock, reward.rewardAmount],
      );
    }

    const treatIds = new Map<string, number>();
    for (const treat of fixture.treats) {
      const result = await db.runAsync(
        `INSERT INTO treats
         (user_id, name, icon, target_stars, approx_amount, currency, status,
          sort_order, reached_at, enjoyed_at)
        VALUES (?, ?, ?, ?, ?, 'VND', ?, ?, ?, ?)`,
        [userId, treat.name, treat.icon, treat.targetStars, treat.approxAmount, treat.status,
          treat.sortOrder, treat.reachedAt ? `${treat.reachedAt}T18:00:00.000Z` : null,
          treat.enjoyedAt ? `${treat.enjoyedAt}T20:00:00.000Z` : null],
      );
      treatIds.set(treat.key, Number(result.lastInsertRowId));
    }
    for (const history of fixture.treatHistory) {
      const treatId = treatIds.get(history.treatKey);
      if (!treatId) continue;
      await db.runAsync(
        `INSERT INTO treat_history (user_id, treat_id, name, stars_spent, amount, currency, enjoyed_at)
         VALUES (?, ?, ?, ?, ?, 'VND', ?)`,
        [userId, treatId, history.name, history.starsSpent, history.amount, `${history.enjoyedAt}T20:00:00.000Z`],
      );
    }

    const challengeIds = new Map<string, number>();
    for (const challenge of fixture.challenges) {
      const result = await db.runAsync(
        `INSERT INTO challenges
         (user_id, name, task_type_id, mode, target_days, weekly_target, total_weeks,
          start_date, status, freezes_left, freeze_used, streak_current, completed_at,
          notifications_enabled, min_duration, min_count)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
        [userId, challenge.name, challenge.taskKey ? taskIds.get(challenge.taskKey) ?? null : null, challenge.mode,
          challenge.targetDays, challenge.weeklyTarget, challenge.totalWeeks, challenge.startDate, challenge.status,
          challenge.freezesLeft, challenge.freezeUsed, challenge.streakCurrent, challenge.completedAt,
          challenge.minDuration, challenge.minCount],
      );
      challengeIds.set(challenge.key, Number(result.lastInsertRowId));
    }
    for (const log of fixture.challengeLogs) {
      const challengeId = challengeIds.get(log.challengeKey);
      if (!challengeId) continue;
      const timestamp = new Date(`${log.localDate}T12:00:00`).getTime();
      await db.runAsync(
        'INSERT INTO challenge_log (challenge_id, local_date, state) VALUES (?, ?, ?)',
        [challengeId, log.localDate, log.state],
      );
      if (log.state === 'done') {
        await db.runAsync(
          'INSERT INTO challenge_days (challenge_id, local_date, logged_at) VALUES (?, ?, ?)',
          [challengeId, log.localDate, timestamp],
        );
      }
    }

    for (const achievement of fixture.achievements) {
      await db.runAsync(
        `INSERT INTO achievements (user_id, key, rarity, earned_at, source_type, source_id)
         VALUES (?, ?, 'common', ?, 'record', NULL)`,
        [userId, achievement.key, achievement.earnedAt],
      );
    }
    for (const milestone of fixture.milestoneStars) {
      await db.runAsync(
        `INSERT INTO milestone_stars (user_id, milestone_days, stars, awarded_at)
         VALUES (?, ?, ?, ?)`,
        [userId, milestone.milestoneDays, milestone.stars, milestone.awardedAt],
      );
    }
    for (const freeze of fixture.streakFreezes) {
      await db.runAsync(
        `INSERT INTO streak_freezes (user_id, local_date, purchased_at) VALUES (?, ?, ?)`,
        [userId, freeze.localDate, freeze.purchasedAt],
      );
    }
    for (const transaction of fixture.fundTransactions) {
      await db.runAsync(
        `INSERT INTO fund_transactions (user_id, type, amount, currency, note, occurred_at)
         VALUES (?, ?, ?, 'VND', ?, ?)`,
        [userId, transaction.type, transaction.amount, transaction.note, transaction.occurredAt],
      );
    }
    await db.runAsync(
      `INSERT INTO boost_events
       (user_id, local_date, multiplier, claim_deadline, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, fixture.boost.localDate, fixture.boost.multiplier, fixture.boost.claimDeadline, fixture.boost.createdAt],
    );
    await db.runAsync(
      'UPDATE users SET current_tier_id = ?, lifetime_stars = ?, treat_stars = ?, treat_stars_lifetime = ? WHERE id = ?',
      [reachedTier?.id ?? null, fixture.lifetimeStars, fixture.treatStars, fixture.lifetimeStars, userId],
    );
  });

  return userId;
}
