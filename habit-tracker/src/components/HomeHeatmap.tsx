import React, { useMemo, useRef, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { AppColors, FontFamily, Radii, Shadows, Spacing } from '../config/theme';
import { HeatmapDay, buildHeatmapWeeks } from '../utils/heatmap';

type Props = { days: HeatmapDay[]; streak: number; goal: number; colors: AppColors; todayPoints?: number; rankEmoji?: string };

export function HomeHeatmap({ days, streak, goal, colors, todayPoints, rankEmoji }: Props) {
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
      <View style={styles.headerTitle}>
        <View style={styles.titleRow}><Text style={styles.eyebrow}>LƯỚI CẢ NĂM</Text><View style={styles.yearChip}><Text style={styles.yearText}>{now.getFullYear()} ▾</Text></View></View>
        <View style={styles.totalRow}><Text style={styles.total}>{activeDays}</Text><Text style={styles.totalLabel}>ngày{`\n`}đã tô</Text></View>
      </View>
      <View style={styles.badges}><View style={styles.streak}><Text style={styles.streakText}>🔥 {streak}</Text></View>{rankEmoji ? <View style={styles.rank}><Text style={styles.rankText}>{rankEmoji}</Text></View> : null}</View>
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
    <View style={styles.legend}><Text style={styles.legendLabel}>Ít</Text>{shades.map((color, i) => <View key={i} style={[styles.legendCell, { backgroundColor: color }]} />)}<Text style={styles.legendLabel}>Nhiều</Text></View>
    {progress !== null && <View style={styles.today}><View style={styles.todayRow}><Text style={styles.todayLabel}>ĐIỂM HÔM NAY</Text><Text style={styles.todayValue}>{todayPoints} / {goal}</Text></View><View style={styles.progress}><View style={[styles.progressFill, { width: `${progress * 100}%` }]} /></View><Text style={styles.progressLabel}>Còn {Math.max(goal - (todayPoints ?? 0), 0)} điểm nữa để tô đầy ô hôm nay</Text></View>}
    <Modal visible={selectedDate !== null} transparent animationType="fade" onRequestClose={() => setSelectedDate(null)}>
      <View style={styles.modal}><TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setSelectedDate(null)} /><View style={styles.sheet}><Text style={styles.sheetDate}>{selectedDate}</Text><Text style={styles.sheetPoints}>{selectedPoints} điểm</Text></View></View>
    </Modal>
  </View>;
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    card: { marginHorizontal: Spacing.lg, marginTop: 14, padding: Spacing.lg, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: Radii.xl, ...Shadows.light },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.md }, headerTitle: { flex: 1 }, titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    eyebrow: { color: C.primary, fontSize: 12, fontFamily: FontFamily.extraBold, letterSpacing: 0.4 }, yearChip: { backgroundColor: C.primarySoft, borderRadius: Radii.pill, paddingHorizontal: 9, paddingVertical: 4 }, yearText: { color: C.primary, fontSize: 12, fontFamily: FontFamily.extraBold },
    totalRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 2 }, total: { color: C.inkDark, fontSize: 52, lineHeight: 56, letterSpacing: -2.5, fontFamily: FontFamily.extraBold }, totalLabel: { color: C.muted, fontSize: 12, fontFamily: FontFamily.bold },
    badges: { flexDirection: 'row', gap: 7 }, streak: { backgroundColor: C.surface2, borderRadius: Radii.pill, paddingHorizontal: 10, paddingVertical: 7 }, streakText: { color: C.inkDark, fontSize: 13, fontFamily: FontFamily.bold }, rank: { backgroundColor: C.primarySoft, borderRadius: Radii.pill, paddingHorizontal: 10, paddingVertical: 7 }, rankText: { color: C.primary, fontSize: 13, fontFamily: FontFamily.bold },
    gridRow: { flexDirection: 'row' }, rail: { width: 22, marginTop: 19, gap: 3 }, dayLabel: { height: 13, color: C.faint, fontSize: 9, lineHeight: 13, fontFamily: FontFamily.semiBold }, months: { height: 19, flexDirection: 'row', gap: 3 }, month: { width: 13, color: C.faint, fontSize: 9, fontFamily: FontFamily.semiBold }, weeks: { flexDirection: 'row', gap: 3 }, week: { gap: 3 }, cell: { width: 13, height: 13, borderRadius: 3 }, todayCell: { borderWidth: 2, borderColor: C.primary },
    legend: { marginTop: Spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }, legendLabel: { color: C.faint, fontSize: 10, fontFamily: FontFamily.medium }, legendCell: { width: 11, height: 11, borderRadius: 3 },
    today: { borderTopWidth: 1, borderTopColor: C.line, marginTop: Spacing.md, paddingTop: Spacing.md }, todayRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, todayLabel: { color: C.ink2, fontSize: 12, fontFamily: FontFamily.extraBold }, todayValue: { color: C.inkDark, fontSize: 15, fontFamily: FontFamily.extraBold }, progress: { height: 9, marginTop: 8, borderRadius: Radii.pill, backgroundColor: C.surface2, overflow: 'hidden' }, progressFill: { ...StyleSheet.absoluteFill, backgroundColor: C.primary }, progressLabel: { color: C.muted, fontSize: 12, fontFamily: FontFamily.semiBold, marginTop: 7 },
    modal: { flex: 1, justifyContent: 'flex-end' }, backdrop: { ...StyleSheet.absoluteFill, backgroundColor: '#00000066' }, sheet: { backgroundColor: C.surface, borderTopLeftRadius: Radii.xl, borderTopRightRadius: Radii.xl, padding: Spacing.xl, alignItems: 'center' }, sheetDate: { color: C.inkDark, fontSize: 18, fontFamily: FontFamily.bold }, sheetPoints: { color: C.primary, fontSize: 28, fontFamily: FontFamily.extraBold, marginTop: Spacing.xs },
  });
}
