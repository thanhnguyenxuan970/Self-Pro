// Hàm THUẦN cho "Điểm danh bù" — không chạm DB, dễ unit-test.
// Phần ghi DB + cộng weekly_stars để ở tầng gọi (xem backfill-spec.md §4–6).

import { computeLogTaskRows, type ComputeResult } from './logTask';

const WEEKLY_BACKFILL_QUOTA = 2;

export interface BackfillCheckInput {
  date: string;              // 'YYYY-MM-DD' ngày muốn điểm danh bù
  today: string;             // 'YYYY-MM-DD'
  weekStartOfDate: string;   // getWeekStart(date)
  currentWeekStart: string;  // getWeekStart(today)
  dayHasActivity: boolean;   // ngày đó đã có log chưa
  backfillsUsedThisWeek: number;
  hasStreakFreeze?: boolean; // ngày đó đã mua streak-freeze chưa
  quotaPerWeek?: number;     // mặc định 2
}

export type BackfillDenyReason =
  | 'FUTURE'
  | 'TODAY'
  | 'NOT_CURRENT_WEEK'
  | 'DAY_NOT_EMPTY'
  | 'HAS_FREEZE'
  | 'QUOTA_EXCEEDED';

export type BackfillCheck =
  | { allowed: true }
  | { allowed: false; reason: BackfillDenyReason };

/** Guardrail điểm danh bù (xếp lớp). Trả lý do đầu tiên bị chặn. */
export function canBackfill(i: BackfillCheckInput): BackfillCheck {
  const quota = i.quotaPerWeek ?? WEEKLY_BACKFILL_QUOTA;
  if (i.date > i.today) return { allowed: false, reason: 'FUTURE' };
  if (i.date === i.today) return { allowed: false, reason: 'TODAY' };
  if (i.weekStartOfDate !== i.currentWeekStart) return { allowed: false, reason: 'NOT_CURRENT_WEEK' };
  if (i.dayHasActivity) return { allowed: false, reason: 'DAY_NOT_EMPTY' };
  if (i.hasStreakFreeze) return { allowed: false, reason: 'HAS_FREEZE' };
  if (i.backfillsUsedThisWeek >= quota) return { allowed: false, reason: 'QUOTA_EXCEEDED' };
  return { allowed: true };
}

/** Số lượt điểm danh bù còn lại trong tuần. */
export function backfillRemaining(usedThisWeek: number, quotaPerWeek = WEEKLY_BACKFILL_QUOTA): number {
  return Math.max(0, quotaPerWeek - usedThisWeek);
}

/** Keep the locked result visible even when saving the session consumes the last quota. */
export function shouldShowBackfillQuotaExhausted(remaining: number, locked: boolean): boolean {
  return remaining <= 0 && !locked;
}

/**
 * Tính lại streak_count cho 1 dải ngày LIÊN TIẾP.
 * @param days   mảng "ngày đó có hoạt động?" theo thứ tự thời gian tăng dần
 * @param priorStreak streak_count của ngày NGAY TRƯỚC phần tử đầu (0 nếu trống)
 * @returns streak_count cho từng ngày trong `days`
 *
 * Invariant giữ nguyên: có hoạt động → +1; trống → reset 0.
 * Nhờ chạy từ ngày sớm nhất, điểm danh bù nhiều ngày liên tiếp tự nối đúng.
 */
export function computeStreakCounts(days: boolean[], priorStreak = 0): number[] {
  const out: number[] = [];
  let run = priorStreak;
  for (const active of days) {
    run = active ? run + 1 : 0;
    out.push(run);
  }
  return out;
}

export interface BackfillSessionEntry {
  taskTypeId: number;
  kind: 'GOOD' | 'BAD';
  isTimeBased: boolean;
  basePoints: number;
  starPenalty: number;
  durationMin?: number;
  countTowardRank?: boolean; // default false — anti-gaming
}

export interface BackfillSessionContext {
  userId: number;
  loggedAt: Date;
  localDate: string;
  weekStart: string;
  initialDayPoints: number;
  initialBonusStars: number;
}

export interface BackfillSessionResult {
  rows: ComputeResult[];         // one {activityRow, bonusRow} per entry, in order
  dayPoints: number;             // cumulative daily total_points after the whole session
  bonusStars: number;            // total daily bonus after the whole session
  sessionPointsDelta: number;    // total points added across all entries
  sessionStarsDelta: number;     // total stars added across all entries
  rankPointsDelta: number;       // points from entries with countTowardRank === true
  rankStarsDelta: number;        // stars from entries with countTowardRank === true
}

/**
 * Điểm danh bù NHIỀU hoạt động trong 1 phiên (session), tính tuần tự để
 * daily-bonus và ngưỡng điểm/ngày cộng dồn đúng qua từng entry. Hàm THUẦN —
 * không chạm DB; tầng gọi ghi `rows` vào activity_log rồi cập nhật
 * daily_summary/weekly_summary bằng các delta trả về.
 */
export function computeBackfillSession(
  entries: BackfillSessionEntry[],
  ctx: BackfillSessionContext,
): BackfillSessionResult {
  let dayPoints = ctx.initialDayPoints;
  let bonusStars = ctx.initialBonusStars;
  let sessionPointsDelta = 0;
  let sessionStarsDelta = 0;
  let rankPointsDelta = 0;
  let rankStarsDelta = 0;
  const rows: ComputeResult[] = [];

  for (const entry of entries) {
    const result = computeLogTaskRows({
      userId: ctx.userId,
      taskTypeId: entry.taskTypeId,
      kind: entry.kind,
      isTimeBased: entry.isTimeBased,
      basePoints: entry.basePoints,
      starPenalty: entry.starPenalty,
      durationMin: entry.durationMin,
      currentDayPoints: dayPoints,
      bonusStarsAwarded: bonusStars,
      loggedAt: ctx.loggedAt,
      localDate: ctx.localDate,
      weekStart: ctx.weekStart,
    });
    rows.push(result);

    const entryStarsDelta = result.activityRow.stars_delta + (result.bonusRow ? result.bonusRow.stars_delta : 0);
    dayPoints += result.activityRow.points_earned;
    if (result.bonusRow) bonusStars += result.bonusRow.stars_delta;
    sessionPointsDelta += result.activityRow.points_earned;
    sessionStarsDelta += entryStarsDelta;
    if (entry.countTowardRank === true) {
      rankPointsDelta += result.activityRow.points_earned;
      rankStarsDelta += entryStarsDelta;
    }
  }

  return { rows, dayPoints, bonusStars, sessionPointsDelta, sessionStarsDelta, rankPointsDelta, rankStarsDelta };
}
