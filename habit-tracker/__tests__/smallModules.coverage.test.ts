import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn().mockResolvedValue(undefined),
}));

import { isAudioEnabled, setAudioEnabled } from '../src/audio/audioEnabled';
import { ACHIEVEMENTS, matchesFilter } from '../src/config/achievements';
import {
  challengeCompletionStars,
  computeChallengeReward,
  isValidCustomChallengeValue,
  weeklyChallengeCompletionStars,
} from '../src/config/challenges.config';
import {
  getLatestNewsId,
  getNewsViewerKey,
  getUnreadNewsCount,
  getLastSeenNewsId,
  isNewsRead,
  setLastSeenNewsId,
} from '../src/utils/news';
import { analyticsBarAccessibilityLabel, getMonthChartAnchor } from '../src/analytics/dashboardModel';
import { getAnalyticsYearWindow, normalizeAnalyticsYearStars } from '../src/analytics/yearStars';
import { getTranslations } from '../src/config/i18n';
import { getAppButtonAccessibilityState, getBottomSheetAnimationType } from '../src/components/uiPrimitives';
import { getRankConfigByTierOrder, getRankThreshold, starPoints } from '../src/config/ranks.config';
import { getAccountActivityStartDate, filterRowsByActivityStartDate, sumPositiveStarsFromRows } from '../src/lib/accountActivityBoundary';
import { getCelebrationGlowColor, shouldRunCelebrationBurst, shouldRunRankLoop } from '../src/lib/rankPresentation';
import { clampThreshold, deriveLinkedDoneDates } from '../src/lib/challengeLinked';
import { addDays, challengeIdFromReminderIdentifier, isChallengeAtRisk, planChallengeReminders } from '../src/lib/challengeNotificationPlan';
import { getCalendarLayout } from '../src/utils/calendarLayout';
import { getCoachmarkPosition } from '../src/utils/coachmarkLayout';
import { parseDurationMinutes } from '../src/utils/duration';
import { getMillisecondsUntilLocalMidnight, getRangeLabel, getWeekStart, getWeekStartOffset } from '../src/utils/formatters';
import { heatmapLevel, stepHeatmapAccessibilityDate } from '../src/utils/heatmap';
import { getHomeHeatmapLayout } from '../src/utils/homeHeatmapLayout';
import { computeLifetimeTierCrossings } from '../src/game/lifetimeRank';
import { computeLogTaskRows } from '../src/game/logTask';

