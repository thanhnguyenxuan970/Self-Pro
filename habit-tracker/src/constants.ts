// src/constants.ts
export const STARS_PER_TASK = 1;
export const DAILY_BONUS_THRESHOLD = 50;   // points in a day → +1 star (once/day)
export const DAILY_BONUS_STARS = 1;
export const TIME_UNIT_MINUTES = 30;       // +1 pt per 30 min of time-based task
export const DEFAULT_PENALTY_STARS = 50;  // bad habit star penalty
export const DEFAULT_CURRENCY = 'VND';
export const DEFAULT_TIMEZONE = 'Asia/Ho_Chi_Minh';

export const SOURCE_TASK = 'TASK';
export const SOURCE_DAILY_BONUS = 'DAILY_BONUS';
export const SOURCE_PENALTY = 'PENALTY';

export const USER_ID = 1;
export const STREAK_FREEZE_COST = 10_000;

export type TemplateTask = {
  name: string;
  icon: string;
  isTimeBased: boolean;
  basePoints: number;
  kind: 'GOOD';
  starPenalty: number;
};

export type TemplateCategory = {
  key: string;
  name: string;
  icon: string;
  tasks: TemplateTask[];
};

export const TEMPLATE_CATEGORIES: TemplateCategory[] = [
  {
    key: 'sports',
    name: 'Thể thao',
    icon: '🏃',
    tasks: [
      { name: 'Chạy bộ', icon: '🏃', isTimeBased: true, basePoints: 1, kind: 'GOOD', starPenalty: 0 },
      { name: 'Gym', icon: '💪', isTimeBased: true, basePoints: 2, kind: 'GOOD', starPenalty: 0 },
    ],
  },
  {
    key: 'reading',
    name: 'Đọc sách',
    icon: '📚',
    tasks: [
      { name: 'Đọc sách', icon: '📖', isTimeBased: true, basePoints: 1, kind: 'GOOD', starPenalty: 0 },
    ],
  },
  {
    key: 'studying',
    name: 'Học tập',
    icon: '✏️',
    tasks: [
      { name: 'Học ngoại ngữ', icon: '🌍', isTimeBased: true, basePoints: 1, kind: 'GOOD', starPenalty: 0 },
      { name: 'Làm bài tập', icon: '📝', isTimeBased: false, basePoints: 5, kind: 'GOOD', starPenalty: 0 },
      { name: 'Ôn bài', icon: '📋', isTimeBased: true, basePoints: 1, kind: 'GOOD', starPenalty: 0 },
    ],
  },
  {
    key: 'housework',
    name: 'Nhà cửa',
    icon: '🏠',
    tasks: [
      { name: 'Dọn dẹp', icon: '🧹', isTimeBased: false, basePoints: 5, kind: 'GOOD', starPenalty: 0 },
      { name: 'Nấu ăn', icon: '🍳', isTimeBased: false, basePoints: 3, kind: 'GOOD', starPenalty: 0 },
    ],
  },
];
