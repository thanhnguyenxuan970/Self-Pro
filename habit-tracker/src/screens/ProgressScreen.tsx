import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView, Alert, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { VictoryChart, VictoryBar, VictoryStack, VictoryAxis } from 'victory-native';
import {
  useProgressData, useStreakCount, useStarsToNextTier,
  useRecentActivityLogs, useDeleteActivityLogs, useWeeklyConsistency, useTopActivities,
  ActivityLogEntry,
} from '../queries/useProgress';
import { Radii, Spacing, Shadows, AppColors } from '../config/theme';
import { useAuthUser } from '../hooks/useAuth';
import { useTheme, useTranslations } from '../hooks/useSettings';
import { useSelectionMode } from '../hooks/useSelectionMode';

type Range = 'W' | 'M' | 'Y';

type ProgStyles = ReturnType<typeof makeStyles>;
type ProgTranslations = ReturnType<typeof useTranslations>;

// fallow-ignore-next-line complexity
function ProgressLogRow({ item, isLast, selectionMode, selected, toggleSelect, enterSelection, bonusDay, timeLocale, styles }: {
  item: ActivityLogEntry; isLast: boolean; selectionMode: boolean; selected: boolean;
  toggleSelect: (id: number) => void; enterSelection: (id: number) => void;
  bonusDay: string; timeLocale: string; styles: ProgStyles;
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
          {item.task_name ?? (item.source === 'BONUS' ? bonusDay : item.source)}
        </Text>
        <Text style={styles.logDate}>{item.local_date} · {timeStr}</Text>
      </View>
      <Text style={[styles.logStars, item.stars_delta < 0 && styles.logStarsBad]}>
        {item.stars_delta >= 0 ? '+' : ''}{item.stars_delta.toFixed(1)} ★
      </Text>
    </TouchableOpacity>
  );
}

function ActivityLogSection({ actLogs, selectionMode, selectedIds, selectAll, cancelSelection, enterSelection, toggleSelect, handleDeleteSelected, deleteLogs, t, styles }: {
  actLogs: ActivityLogEntry[]; selectionMode: boolean; selectedIds: Set<number>;
  selectAll: () => void; cancelSelection: () => void;
  enterSelection: (id: number) => void; toggleSelect: (id: number) => void;
  handleDeleteSelected: () => void; deleteLogs: { isPending: boolean };
  t: ProgTranslations; styles: ProgStyles;
}) {
  return (
    <>
      <View style={styles.logHeader}>
        <Text style={[styles.sectionLabel, { marginHorizontal: 0 }]}>{t.activityLogSection}</Text>
        {selectionMode ? (
          <View style={styles.logActions}>
            <TouchableOpacity onPress={selectAll} style={styles.logActionBtn}>
              <Text style={styles.logActionTxt}>{t.all}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleDeleteSelected}
              style={[styles.logActionBtn, styles.logDeleteBtn]}
              disabled={selectedIds.size === 0 || deleteLogs.isPending}
            >
              <Text style={styles.logDeleteTxt}>{t.deleteCount(selectedIds.size)}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={cancelSelection} style={styles.logActionBtn}>
              <Text style={styles.logActionTxt}>{t.cancel}</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
      {actLogs.length === 0 ? (
        <Text style={styles.logEmpty}>{t.noActivityYet}</Text>
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
              styles={styles}
            />
          ))}
        </View>
      )}
    </>
  );
}

