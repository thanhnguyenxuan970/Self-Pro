import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { VictoryChart, VictoryBar, VictoryStack, VictoryAxis } from 'victory-native';
import { useProgressData, useStreakCount, useStarsToNextTier, useAllTimeStats } from '../queries/useProgress';
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
});
