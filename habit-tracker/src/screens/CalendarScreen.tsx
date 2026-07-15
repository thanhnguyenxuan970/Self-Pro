import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useCalendarData, CalendarDay } from '../queries/useCalendar';
import { useBackfillStatus } from '../queries/useBackfillStatus';
import { useAuthUser } from '../hooks/useAuth';
import { useTheme, useTranslations, useLanguage } from '../hooks/useSettings';
import { AppColors, Radii, Spacing, FontFamily, Shadows } from '../config/theme';
import { AnimatedFireIcon, AnimatedStarIcon, AnimatedBurningStarIcon } from '../components/CalendarIcons';
import { BackfillSheet } from '../components/BackfillSheet';
import { canBackfill } from '../game/backfill';
import { getLocalDate, getWeekStart, getWeekStartFor } from '../utils/formatters';


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
  if (hasActivity) return { cellBg: colors.primarySoft, numColor: colors.primary };
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
): { dateStr: string; isEligible: boolean; isBackfilled: boolean; cellBg: string; numColor: string; cellIcon: React.ReactNode } {
  const data = dayMap[day];
  const hasActivity = !!data;
  const isBackfilled = !!data?.is_backfill;
  const { cellBg, numColor } = resolveCellColors(hasActivity, colors);
  const cellIcon = hasActivity ? <Text style={{ fontSize: 12, fontFamily: FontFamily.extraBold, color: colors.primary }}>✓</Text> : null;
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
    cellBg: isBackfilled ? 'transparent' : cellBg,
    numColor,
    cellIcon: isBackfilled ? null : cellIcon,
  };
}

function resolveCellIcon(data: CalendarDay | undefined, isMilestone: boolean, isBest: boolean, muteColor: string) {
  if (!data) return null;
  if (isMilestone && isBest) return <AnimatedBurningStarIcon />;
  if (isMilestone) return <AnimatedFireIcon />;
  if (isBest) return <AnimatedStarIcon />;
  return <Text style={{ fontSize: 11, fontFamily: FontFamily.semiBold, marginTop: 1, color: muteColor }}>{parseFloat(data.stars.toFixed(1))}★</Text>;
}

export function CalendarScreen() {
  const userId = useAuthUser();
  const { colors } = useTheme();
  const t = useTranslations();
  const [lang] = useLanguage();
  const { bottom: bottomInset } = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(colors, bottomInset), [colors, bottomInset]);

  const [yearMonth, setYearMonth] = useState(() => toYearMonth(new Date()));
  const [backfillDate, setBackfillDate] = useState<string | null>(null);

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
    <SafeAreaView style={styles.safeArea} edges={['top']}>
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{t.calendarTitle}</Text>
      </View>

      {/* Month Nav */}
      <View style={styles.monthNav}>
        <TouchableOpacity onPress={prevMonth} style={styles.navBtn} activeOpacity={0.7} accessibilityLabel={t.prevMonth} accessibilityRole="button">
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.inkDark} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M15 18l-6-6 6-6" />
          </Svg>
        </TouchableOpacity>
        <Text style={styles.monthLabel}>{monthLabel(yearMonth, locale)}</Text>
        <TouchableOpacity onPress={nextMonth} style={styles.navBtn} activeOpacity={0.7} accessibilityLabel={t.nextMonth} accessibilityRole="button">
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.inkDark} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M9 18l6-6-6-6" />
          </Svg>
        </TouchableOpacity>
      </View>

      {/* DOW Labels */}
      <View style={styles.dowRow}>
        {t.calDow.map((l, i) => (
          <Text key={i} style={styles.dowLabel}>{l}</Text>
        ))}
      </View>

      {/* Calendar Grid */}
      <View style={styles.grid}>
        {cells.map((day, idx) => {
          if (!day) return <View key={idx} style={styles.cell} />;
          const { dateStr, isEligible, isBackfilled, cellBg, numColor, cellIcon } = resolveDayCellProps(
            day, dayMap, backfillStatus, yearMonth, todayStr, currentWeekStart, colors,
          );
          const cellStyle = [
            styles.cell,
            { backgroundColor: cellBg },
            day === today && styles.cellToday,
            (isEligible || isBackfilled) && styles.cellEligible,
          ];
          const cellContent = (
            <>
              <Text style={[styles.dayNum, { color: numColor }]}>{day}</Text>
              <View style={styles.cellBottom}>
                {cellIcon ?? (isEligible || isBackfilled ? <Text style={styles.backfillHint}>+</Text> : null)}
              </View>
            </>
          );
          if (isEligible) {
            return (
              <TouchableOpacity key={idx} style={cellStyle} onPress={() => setBackfillDate(dateStr)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={`${t.backfillEligible} ${dateStr}`}>
                {cellContent}
              </TouchableOpacity>
            );
          }
          return <View key={idx} style={cellStyle}>{cellContent}</View>;
        })}
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
          <Text style={styles.summaryV}>{parseFloat(totalStars.toFixed(1))}★</Text>
          <Text style={styles.summaryL}>{t.calendarTotalStars}</Text>
        </View>
        <View style={styles.summarySep} />
        <View style={styles.summaryCell}>
          <Text style={styles.summaryV}>{activeDays}</Text>
          <Text style={styles.summaryL}>{t.calendarActiveDays}</Text>
        </View>
        <View style={styles.summarySep} />
        <View style={styles.summaryCell}>
          <Text style={styles.summaryV}>{bestStars > 0 ? `${parseFloat(bestStars.toFixed(1))}★` : '—'}</Text>
          <Text style={styles.summaryL}>{t.calendarBest}</Text>
        </View>
      </View>
    </ScrollView>

    <BackfillSheet
      visible={!!backfillDate}
      date={backfillDate ?? ''}
      backfillsUsedThisWeek={backfillStatus?.backfillsUsedThisWeek ?? 0}
      userId={userId}
      onClose={() => setBackfillDate(null)}
    />
    </SafeAreaView>
  );
}

