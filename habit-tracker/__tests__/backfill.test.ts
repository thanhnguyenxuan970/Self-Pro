import { canBackfill, backfillRemaining, computeStreakCounts, BackfillCheckInput } from '../src/game/backfill';

const base: BackfillCheckInput = {
  date: '2026-06-17',
  today: '2026-06-19',
  weekStartOfDate: '2026-06-15',
  currentWeekStart: '2026-06-15',
  dayHasActivity: false,
  backfillsUsedThisWeek: 0,
};

describe('canBackfill', () => {
  it('cho phép khi ngày trống, trong tuần, trước hôm nay, còn quota', () => {
    expect(canBackfill(base)).toEqual({ allowed: true });
  });
  it('chặn ngày tương lai', () => {
    expect(canBackfill({ ...base, date: '2026-06-21' })).toEqual({ allowed: false, reason: 'FUTURE' });
  });
  it('chặn hôm nay (dùng log thường)', () => {
    expect(canBackfill({ ...base, date: '2026-06-19' })).toEqual({ allowed: false, reason: 'TODAY' });
  });
  it('chặn ngày ngoài tuần hiện tại', () => {
    expect(canBackfill({ ...base, weekStartOfDate: '2026-06-08' })).toEqual({ allowed: false, reason: 'NOT_CURRENT_WEEK' });
  });
  it('chặn ngày đã có hoạt động', () => {
    expect(canBackfill({ ...base, dayHasActivity: true })).toEqual({ allowed: false, reason: 'DAY_NOT_EMPTY' });
  });
  it('chặn ngày đã mua streak-freeze', () => {
    expect(canBackfill({ ...base, hasStreakFreeze: true })).toEqual({ allowed: false, reason: 'HAS_FREEZE' });
  });
  it('chặn khi hết quota', () => {
    expect(canBackfill({ ...base, backfillsUsedThisWeek: 2 })).toEqual({ allowed: false, reason: 'QUOTA_EXCEEDED' });
  });
});

describe('backfillRemaining', () => {
  it('trả số lượt còn lại, không âm', () => {
    expect(backfillRemaining(0)).toBe(2);
    expect(backfillRemaining(1)).toBe(1);
    expect(backfillRemaining(5)).toBe(0);
  });
});

describe('computeStreakCounts', () => {
  it('có hoạt động +1, trống reset 0', () => {
    expect(computeStreakCounts([true, true, false, true])).toEqual([1, 2, 0, 1]);
  });
  it('nối tiếp priorStreak', () => {
    expect(computeStreakCounts([true, true], 3)).toEqual([4, 5]);
  });
  it('điểm danh bù 2 ngày liên tục → chuỗi nối lại', () => {
    // trước bù: [T2 ✓, T3 ✗, T4 ✗, T5(today) ✓] = [1,0,0,1]
    expect(computeStreakCounts([true, false, false, true])).toEqual([1, 0, 0, 1]);
    // sau khi bù T3 & T4 (set true):
    expect(computeStreakCounts([true, true, true, true])).toEqual([1, 2, 3, 4]);
  });
});
