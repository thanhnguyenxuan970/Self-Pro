import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useCalendarData, CalendarDay } from '../queries/useCalendar';
import { useAuthUser } from '../hooks/useAuth';
import { useTheme, useTranslations, useLanguage } from '../hooks/useSettings';
import { AppColors, Radii, Spacing } from '../config/theme';

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

export function CalendarScreen() {
  const userId = useAuthUser();
  const { colors, isDark } = useTheme();
  const t = useTranslations();
  const [lang] = useLanguage();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [yearMonth, setYearMonth] = useState(() => toYearMonth(new Date()));
  const { data: days = [] } = useCalendarData(userId, yearMonth);

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
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{t.calendarTitle}</Text>
      </View>

      {/* Month Nav */}
      <View style={styles.monthNav}>
        <TouchableOpacity onPress={prevMonth} style={styles.navBtn} activeOpacity={0.7}>
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.inkDark} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M15 18l-6-6 6-6" />
          </Svg>
        </TouchableOpacity>
        <Text style={styles.monthLabel}>{monthLabel(yearMonth, locale)}</Text>
        <TouchableOpacity onPress={nextMonth} style={styles.navBtn} activeOpacity={0.7}>
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
          if (!day) {
            return <View key={idx} style={styles.cell} />;
          }
          const data = dayMap[day];
          const isToday = day === today;
          const isBest = data?.is_best_day ?? false;
          const isMilestone = data?.is_milestone ?? false;
          const hasActivity = !!data;

          let cellBg: string = 'transparent';
          let numColor: string = colors.inkDark;
          let starsColor: string = colors.muted;

          if (isMilestone) {
            cellBg = colors.primary;
            numColor = '#fff';
            starsColor = 'rgba(255,255,255,0.8)';
          } else if (isBest) {
            cellBg = colors.starGold;
            numColor = '#fff';
            starsColor = 'rgba(255,255,255,0.8)';
          } else if (hasActivity) {
            cellBg = isDark ? colors.surface2 : colors.primarySoft;
            numColor = colors.primary;
            starsColor = colors.muted;
          }

          return (
            <View
              key={idx}
              style={[
                styles.cell,
                { backgroundColor: cellBg },
                isToday && !isBest && !isMilestone && styles.todayBorder,
                isToday && !isBest && !isMilestone && { borderColor: colors.primary },
              ]}
            >
              <Text style={[styles.dayNum, { color: numColor }]}>{day}</Text>
              {data ? (
                <Text style={[styles.dayStars, { color: starsColor }]}>{data.stars}★</Text>
              ) : null}
            </View>
          );
        })}
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.primary }]} />
          <Text style={styles.legendLabel}>{t.calendarMilestone}</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.starGold }]} />
          <Text style={styles.legendLabel}>{t.calendarBestDay}</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: isDark ? colors.surface2 : colors.primarySoft }]} />
          <Text style={styles.legendLabel}>{t.calendarActive}</Text>
        </View>
      </View>

      {/* Month Summary */}
      <View style={styles.summary}>
        <View style={styles.summaryCell}>
          <Text style={styles.summaryV}>{totalStars}★</Text>
          <Text style={styles.summaryL}>{t.calendarTotalStars}</Text>
        </View>
        <View style={styles.summarySep} />
        <View style={styles.summaryCell}>
          <Text style={styles.summaryV}>{activeDays}</Text>
          <Text style={styles.summaryL}>{t.calendarActiveDays}</Text>
        </View>
        <View style={styles.summarySep} />
        <View style={styles.summaryCell}>
          <Text style={styles.summaryV}>{bestStars > 0 ? `${bestStars}★` : '—'}</Text>
          <Text style={styles.summaryL}>{t.calendarBest}</Text>
        </View>
      </View>
    </ScrollView>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.surface },
    content: { paddingHorizontal: Spacing.lg, paddingBottom: 40, paddingTop: 16 },
    header: { marginBottom: 16, marginTop: 8 },
    title: { fontSize: 22, fontWeight: '800', color: colors.inkDark },
    monthNav: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 16,
    },
    navBtn: { padding: 8 },
    monthLabel: { fontSize: 16, fontWeight: '700', color: colors.inkDark },
    dowRow: {
      flexDirection: 'row',
      marginBottom: 4,
    },
    dowLabel: {
      flex: 1,
      textAlign: 'center',
      fontSize: 11,
      fontWeight: '700',
      color: colors.muted,
      paddingVertical: 4,
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
    },
    cell: {
      width: '14.285%',
      aspectRatio: 1,
      justifyContent: 'center',
      alignItems: 'center',
      borderRadius: Radii.sm,
      marginVertical: 2,
    },
    todayBorder: {
      borderWidth: 2,
    },
    dayNum: { fontSize: 13, fontWeight: '700' },
    dayStars: { fontSize: 8, fontWeight: '600', marginTop: 1 },
    legend: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 16,
      marginTop: 16,
      marginBottom: 8,
    },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    legendDot: { width: 10, height: 10, borderRadius: 5 },
    legendLabel: { fontSize: 11, color: colors.muted },
    summary: {
      flexDirection: 'row',
      backgroundColor: colors.surface2,
      borderRadius: Radii.md,
      paddingVertical: 16,
      marginTop: 8,
    },
    summaryCell: { flex: 1, alignItems: 'center' },
    summarySep: { width: 1, backgroundColor: colors.line },
    summaryV: { fontSize: 18, fontWeight: '800', color: colors.primary },
    summaryL: { fontSize: 11, color: colors.muted, marginTop: 2 },
  });
}