describe('small pure module contracts', () => {
  test('formats singular and plural friend counts', () => {
    for (const language of ['en', 'vi'] as const) {
      const t = getTranslations(language);
      expect(t.friendsPendingBadgeLabel(1)).toBeTruthy();
      expect(t.friendsPendingBadgeLabel(2)).toBeTruthy();
      expect(t.friendsTiedAt(1, 1)).toBeTruthy();
      expect(t.friendsTiedAt(1, 2)).toBeTruthy();
      expect(t.friendsOutgoingCollapsed(1)).toBeTruthy();
      expect(t.friendsOutgoingCollapsed(2)).toBeTruthy();
    }
  });

  test('toggles audio state', () => {
    setAudioEnabled(false);
    expect(isAudioEnabled()).toBe(false);
    setAudioEnabled(true);
    expect(isAudioEnabled()).toBe(true);
  });

  test('matches every achievement filter', () => {
    const first = ACHIEVEMENTS[0];
    expect(matchesFilter(first, 'all')).toBe(true);
    expect(ACHIEVEMENTS.some(item => matchesFilter(item, 'streak'))).toBe(true);
    expect(ACHIEVEMENTS.some(item => matchesFilter(item, 'challenge'))).toBe(true);
    expect(ACHIEVEMENTS.some(item => matchesFilter(item, 'rank'))).toBe(true);
  });

  test('covers standard, legacy, custom, fallback, and weekly challenge rewards', () => {
    expect(isValidCustomChallengeValue(7, 'days')).toBe(true);
    expect(isValidCustomChallengeValue(366, 'days')).toBe(false);
    expect(isValidCustomChallengeValue(2, 'weeks')).toBe(true);
    expect(isValidCustomChallengeValue(1.5, 'weeks')).toBe(false);
    expect(challengeCompletionStars(7)).toBe(1);
    expect(challengeCompletionStars(21)).toBe(3);
    expect(challengeCompletionStars(365)).toBe(1460);
    expect(challengeCompletionStars(14)).toBe(2);
    expect(weeklyChallengeCompletionStars(3, 2)).toBe(6);
    expect(weeklyChallengeCompletionStars(1, 1)).toBe(1);
    expect(computeChallengeReward({ mode: 'streak', targetDays: 30 })).toEqual({ stars: 30 });
    expect(computeChallengeReward({ mode: 'weekly', weeklyTarget: 3, totalWeeks: 2 })).toEqual({ stars: 6 });
  });

  test('tracks news viewer/read state', async () => {
    const news = [{ id: 5 }, { id: 3 }];
    expect(getNewsViewerKey('  sub ')).toBe('sub');
    expect(getNewsViewerKey('  ')).toBeNull();
    expect(getLatestNewsId(news)).toBe(5);
    expect(getLatestNewsId([])).toBeNull();
    expect(isNewsRead(3, 3)).toBe(true);
    expect(isNewsRead(4, null)).toBe(false);
    expect(getUnreadNewsCount(news, 3)).toBe(1);
    jest.mocked(AsyncStorage.getItem).mockResolvedValueOnce('5').mockResolvedValueOnce('bad');
    await expect(getLastSeenNewsId('sub')).resolves.toBe(5);
    await expect(getLastSeenNewsId('sub')).resolves.toBeNull();
    jest.mocked(AsyncStorage.getItem).mockResolvedValueOnce(null);
    await expect(getLastSeenNewsId('sub')).resolves.toBeNull();
    await setLastSeenNewsId('sub', 8);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('habit_tracker_last_seen_news_id:sub', '8');
  });

  test('covers alternate accessibility, analytics, rank, and layout branches', () => {
    expect(getAppButtonAccessibilityState(undefined, false, false)).toEqual({ disabled: false });
    expect(getAppButtonAccessibilityState({ selected: true }, true, true)).toEqual({ selected: true, disabled: true, busy: true });
    expect(getBottomSheetAnimationType(true)).toBe('none');
    expect(getBottomSheetAnimationType(false)).toBe('slide');
    expect(analyticsBarAccessibilityLabel('vi', 'T2', 10, 5, 0, false)).toBe('T2: 10 điểm');
    expect(analyticsBarAccessibilityLabel('en', 'T2', 10, 5, 50, true)).toBe('T2: 10 points, previous 5 points, goal 50 points');
    expect(getMonthChartAnchor(0, 0, 400).scrollOffset).toBe(0);
    expect(getAnalyticsYearWindow(new Date(2026, 5, 2), '2026-07-01')).toEqual({ start: '2026-07-01', end: '2026-06-02' });
    expect(getAnalyticsYearWindow(new Date(2026, 5, 2), '2026-06-01')).toEqual({ start: '2026-06-01', end: '2026-06-02' });
    expect(normalizeAnalyticsYearStars('bad')).toBe(0);
    expect(getRankThreshold(-1)).toBe(0);
    expect(getRankThreshold(1)).toBeGreaterThan(0);
    expect(getRankThreshold(999)).toBeGreaterThan(320);
    expect(getRankConfigByTierOrder(-1).tier).toBe(0);
    expect(starPoints({ outer: 10, innerRatio: 0.5, points: 6 }).split(' ')).toHaveLength(12);
    expect(getCelebrationGlowColor(0)).toBeTruthy();
    expect(shouldRunRankLoop({ reduceMotion: true, loop: true, hasLoopAnimation: true })).toBe(false);
    expect(shouldRunCelebrationBurst(true, false)).toBe(true);
  });

  test('covers account boundaries, thresholds, challenge policy, and geometry fallbacks', () => {
    expect(getAccountActivityStartDate('  THANHNGUYENXUAN970@GMAIL.COM ')).toBe('2026-07-06');
    expect(getAccountActivityStartDate('other@example.com')).toBeNull();
    expect(filterRowsByActivityStartDate([{ local_date: '2026-07-05' }, { local_date: 1 }, { local_date: '2026-07-06' }], '2026-07-06')).toEqual([{ local_date: '2026-07-06' }]);
    expect(filterRowsByActivityStartDate([{ local_date: '2026-01-01' }], null)).toEqual([{ local_date: '2026-01-01' }]);
    expect(sumPositiveStarsFromRows([{ stars_delta: 3 }, { stars_delta: -2 }, { stars_delta: '3' }, { stars_delta: Number.NaN }])).toBe(3);
    expect(clampThreshold(null)).toBeNull();
    expect(clampThreshold(0)).toBeNull();
    expect(clampThreshold(2.9)).toBe(2);
    expect(deriveLinkedDoneDates([
      { localDate: '2026-01-01', durationMin: 10 },
      { localDate: '2026-01-01', durationMin: 1 },
      { localDate: '2025-12-31', durationMin: 99 },
    ], { minDuration: 10, minCount: 2 }, '2026-01-01')).toEqual(['2026-01-01']);
    expect(deriveLinkedDoneDates([
      { localDate: '2026-01-02', durationMin: null },
    ], { minDuration: 10, minCount: null }, '2026-01-02')).toEqual([]);
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(challengeIdFromReminderIdentifier('bad')).toBeNull();
    expect(challengeIdFromReminderIdentifier('habi-ch-9007199254740992-normal-2026-01-01')).toBeNull();
    expect(isChallengeAtRisk({ mode: 'weekly', freezesLeft: 1, weekPaceState: 'behind' })).toBe(true);
    expect(isChallengeAtRisk({ mode: 'streak', freezesLeft: 1, weekPaceState: null })).toBe(false);
    const state = { challengeId: 1, challengeName: 'Run', mode: 'streak' as const, status: 'active' as const, notificationsEnabled: true, loggedToday: false, freezesLeft: 1, weekPaceState: null, weekEnd: null, today: '2026-01-01' };
    expect(planChallengeReminders(state, { now: new Date('2025-12-31T00:00:00') }).length).toBeGreaterThan(0);
    expect(getCalendarLayout(Number.NaN).horizontalPadding).toBe(12);
    expect(getCalendarLayout(320, 1.2).dayFontSize).toBe(13);
    expect(getCoachmarkPosition(null, Number.NaN, 300, Number.NaN).tipWidth).toBe(0);
    expect(getCoachmarkPosition(null, 300, Number.NaN, 100).tipTop).toBeGreaterThanOrEqual(8);
    expect(getCoachmarkPosition({ x: 0, y: 240, width: 20, height: 20 }, 400, 800, 100).tipTop).toBe(284);
    expect(getCoachmarkPosition({ x: 0, y: 100, width: 20, height: 20 }, 400, 800, 100).tipTop).toBe(144);
    expect(getCoachmarkPosition({ x: 0, y: 700, width: 20, height: 20 }, 400, 800, 100).tipTop).toBe(576);
    expect(getCoachmarkPosition({ x: 0, y: 300, width: 20, height: 20 }, 400, 500, 300).tipTop).toBeGreaterThan(0);
    expect(getCoachmarkPosition({ x: 0, y: 20, width: 20, height: 20 }, 300, 200, 100).tipTop).toBeGreaterThanOrEqual(8);
    expect(parseDurationMinutes('2', 'hr')).toBe(120);
    expect(parseDurationMinutes('0', 'min')).toBeNull();
    expect(getRangeLabel('D', new Date(2026, 0, 2))).toBe('2/1/2026');
    expect(getRangeLabel('W', new Date(2026, 0, 4))).toContain(' – ');
    expect(getRangeLabel('M', new Date(2026, 0, 2))).toBe('Tháng 1 2026');
    expect(getRangeLabel('Y', new Date(2026, 0, 2))).toBe('2026');
    expect(getMillisecondsUntilLocalMidnight(new Date(2026, 0, 2, 23, 59, 59, 999))).toBeGreaterThanOrEqual(1000);
    expect(heatmapLevel(0)).toBe(0);
    expect(heatmapLevel(6)).toBe(2);
    expect(require('../src/utils/heatmap').buildHeatmapWeeks([{ local_date: '2026-01-01', total_points: 1 }], new Date(2026, 0, 2)).flat().some((cell: { level: number }) => cell.level === 0)).toBe(true);
    expect(stepHeatmapAccessibilityDate([], 'x', 'next')).toBe('');
    expect(stepHeatmapAccessibilityDate(['a', 'b'], 'a', 'previous')).toBe('a');
    expect(getHomeHeatmapLayout(Number.NaN).compactHeader).toBe(false);
    expect(getHomeHeatmapLayout(320).compactHeader).toBe(true);
  });

  test('covers Sunday date arithmetic and defensive task/rank fallbacks', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-06T12:00:00'));
    expect(getWeekStart()).toBe('2026-08-31');
    expect(getWeekStartOffset(1)).toBe('2026-09-07');
    jest.useRealTimers();

    const rows = computeLogTaskRows({
      userId: 1, taskTypeId: 2, kind: 'GOOD', isTimeBased: true, basePoints: 1, starPenalty: 1,
      currentDayPoints: 0, bonusStarsAwarded: 0, loggedAt: new Date(0), localDate: '2026-01-01', weekStart: '2025-12-29',
    });
    expect(rows.activityRow.points_earned).toBe(1);
    expect(computeLifetimeTierCrossings(0, 10, 999, [{ id: 1, tier_order: 1, rank_name: 'One', stars_required: 5 }])).toEqual({ crossings: [{ tierId: 1, tierOrder: 1, rankName: 'One', starsAtCrossing: 5 }], finalTierId: 1 });
  });
});
