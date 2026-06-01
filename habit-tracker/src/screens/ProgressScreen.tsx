import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { VictoryChart, VictoryBar, VictoryStack, VictoryAxis } from 'victory-native';
import {
  useProgressData, useStreakCount, useStarsToNextTier, useAllTimeStats,
  useRecentActivityLogs, useDeleteActivityLogs, ActivityLogEntry,
} from '../queries/useProgress';
import { getRangeLabel } from '../logic/formatters';
import { Colors, Radii, Spacing, Shadows } from '../theme';
import { useAuthUser } from '../hooks/useAuth';

type Range = 'D' | 'W' | 'M' | 'Y';
const RANGES: { key: Range; label: string }[] = [
  { key: 'D', label: 'Ngày' },
  { key: 'W', label: 'Tuần' },
  { key: 'M', label: 'Tháng' },
  { key: 'Y', label: 'Năm' },
];

function formatBucket(bucket: string, range: Range): string {
  if (range === 'D') return `${bucket}h`;
  if (range === 'W') {
    const days = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
    const d = new Date(bucket + 'T00:00:00');
    return days[d.getDay()];
  }
  if (range === 'M') return bucket.slice(8);
  const months = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
  return months[parseInt(bucket.slice(5, 7), 10) - 1];
}

export function ProgressScreen() {
  const userId = useAuthUser();
  const [range, setRange] = useState<Range>('W');
  const { data: chartData = [], isLoading } = useProgressData(userId, range);
  const { data: streak = 0 } = useStreakCount(userId);
  const { data: tierInfo } = useStarsToNextTier(userId);
  const { data: allTime } = useAllTimeStats(userId);
  const { data: actLogs = [] } = useRecentActivityLogs(userId);
  const deleteLogs = useDeleteActivityLogs(userId);

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

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
      'Xoá nhật ký',
      `Xoá ${ids.length} mục đã chọn?`,
      [
        { text: 'Huỷ', style: 'cancel' },
        {
          text: 'Xoá', style: 'destructive',
          onPress: () => {
            deleteLogs.mutateAsync(ids)
              .then(cancelSelection)
              .catch(() => Alert.alert('Lỗi', 'Xoá thất bại. Thử lại.'));
          },
        },
      ]
    );
  }

  const totalSum = chartData.reduce((s, r) => s + r.goodStars + r.badStars, 0);
  const goodData = chartData.map((r, i) => ({ x: i + 1, y: r.goodStars }));
  const badData  = chartData.map((r, i) => ({ x: i + 1, y: r.badStars }));

  return (
    <SafeAreaView style={s.safeArea} edges={['top']}>
      <ScrollView style={s.container} contentContainerStyle={{ paddingBottom: 32 }}>
        <Text style={s.title}>Phân tích</Text>

        {/* Segmented control */}
        <View style={s.segbar}>
          {RANGES.map(({ key, label }) => (
            <TouchableOpacity
              key={key}
              style={[s.segBtn, range === key && s.segBtnActive]}
              onPress={() => setRange(key)}
            >
              <Text style={[s.segTxt, range === key && s.segTxtActive]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Chart card */}
        <View style={s.card}>
          <View style={s.cardHeader}>
            <Text style={s.cardTitle}>Điểm theo thời gian</Text>
            <Text style={s.chartSum}>Σ {totalSum}</Text>
          </View>
          <View style={s.chartWrap}>
            {isLoading ? (
              <ActivityIndicator color={Colors.primary} />
            ) : chartData.length === 0 ? (
              <View style={s.emptyChart}>
                <Text style={s.emptyText}>Chưa có hoạt động nào</Text>
              </View>
            ) : (
              <VictoryChart height={190} padding={{ top: 10, bottom: 36, left: 36, right: 12 }}>
                <VictoryAxis
                  tickValues={chartData.map((_, i) => i + 1)}
                  tickFormat={(t: number) => formatBucket(chartData[t - 1]?.bucket ?? '', range)}
                  style={{ axis: { stroke: Colors.line2 }, tickLabels: { fill: Colors.muted, fontSize: 9.5, fontWeight: '600' } }}
                />
                <VictoryAxis dependentAxis style={{ axis: { stroke: Colors.line2 }, tickLabels: { fill: Colors.muted, fontSize: 9.5 } }} />
                <VictoryStack colorScale={[Colors.primary, Colors.danger]}>
                  <VictoryBar data={goodData} />
                  <VictoryBar data={badData} />
                </VictoryStack>
              </VictoryChart>
            )}
          </View>
        </View>

        {/* Stats overview 2x2 */}
        <Text style={s.sectionLabel}>Tổng quan</Text>
        <View style={s.statGrid}>
          <View style={s.stat}>
            <Text style={s.statV}>{tierInfo?.currentStars ?? 0} ★</Text>
            <Text style={s.statL}>Sao tuần này</Text>
          </View>
          <View style={s.stat}>
            <Text style={s.statV}>{allTime?.totalActivities ?? 0}</Text>
            <Text style={s.statL}>Hoạt động</Text>
          </View>
          <View style={s.stat}>
            <Text style={s.statV}>{streak} 🔥</Text>
            <Text style={s.statL}>Streak dài nhất</Text>
          </View>
          <View style={s.stat}>
            <Text style={s.statV}>
              {tierInfo?.starsNeeded ? `${Math.ceil(tierInfo.starsNeeded)} ★` : 'MAX'}
            </Text>
            <Text style={s.statL}>Đến hạng kế</Text>
          </View>
        </View>

        {/* All-time */}
        <Text style={s.sectionLabel}>Toàn thời gian</Text>
        <View style={s.statGrid}>
          <View style={s.stat}>
            <Text style={s.statV}>{allTime?.totalActivities ?? 0}</Text>
            <Text style={s.statL}>Hoạt động</Text>
          </View>
          <View style={s.stat}>
            <Text style={s.statV}>{allTime?.totalStars ?? 0} ★</Text>
            <Text style={s.statL}>Tổng Sao</Text>
          </View>
          <View style={s.stat}>
            <Text style={s.statV}>{allTime?.bestStreak ?? 0} 🔥</Text>
            <Text style={s.statL}>Streak cao nhất</Text>
          </View>
          <View style={[s.stat, { opacity: 0 }]}>
            <Text style={s.statV}>—</Text>
            <Text style={s.statL}> </Text>
          </View>
        </View>

        {/* Activity log */}
        <View style={s.logHeader}>
          <Text style={s.sectionLabel}>NHẬT KÝ HOẠT ĐỘNG</Text>
          {selectionMode ? (
            <View style={s.logActions}>
              <TouchableOpacity onPress={selectAll} style={s.logActionBtn}>
                <Text style={s.logActionTxt}>Tất cả</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleDeleteSelected}
                style={[s.logActionBtn, s.logDeleteBtn]}
                disabled={selectedIds.size === 0 || deleteLogs.isPending}
              >
                <Text style={s.logDeleteTxt}>Xoá ({selectedIds.size})</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={cancelSelection} style={s.logActionBtn}>
                <Text style={s.logActionTxt}>Huỷ</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>

        {actLogs.length === 0 ? (
          <Text style={s.logEmpty}>Chưa có hoạt động nào</Text>
        ) : (
          <View style={s.logCard}>
            {actLogs.map((item: ActivityLogEntry, idx: number) => {
              const selected = selectedIds.has(item.id);
              const isLast = idx === actLogs.length - 1;
              const timeStr = new Date(item.logged_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[s.logRow, isLast && s.logRowLast, selected && s.logRowSelected]}
                  onPress={() => selectionMode ? toggleSelect(item.id) : undefined}
                  onLongPress={() => enterSelection(item.id)}
                  delayLongPress={300}
                  activeOpacity={0.7}
                >
                  {selectionMode && (
                    <View style={[s.checkbox, selected && s.checkboxSelected]}>
                      {selected && <Text style={s.checkmark}>✓</Text>}
                    </View>
                  )}
                  <View style={s.logBody}>
                    <Text style={s.logName} numberOfLines={1}>
                      {item.task_name ?? (item.source === 'BONUS' ? '🎯 Bonus ngày' : item.source)}
                    </Text>
                    <Text style={s.logDate}>{item.local_date} · {timeStr}</Text>
                  </View>
                  <Text style={[s.logStars, item.stars_delta < 0 && s.logStarsBad]}>
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

const s = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.bgBase },
  container: { flex: 1 },
  title: { fontSize: 24, fontWeight: '800', letterSpacing: -0.5, color: Colors.inkDark, marginHorizontal: Spacing.lg, marginTop: 10, marginBottom: 14 },

  segbar: {
    flexDirection: 'row', marginHorizontal: Spacing.lg, marginBottom: 14,
    backgroundColor: Colors.surface2, borderRadius: Radii.md, padding: 3,
  },
  segBtn: {
    flex: 1, paddingVertical: 9, borderRadius: Radii.sm, alignItems: 'center',
  },
  segBtnActive: {
    backgroundColor: Colors.surface,
    shadowColor: '#14231A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 2, elevation: 1,
  },
  segTxt: { fontSize: 12, fontWeight: '700', color: Colors.muted },
  segTxtActive: { color: Colors.inkDark },

  card: {
    marginHorizontal: Spacing.lg, backgroundColor: Colors.surface,
    borderRadius: Radii.lg, padding: 15, borderWidth: 1, borderColor: Colors.line, ...Shadows.light,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 13, fontWeight: '800', color: Colors.inkDark },
  chartSum: { fontSize: 11, color: Colors.muted },
  chartWrap: { marginTop: 4 },
  emptyChart: { height: 148, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: Colors.muted, fontSize: 14 },

  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: Colors.muted,
    textTransform: 'uppercase', letterSpacing: 0.7,
    marginHorizontal: Spacing.lg, marginTop: 20, marginBottom: 9,
  },
  statGrid: {
    marginHorizontal: Spacing.lg, flexDirection: 'row', flexWrap: 'wrap', gap: 10,
  },
  stat: {
    flex: 1, minWidth: '45%', backgroundColor: Colors.surface,
    borderRadius: Radii.md, padding: 14, borderWidth: 1, borderColor: Colors.line, ...Shadows.light,
  },
  statV: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5, color: Colors.inkDark },
  statL: { fontSize: 11, color: Colors.muted, fontWeight: '700', marginTop: 3 },

  logHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginHorizontal: Spacing.lg, marginTop: 20, marginBottom: 9,
  },
  logActions: { flexDirection: 'row', gap: 8 },
  logActionBtn: {
    paddingHorizontal: 10, paddingVertical: 5,
    backgroundColor: Colors.surface2, borderRadius: Radii.sm,
    borderWidth: 1, borderColor: Colors.line2,
  },
  logActionTxt: { fontSize: 12, fontWeight: '700', color: Colors.inkDark },
  logDeleteBtn: { borderColor: Colors.danger, backgroundColor: Colors.dangerSoft },
  logDeleteTxt: { fontSize: 12, fontWeight: '700', color: Colors.danger },
  logCard: {
    marginHorizontal: Spacing.lg, backgroundColor: Colors.surface,
    borderRadius: Radii.lg, borderWidth: 1, borderColor: Colors.line,
    paddingHorizontal: 15, ...Shadows.light,
  },
  logRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 11, borderBottomWidth: 1, borderColor: Colors.line,
  },
  logRowLast: { borderBottomWidth: 0 },
  logRowSelected: { backgroundColor: Colors.primarySoft },
  logBody: { flex: 1, minWidth: 0 },
  logName: { fontSize: 13.5, fontWeight: '600', color: Colors.inkDark },
  logDate: { fontSize: 11, color: Colors.muted, marginTop: 2 },
  logStars: { fontSize: 13, fontWeight: '800', color: Colors.primary, flexShrink: 0 },
  logStarsBad: { color: Colors.danger },
  logEmpty: {
    textAlign: 'center', color: Colors.muted, fontSize: 13,
    marginHorizontal: Spacing.lg, marginTop: 4,
  },
  checkbox: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, borderColor: Colors.line2,
    justifyContent: 'center', alignItems: 'center', flexShrink: 0,
  },
  checkboxSelected: { borderColor: Colors.primary, backgroundColor: Colors.primary },
  checkmark: { fontSize: 13, fontWeight: '800', color: Colors.white },
});
