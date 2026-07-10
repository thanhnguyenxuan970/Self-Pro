import React, { useMemo, useRef } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppColors, FontFamily, Radii, Shadows, Spacing } from '../config/theme';
import { HeatmapDay, buildHeatmapWeeks } from '../utils/heatmap';

type Props = { days: HeatmapDay[]; streak: number; goal: number; colors: AppColors };

export function HomeHeatmap({ days, streak, goal, colors }: Props) {
  const scrollRef = useRef<ScrollView>(null);
  const weeks = useMemo(() => buildHeatmapWeeks(days, goal), [days, goal]);
  const activeDays = days.filter(day => day.total_points > 0).length;
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const shades = [colors.surface3, colors.primarySoft, colors.primary + '99', colors.primary, colors.primaryHover];

  return <View style={styles.card}>
    <View style={styles.header}>
      <View>
        <Text style={styles.eyebrow}>LƯỚI CẢ NĂM</Text>
        <View style={styles.totalRow}><Text style={styles.total}>{activeDays}</Text><Text style={styles.totalLabel}>ngày đã lấp</Text></View>
      </View>
      <View style={styles.streak}><Text style={styles.streakText}>🔥 {streak}</Text></View>
    </View>
    <View style={styles.gridRow}>
      <View style={styles.rail}>{['T2', '', 'T4', '', 'T6', '', ''].map((label, i) => <Text key={i} style={styles.dayLabel}>{label}</Text>)}</View>
      <ScrollView ref={scrollRef} horizontal showsHorizontalScrollIndicator={false} onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}>
        <View>
          <View style={styles.months}>{weeks.map((week, i) => <Text key={i} style={styles.month}>{week.find(cell => cell.month)?.month ?? ''}</Text>)}</View>
          <View style={styles.weeks}>{weeks.map((week, i) => <View key={i} style={styles.week}>{week.map((cell, j) => <View key={`${cell.date}-${j}`} style={[styles.cell, { backgroundColor: cell.date ? shades[cell.level] : 'transparent' }]} />)}</View>)}</View>
        </View>
      </ScrollView>
    </View>
    <View style={styles.legend}><Text style={styles.legendLabel}>Ít</Text>{shades.map((color, i) => <View key={i} style={[styles.legendCell, { backgroundColor: color }]} />)}<Text style={styles.legendLabel}>Nhiều</Text></View>
  </View>;
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    card: { marginHorizontal: Spacing.lg, marginTop: 14, padding: Spacing.lg, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: Radii.xl, ...Shadows.light },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.md },
    eyebrow: { color: C.primary, fontSize: 12, fontFamily: FontFamily.extraBold, letterSpacing: 0.4 },
    totalRow: { flexDirection: 'row', alignItems: 'baseline', gap: 7, marginTop: 2 },
    total: { color: C.inkDark, fontSize: 48, lineHeight: 54, letterSpacing: -2.5, fontFamily: FontFamily.extraBold },
    totalLabel: { color: C.muted, fontSize: 12, fontFamily: FontFamily.medium },
    streak: { backgroundColor: C.surface2, borderRadius: Radii.pill, paddingHorizontal: 10, paddingVertical: 7 },
    streakText: { color: C.inkDark, fontSize: 13, fontFamily: FontFamily.bold },
    gridRow: { flexDirection: 'row' },
    rail: { width: 22, marginTop: 19, gap: 3 },
    dayLabel: { height: 13, color: C.faint, fontSize: 9, lineHeight: 13, fontFamily: FontFamily.semiBold },
    months: { height: 19, flexDirection: 'row', gap: 3 },
    month: { width: 13, color: C.faint, fontSize: 9, fontFamily: FontFamily.semiBold },
    weeks: { flexDirection: 'row', gap: 3 },
    week: { gap: 3 },
    cell: { width: 13, height: 13, borderRadius: 3 },
    legend: { marginTop: Spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
    legendLabel: { color: C.faint, fontSize: 10, fontFamily: FontFamily.medium },
    legendCell: { width: 11, height: 11, borderRadius: 3 },
  });
}
