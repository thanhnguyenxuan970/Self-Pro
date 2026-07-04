export const CHALLENGE_DURATIONS = [30, 60, 100] as const;
export type ChallengeDuration = (typeof CHALLENGE_DURATIONS)[number];

export const PHAO_COUNT = 1;

export const CHALLENGE_NAME_MAX_LENGTH = 40;

const LEGACY_CHALLENGE_REWARDS: Record<number, number> = {
  7: 1,
  21: 3,
  66: 9,
};

const CHALLENGE_REWARDS: Record<ChallengeDuration, number> = {
  30: 30,
  60: 120,
  100: 300,
};

export function challengeCompletionStars(targetDays: number): number {
  return CHALLENGE_REWARDS[targetDays as ChallengeDuration]
    ?? LEGACY_CHALLENGE_REWARDS[targetDays]
    ?? Math.max(1, Math.floor(targetDays / 7));
}

export const CHALLENGE_RULE_COPY = {
  vi: (freezes: number) => `Ghi nhận mỗi ngày. Bỏ lỡ 1 ngày sẽ dùng ${freezes} lượt phao cứu trợ. Hết phao mà bỏ lỡ → thử thách thất bại.`,
  en: (freezes: number) => `Log every day. A missed day uses one of your ${freezes} freezes. Missing a day with none left fails the challenge.`,
};
