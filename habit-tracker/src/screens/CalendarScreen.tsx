import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useCalendarData, CalendarDay } from '../queries/useCalendar';
import { useBackfillStatus } from '../queries/useBackfillStatus';
import { useAuthUser } from '../hooks/useAuth';
import { useTheme, useTranslations, useLanguage } from '../hooks/useSettings';
import { AppColors, Radii, FontFamily, Shadows } from '../config/theme';
import { BackfillFlow } from '../components/BackfillFlow';
import { StreakMilestoneCelebrationModal } from '../components/StreakMilestoneCelebrationModal';
import { canBackfill } from '../game/backfill';
import type { StreakMilestone } from '../game/streakMilestones';
import { getLocalDate, getWeekStart, getWeekStartFor } from '../utils/formatters';
import { getCalendarLayout } from '../utils/calendarLayout';
import type { CalendarLayout } from '../utils/calendarLayout';


function toYearMonth(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function monthLabel(yearMonth: string, locale: string): string {
  const [y, m] = yearMonth.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleString(locale, { month: 'long', year: 'numeric' });
}

function daysInMonth(yearMonth: string): number {
  const [y, m] = yearMonth.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

function firstDowOfMonth(yearMonth: string): number {
  const [y, m] = yearMonth.split('-').map(Number);
  // getDay() 0=Sun, we want 0=Mon. Convert: (dow + 6) % 7
  return (new Date(y, m - 1, 1).getDay() + 6) % 7;
}

function resolveCellColors(
  hasActivity: boolean,
  colors: AppColors,
): { cellBg: string; numColor: string } {
  if (hasActivity) return { cellBg: colors.primarySoft, numColor: colors.primaryText };
  return { cellBg: 'transparent', numColor: colors.inkDark };
}

interface BackfillInfo {
  backfillsUsedThisWeek: number;
  freezeDates: Set<string>;
}

function resolveDayCellProps(
  day: number,
  dayMap: Record<string, CalendarDay>,
  backfillInfo: BackfillInfo | undefined,
  yearMonth: string,
  todayStr: string,
  currentWeekStart: string,
  colors: AppColors,
  cellIconSize: number,
  cellIconLineHeight: number,
): { dateStr: string; isEligible: boolean; isBackfilled: boolean; hasActivity: boolean; cellBg: string; numColor: string; cellIcon: React.ReactNode } {
  const data = dayMap[day];
  const hasActivity = !!data;
  const isBackfilled = !!data?.is_backfill;
  const { cellBg, numColor } = resolveCellColors(hasActivity, colors);
  const cellIcon = hasActivity ? <Text style={{ fontSize: cellIconSize, lineHeight: cellIconLineHeight, fontFamily: FontFamily.extraBold, color: colors.primaryText }}>✓</Text> : null;
  const dateStr = `${yearMonth}-${String(day).padStart(2, '0')}`;
  const backfillsUsed = backfillInfo ? backfillInfo.backfillsUsedThisWeek : 0;
  const hasFreeze = backfillInfo ? backfillInfo.freezeDates.has(dateStr) : false;
  const isEligible = canBackfill({
    date: dateStr,
    today: todayStr,
    weekStartOfDate: getWeekStartFor(new Date(dateStr + 'T12:00:00')),
    currentWeekStart,
    dayHasActivity: hasActivity,
    backfillsUsedThisWeek: backfillsUsed,
    hasStreakFreeze: hasFreeze,
  }).allowed;
  return {
    dateStr,
    isEligible,
    isBackfilled,
    hasActivity,
    cellBg,
    numColor,
    cellIcon,
  };
}

export function CalendarScreen({ qaBannerVisible = false }: { qaBannerVisible?: boolean } = {}) {
  const userId = useAuthUser();
  const { colors } = useTheme();
  const t = useTranslations();
  const [lang] = useLanguage();
  const { bottom: bottomInset } = useSafeAreaInsets();
  const { width: windowWidth, fontScale } = useWindowDimensions();
  const layout = useMemo(() => getCalendarLayout(windowWidth, fontScale), [fontScale, windowWidth]);
  const styles = useMemo(() => makeStyles(colors, bottomInset, layout), [colors, bottomInset, layout]);

  const [yearMonth, setYearMonth] = useState(() => toYearMonth(new Date()));
  const [backfillDate, setBackfillDate] = useState<string | null>(null);
  const [pendingStreakMilestone, setPendingStreakMilestone] = useState<StreakMilestone | null>(null);

  const { data: days = [] } = useCalendarData(userId, yearMonth);
  const { data: backfillStatus } = useBackfillStatus(userId);

  const todayStr = getLocalDate();
  const currentWeekStart = getWeekStart();

  const today = toYearMonth(new Date()) === yearMonth
    ? new Date().getDate()
    : -1;

  const dayMap = useMemo(() => {
    const m: Record<string, CalendarDay> = {};
    for (const d of days) {
      const dayNum = parseInt(d.local_date.slice(8, 10), 10);
      m[dayNum] = d;
    }
    return m;
  }, [days]);

  const totalStars = useMemo(() => days.reduce((s, d) => s + d.stars, 0), [days]);
  const activeDays = days.length;
  const bestStars = useMemo(() => Math.max(0, ...days.map((d) => d.stars)), [days]);

  function prevMonth() {
    const [y, m] = yearMonth.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    setYearMonth(toYearMonth(d));
  }

  function nextMonth() {
    const [y, m] = yearMonth.split('-').map(Number);
    const d = new Date(y, m, 1);
    setYearMonth(toYearMonth(d));
  }

  const cells = useMemo<(number | null)[]>(() => {
    const totalDays = daysInMonth(yearMonth);
    const firstDow = firstDowOfMonth(yearMonth);
    const arr: (number | null)[] = [
      ...Array(firstDow).fill(null),
      ...Array.from({ length: totalDays }, (_, i) => i + 1),
    ];
    while (arr.length % 7 !== 0) arr.push(null);
    return arr;
  }, [yearMonth]);

  const locale = lang === 'vi' ? 'vi-VN' : 'en-US';

  return (
    <SafeAreaView style={styles.safeArea} edges={qaBannerVisible ? ['bottom'] : ['top']}>
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Month Nav */}
      <View style={styles.monthNav}>
        <TouchableOpacity onPress={prevMonth} style={styles.navBtn} activeOpacity={0.7} accessibilityLabel={t.prevMonth} accessibilityRole="button">
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.inkDark} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M15 18l-6-6 6-6" />
          </Svg>
        </TouchableOpacity>
        <Text style={styles.monthLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{monthLabel(yearMonth, locale)}</Text>
        <TouchableOpacity onPress={nextMonth} style={styles.navBtn} activeOpacity={0.7} accessibilityLabel={t.nextMonth} accessibilityRole="button">
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.inkDark} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M9 18l6-6-6-6" />
          </Svg>
        </TouchableOpacity>
      </View>

      {/* DOW Labels */}
      <View style={styles.dowRow}>
        {t.calDow.map((l, i) => (
          <Text key={i} style={styles.dowLabel} numberOfLines={1}>{l}</Text>
        ))}
      </View>

      {/* Calendar Grid */}
      <View style={styles.grid}>
        {Array.from({ length: cells.length / 7 }, (_, rowIndex) => (
          <View key={`row-${rowIndex}`} style={styles.gridRow}>
            {cells.slice(rowIndex * 7, rowIndex * 7 + 7).map((day, columnIndex) => {
              const idx = rowIndex * 7 + columnIndex;
              if (!day) return <View key={idx} style={styles.cell} />;
              const { dateStr, isEligible, hasActivity, cellBg, numColor, cellIcon } = resolveDayCellProps(
                day, dayMap, backfillStatus, yearMonth, todayStr, currentWeekStart, colors,
                layout.cellIconSize, layout.cellIconLineHeight,
              );
              const isToday = day === today;
              const dayLabel = `${day}${isToday ? `, ${t.calDayToday}` : ''}: ${hasActivity ? t.calDayLogged : t.calDayEmpty}`;
              const cellStyle = [
                styles.cell,
                { backgroundColor: cellBg },
                isToday && styles.cellToday,
                isEligible && styles.cellEligible,
              ];
              const cellContent = (
                <>
                  <Text style={[styles.dayNum, { color: numColor }]} numberOfLines={1}>{day}</Text>
                  <View style={styles.cellBottom}>
                    {cellIcon ?? (isEligible ? <Text style={styles.backfillHint}>+</Text> : null)}
                  </View>
                </>
              );
              if (isEligible) {
                return (
                  <TouchableOpacity key={idx} style={cellStyle} onPress={() => setBackfillDate(dateStr)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={`${dayLabel}, ${t.backfillEligible}`} hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}>
                    {cellContent}
                  </TouchableOpacity>
                );
              }
              return <View key={idx} style={cellStyle} accessible accessibilityLabel={dayLabel}>{cellContent}</View>;
            })}
          </View>
        ))}
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <Text style={styles.legendCheck}>✓</Text>
          <Text style={styles.legendLabel}>{t.calendarActive}</Text>
        </View>
        <View style={styles.legendItem}>
          <Text style={styles.legendPlus}>＋</Text>
          <Text style={styles.legendLabel}>{t.calendarBackfill}</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={styles.legendToday} />
          <Text style={styles.legendLabel}>{t.calendarToday}</Text>
        </View>
      </View>

      {/* Month Summary */}
      <View style={styles.summary}>
        <View style={styles.summaryCell}>
          <Text style={styles.summaryV} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{Math.round(totalStars)}★</Text>
          <Text style={styles.summaryL} numberOfLines={2}>{t.calendarTotalStars}</Text>
        </View>
        <View style={styles.summarySep} />
        <View style={styles.summaryCell}>
          <Text style={styles.summaryV} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{activeDays}</Text>
          <Text style={styles.summaryL} numberOfLines={2}>{t.calendarActiveDays}</Text>
        </View>
        <View style={styles.summarySep} />
        <View style={styles.summaryCell}>
          <Text style={styles.summaryV} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{bestStars > 0 ? `${Math.round(bestStars)}★` : '—'}</Text>
          <Text style={styles.summaryL} numberOfLines={2}>{t.calendarBest}</Text>
        </View>
      </View>
    </ScrollView>

    <BackfillFlow
      backfillDate={backfillDate}
      setBackfillDate={setBackfillDate}
      backfillsUsedThisWeek={backfillStatus?.backfillsUsedThisWeek}
      userId={userId}
      setPendingStreakMilestone={setPendingStreakMilestone}
    />
    <StreakMilestoneCelebrationModal milestone={pendingStreakMilestone} onDismiss={() => setPendingStreakMilestone(null)} />
    </SafeAreaView>
  );
}

