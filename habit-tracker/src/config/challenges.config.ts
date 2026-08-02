export const CHALLENGE_DURATIONS = [7, 30, 60, 100] as const;
type ChallengeDuration = (typeof CHALLENGE_DURATIONS)[number];

export const WEEKLY_TARGETS = [3, 4, 5, 6] as const;

export const TOTAL_WEEKS_OPTIONS = [2, 4, 8, 12] as const;

export const THRESHOLD_DURATIONS = [15, 30, 45, 60] as const;
export const THRESHOLD_COUNTS = [1, 2, 3] as const;

export const PHAO_COUNT = 1;

export const CHALLENGE_NAME_MAX_LENGTH = 72;

export function isValidCustomChallengeValue(value: number, field: 'days' | 'weeks'): boolean {
  return Number.isInteger(value) && (field === 'days' ? value >= 7 && value <= 365 : value >= 2 && value <= 52);
}

const LEGACY_CHALLENGE_REWARDS: Record<number, number> = {
  7: 1,
  21: 3,
  66: 9,
};

const CHALLENGE_REWARDS: Record<ChallengeDuration, number> = {
  7: 1,
  30: 30,
  60: 120,
  100: 300,
};

const CUSTOM_CHALLENGE_REWARDS: Record<number, number> = { 365: 1460 };

export function challengeCompletionStars(targetDays: number): number {
  return CHALLENGE_REWARDS[targetDays as ChallengeDuration]
    ?? CUSTOM_CHALLENGE_REWARDS[targetDays]
    ?? LEGACY_CHALLENGE_REWARDS[targetDays]
    ?? Math.max(1, Math.floor(targetDays / 7));
}

/** Curated per-combo rewards for weekly mode (16 fixed weekly_target x total_weeks
 *  combos, both chip sets are closed) -- mirrors CHALLENGE_REWARDS's convexity
 *  (longer commitment pays disproportionately more per session), never a formula
 *  guess like the generic streak fallback. */
const WEEKLY_CHALLENGE_REWARDS: Record<string, number> = {
  '3x2': 6, '3x4': 18, '3x8': 60, '3x12': 126,
  '4x2': 8, '4x4': 24, '4x8': 80, '4x12': 168,
  '5x2': 10, '5x4': 30, '5x8': 100, '5x12': 210,
  '6x2': 12, '6x4': 36, '6x8': 120, '6x12': 252,
};

export function weeklyChallengeCompletionStars(weeklyTarget: number, totalWeeks: number): number {
  const key = `${weeklyTarget}x${totalWeeks}`;
  return WEEKLY_CHALLENGE_REWARDS[key] ?? Math.max(1, Math.floor((weeklyTarget * totalWeeks) / 2));
}

/** Shared reward computation used by both streak and weekly completion (spec
 *  §9: bonus stars apply to both modes uniformly). This app has one stars
 *  pool that already does double duty -- it spends as treat currency AND
 *  feeds the weekly rank-tier ladder (see awardChallengeCompletion) -- there
 *  is no separate "rank points" currency to report alongside it. */
export function computeChallengeReward(
  params: { mode: 'streak'; targetDays: number } | { mode: 'weekly'; weeklyTarget: number; totalWeeks: number },
): { stars: number } {
  const stars = params.mode === 'streak'
    ? challengeCompletionStars(params.targetDays)
    : weeklyChallengeCompletionStars(params.weeklyTarget, params.totalWeeks);
  return { stars };
}

export const CHALLENGE_RULE_COPY = {
  vi: (freezes: number) => `Ghi nhận hoạt động mỗi ngày liên tiếp. Bỏ lỡ một ngày sẽ đặt lại chuỗi — nhưng bạn có ${freezes} phao cứu để bù một lần bỏ lỡ.`,
  en: (freezes: number) => `Log every day in a row. Miss a day and the streak resets — but you get ${freezes} rescue (freeze) to cover one miss.`,
};

const WEEKLY_RULE_COPY = {
  vi: (weeklyTarget: number) => `Hoàn thành đủ ${weeklyTarget} buổi mỗi tuần, ngày nào cũng được. Ngày nghỉ không tính là bỏ lỡ. Tuần bắt đầu từ thứ Hai.`,
  en: (weeklyTarget: number) => `Hit ${weeklyTarget} sessions every week, any day works. Rest days are free — they don't count as a miss. Weeks start Monday.`,
};
