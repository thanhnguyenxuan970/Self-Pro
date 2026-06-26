// Hàm THUẦN cho "Điểm danh bù" — không chạm DB, dễ unit-test.
// Phần ghi DB + cộng weekly_stars để ở tầng gọi (xem backfill-spec.md §4–6).

export const WEEKLY_BACKFILL_QUOTA = 2;

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
