import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { VictoryChart, VictoryBar, VictoryStack, VictoryAxis } from 'victory-native';
import {
  useProgressData, useStreakCount, useStarsToNextTier, useAllTimeStats,
  useRecentActivityLogs, useDeleteActivityLogs, ActivityLogEntry,
} from '../queries/useProgress';
import { Radii, Spacing, Shadows, AppColors } from '../config/theme';
import { useAuthUser } from '../hooks/useAuth';
import { useTheme, useTranslations } from '../hooks/useSettings';

type Range = 'D' | 'W' | 'M' | 'Y';

export function ProgressScreen() {
  const userId = useAuthUser();
  const { colors } = useTheme();
  const t = useTranslations();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [range, setRange] = useState<Range>('W');
  const [offset, setOffset] = useState(0);
  const { data: chartData = [], isLoading } = useProgressData(userId, range, offset);
  const { data: streak = 0 } = useStreakCount(userId);
  const { data: tierInfo } = useStarsToNextTier(userId);
  const { data: allTime } = useAllTimeStats(userId);
  const { data: actLogs = [] } = useRecentActivityLogs(userId);
  const deleteLogs = useDeleteActivityLogs(userId);

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const RANGES: { key: Range; label: string }[] = [
    { key: 'D', label: t.rangeDay },
    { key: 'W', label: t.rangeWeek },
    { key: 'M', label: t.rangeMonth },
    { key: 'Y', label: t.rangeYear },
  ];

  function formatBucket(bucket: string, r: Range): string {
    if (r === 'D') return `${bucket}h`;
    if (r === 'W') {
      const d = new Date(bucket + 'T00:00:00');
      return t.dayAbbr[d.getDay()];
    }
    if (r === 'M') return bucket.slice(8);
    const months = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
    return months[parseInt(bucket.slice(5, 7), 10) - 1];
  }

  const enterSelection = useCallback((id: number) => {
    setSelectionMode(true);
    setSelectedIds(new Set([id]));
  }, []);

  const toggleSelect = useCallback((id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(actLogs.map(l => l.id)));
  }, [actLogs]);

  const cancelSelection = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

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

  const totalSum = chartData.reduce((s, r) => s + r.goodStars + r.badStars, 0);
  const goodData = chartData.map((r, i) => ({ x: i + 1, y: r.goodStars }));
  const badData  = chartData.map((r, i) => ({ x: i + 1, y: r.badStars }));

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
              onPress={() => { setRange(key); setOffset(0); }}
            >
              <Text style={[styles.segTxt, range === key && styles.segTxtActive]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Period navigation */}
        <View style={styles.periodNav}>
          <TouchableOpacity style={styles.navBtn} onPress={() => setOffset(o => o - 1)}>
            <Text style={styles.navBtnText}>{t.prevPeriod}</Text>
          </TouchableOpacity>
          {offset !== 0 && (
            <TouchableOpacity style={styles.navCurrent} onPress={() => setOffset(0)}>
              <Text style={styles.navCurrentText}>{t.currentPeriod}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.navBtn, offset === 0 && styles.navBtnDisabled]}
            onPress={() => setOffset(o => Math.min(0, o + 1))}
            disabled={offset === 0}
          >
            <Text style={[styles.navBtnText, offset === 0 && styles.navBtnTextDisabled]}>{t.nextPeriod}</Text>
          </TouchableOpacity>
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
            ) : chartData.length === 0 ? (
              <View style={styles.emptyChart}>
                <Text style={styles.emptyText}>{t.noActivityYet}</Text>
              </View>
            ) : (
              <VictoryChart height={190} padding={{ top: 10, bottom: 36, left: 36, right: 12 }}>
                <VictoryAxis
                  tickValues={chartData.map((_, i) => i + 1)}
                  tickFormat={(tv: number) => formatBucket(chartData[tv - 1]?.bucket ?? '', range)}
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

        {/* Stats overview */}
        <Text style={styles.sectionLabel}>{t.overviewSection}</Text>
        <View style={styles.statGrid}>
          <View style={styles.stat}>
            <Text style={styles.statV}>{tierInfo?.currentStars ?? 0} ★</Text>
            <Text style={styles.statL}>{t.starsThisWeek}</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statV}>{streak} 🔥</Text>
            <Text style={styles.statL}>{t.longestStreak}</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statV}>
              {tierInfo?.starsNeeded ? `${Math.ceil(tierInfo.starsNeeded)} ★` : 'MAX'}
            </Text>
            <Text style={styles.statL}>{t.toNextRank}</Text>
          </View>
        </View>

        {/* All-time */}
        <Text style={styles.sectionLabel}>{t.allTimeSection}</Text>
        <View style={styles.statGrid}>
          <View style={styles.stat}>
            <Text style={styles.statV}>{allTime?.totalActivities ?? 0}</Text>
            <Text style={styles.statL}>{t.activities}</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statV}>{allTime?.totalStars ?? 0} ★</Text>
            <Text style={styles.statL}>{t.totalStars}</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statV}>{allTime?.bestStreak ?? 0} 🔥</Text>
            <Text style={styles.statL}>{t.bestStreak}</Text>
          </View>
        </View>

        {/* Activity log */}
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
            {actLogs.map((item: ActivityLogEntry, idx: number) => {
              const selected = selectedIds.has(item.id);
              const isLast = idx === actLogs.length - 1;
              const timeStr = new Date(item.logged_at).toLocaleTimeString(t.timeLocale, { hour: '2-digit', minute: '2-digit' });
              return (
                <TouchableOpacity
                  key={item.id}
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
                      {item.task_name ?? (item.source === 'BONUS' ? t.bonusDay : item.source)}
                    </Text>
                    <Text style={styles.logDate}>{item.local_date} · {timeStr}</Text>
                  </View>
                  <Text style={[styles.logStars, item.stars_delta < 0 && styles.logStarsBad]}>
                    {item.stars_delta >= 0 ? '+' : ''}{item.stars_delta.toFixed(1)} ★
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
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

    periodNav: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      marginHorizontal: Spacing.lg, marginBottom: 10,
    },
    navBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: Radii.md, backgroundColor: C.surface },
    navBtnDisabled: { opacity: 0.3 },
    navBtnText: { fontSize: 20, color: C.inkDark, fontWeight: '600' },
    navBtnTextDisabled: { color: C.muted },
    navCurrent: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radii.sm, backgroundColor: C.primary + '22' },
    navCurrentText: { fontSize: 12, color: C.primary, fontWeight: '600' },

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
      flex: 1, minWidth: '45%', backgroundColor: C.surface,
      borderRadius: Radii.md, padding: 14, borderWidth: 1, borderColor: C.line, ...Shadows.light,
    },
    statV: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5, color: C.primary },
    statL: { fontSize: 11, color: C.muted, fontWeight: '700', marginTop: 3 },

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
    checkbox: {
      width: 22, height: 22, borderRadius: 11,
      borderWidth: 2, borderColor: C.line2,
      justifyContent: 'center', alignItems: 'center', flexShrink: 0,
    },
    checkboxSelected: { borderColor: C.primary, backgroundColor: C.primary },
    checkmark: { fontSize: 13, fontWeight: '800', color: C.white },
  });
}
