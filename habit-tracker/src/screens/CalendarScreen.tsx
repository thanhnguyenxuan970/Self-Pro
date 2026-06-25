import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useCalendarData, CalendarDay } from '../queries/useCalendar';
import { useBackfillStatus } from '../queries/useBackfillStatus';
import { useAuthUser } from '../hooks/useAuth';
import { useTheme, useTranslations, useLanguage } from '../hooks/useSettings';
import { AppColors, Radii, Spacing, FontFamily } from '../config/theme';
import { AnimatedFireIcon, AnimatedStarIcon, AnimatedBurningStarIcon } from '../components/CalendarIcons';
import { BackfillSheet } from '../components/BackfillSheet';
import { canBackfill } from '../game/backfill';
import { getLocalDate, getWeekStart, getWeekStartFor } from '../utils/formatters';

const DOW_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

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
  isMilestone: boolean, isBest: boolean, hasActivity: boolean,
  isDark: boolean, colors: AppColors,
): { cellBg: string; numColor: string } {
  if (isMilestone || isBest) return { cellBg: 'transparent', numColor: colors.inkDark };
  if (hasActivity) return { cellBg: colors.primarySoft, numColor: colors.primary };
  return { cellBg: 'transparent', numColor: colors.inkDark };
}

function resolveCellIcon(data: CalendarDay | undefined, isMilestone: boolean, isBest: boolean, muteColor: string) {
  if (!data) return null;
  if (isMilestone && isBest) return <AnimatedBurningStarIcon />;
  if (isMilestone) return <AnimatedFireIcon />;
  if (isBest) return <AnimatedStarIcon />;
  return <Text style={{ fontSize: 9, fontFamily: FontFamily.semiBold, marginTop: 1, color: muteColor }}>{parseFloat(data.stars.toFixed(1))}★</Text>;
}

export function CalendarScreen() {
  const userId = useAuthUser();
  const { colors, isDark } = useTheme();
  const t = useTranslations();
  const [lang] = useLanguage();
  const styles = useMemo(() => makeStyles(colors), [colors]);

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
        {DOW_LABELS.map((l, i) => (
          <Text key={i} style={styles.dowLabel}>{l}</Text>
        ))}
      </View>

      {/* Calendar Grid */}
      <View style={styles.grid}>
        {cells.map((day, idx) => {
          if (!day) return <View key={idx} style={styles.cell} />;
          const data = dayMap[day];
          const isBest = data?.is_best_day ?? false;
          const isMilestone = data?.is_milestone ?? false;
          const { cellBg, numColor } = resolveCellColors(isMilestone, isBest, !!data, isDark, colors);
          const cellIcon = resolveCellIcon(data, isMilestone, isBest, colors.muted);

          const dateStr = `${yearMonth}-${String(day).padStart(2, '0')}`;
          const isEligible = canBackfill({
            date: dateStr,
            today: todayStr,
            weekStartOfDate: getWeekStartFor(new Date(dateStr + 'T12:00:00')),
            currentWeekStart,
            dayHasActivity: !!data,
            backfillsUsedThisWeek: backfillStatus?.backfillsUsedThisWeek ?? 0,
            hasStreakFreeze: backfillStatus?.freezeDates?.has(dateStr) ?? false,
          }).allowed;

          const cellStyle = [
            styles.cell,
            { backgroundColor: cellBg },
            day === today && { borderWidth: 1.5, borderColor: colors.primary },
            isEligible && styles.cellEligible,
          ];
          const cellContent = (
            <>
              <Text style={[styles.dayNum, { color: numColor }]}>{day}</Text>
              <View style={styles.cellBottom}>
                {cellIcon ?? (isEligible
                  ? <Text style={styles.backfillHint}>+</Text>
                  : null)}
              </View>
            </>
          );

          if (isEligible) {
            return (
              <TouchableOpacity
                key={idx}
                style={cellStyle}
                onPress={() => setBackfillDate(dateStr)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`${t.backfillEligible} ${dateStr}`}
              >
                {cellContent}
              </TouchableOpacity>
            );
          }
          return (
            <View key={idx} style={cellStyle}>
              {cellContent}
            </View>
          );
        })}
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <AnimatedFireIcon size={20} />
          <Text style={styles.legendLabel}>{t.calendarMilestone}</Text>
        </View>
        <View style={styles.legendItem}>
          <AnimatedStarIcon size={20} />
          <Text style={styles.legendLabel}>{t.calendarBestDay}</Text>
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

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.surface },
    container: { flex: 1 },
    content: { paddingHorizontal: Spacing.lg, paddingBottom: 40, paddingTop: 16 },
    header: { marginBottom: 16, marginTop: 8 },
    title: { fontSize: 22, fontFamily: FontFamily.extraBold, color: colors.inkDark },
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
      marginHorizontal: -Spacing.lg,
      paddingHorizontal: 4,
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
      marginHorizontal: -Spacing.lg,
      paddingHorizontal: 4,
    },
    cell: {
      width: '14.285%',
      aspectRatio: 1,
      justifyContent: 'space-between',
      paddingTop: 6,
      paddingBottom: 5,
      alignItems: 'center',
      borderRadius: Radii.sm,
      marginVertical: 2,
    },
    dayNum: { fontSize: 15, fontFamily: FontFamily.bold },
    dayStars: { fontSize: 8, fontFamily: FontFamily.semiBold, marginTop: 1 },
    dayIcon: { fontSize: 9, marginTop: 1 },
    cellBottom: { alignItems: 'center', height: 16 },
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
      justifyContent: 'center',
      gap: 16,
      marginTop: 16,
      marginBottom: 8,
    },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    legendIcon: { fontSize: 14 },
    legendLabel: { fontSize: 13, color: colors.muted },
    summary: {
      flexDirection: 'row',
      backgroundColor: colors.surface2,
      borderRadius: Radii.md,
      paddingVertical: 16,
      marginTop: 8,
    },
    summaryCell: { flex: 1, alignItems: 'center' },
    summarySep: { width: 1, backgroundColor: colors.line },
    summaryV: { fontSize: 18, fontFamily: FontFamily.extraBold, color: colors.primary },
    summaryL: { fontSize: 11, color: colors.ink2, marginTop: 2 },
  });
}
