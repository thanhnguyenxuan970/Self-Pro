import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { VictoryChart, VictoryBar, VictoryStack, VictoryAxis } from 'victory-native';
import { useProgressData, useStreakCount, useStarsToNextTier, useAllTimeStats } from '../queries/useProgress';
import { getRangeLabel } from '../logic/formatters';
import { Colors, Typography, Radii, Spacing } from '../theme';
import { useAuthUser } from '../hooks/useAuth';

type Range = 'D' | 'W' | 'M' | 'Y';
const RANGES: Range[] = ['D', 'W', 'M', 'Y'];

function formatBucket(bucket: string, range: Range): string {
  if (range === 'D') return `${bucket}h`;
  if (range === 'W') {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const d = new Date(bucket + 'T00:00:00');
    return days[d.getDay()];
  }
  if (range === 'M') return bucket.slice(8);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return months[parseInt(bucket.slice(5, 7), 10) - 1];
}

export function ProgressScreen() {
  const userId = useAuthUser();
  const [range, setRange] = useState<Range>('W');
  const { data: chartData = [], isLoading } = useProgressData(userId, range);
  const { data: streak = 0 } = useStreakCount(userId);
  const { data: tierInfo } = useStarsToNextTier(userId);
  const { data: allTime } = useAllTimeStats(userId);
  const rangeLabel = getRangeLabel(range);

  const goodData = chartData.map((r, i) => ({ x: i + 1, y: r.goodStars }));
  const badData  = chartData.map((r, i) => ({ x: i + 1, y: r.badStars }));

  return (
    <ScrollView style={s.container} contentContainerStyle={{ paddingBottom: 32 }}>
      {/* Range Toggle */}
      <View style={s.toggle}>
        {RANGES.map(r => (
          <TouchableOpacity
            key={r}
            style={[s.toggleBtn, range === r && s.toggleActive]}
            onPress={() => setRange(r)}
          >
            <Text style={[s.toggleTxt, range === r && s.toggleActiveTxt]}>{r}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Date range label */}
      <Text style={s.rangeLabel}>{rangeLabel}</Text>

      {/* Chart */}
      <View style={s.chartWrap}>
        {isLoading ? (
          <ActivityIndicator color={Colors.primary} />
        ) : chartData.length === 0 ? (
          <Text style={s.empty}>Chưa có hoạt động nào</Text>
        ) : (
          <VictoryChart height={220} padding={{ top: 20, bottom: 40, left: 40, right: 20 }}>
            <VictoryAxis
              tickValues={chartData.map((_, i) => i + 1)}
              tickFormat={(t: number) => formatBucket(chartData[t - 1]?.bucket ?? '', range)}
              style={{ axis: { stroke: Colors.line2 }, tickLabels: { fill: Colors.muted, fontSize: 10 } }}
            />
            <VictoryAxis dependentAxis style={{ axis: { stroke: Colors.line2 }, tickLabels: { fill: Colors.muted, fontSize: 10 } }} />
            <VictoryStack colorScale={[Colors.primary, Colors.danger]}>
              <VictoryBar data={goodData} />
              <VictoryBar data={badData} />
            </VictoryStack>
          </VictoryChart>
        )}
      </View>

      {/* StatStrip */}
      <View style={s.strip}>
        <StatBox label="🔥 Streak" value={`${streak}d`} />
        <StatBox label="★ Tuần này" value={String(tierInfo?.currentStars ?? 0)} />
        <StatBox label="🎯 Đến hạng" value={tierInfo?.starsNeeded ? `${Math.ceil(tierInfo.starsNeeded)}★` : 'MAX'} />
      </View>

      {/* All-time stats */}
      <Text style={s.stripTitle}>Tổng cộng</Text>
      <View style={s.strip}>
        <StatBox label="📋 Hoạt động" value={String(allTime?.totalActivities ?? 0)} />
        <StatBox label="⭐ Sao" value={String(allTime?.totalStars ?? 0)} />
        <StatBox label="🏆 Streak cao" value={`${allTime?.bestStreak ?? 0}d`} />
      </View>
    </ScrollView>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.statBox}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={s.statValue}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgBase, paddingTop: Spacing.md },
  toggle: { flexDirection: 'row', justifyContent: 'center', marginBottom: 12, gap: 8 },
  toggleBtn: { paddingHorizontal: 20, paddingVertical: 8, borderRadius: Radii.pill, backgroundColor: Colors.surface2, borderWidth: 1, borderColor: Colors.line },
  toggleActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  toggleTxt: { color: Colors.muted, fontWeight: '600' },
  toggleActiveTxt: { color: Colors.white },
  chartWrap: { alignItems: 'center', height: 240, justifyContent: 'center', backgroundColor: Colors.surface },
  empty: { color: Colors.muted, fontSize: 14 },
  strip: { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: Spacing.md, paddingTop: Spacing.md },
  statBox: { alignItems: 'center', flex: 1 },
  statLabel: { ...Typography.caption, color: Colors.muted, marginBottom: 4 },
  statValue: { ...Typography.large, color: Colors.inkDark },
  rangeLabel: { textAlign: 'center', ...Typography.caption, color: Colors.muted, marginTop: 4, marginBottom: 8 },
  stripTitle: { ...Typography.sectionLabel, color: Colors.muted, paddingHorizontal: Spacing.lg, marginTop: Spacing.sm },
});