function makeStyles(colors: AppColors, bottomInset: number) {
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.surface },
    container: { flex: 1 },
    content: { paddingHorizontal: Spacing.md, paddingBottom: 40 + bottomInset, paddingTop: 16 },
    header: { marginBottom: 12, marginTop: 8 },
    title: { fontSize: 28, fontFamily: FontFamily.extraBold, color: colors.inkDark },
    monthNav: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 16,
    },
    navBtn: { padding: 12 },
    monthLabel: { fontSize: 16, fontFamily: FontFamily.bold, color: colors.inkDark },
    dowRow: {
      flexDirection: 'row',
      marginBottom: 4,
      paddingHorizontal: 1,
    },
    dowLabel: {
      flex: 1,
      textAlign: 'center',
      fontSize: 12,
      fontFamily: FontFamily.bold,
      color: colors.ink2,
      paddingVertical: 4,
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      paddingHorizontal: 1,
    },
    cell: {
      width: '13.5%',
      aspectRatio: 1,
      justifyContent: 'space-between',
      paddingTop: 6,
      paddingBottom: 5,
      alignItems: 'center',
      borderRadius: Radii.sm,
      marginHorizontal: '0.39%',
      marginVertical: 2,
    },
    dayNum: { fontSize: 15, fontFamily: FontFamily.bold },
    cellBottom: { alignItems: 'center', height: 16 },
    cellToday: { borderWidth: 2, borderColor: colors.primary, backgroundColor: colors.primarySoft, ...Shadows.light },
    cellEligible: {
      borderWidth: 1,
      borderColor: colors.primary,
      borderStyle: 'dashed' as const,
    },
    backfillHint: {
      fontSize: 10,
      fontFamily: FontFamily.bold,
      color: colors.primary,
      marginTop: 1,
    },
    legend: {
      flexDirection: 'row',
      alignSelf: 'center',
      gap: 12,
      marginTop: 16,
      marginBottom: 10,
    },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    legendCheck: { color: colors.primary, fontSize: 14, fontFamily: FontFamily.extraBold },
    legendPlus: { color: colors.primary, fontSize: 16, fontFamily: FontFamily.extraBold },
    legendToday: { width: 13, height: 13, borderRadius: 3, borderWidth: 2, borderColor: colors.primary, backgroundColor: colors.primarySoft },
    legendLabel: { fontSize: 11, fontFamily: FontFamily.semiBold, color: colors.ink2 },
    summary: {
      flexDirection: 'row',
      backgroundColor: colors.white,
      borderRadius: Radii.md,
      borderWidth: 1,
      borderColor: colors.line,
      paddingVertical: 16,
      marginTop: 8,
      ...Shadows.light,
    },
    summaryCell: { flex: 1, alignItems: 'center' },
    summarySep: { width: 1, backgroundColor: colors.line },
    summaryV: { fontSize: 18, fontFamily: FontFamily.extraBold, color: colors.primary },
    summaryL: { fontSize: 11, color: colors.ink2, marginTop: 2 },
  });
}
