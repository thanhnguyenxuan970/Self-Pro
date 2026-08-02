// src/constants.ts
export const STARS_PER_TASK = 1;
export const POINTS_PER_UNTIMED_ACTIVITY = 5;
export const TIME_UNIT_MINUTES = 30;
export const DAILY_BONUS_THRESHOLD = 50;
export function dailyBonusStarsForPoints(points: number): number {
  if (points >= 50) return 3;
  if (points >= 25) return 1;
  return 0;
}
export function dailyBonusGoal(points: number, maximum = DAILY_BONUS_THRESHOLD): number {
  return points >= maximum / 2 ? maximum : maximum / 2;
}
const DEFAULT_PENALTY_STARS = 2;  // bad habit star penalty (1-2 stars; 50 was a units mix-up)
const DEFAULT_CURRENCY = 'VND';
const DEFAULT_TIMEZONE = 'Asia/Ho_Chi_Minh';

export const SOURCE_TASK = 'TASK';
export const SOURCE_DAILY_BONUS = 'DAILY_BONUS';
const SOURCE_PENALTY = 'PENALTY';

// Multiplier Boost: limited-time daily event, multiplies stars earned from
// logging (not the daily-points bonus, not BAD-log penalties).
const BOOST_MULTIPLIERS = [2, 3] as const;
export const BOOST_RARE_CHANCE = 0.15; // odds the daily roll is x3 instead of x2
export const BOOST_CLAIM_DEADLINE_HOUR = 10; // must claim before 10:00 local, else no boost that day
export const BOOST_EXPIRING_THRESHOLD_SECS = 300; // <5:00 left => urgency treatment

const DEFAULT_VALUE_PER_STAR = 1000;
const STREAK_FREEZE_COST = 10; // stars (1★ = DEFAULT_VALUE_PER_STAR VND)

export type TemplateTask = {
  name: string;
  nameKey: string;
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
      { name: 'Chạy bộ', nameKey: 'tmplRunning', icon: '🏃', isTimeBased: true, basePoints: 1, kind: 'GOOD', starPenalty: 0 },
      { name: 'Gym', nameKey: 'tmplGym', icon: '💪', isTimeBased: true, basePoints: 2, kind: 'GOOD', starPenalty: 0 },
    ],
  },
  {
    key: 'reading',
    name: 'Đọc sách',
    icon: '📚',
    tasks: [
      { name: 'Đọc sách', nameKey: 'tmplReading', icon: '📖', isTimeBased: true, basePoints: 1, kind: 'GOOD', starPenalty: 0 },
    ],
  },
  {
    key: 'studying',
    name: 'Học tập',
    icon: '✏️',
    tasks: [
      { name: 'Học ngoại ngữ', nameKey: 'tmplLanguage', icon: '🌍', isTimeBased: true, basePoints: 1, kind: 'GOOD', starPenalty: 0 },
      { name: 'Làm bài tập', nameKey: 'tmplHomework', icon: '📝', isTimeBased: false, basePoints: 5, kind: 'GOOD', starPenalty: 0 },
      { name: 'Ôn bài', nameKey: 'tmplStudying', icon: '📋', isTimeBased: true, basePoints: 1, kind: 'GOOD', starPenalty: 0 },
    ],
  },
  {
    key: 'housework',
    name: 'Nhà cửa',
    icon: '🏠',
    tasks: [
      { name: 'Dọn dẹp', nameKey: 'tmplCleaning', icon: '🧹', isTimeBased: false, basePoints: 5, kind: 'GOOD', starPenalty: 0 },
      { name: 'Nấu ăn', nameKey: 'tmplCooking', icon: '🍳', isTimeBased: false, basePoints: 3, kind: 'GOOD', starPenalty: 0 },
    ],
  },
];
