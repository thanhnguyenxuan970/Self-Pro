export const CHALLENGE_DURATIONS = [7, 21, 30, 66] as const;
export type ChallengeDuration = (typeof CHALLENGE_DURATIONS)[number];

export const PHAO_COUNT = 1;

export const CHALLENGE_NAME_MAX_LENGTH = 40;

export const CHALLENGE_RULE_COPY = {
  vi: (freezes: number) => `Ghi nhận mỗi ngày. Bỏ lỡ 1 ngày sẽ dùng ${freezes} lượt phao cứu trợ. Hết phao mà bỏ lỡ → thử thách thất bại.`,
  en: (freezes: number) => `Log every day. A missed day uses one of your ${freezes} freezes. Missing a day with none left fails the challenge.`,
};
