import React, { useMemo, useRef, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { AppColors, FontFamily, Radii, Shadows, Spacing } from '../config/theme';
import { useLanguage, useTranslations } from '../hooks/useSettings';
import { HeatmapDay, buildHeatmapWeeks, heatmapShades } from '../utils/heatmap';
import { formatDayDetailDate } from '../utils/formatters';

type Props = {
  days: HeatmapDay[]; streak: number; goal: number; colors: AppColors; todayPoints?: number;
  rankEmoji?: string; weeklyStars?: number; rankName?: string;
};

function ProgressRing({ progress, colors }: { progress: number; colors: AppColors }) {
  const size = 54;
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  return <View style={styles.ring} accessibilityLabel={`${Math.round(progress * 100)}% complete`}>
    <Svg width={size} height={size}>
      <Circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={colors.surface2} strokeWidth={5} />
      <Circle
        cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={colors.primary} strokeWidth={5}
        strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - progress)}
        rotation="-90" origin={`${size / 2}, ${size / 2}`}
      />
    </Svg>
    <Text style={[styles.ringValue, { color: colors.inkDark }]}>{progress >= 1 ? '✓' : `${Math.round(progress * 100)}%`}</Text>
  </View>;
}

export function HomeHeatmap({ days, streak, goal, colors, todayPoints, rankEmoji, weeklyStars, rankName }: Props) {
  const scrollRef = useRef<ScrollView>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const t = useTranslations();
  const [lang] = useLanguage();
  const weeks = useMemo(() => buildHeatmapWeeks(days, goal), [days, goal]);
  const activeDays = days.filter(day => day.total_points > 0).length;
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const shades = heatmapShades(colors);
  const pointsByDate = useMemo(() => new Map(days.map(day => [day.local_date, day.total_points])), [days]);
  const starsByDate = useMemo(() => new Map(days.map(day => [day.local_date, day.stars ?? 0])), [days]);
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const selectedPoints = selectedDate ? pointsByDate.get(selectedDate) ?? 0 : 0;
  const selectedStars = selectedDate ? Math.trunc(starsByDate.get(selectedDate) ?? 0) : 0;
  const selectedDateLabel = selectedDate ? formatDayDetailDate(selectedDate, lang === 'vi' ? 'vi-VN' : 'en-US') : '';
  const progress = todayPoints === undefined ? null : Math.min(todayPoints / goal, 1);

  return <View style={styles.card}>
    <View style={styles.header}>
      <View style={styles.headerTitle}>
        <View style={styles.totalRow}><Text style={styles.total}>{activeDays}</Text><Text style={styles.totalLabel}>ngày{`\n`}đã tô</Text></View>
      </View>
      <Text style={styles.yearText}>{now.getFullYear()} ▾</Text>
    </View>
    <View style={styles.rewardRow}>
      <View style={styles.rewardPill}>
        <Text style={styles.rewardText}>{rankName ? `🔥 ${streak} · ★ ${weeklyStars ?? 0} › ${rankEmoji} ${rankName}` : `🔥 ${streak}`}</Text>
      </View>
    </View>
    <View style={styles.gridRow}>
      <View style={styles.rail}>{['Mon', '', 'Wed', '', 'Fri', '', ''].map((label, i) => <Text key={i} style={styles.dayLabel}>{label}</Text>)}</View>
      <ScrollView ref={scrollRef} horizontal showsHorizontalScrollIndicator={false} onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}>
        <View>
          <View style={styles.months}>{weeks.map((week, i) => {
            const month = week.find(cell => cell.month)?.month;
            return month ? <Text key={i} style={[styles.month, { left: i * 16 }]}>{month}</Text> : null;
          })}</View>
          <View style={styles.weeks}>{weeks.map((week, i) => <View key={i} style={styles.week}>{week.map((cell, j) => cell.date ? <TouchableOpacity key={cell.date} style={[styles.cell, { backgroundColor: shades[cell.level] }, cell.date === today && styles.todayCell]} onPress={() => setSelectedDate(cell.date)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`${cell.date}: ${pointsByDate.get(cell.date) ?? 0} points`} /> : <View key={`${cell.date}-${j}`} style={styles.cell} />)}</View>)}</View>
        </View>
      </ScrollView>
    </View>
    <View style={styles.legend}><Text style={styles.legendLabel}>Ít</Text>{shades.map((color, i) => <View key={i} style={[styles.legendCell, { backgroundColor: color }]} />)}<Text style={styles.legendLabel}>Nhiều</Text></View>
    {progress !== null && <View style={styles.today}>
      <ProgressRing progress={progress} colors={colors} />
      <View style={styles.todayCopy}>
        <Text style={styles.todayValue}>{todayPoints} / {goal}</Text>
        <Text style={styles.todayLabel}>ĐIỂM HÔM NAY</Text>
      </View>
    </View>}
    <Modal visible={selectedDate !== null} transparent animationType="fade" onRequestClose={() => setSelectedDate(null)}>
      <View style={styles.modal}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setSelectedDate(null)} accessibilityLabel={t.close} accessibilityRole="button" />
        <View style={styles.sheet}>
          <Svg style={styles.rewardGlow} width="100%" height={210} pointerEvents="none">
            <Defs><RadialGradient id="reward-glow" cx="50%" cy="0%" rx="72%" ry="100%"><Stop offset="0" stopColor={colors.starGold} stopOpacity={0.28} /><Stop offset="1" stopColor={colors.starGold} stopOpacity={0} /></RadialGradient></Defs>
            <Rect width="100%" height="100%" fill="url(#reward-glow)" />
          </Svg>
          <View style={styles.grabber} />
          <View style={styles.sheetHeader}>
            <View style={styles.sheetTitleCopy}>
              <Text style={styles.sheetDate} numberOfLines={2}>{selectedDateLabel}</Text>
            </View>
            <TouchableOpacity style={styles.closeButton} onPress={() => setSelectedDate(null)} accessibilityLabel={t.close} accessibilityRole="button">
              <Text style={styles.closeGlyph}>×</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.rewardCopy}>
            <Text style={[styles.rewardStars, { color: colors.rewardCta }]} adjustsFontSizeToFit minimumFontScale={0.7} numberOfLines={1}>+{selectedStars} ★</Text>
            <Text style={styles.rewardSubtitle}>{t.rewardStarsReceived}</Text>
          </View>
          <View style={styles.pointsCard}>
            <Text style={styles.pointsValue} adjustsFontSizeToFit minimumFontScale={0.75} numberOfLines={1}>{selectedPoints} <Text style={styles.pointsGoal}>/ {goal}</Text></Text>
            <Text style={styles.pointsLabel}>{t.pointsLabel}</Text>
          </View>
          <TouchableOpacity style={[styles.dismissButton, { backgroundColor: colors.rewardCta }]} onPress={() => setSelectedDate(null)} activeOpacity={0.8} accessibilityRole="button">
            <Text style={styles.dismissButtonText}>{t.rewardDismiss}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  </View>;
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    card: { marginHorizontal: Spacing.lg, marginTop: 14, padding: Spacing.lg, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: Radii.xl, ...Shadows.light },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }, headerTitle: { flex: 1 }, yearText: { color: C.primary, fontSize: 13, fontFamily: FontFamily.extraBold, paddingTop: 6 },
    totalRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 2 }, total: { color: C.inkDark, fontSize: 52, lineHeight: 56, letterSpacing: -2.5, fontFamily: FontFamily.extraBold }, totalLabel: { color: C.muted, fontSize: 12, fontFamily: FontFamily.bold },
    rewardRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: Spacing.md }, rewardPill: { maxWidth: '100%', flexShrink: 1, backgroundColor: C.surface2, borderRadius: Radii.pill, paddingHorizontal: 11, paddingVertical: 7 }, rewardText: { flexShrink: 1, color: C.inkDark, fontSize: 13, fontFamily: FontFamily.bold },
    gridRow: { flexDirection: 'row' }, rail: { width: 22, marginTop: 19, gap: 3 }, dayLabel: { height: 13, color: C.faint, fontSize: 9, lineHeight: 13, fontFamily: FontFamily.semiBold }, months: { height: 19, position: 'relative' }, month: { position: 'absolute', width: 22, color: C.faint, fontSize: 9, lineHeight: 10, fontFamily: FontFamily.semiBold }, weeks: { flexDirection: 'row', gap: 3 }, week: { gap: 3 }, cell: { width: 13, height: 13, borderRadius: 3 }, todayCell: { borderWidth: 2, borderColor: C.primary },
    legend: { marginTop: Spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }, legendLabel: { color: C.faint, fontSize: 10, fontFamily: FontFamily.medium }, legendCell: { width: 11, height: 11, borderRadius: 3 },
    today: { borderTopWidth: 1, borderTopColor: C.line, marginTop: Spacing.md, paddingTop: Spacing.md, flexDirection: 'row', alignItems: 'center', gap: 11 }, todayCopy: { flex: 1 }, todayLabel: { color: C.ink2, fontSize: 11, fontFamily: FontFamily.extraBold, marginTop: 1 }, todayValue: { color: C.inkDark, fontSize: 18, fontFamily: FontFamily.extraBold },
    modal: { flex: 1, justifyContent: 'flex-end' }, backdrop: { ...StyleSheet.absoluteFill, backgroundColor: C.scrim }, sheet: { overflow: 'hidden', backgroundColor: C.surface, borderTopLeftRadius: Radii.xxl, borderTopRightRadius: Radii.xxl, paddingTop: 12, paddingHorizontal: Spacing.lg, paddingBottom: Spacing.lg, gap: Spacing.sm }, rewardGlow: { position: 'absolute', top: 0, left: 0, right: 0 }, grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: C.line2 }, sheetHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md }, sheetTitleCopy: { flex: 1, minHeight: 44, justifyContent: 'center' }, sheetDate: { color: C.inkDark, fontSize: 17, lineHeight: 24, fontFamily: FontFamily.bold, marginTop: 3 }, closeButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }, closeGlyph: { color: C.muted, fontSize: 28, lineHeight: 28, fontFamily: FontFamily.regular }, rewardCopy: { alignItems: 'center', paddingVertical: Spacing.xs }, rewardStars: { fontSize: 50, lineHeight: 54, fontFamily: FontFamily.extraBold, letterSpacing: -2 }, rewardSubtitle: { color: C.muted, fontSize: 14, fontFamily: FontFamily.bold, marginTop: 2 }, pointsCard: { minHeight: 70, borderWidth: 1, borderColor: C.line, borderRadius: Radii.md, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.md }, pointsValue: { color: C.inkDark, fontSize: 24, fontFamily: FontFamily.extraBold, letterSpacing: -.7 }, pointsGoal: { color: C.muted, fontSize: 14, fontFamily: FontFamily.bold }, pointsLabel: { color: C.muted, fontSize: 11, fontFamily: FontFamily.extraBold, marginTop: 2 }, dismissButton: { minHeight: 52, borderRadius: Radii.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.lg }, dismissButtonText: { color: C.inkDark, fontSize: 16, fontFamily: FontFamily.extraBold },
  });
}

const styles = StyleSheet.create({
  ring: { width: 54, height: 54, alignItems: 'center', justifyContent: 'center' },
  ringValue: { position: 'absolute', fontSize: 11, fontFamily: FontFamily.extraBold },
});