export function ProgressScreen() {
  const userId = useAuthUser();
  const { colors } = useTheme();
  const t = useTranslations();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const { width: windowWidth } = useWindowDimensions();
  const chartWidth = windowWidth - 70;

  const [range, setRange] = useState<Range>('Y');
  const { data: chartData = [], isLoading } = useProgressData(userId, range, 0);
  const { data: streak = 0 } = useStreakCount(userId);
  const { data: tierInfo } = useStarsToNextTier(userId);
  const { data: activeDays = 0 } = useWeeklyConsistency(userId);
  const { data: topActivities = [] } = useTopActivities(userId);
  const { data: actLogs = [] } = useRecentActivityLogs(userId);
  const deleteLogs = useDeleteActivityLogs(userId);

  const { selectionMode, selectedIds, enterSelection, toggleSelect, selectAll, cancelSelection } = useSelectionMode(actLogs);

  const RANGES = useMemo(() => [
    { key: 'W' as Range, label: t.rangeWeek },
    { key: 'M' as Range, label: t.rangeMonth },
    { key: 'Y' as Range, label: t.rangeYear },
  ], [t.rangeWeek, t.rangeMonth, t.rangeYear]);

  const formatBucket = useCallback((bucket: string, r: Range): string => {
    if (r === 'W') {
      const d = new Date(bucket + 'T00:00:00');
      return t.dayAbbr[d.getDay()] ?? bucket;
    }
    if (r === 'M') return bucket.slice(8);
    return bucket; // 'Y': bucket is "2026", "2027" etc.
  }, [t.dayAbbr]);


  function handleDeleteSelected() {
    const ids = Array.from(selectedIds);
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

  const tickFormat = useCallback(
    (tv: number) => formatBucket(chartData[tv - 1]?.bucket ?? '', range),
    [chartData, range, formatBucket],
  );

  const { totalSum, goodData, badData, tickValues } = useMemo(() => {
    let sum = 0;
    const good: { x: number; y: number }[] = [];
    const bad: { x: number; y: number }[] = [];
    const ticks: number[] = [];
    chartData.forEach((r, i) => {
      sum += r.goodStars + r.badStars;
      good.push({ x: i + 1, y: r.goodStars });
      bad.push({ x: i + 1, y: r.badStars });
      ticks.push(i + 1);
    });
    return { totalSum: sum, goodData: good, badData: bad, tickValues: ticks };
  }, [chartData]);

  // Decimate ticks for dense ranges so X-axis labels don't overlap
  const visibleTicks = useMemo(() => {
    if (range === 'M') {
      const step = tickValues.length <= 10 ? 3 : 5;
      const sparse = tickValues.filter((_, i) => i % step === 0);
      const last = tickValues[tickValues.length - 1];
      // append last only when the gap is more than half a step to avoid crowding
      return last - sparse[sparse.length - 1] > step / 2 ? [...sparse, last] : sparse;
    }
    return tickValues;
  }, [range, tickValues]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 32 }}>
        <Text style={styles.title}>{t.analyticsTitle}</Text>

        {/* Segmented control */}
        <View style={styles.segbar}>
          {RANGES.map(({ key, label }) => (
            <TouchableOpacity
              key={key}
              style={[styles.segBtn, range === key && styles.segBtnActive]}
              onPress={() => setRange(key)}
            >
              <Text style={[styles.segTxt, range === key && styles.segTxtActive]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Chart card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>{t.chartTitle}</Text>
            <Text style={styles.chartSum}>Σ {totalSum}</Text>
          </View>
          <View style={styles.chartWrap}>
            {isLoading ? (
              <ActivityIndicator color={colors.primary} />
            ) : chartData.length === 0 || totalSum === 0 ? (
              <View style={styles.emptyChart}>
                <Text style={styles.emptyText}>{t.noActivityYet}</Text>
              </View>
            ) : (
              <VictoryChart
                width={chartWidth}
                height={190}
                padding={{ top: 10, bottom: 36, left: 36, right: 12 }}
                domainPadding={{ x: [20, 10] }}
                animate={false}
              >
                <VictoryAxis
                  tickValues={visibleTicks}
                  tickFormat={tickFormat}
                  style={{ axis: { stroke: colors.line2 }, tickLabels: { fill: colors.muted, fontSize: 9.5, fontWeight: '600' } }}
                />
                <VictoryAxis dependentAxis style={{ axis: { stroke: colors.line2 }, tickLabels: { fill: colors.muted, fontSize: 9.5 } }} />
                <VictoryStack colorScale={[colors.primary, colors.danger]}>
                  <VictoryBar data={goodData} />
                  <VictoryBar data={badData} />
                </VictoryStack>
              </VictoryChart>
            )}
          </View>
        </View>

        {/* Stats */}
        <Text style={styles.sectionLabel}>{t.statsSection}</Text>
        <View style={styles.statGrid}>
          <View style={styles.stat}>
            <Text style={styles.statV}>{tierInfo?.currentStars ?? 0} ★</Text>
            <Text style={styles.statL}>{t.starsThisWeek}</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statV}>{streak} 🔥</Text>
            <Text style={styles.statL}>{t.currentStreak}</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statV}>
              {tierInfo?.starsNeeded ? `${Math.ceil(tierInfo.starsNeeded)} ★` : 'MAX'}
            </Text>
            <Text style={styles.statL}>{t.toNextRank}</Text>
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
                    <Text style={styles.topName} numberOfLines={1}>{item.name}</Text>
                    <View style={styles.topBarTrack}>
                      <View style={[styles.topBarFill, { width: `${pct}%` }]} />
                    </View>
                    <Text style={styles.topCount}>{t.times(item.count)}</Text>
                  </View>
                );
              })}
            </View>
          </>
        )}

        {/* Activity log */}
        <ActivityLogSection
          actLogs={actLogs}
          selectionMode={selectionMode}
          selectedIds={selectedIds}
          selectAll={selectAll}
          cancelSelection={cancelSelection}
          enterSelection={enterSelection}
          toggleSelect={toggleSelect}
          handleDeleteSelected={handleDeleteSelected}
          deleteLogs={deleteLogs}
          t={t}
          styles={styles}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: C.bgBase },
    container: { flex: 1 },
    title: { fontSize: 24, fontWeight: '800', letterSpacing: -0.5, color: C.inkDark, marginHorizontal: Spacing.lg, marginTop: 10, marginBottom: 14 },

    segbar: {
      flexDirection: 'row', marginHorizontal: Spacing.lg, marginBottom: 14,
      backgroundColor: C.surface2, borderRadius: Radii.md, padding: 3,
    },
    segBtn: {
      flex: 1, paddingVertical: 9, borderRadius: Radii.sm, alignItems: 'center',
    },
    segBtnActive: {
      backgroundColor: C.surface,
      shadowColor: '#14231A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 2, elevation: 1,
    },
    segTxt: { fontSize: 12, fontWeight: '700', color: C.muted },
    segTxtActive: { color: C.inkDark },

    card: {
      marginHorizontal: Spacing.lg, backgroundColor: C.surface,
      borderRadius: Radii.lg, padding: 15, borderWidth: 1, borderColor: C.line, ...Shadows.light,
    },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    cardTitle: { fontSize: 13, fontWeight: '800', color: C.inkDark },
    chartSum: { fontSize: 11, color: C.muted },
    chartWrap: { marginTop: 4 },
    emptyChart: { height: 148, justifyContent: 'center', alignItems: 'center' },
    emptyText: { color: C.muted, fontSize: 14 },

    sectionLabel: {
      fontSize: 11, fontWeight: '700', color: C.primary,
      textTransform: 'uppercase', letterSpacing: 0.7,
      marginHorizontal: Spacing.lg, marginTop: 20, marginBottom: 9,
    },
    statGrid: {
      marginHorizontal: Spacing.lg, flexDirection: 'row', flexWrap: 'wrap', gap: 10,
    },
    stat: {
      width: '47%', backgroundColor: C.surface,
      borderRadius: Radii.md, padding: 12, borderWidth: 1, borderColor: C.line, ...Shadows.light,
    },
    statV: { fontSize: 20, fontWeight: '800', letterSpacing: -0.5, color: C.primary },
    statL: { fontSize: 11, color: C.muted, fontWeight: '700', marginTop: 2 },

    logHeader: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      marginHorizontal: Spacing.lg, marginTop: 20, marginBottom: 9,
    },
    logActions: { flexDirection: 'row', gap: 8 },
    logActionBtn: {
      paddingHorizontal: 10, paddingVertical: 5,
      backgroundColor: C.surface2, borderRadius: Radii.sm,
      borderWidth: 1, borderColor: C.line2,
    },
    logActionTxt: { fontSize: 12, fontWeight: '700', color: C.inkDark },
    logDeleteBtn: { borderColor: C.danger, backgroundColor: C.dangerSoft },
    logDeleteTxt: { fontSize: 12, fontWeight: '700', color: C.danger },
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
    logName: { fontSize: 13.5, fontWeight: '600', color: C.inkDark },
    logDate: { fontSize: 11, color: C.muted, marginTop: 2 },
    logStars: { fontSize: 13, fontWeight: '800', color: C.primary, flexShrink: 0 },
    logStarsBad: { color: C.danger },
    logEmpty: {
      textAlign: 'center', color: C.muted, fontSize: 13,
      marginHorizontal: Spacing.lg, marginTop: 4,
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
    topName: { width: 90, fontSize: 13, fontWeight: '600', color: C.inkDark },
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
    topCount: { width: 42, fontSize: 12, fontWeight: '700', color: C.muted, textAlign: 'right' },
    checkbox: {
      width: 22, height: 22, borderRadius: 11,
      borderWidth: 2, borderColor: C.line2,
      justifyContent: 'center', alignItems: 'center', flexShrink: 0,
    },
    checkboxSelected: { borderColor: C.primary, backgroundColor: C.primary },
    checkmark: { fontSize: 13, fontWeight: '800', color: C.white },
  });
}
