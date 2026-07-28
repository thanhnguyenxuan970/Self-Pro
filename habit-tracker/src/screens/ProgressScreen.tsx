import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView, Alert, Platform, Animated, Easing } from 'react-native';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import {
  useAnalyticsDashboard, useAnalyticsPointsData, useStreakCount,
  useRecentActivityLogs, useDeleteActivityLogs, useWeeklyConsistency, useTopActivities, useAllTimeStats,
  ActivityLogEntry,
} from '../queries/useProgress';
import { Radii, Spacing, Shadows, AppColors, FontFamily } from '../config/theme';
import { useAuthUser } from '../hooks/useAuth';
import { useTheme, useTranslations } from '../hooks/useSettings';
import { useReduceMotion } from '../hooks/useReduceMotion';
import { useSelectionMode } from '../hooks/useSelectionMode';
import { AddActivitySheet } from './AddActivitySheet';
import { resolveTaskDisplayName } from '../utils/resolveTaskDisplayName';
import { useHeatmapData } from '../queries/useCalendar';
import { useRankData } from '../queries/useRank';
import { getRankConfigByTierOrder } from '../config/ranks.config';
import { AnalyticsDashboardView } from '../components/analytics/AnalyticsDashboardView';
import { useLanguage } from '../hooks/useSettings';

type Range = 'W' | 'M' | 'Y';

type ProgStyles = ReturnType<typeof makeStyles>;
type ProgTranslations = ReturnType<typeof useTranslations>;

