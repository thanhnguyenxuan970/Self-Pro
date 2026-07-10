import React, { useMemo, useRef, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { AppColors, FontFamily, Radii, Shadows, Spacing } from '../config/theme';
import { HeatmapDay, buildHeatmapWeeks } from '../utils/heatmap';

type Props = { days: HeatmapDay[]; streak: number; goal: number; colors: AppColors; todayPoints?: number };

export function HomeHeatmap({ days, streak, goal, colors, todayPoints }: Props) {
  const scrollRef = useRef<ScrollView>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const weeks = useMemo(() => buildHeatmapWeeks(days, goal), [days, goal]);
  const activeDays = days.filter(day => day.total_points > 0).length;
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const shades = colors.bgBase === '#0F1410'
    ? ['#1A1F1C', '#0E4429', '#006D32', '#00A34A', '#39D36E']
    : ['#EBEDF0', '#9BE9A8', '#40C463', '#30A14E', '#216E39'];
  const pointsByDate = useMemo(() => new Map(days.map(day => [day.local_date, day.total_points])), [days]);
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const selectedPoints = selectedDate ? pointsByDate.get(selectedDate) ?? 0 : 0;
  const progress = todayPoints === undefined ? null : Math.min(todayPoints / goal, 1);

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
          <View style={styles.weeks}>{weeks.map((week, i) => <View key={i} style={styles.week}>{week.map((cell, j) => cell.date ? <TouchableOpacity key={cell.date} style={[styles.cell, { backgroundColor: shades[cell.level] }, cell.date === today && styles.todayCell]} onPress={() => setSelectedDate(cell.date)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`${cell.date}: ${pointsByDate.get(cell.date) ?? 0} points`} /> : <View key={`${cell.date}-${j}`} style={styles.cell} />)}</View>)}</View>
        </View>
      </ScrollView>
    </View>
    {progress !== null && <View style={styles.progress}><View style={[styles.progressFill, { width: `${progress * 100}%` }]} /><Text style={styles.progressLabel}>{Math.max(goal - (todayPoints ?? 0), 0)} điểm để tô đầy hôm nay</Text></View>}
    <View style={styles.legend}><Text style={styles.legendLabel}>Ít</Text>{shades.map((color, i) => <View key={i} style={[styles.legendCell, { backgroundColor: color }]} />)}<Text style={styles.legendLabel}>Nhiều</Text></View>
    <Modal visible={selectedDate !== null} transparent animationType="fade" onRequestClose={() => setSelectedDate(null)}>
      <View style={styles.modal}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setSelectedDate(null)} />
        <View style={styles.sheet}><Text style={styles.sheetDate}>{selectedDate}</Text><Text style={styles.sheetPoints}>{selectedPoints} điểm</Text></View>
      </View>
    </Modal>
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
    gridRow: { flexDirection: 'row' }, rail: { width: 22, marginTop: 19, gap: 3 },
    dayLabel: { height: 13, color: C.faint, fontSize: 9, lineHeight: 13, fontFamily: FontFamily.semiBold },
    months: { height: 19, flexDirection: 'row', gap: 3 }, month: { width: 13, color: C.faint, fontSize: 9, fontFamily: FontFamily.semiBold },
    weeks: { flexDirection: 'row', gap: 3 }, week: { gap: 3 }, cell: { width: 13, height: 13, borderRadius: 3 }, todayCell: { borderWidth: 2, borderColor: C.primary },
    progress: { height: 22, marginTop: Spacing.md, borderRadius: Radii.pill, backgroundColor: C.surface2, overflow: 'hidden', justifyContent: 'center' },
    progressFill: { ...StyleSheet.absoluteFill, backgroundColor: C.primary }, progressLabel: { color: C.inkDark, fontSize: 10, fontFamily: FontFamily.bold, textAlign: 'center' },
    legend: { marginTop: Spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
    legendLabel: { color: C.faint, fontSize: 10, fontFamily: FontFamily.medium }, legendCell: { width: 11, height: 11, borderRadius: 3 },
    modal: { flex: 1, justifyContent: 'flex-end' }, backdrop: { ...StyleSheet.absoluteFill, backgroundColor: '#00000066' },
    sheet: { backgroundColor: C.surface, borderTopLeftRadius: Radii.xl, borderTopRightRadius: Radii.xl, padding: Spacing.xl, alignItems: 'center' },
    sheetDate: { color: C.inkDark, fontSize: 18, fontFamily: FontFamily.bold }, sheetPoints: { color: C.primary, fontSize: 28, fontFamily: FontFamily.extraBold, marginTop: Spacing.xs },
  });
}