function makeStyles(colors: AppColors, bottomInset: number, layout: CalendarLayout) {
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.surface },
    container: { flex: 1 },
    content: { paddingHorizontal: layout.horizontalPadding, paddingBottom: 40 + bottomInset, paddingTop: 16 },
    monthNav: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 16,
    },
    navBtn: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', padding: 10 },
    monthLabel: { flex: 1, minWidth: 0, marginHorizontal: 8, textAlign: 'center', fontSize: layout.monthFontSize, fontFamily: FontFamily.bold, color: colors.inkDark },
    dowRow: {
      flexDirection: 'row',
      marginBottom: 4,
      columnGap: layout.cellGap,
    },
    dowLabel: {
      flex: 1,
      textAlign: 'center',
      fontSize: layout.dowFontSize,
      lineHeight: layout.dowFontSize + 4,
      fontFamily: FontFamily.bold,
      color: colors.ink2,
      paddingVertical: 4,
    },
    grid: {
      width: '100%',
    },
    gridRow: { flexDirection: 'row', width: '100%', columnGap: layout.cellGap },
    cell: {
      flex: 1,
      minWidth: 0,
      aspectRatio: 1,
      justifyContent: 'space-between',
      paddingTop: layout.cellTopPadding,
      paddingBottom: layout.cellBottomPadding,
      alignItems: 'center',
      borderRadius: Radii.sm,
      marginVertical: 2,
    },
    dayNum: { fontSize: layout.dayFontSize, lineHeight: layout.dayLineHeight, fontFamily: FontFamily.bold },
    cellBottom: { alignItems: 'center', height: layout.cellBottomHeight },
    cellToday: { borderWidth: 2, borderColor: colors.primaryPress, backgroundColor: colors.primarySoft, ...Shadows.light },
    cellEligible: {
      borderWidth: 1,
      borderColor: colors.primaryPress,
      borderStyle: 'dashed' as const,
    },
    backfillHint: {
      fontSize: 10,
      fontFamily: FontFamily.bold,
      color: colors.primaryText,
      marginTop: 1,
    },
    legend: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignSelf: 'center',
      justifyContent: 'center',
      columnGap: 8,
      rowGap: 4,
      maxWidth: '100%',
      marginTop: 16,
      marginBottom: 10,
    },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 28, flexShrink: 1 },
    legendCheck: { color: colors.primaryText, fontSize: 14, fontFamily: FontFamily.extraBold },
    legendPlus: { color: colors.primaryText, fontSize: 16, fontFamily: FontFamily.extraBold },
    legendToday: { width: 13, height: 13, borderRadius: 3, borderWidth: 2, borderColor: colors.primaryPress, backgroundColor: colors.primarySoft },
    legendLabel: { fontSize: layout.legendFontSize, lineHeight: layout.legendFontSize + 5, fontFamily: FontFamily.semiBold, color: colors.ink2, flexShrink: 1 },
    summary: {
      flexDirection: 'row',
      backgroundColor: colors.surface,
      borderRadius: Radii.md,
      borderWidth: 1,
      borderColor: colors.line,
      paddingVertical: 14,
      paddingHorizontal: 4,
      marginTop: 8,
      ...Shadows.light,
    },
    summaryCell: { flex: 1, minWidth: 0, alignItems: 'center', paddingHorizontal: 2 },
    summarySep: { width: 1, backgroundColor: colors.line },
    summaryV: { fontSize: layout.summaryValueSize, lineHeight: layout.summaryValueSize + 4, fontFamily: FontFamily.extraBold, color: colors.primaryText, maxWidth: '100%' },
    summaryL: { fontSize: layout.summaryLabelSize, lineHeight: layout.summaryLabelLineHeight, textAlign: 'center', fontFamily: FontFamily.medium, color: colors.ink2, marginTop: 2, maxWidth: '100%', flexShrink: 1 },
  });
}