// Fill-up entrance: grows a bar's height (or width) from 0% to `to`% once on mount.
// Non-native driver because it animates a layout dimension. Respects reduce-motion
// (jumps straight to the final size). Re-runs when `to`/`animKey` change so the bars
// re-fill when the W/M range switches.
function AnimatedFill({ axis, to, delay = 0, duration = 720, animKey, reduceMotion, style }: {
  axis: 'height' | 'width'; to: number; delay?: number; duration?: number;
  animKey?: string | number; reduceMotion: boolean; style?: object;
}) {
  const p = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  useEffect(() => {
    if (reduceMotion) { p.setValue(1); return; }
    p.setValue(0);
    const anim = Animated.timing(p, {
      toValue: 1, duration, delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    anim.start();
    return () => anim.stop();
  }, [to, delay, duration, animKey, reduceMotion, p]);
  const size = p.interpolate({ inputRange: [0, 1], outputRange: ['0%', `${to}%`] });
  return <Animated.View style={[style, { [axis]: size }]} />;
}

// fallow-ignore-next-line complexity
function ProgressLogRow({ item, isLast, selectionMode, selected, toggleSelect, enterSelection, bonusDay, timeLocale, t, styles }: {
  item: ActivityLogEntry; isLast: boolean; selectionMode: boolean; selected: boolean;
  toggleSelect: (id: number) => void; enterSelection: (id: number) => void;
  bonusDay: string; timeLocale: string; t: ProgTranslations; styles: ProgStyles;
}) {
  const timeStr = new Date(item.logged_at).toLocaleTimeString(timeLocale, { hour: '2-digit', minute: '2-digit' });
  return (
    <TouchableOpacity
      style={[styles.logRow, isLast && styles.logRowLast, selected && styles.logRowSelected]}
      onPress={() => selectionMode ? toggleSelect(item.id) : undefined}
      onLongPress={() => enterSelection(item.id)}
      delayLongPress={300}
      activeOpacity={0.7}
    >
      {selectionMode && (
        <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
          {selected && <Text style={styles.checkmark}>✓</Text>}
        </View>
      )}
      <View style={styles.logBody}>
        <Text style={styles.logName} numberOfLines={1}>
          {item.source === 'DAILY_BONUS' ? bonusDay : item.task_name != null ? resolveTaskDisplayName(item.task_name, t, item.is_template === 1) : item.source}
        </Text>
        <Text style={styles.logDate}>{item.local_date} · {timeStr}</Text>
      </View>
      <Text style={[styles.logStars, item.stars_delta < 0 && styles.logStarsBad]}>
        {item.stars_delta >= 0 ? '+' : ''}{Math.round(item.stars_delta)} ★
      </Text>
    </TouchableOpacity>
  );
}

function ActivityLogSection({ actLogs, selectionMode, selectedIds, selectAll, cancelSelection, enterSelection, toggleSelect, handleDeleteSelected, deleteLogs, onAddActivity, filterDate, onFilterPress, onFilterClear, t, styles }: {
  actLogs: ActivityLogEntry[]; selectionMode: boolean; selectedIds: Set<number>;
  selectAll: () => void; cancelSelection: () => void;
  enterSelection: (id: number) => void; toggleSelect: (id: number) => void;
  handleDeleteSelected: () => void; deleteLogs: { isPending: boolean };
  onAddActivity: () => void; filterDate: string | null;
  onFilterPress: () => void; onFilterClear: () => void;
  t: ProgTranslations; styles: ProgStyles;
}) {
  return (
    <>
      <View style={styles.logHeader}>
        <Text style={[styles.sectionLabel, { marginHorizontal: 0 }]}>{t.activityLogSection}</Text>
        {selectionMode ? (
          <View style={styles.logActions}>
            <TouchableOpacity onPress={selectAll} style={styles.logActionBtn} accessibilityRole="button" accessibilityLabel={t.all}>
              <Text style={styles.logActionTxt}>{t.all}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleDeleteSelected}
              style={[styles.logActionBtn, styles.logDeleteBtn]}
              disabled={selectedIds.size === 0 || deleteLogs.isPending}
              accessibilityRole="button"
              accessibilityLabel={t.deleteCount(selectedIds.size)}
            >
              <Text style={styles.logDeleteTxt}>{t.deleteCount(selectedIds.size)}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={cancelSelection} style={styles.logActionBtn} accessibilityRole="button" accessibilityLabel={t.cancel}>
              <Text style={styles.logActionTxt}>{t.cancel}</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
      {/* Date filter chip */}
      <View style={styles.filterRow}>
        <TouchableOpacity style={styles.filterChip} onPress={onFilterPress} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={filterDate ?? t.filterLast7Days}>
          <Text style={styles.filterChipText}>{filterDate ?? t.filterLast7Days}</Text>
        </TouchableOpacity>
        {filterDate !== null && (
          <TouchableOpacity onPress={onFilterClear} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t.filterClear}>
            <Text style={styles.filterClearText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>
      {actLogs.length === 0 ? (
        <View style={styles.logEmptyWrap}>
          <Text style={styles.logEmpty}>{t.progressEmptyMsg}</Text>
          <TouchableOpacity style={styles.logEmptyCta} onPress={onAddActivity} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={t.progressEmptyCta}>
            <Text style={styles.logEmptyCtaTxt}>{t.progressEmptyCta}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.logCard}>
          {actLogs.map((item, idx) => (
            <ProgressLogRow
              key={item.id}
              item={item}
              isLast={idx === actLogs.length - 1}
              selectionMode={selectionMode}
              selected={selectedIds.has(item.id)}
              toggleSelect={toggleSelect}
              enterSelection={enterSelection}
              bonusDay={t.bonusDay}
              timeLocale={t.timeLocale}
              t={t}
              styles={styles}
            />
          ))}
        </View>
      )}
    </>
  );
}

function formatBucketLabel(bucket: string, r: Range, dayAbbr: string[], dateStr: (day: number, month: number) => string): string {
  if (r === 'W') {
    const d = new Date(bucket + 'T00:00:00');
    return dayAbbr[d.getDay()] ?? bucket;
  }
  if (r === 'M') return bucket;
  const month = Number(bucket.slice(5, 7));
  return dateStr(1, month).startsWith('1 ') ? `T${month}` : dateStr(1, month).split(' ')[0];
}

function openDateFilter(filterDate: string | null, setFilterDate: (d: string) => void) {
  if (Platform.OS !== 'android') return;
  const initial = filterDate ? new Date(filterDate + 'T00:00:00') : new Date();
  DateTimePickerAndroid.open({
    mode: 'date',
    value: initial,
    maximumDate: new Date(),
    onValueChange: (_event, selected) => {
      if (selected) {
        const y = selected.getFullYear();
        const m = String(selected.getMonth() + 1).padStart(2, '0');
        const d = String(selected.getDate()).padStart(2, '0');
        setFilterDate(`${y}-${m}-${d}`);
      }
    },
  });
}

function confirmDeleteSelected(
  ids: number[],
  cancelSelection: () => void,
  deleteLogs: { mutateAsync: (ids: number[]) => Promise<unknown> },
  t: ProgTranslations,
) {
  Alert.alert(
    t.deleteLogTitle,
    t.deleteNItems(ids.length),
    [
      { text: t.cancel, style: 'cancel' },
      {
        text: t.delete, style: 'destructive',
        onPress: () => {
          deleteLogs.mutateAsync(ids)
            .then(cancelSelection)
            .catch(() => Alert.alert(t.error, t.deleteFailed));
        },
      },
    ]
  );
}

type ChartData = { bucket: string; points: number };

function ProgressChartContent({ isLoading, chartData, range, formatBucket, colors, reduceMotion, focusKey, styles, t }: {
  isLoading: boolean; chartData: ChartData[]; range: Range;
  formatBucket: (bucket: string, range: Range) => string; colors: AppColors;
  reduceMotion: boolean; focusKey: number; styles: ProgStyles; t: ProgTranslations;
}) {
  if (isLoading) return <ActivityIndicator color={colors.primary} />;
  if (chartData.length === 0) {
    return (
      <View style={styles.emptyChart}>
        <Text style={styles.emptyText}>{t.noActivityYet}</Text>
      </View>
    );
  }
  const maxPoints = Math.max(...chartData.map(day => day.points));
  const totalPoints = chartData.reduce((sum, day) => sum + day.points, 0);
  return (
    <View style={[styles.barChart, chartData.length > 10 && styles.barChartDense]} accessible accessibilityLabel={t.chartSummary(totalPoints)}>
      {chartData.map((day, idx) => {
        const isPeak = day.points === maxPoints;
        const targetPct = Math.max(14, Math.round((day.points / maxPoints) * 100));
        return (
          <View key={day.bucket} style={styles.barColumn}>
            <Text style={[styles.barValue, isPeak && styles.barValuePeak, chartData.length > 10 && styles.barValueDense]}>{day.points}</Text>
            <View style={styles.barArea}>
              <AnimatedFill
                axis="height"
                to={targetPct}
                delay={idx * 55}
                animKey={`${range}-${day.bucket}-${focusKey}`}
                reduceMotion={reduceMotion}
                style={[styles.bar, isPeak ? styles.barPeak : styles.barRegular]}
              />
            </View>
            <Text style={[styles.barLabel, chartData.length > 10 && styles.barLabelDense]}>{formatBucket(day.bucket, range)}</Text>
          </View>
        );
      })}
    </View>
  );
}

export function ProgressScreen() {
  const userId = useAuthUser();
  const { colors, isDark } = useTheme();
  const [language] = useLanguage();
  const t = useTranslations();
  const reduceMotion = useReduceMotion();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  // Re-trigger entrance animations every time the screen gains focus (tab
  // screens stay mounted, so a one-shot mount effect would only fire once).
  // Bumping focusKey resets every AnimatedFill via its animKey dependency.
  const [focusKey, setFocusKey] = useState(0);
  useFocusEffect(
    useCallback(() => { setFocusKey(k => k + 1); }, []),
  );

  const [range, setRange] = useState<Range>('W');
  const { data: dashboard, isLoading: isDashboardLoading } = useAnalyticsDashboard(userId, range);
  const { data: chartData = [], isLoading } = useAnalyticsPointsData(userId, range);
  const { data: streak = 0 } = useStreakCount(userId);
  const { data: heatmapDays = [] } = useHeatmapData(userId);
  const { data: allTimeStats } = useAllTimeStats(userId);
  const { data: rankData } = useRankData(userId);
  const { data: activeDays = 0 } = useWeeklyConsistency(userId);
  const { data: topActivities = [] } = useTopActivities(userId);
  const [filterDate, setFilterDate] = useState<string | null>(null);
  const { data: actLogs = [] } = useRecentActivityLogs(
    userId, 50,
    filterDate ?? undefined,
    filterDate ?? undefined,
  );
  const deleteLogs = useDeleteActivityLogs(userId);

  const { selectionMode, selectedIds, enterSelection, toggleSelect, selectAll, cancelSelection } = useSelectionMode(actLogs);
  const [addSheetVisible, setAddSheetVisible] = useState(false);

  const RANGES = useMemo(() => [
    { key: 'W' as Range, label: t.rangeWeek },
    { key: 'M' as Range, label: t.rangeMonth },
    { key: 'Y' as Range, label: t.rangeYear },
  ], [t.rangeWeek, t.rangeMonth, t.rangeYear]);

  const formatBucket = useCallback(
    (bucket: string, r: Range) => formatBucketLabel(bucket, r, t.dayAbbr, t.dateStr),
    [t.dayAbbr, t.dateStr],
  );

  const yearStats = useMemo(
    () => ({ peakPoints: Math.max(0, ...heatmapDays.map(day => day.total_points)) }),
    [heatmapDays],
  );

  const currentTier = rankData?.currentTierId ? rankData.tiers.find(tier => tier.id === rankData.currentTierId) : undefined;
  const nextTier = currentTier
    ? rankData?.tiers.find(tier => tier.tier_order === currentTier.tier_order + 1)
    : rankData?.tiers.find(tier => tier.stars_required > (rankData?.currentStars ?? 0));
  const rankFloor = currentTier?.stars_required ?? 0;
  const rankProgress = nextTier
    ? Math.min(1, Math.max(0, ((rankData?.currentStars ?? 0) - rankFloor) / Math.max(1, nextTier.stars_required - rankFloor)))
    : 1;
  const rankName = getRankConfigByTierOrder(currentTier?.tier_order ?? 1).nameVi;
  const displayCurrentStars = Math.round(rankData?.currentStars ?? 0);
  const isEmpty = allTimeStats?.totalActivities === 0;

  const rangeSegmentedControl = (
    <View style={styles.segbar}>
      {RANGES.map(({ key, label }) => (
        <TouchableOpacity
          key={key}
          style={[styles.segBtn, range === key && styles.segBtnActive]}
          onPress={() => setRange(key)}
          accessibilityRole="tab"
          accessibilityLabel={label}
          accessibilityState={{ selected: range === key }}
        >
          <Text style={[styles.segTxt, range === key && styles.segTxtActive]}>{label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const activityLogSection = (
    <ActivityLogSection
      actLogs={actLogs}
      selectionMode={selectionMode}
      selectedIds={selectedIds}
      selectAll={selectAll}
      cancelSelection={cancelSelection}
      enterSelection={enterSelection}
      toggleSelect={toggleSelect}
      handleDeleteSelected={() => confirmDeleteSelected(Array.from(selectedIds), cancelSelection, deleteLogs, t)}
      deleteLogs={deleteLogs}
      onAddActivity={() => setAddSheetVisible(true)}
      filterDate={filterDate}
      onFilterPress={() => openDateFilter(filterDate, setFilterDate)}
      onFilterClear={() => setFilterDate(null)}
      t={t}
      styles={styles}
    />
  );

  if (dashboard) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 32 }}>
          <Text style={styles.title}>{t.analyticsTitle}</Text>
          <Text style={styles.dashboardSubtitle}>{range === 'W' ? t.filterLast7Days : range === 'M' ? t.periodThisMonth : t.periodThisYear}</Text>
          {rangeSegmentedControl}
          <View style={styles.dashboardWrap}><AnalyticsDashboardView data={dashboard} colors={colors} isDark={isDark} language={language} range={range} reduceMotion={reduceMotion} animationKey={focusKey} /></View>
          {activityLogSection}
        </ScrollView>
        <AddActivitySheet visible={addSheetVisible} onClose={() => setAddSheetVisible(false)} />
      </SafeAreaView>
    );
  }
  if (isDashboardLoading) return <SafeAreaView style={styles.safeArea}><ActivityIndicator color={colors.primary} /></SafeAreaView>;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 32 }}>
        <Text style={styles.title}>{t.analyticsTitle}</Text>

        <Text style={styles.sectionLabel}>{t.analyticsMomentum}</Text>
        <View style={styles.momentumCard}>
          <View style={styles.momentumHalf}><Text style={styles.momentumValue}>{streak}</Text><Text style={styles.statL}>{t.currentStreak}</Text></View>
          <View style={styles.momentumHalf}><Text style={styles.momentumValue}>{allTimeStats?.bestStreak ?? 0}</Text><Text style={styles.statL}>{t.bestStreak}</Text></View>
        </View>

        <Text style={styles.sectionLabel}>{t.analyticsWeeklyRank}</Text>
        <View style={styles.rankCard}>
          <View style={styles.rankHeader}>
            <View><Text style={styles.rankName}>{rankName}</Text><Text style={styles.rankStars}>{displayCurrentStars} ★</Text></View>
            <Text style={styles.rankNext}>{nextTier ? t.rankStarsToNext(Math.round(Math.max(0, nextTier.stars_required - (rankData?.currentStars ?? 0)))) : t.rankMaxed}</Text>
          </View>
          <View style={styles.rankTrack}>
            <AnimatedFill axis="width" to={Math.round(rankProgress * 100)} duration={900} animKey={`${Math.round(rankProgress * 100)}-${focusKey}`} reduceMotion={reduceMotion} style={styles.rankFill} />
          </View>
        </View>

        {/* Segmented control */}
        {rangeSegmentedControl}

        {/* Chart card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>{range === 'W' ? t.chartLast7Days : range === 'M' ? t.chartPointsThisMonth : t.chartPointsThisYear}</Text>
          </View>
          <View style={styles.chartWrap}>
            <ProgressChartContent
              isLoading={isLoading} chartData={chartData} range={range}
              formatBucket={formatBucket} colors={colors} reduceMotion={reduceMotion} focusKey={focusKey} styles={styles} t={t}
            />
          </View>
        </View>

        <Text style={styles.sectionLabel}>{t.analyticsMetrics}</Text>
        <View style={styles.statGrid}>
          <View style={styles.stat}>
            <Text style={[styles.statV, styles.statVPeak]}>{yearStats.peakPoints}</Text>
            <Text style={styles.statL}>{t.peakPointsLabel}</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statV}>{activeDays}/7</Text>
            <Text style={styles.statL}>{t.weeklyActiveDays}</Text>
          </View>
        </View>

        {/* Top habits */}
        {topActivities.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>{t.topHabits}</Text>
            <View style={styles.topCard}>
              {topActivities.map((item, idx) => {
                const pct = Math.round((item.count / topActivities[0].count) * 100);
                return (
                  <View key={idx} style={[styles.topRow, idx === topActivities.length - 1 && styles.topRowLast]}>
                    <Text style={styles.topName} numberOfLines={1}>{resolveTaskDisplayName(item.name, t)}</Text>
                    <View style={styles.topBarTrack}>
                      <AnimatedFill axis="width" to={pct} delay={idx * 80} animKey={`${idx}-${pct}-${focusKey}`} reduceMotion={reduceMotion} style={styles.topBarFill} />
                    </View>
                    <Text style={styles.topCount}>{t.times(item.count)}</Text>
                  </View>
                );
              })}
            </View>
          </>
        )}

        {isEmpty && <Text style={styles.emptyEncouragement}>{t.progressEmptyEncouragement}</Text>}

        {/* Keep the existing log management surface; this redesign does not replace it. */}
        {activityLogSection}
      </ScrollView>
      <AddActivitySheet visible={addSheetVisible} onClose={() => setAddSheetVisible(false)} />
    </SafeAreaView>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: C.bgBase },
    container: { flex: 1 },
    title: { fontSize: 28, fontFamily: FontFamily.extraBold, letterSpacing: -0.7, color: C.inkDark, marginHorizontal: Spacing.lg, marginTop: 10, marginBottom: 14 },
    dashboardSubtitle: { color: C.muted, fontFamily: FontFamily.regular, fontSize: 12, marginHorizontal: Spacing.lg, marginTop: -8 },
    dashboardWrap: { marginHorizontal: Spacing.lg },

    segbar: { flexDirection: 'row', marginHorizontal: Spacing.lg, marginBottom: 14 },
    segBtn: {
      flex: 1, minHeight: 38, justifyContent: 'center', borderRadius: Radii.pill, alignItems: 'center',
    },
    segBtnActive: {
      backgroundColor: C.surface,
      ...Shadows.light,
    },
    segTxt: { fontSize: 12, fontFamily: FontFamily.bold, color: C.ink2 },
    segTxtActive: { color: C.inkDark },

    card: {
      marginHorizontal: Spacing.lg, backgroundColor: C.surface,
      borderRadius: Radii.lg, padding: 15, borderWidth: 1, borderColor: C.line, ...Shadows.light,
    },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    cardTitle: { fontSize: 13, fontFamily: FontFamily.extraBold, color: C.inkDark },
    chartSum: { fontSize: 11, color: C.ink2 },
    chartWrap: { marginTop: 8 },
    barChart: { height: 148, flexDirection: 'row', gap: 8, alignItems: 'flex-end', paddingHorizontal: 3 },
    barChartDense: { gap: 2 },
    barColumn: { flex: 1, height: '100%', alignItems: 'center', minWidth: 0 },
    barValue: { color: C.muted, fontSize: 11, fontFamily: FontFamily.extraBold, lineHeight: 16 },
    barValuePeak: { color: C.primary },
    barValueDense: { fontSize: 9 },
    barArea: { flex: 1, width: '100%', justifyContent: 'flex-end', paddingTop: 4 },
    bar: { width: '100%', borderRadius: Radii.xs },
    barRegular: { backgroundColor: C.primaryLine },
    barPeak: { backgroundColor: C.primary },
    barLabel: { color: C.ink2, fontSize: 11, fontFamily: FontFamily.semiBold, lineHeight: 16, marginTop: 4 },
    barLabelDense: { fontSize: 9 },
    emptyChart: { height: 148, justifyContent: 'center', alignItems: 'center' },
    emptyText: { color: C.muted, fontSize: 14 },

    sectionLabel: {
      fontSize: 12, fontFamily: FontFamily.semiBold, color: C.ink2,
      marginHorizontal: Spacing.lg, marginTop: 20, marginBottom: 9,
    },
    momentumCard: { marginHorizontal: Spacing.lg, flexDirection: 'row', backgroundColor: C.surface, borderRadius: Radii.lg, borderWidth: 1, borderColor: C.line, ...Shadows.light },
    momentumHalf: { flex: 1, padding: 14 },
    momentumValue: { color: C.primary, fontSize: 34, fontFamily: FontFamily.extraBold, letterSpacing: -1 },
    rankCard: { marginHorizontal: Spacing.lg, padding: 14, backgroundColor: C.surface, borderRadius: Radii.lg, borderWidth: 1, borderColor: C.line, ...Shadows.light },
    rankHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
    rankName: { color: C.inkDark, fontSize: 18, fontFamily: FontFamily.extraBold },
    rankStars: { color: C.primary, fontSize: 13, fontFamily: FontFamily.bold, marginTop: 2 },
    rankNext: { flex: 1, color: C.muted, fontSize: 12, fontFamily: FontFamily.semiBold, textAlign: 'right' },
    rankTrack: { height: 7, marginTop: 12, backgroundColor: C.surface2, borderRadius: Radii.pill, overflow: 'hidden' },
    rankFill: { height: '100%', backgroundColor: C.primary, borderRadius: Radii.pill },
    emptyEncouragement: { marginHorizontal: Spacing.lg, marginTop: 12, color: C.ink2, fontSize: 13, lineHeight: 19, textAlign: 'center' },
    statGrid: {
      marginHorizontal: Spacing.lg, flexDirection: 'row', flexWrap: 'wrap', gap: 10,
    },
    stat: {
      width: '47%', backgroundColor: C.surface,
      borderRadius: Radii.md, padding: 12, borderWidth: 1, borderColor: C.line, ...Shadows.light,
    },
    statV: { fontSize: 28, fontFamily: FontFamily.extraBold, letterSpacing: -0.8, color: C.primary, marginTop: 4 },
    statVPeak: { color: C.primary }, statUnit: { fontSize: 12, letterSpacing: 0, color: C.ink2 },
    statL: { fontSize: 11, color: C.ink2, fontFamily: FontFamily.bold, marginTop: 2 },

    logHeader: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      marginHorizontal: Spacing.lg, marginTop: 20, marginBottom: 6,
    },
    filterRow: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      marginHorizontal: Spacing.lg, marginBottom: 9,
    },
    filterChip: {
      flexDirection: 'row', alignItems: 'center', minHeight: 44,
      backgroundColor: C.surface2, borderRadius: Radii.pill,
      paddingHorizontal: 12, paddingVertical: 5,
      borderWidth: 1, borderColor: C.line2,
    },
    filterChipText: { fontSize: 12, fontFamily: FontFamily.semiBold, color: C.inkDark },
    filterClearText: { fontSize: 14, color: C.muted, fontFamily: FontFamily.bold, paddingHorizontal: 4 },
    logActions: { flexDirection: 'row', gap: 8 },
    logActionBtn: {
      minHeight: 44, justifyContent: 'center',
      paddingHorizontal: 10, paddingVertical: 5,
      backgroundColor: C.surface2, borderRadius: Radii.sm,
      borderWidth: 1, borderColor: C.line2,
    },
    logActionTxt: { fontSize: 12, fontFamily: FontFamily.bold, color: C.inkDark },
    logDeleteBtn: { borderColor: C.danger, backgroundColor: C.dangerSoft },
    logDeleteTxt: { fontSize: 12, fontFamily: FontFamily.bold, color: C.danger },
    logCard: {
      marginHorizontal: Spacing.lg, backgroundColor: C.surface,
      borderRadius: Radii.lg, borderWidth: 1, borderColor: C.line,
      paddingHorizontal: 15, ...Shadows.light,
    },
    logRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingVertical: 11, borderBottomWidth: 1, borderColor: C.line,
    },
    logRowLast: { borderBottomWidth: 0 },
    logRowSelected: { backgroundColor: C.primarySoft },
    logBody: { flex: 1, minWidth: 0 },
    logName: { fontSize: 13.5, fontFamily: FontFamily.semiBold, color: C.inkDark },
    logDate: { fontSize: 11, color: C.ink2, marginTop: 2 },
    logStars: { fontSize: 13, fontFamily: FontFamily.extraBold, color: C.primary, flexShrink: 0 },
    logStarsBad: { color: C.danger },
    logEmptyWrap: {
      alignItems: 'center', paddingVertical: 24, marginHorizontal: Spacing.lg,
    },
    logEmpty: {
      textAlign: 'center', color: C.ink2, fontSize: 13,
      marginBottom: 14,
    },
    logEmptyCta: {
      paddingHorizontal: 20, paddingVertical: 10,
      backgroundColor: C.primary, borderRadius: Radii.pill,
    },
    logEmptyCtaTxt: {
      fontSize: 13, fontFamily: FontFamily.bold, color: C.white,
    },
    topCard: {
      marginHorizontal: Spacing.lg,
      backgroundColor: C.surface,
      borderRadius: Radii.lg,
      borderWidth: 1,
      borderColor: C.line,
      ...Shadows.light,
      overflow: 'hidden',
    },
    topRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 11,
      borderBottomWidth: 1,
      borderColor: C.line,
      gap: 10,
    },
    topRowLast: { borderBottomWidth: 0 },
    topName: { width: 90, fontSize: 13, fontFamily: FontFamily.semiBold, color: C.inkDark },
    topBarTrack: {
      flex: 1,
      height: 6,
      backgroundColor: C.surface2,
      borderRadius: 3,
      overflow: 'hidden',
    },
    topBarFill: {
      height: 6,
      backgroundColor: C.primary,
      borderRadius: 3,
    },
    topCount: { width: 42, fontSize: 12, fontFamily: FontFamily.bold, color: C.muted, textAlign: 'right' },
    checkbox: {
      width: 22, height: 22, borderRadius: 11,
      borderWidth: 2, borderColor: C.line2,
      justifyContent: 'center', alignItems: 'center', flexShrink: 0,
    },
    checkboxSelected: { borderColor: C.primary, backgroundColor: C.primary },
    checkmark: { fontSize: 13, fontFamily: FontFamily.extraBold, color: C.white },
  });
}
