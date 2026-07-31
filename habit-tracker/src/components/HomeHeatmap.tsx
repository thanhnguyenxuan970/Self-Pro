import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View, Animated, Easing } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useFocusEffect } from '@react-navigation/native';
import { AppColors, FontFamily, Radii, Shadows, Spacing } from '../config/theme';
import { useLanguage, useTranslations } from '../hooks/useSettings';
import { useReduceMotion } from '../hooks/useReduceMotion';
import { HeatmapDay, buildHeatmapWeeks, heatmapShades } from '../utils/heatmap';
import { formatDayDetailDate } from '../utils/formatters';
import { dailyBonusGoal } from '../config/constants';

type Props = {
  days: HeatmapDay[]; streak: number; goal: number; colors: AppColors; todayPoints?: number;
  rankEmoji?: string; weeklyStars?: number; rankName?: string; streakRef?: (node: View | null) => void;
  scoringGuideVisible?: boolean; onScoringGuideClose?: () => void;
};

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const HEATMAP_ANIMATE_WEEKS = 16;

// Entry-animated progress ring: the primary arc sweeps from empty up to its
// current fraction on mount and every time Home regains focus. Reduce-motion
// paints the final frame directly.
function ProgressRing({ progress, colors, animKey, reduceMotion }: { progress: number; colors: AppColors; animKey: number; reduceMotion: boolean }) {
  const size = 54;
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const driver = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  useEffect(() => {
    if (reduceMotion) { driver.setValue(1); return; }
    driver.setValue(0);
    const anim = Animated.timing(driver, {
      toValue: 1, duration: 820, delay: 160,
      easing: Easing.out(Easing.cubic), useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [progress, animKey, reduceMotion, driver]);
  // Sweep dashoffset from full (empty ring) to the target fraction's offset.
  const dashOffset = driver.interpolate({ inputRange: [0, 1], outputRange: [circumference, circumference * (1 - progress)] });
  return <View style={styles.ring} accessible accessibilityLabel={`${Math.round(progress * 100)}% complete`}>
    <Svg width={size} height={size}>
      <Circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={colors.surface2} strokeWidth={5} />
      <AnimatedCircle
        cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={colors.primary} strokeWidth={5}
        strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={dashOffset}
        rotation="-90" origin={`${size / 2}, ${size / 2}`}
      />
    </Svg>
    <Text style={[styles.ringValue, { color: colors.inkDark }]}>{progress >= 1 ? '✓' : `${Math.round(progress * 100)}%`}</Text>
  </View>;
}

// Heatmap cells "fill in" with their colour in a diagonal wave: each coloured
// box starts empty, then its shade pops in (opacity + scale), delayed by its
// distance from the top-left corner (col + row). Replayed on focus via animKey.
// Reduce-motion shows every cell filled at rest.
const AnimatedWeeks = React.memo(function AnimatedWeeks({ weeks, styles, shades, today, pointsByDate, onSelect, animKey, reduceMotion }: {
  weeks: ReturnType<typeof buildHeatmapWeeks>; styles: ReturnType<typeof makeStyles>;
  shades: string[]; today: string; pointsByDate: Map<string, number>;
  onSelect: (date: string) => void; animKey: number; reduceMotion: boolean;
}) {
  // One Animated.Value per cell (weeks × 7), so each can carry its own diagonal delay.
  const anims = useRef<Animated.Value[][]>([]).current;
  if (anims.length !== weeks.length) {
    anims.length = 0;
    for (let i = 0; i < weeks.length; i++) {
      anims.push(Array.from({ length: 7 }, () => new Animated.Value(reduceMotion ? 1 : 0)));
    }
  }
  useEffect(() => {
    if (reduceMotion) { anims.forEach(col => col.forEach(a => a.setValue(1))); return; }
    // Only the most recent weeks are on/near-screen when the grid scrolls to
    // its end on mount, so cap the parallel burst to that window instead of
    // animating all 53 weeks — older cells snap straight to their final state.
    const animateFrom = Math.max(0, weeks.length - HEATMAP_ANIMATE_WEEKS);
    const all: Animated.CompositeAnimation[] = [];
    anims.forEach((col, i) => col.forEach((a, j) => {
      if (i < animateFrom) { a.setValue(1); return; }
      a.setValue(0);
      all.push(Animated.timing(a, {
        toValue: 1, duration: 420, delay: (i - animateFrom + j) * 34,
        easing: Easing.out(Easing.cubic), useNativeDriver: true,
      }));
    }));
    const group = Animated.parallel(all, { stopTogether: false });
    group.start();
    return () => group.stop();
  }, [animKey, weeks.length, reduceMotion]); // eslint-disable-line react-hooks/exhaustive-deps
  return <View style={styles.weeks}>{weeks.map((week, i) => (
    <View key={i} style={styles.week}>
      {week.map((cell, j) => {
        if (!cell.date) return <View key={`${cell.date}-${j}`} style={styles.cell} />;
        const v = anims[i][j];
        return (
          <TouchableOpacity
            key={cell.date}
            style={[styles.cell, { backgroundColor: shades[0] }, cell.date === today && styles.todayCell]}
            // hitSlop capped at half the 3px cell gap: cells sit edge-to-edge in
            // a dense 7-row grid, so any larger slop overlaps the neighbouring
            // cell's hit region and taps register the wrong day.
            onPress={() => onSelect(cell.date)} hitSlop={1}
            accessibilityRole="button" accessibilityLabel={`${cell.date}: ${pointsByDate.get(cell.date) ?? 0} points`}
          >
            {cell.level > 0 && (
              <Animated.View
                pointerEvents="none"
                style={[StyleSheet.absoluteFill, { backgroundColor: shades[cell.level], borderRadius: 4, opacity: v, transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }) }] }]}
              />
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  ))}</View>;
});

export const HomeHeatmap = React.memo(function HomeHeatmap({ days, streak, goal, colors, todayPoints, rankEmoji, weeklyStars, rankName, streakRef, scoringGuideVisible = false, onScoringGuideClose }: Props) {
  const scrollRef = useRef<ScrollView>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showLegend, setShowLegend] = useState(false);
  const t = useTranslations();
  const [lang] = useLanguage();
  const reduceMotion = useReduceMotion();
  // Bumped on every focus so grid + ring entry animations replay when the user
  // navigates back to Home (the tab screen stays mounted).
  const [animKey, setAnimKey] = useState(0);
  useFocusEffect(useCallback(() => { setAnimKey(k => k + 1); }, []));
  const weeks = useMemo(() => buildHeatmapWeeks(days), [days]);
  const activeDays = days.filter(day => day.total_points > 0).length;
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const shades = useMemo(() => heatmapShades(colors), [colors]);
  const pointsByDate = useMemo(() => new Map(days.map(day => [day.local_date, day.total_points])), [days]);
  const starsByDate = useMemo(() => new Map(days.map(day => [day.local_date, day.stars ?? 0])), [days]);
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const selectedPoints = selectedDate ? pointsByDate.get(selectedDate) ?? 0 : 0;
  const selectedStars = selectedDate ? Math.round(starsByDate.get(selectedDate) ?? 0) : 0;
  const selectedDateLabel = selectedDate ? formatDayDetailDate(selectedDate, lang === 'vi' ? 'vi-VN' : 'en-US') : '';
  const todayGoal = dailyBonusGoal(todayPoints ?? 0, goal);
  const selectedGoal = dailyBonusGoal(selectedPoints, goal);
  const progress = todayPoints === undefined ? null : Math.min(todayPoints / todayGoal, 1);

  return <View style={styles.card}>
    <View style={styles.header}>
      <View style={styles.headerTitle}>
        <View style={styles.totalRow}><Text style={styles.total}>{activeDays}</Text><Text style={styles.totalLabel}>{t.heatmapActiveDays}</Text></View>
      </View>
      <View style={styles.headerActions}>
        <View style={styles.yearWrap}>
          <TouchableOpacity style={styles.legendButton} hitSlop={16} onPress={() => setShowLegend(true)} accessibilityRole="button" accessibilityLabel={t.heatmapLegendTitle}>
            <Text style={styles.legendButtonText}>?</Text>
          </TouchableOpacity>
          <Text style={styles.yearText} accessibilityLabel={String(now.getFullYear())}>{now.getFullYear()} ▾</Text>
        </View>
      </View>
    </View>
    <View style={styles.rewardRow}>
      <View ref={streakRef} style={styles.rewardPill}>
        <Text style={styles.rewardText}>{rankName ? `🔥 ${streak} · ★ ${Math.round(weeklyStars ?? 0)} › ${rankEmoji} ${rankName}` : `🔥 ${streak}`}</Text>
      </View>
    </View>
    <View style={styles.gridRow}>
      <View style={styles.rail}>{t.calDow.map((label, i) => <Text key={i} style={styles.dayLabel}>{[0, 2, 4].includes(i) ? label : ''}</Text>)}</View>
      <ScrollView ref={scrollRef} horizontal showsHorizontalScrollIndicator={false} onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}>
        <View>
          <View style={styles.months}>{weeks.map((week, i) => {
            const month = week.find(cell => cell.month)?.month;
            return month ? <Text key={i} style={[styles.month, { left: i * 16 }]}>{month}</Text> : null;
          })}</View>
          <AnimatedWeeks
            weeks={weeks} styles={styles} shades={shades} today={today}
            pointsByDate={pointsByDate} onSelect={setSelectedDate}
            animKey={animKey} reduceMotion={reduceMotion}
          />
        </View>
      </ScrollView>
    </View>
    <View style={styles.legend}><Text style={styles.legendLabel}>{t.heatmapLess}</Text>{shades.map((color, i) => <View key={i} style={[styles.legendCell, { backgroundColor: color }]} />)}<Text style={styles.legendLabel}>{t.heatmapMore}</Text></View>
    <Modal visible={showLegend} transparent animationType={reduceMotion ? 'none' : 'fade'} onRequestClose={() => setShowLegend(false)} statusBarTranslucent navigationBarTranslucent>
      <View style={styles.legendModal}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setShowLegend(false)} accessibilityRole="button" accessibilityLabel={t.close} />
        <View style={styles.legendSheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.legendTitle}>{t.heatmapLegendTitle}</Text>
            <TouchableOpacity style={styles.legendCloseButton} hitSlop={8} onPress={() => setShowLegend(false)} accessibilityLabel={t.close} accessibilityRole="button"><Text style={styles.legendCloseGlyph}>×</Text></TouchableOpacity>
          </View>
          <Text style={styles.legendSubtitle}>{t.heatmapLegendSubtitle}</Text>
          <View style={styles.legendDivider} />
          <View style={styles.legendItem}>
            <View style={[styles.legendItemColor, styles.emptyLegendCell]} />
            <Text style={styles.legendRange}>{t.heatmapLegendNoStars}</Text>
            <Text style={styles.legendHint}>{t.heatmapLegendEmptyCell}</Text>
          </View>
          {t.heatmapLegendRanges.map((range, i) => <View key={range} style={[styles.legendItem, i === t.heatmapLegendRanges.length - 1 && styles.legendItemLast]}><View style={[styles.legendItemColor, { backgroundColor: shades[i + 1] }]} /><Text style={styles.legendRange}>{range}</Text><Text style={styles.legendUnit}>{t.heatmapLegendUnit}</Text></View>)}
          <View style={styles.legendDivider} />
          <Text style={styles.legendGridTitle}>{t.heatmapLegendOnGrid}</Text>
          <View style={styles.legendSample}>{shades.map((color, i) => <View key={i} style={[styles.legendSampleCell, { backgroundColor: color }, i === 0 && styles.emptyLegendCell]} />)}</View>
        </View>
      </View>
    </Modal>
    <Modal visible={scoringGuideVisible} transparent animationType={reduceMotion ? 'none' : 'fade'} onRequestClose={onScoringGuideClose} statusBarTranslucent navigationBarTranslucent>
      <View style={styles.legendModal}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onScoringGuideClose} accessibilityRole="button" accessibilityLabel={t.close} />
        <View style={styles.scoringSheetContainer}>
          <ScrollView style={styles.scoringSheet} contentContainerStyle={styles.scoringSheetContent} showsVerticalScrollIndicator={false}>
          <View style={styles.sheetHeader}>
            <Text style={styles.legendTitle}>{t.scoringGuideTitle}</Text>
            <TouchableOpacity style={styles.closeButton} onPress={onScoringGuideClose} hitSlop={4} accessibilityLabel={t.close} accessibilityRole="button"><Text style={styles.closeGlyph}>×</Text></TouchableOpacity>
          </View>
          <Text style={styles.scoringSubtitle}>{t.scoringGuideSubtitle}</Text>
          <Text style={styles.scoringSection}>{t.scoringPointsTitle}</Text>
          <View style={styles.scoringDivider} />
          {t.scoringPointRules.map((rule, i) => <View key={rule.title} style={styles.legendItem}><Text style={styles.scoringNumber}>{i + 1}</Text><View style={styles.scoringCopy}><Text style={styles.legendItemText}>{rule.title}</Text><Text style={styles.scoringExample}>{rule.example}</Text></View></View>)}
          <Text style={styles.scoringSection}>{t.scoringStarsTitle}</Text>
          <View style={styles.scoringDivider} />
          {t.scoringStarRules.map((rule) => <View key={rule.title} style={styles.legendItem}><Text style={[styles.starBadge, { backgroundColor: colors.primary }]}>★</Text><View style={styles.scoringCopy}><Text style={styles.legendItemText}>{rule.title}</Text><Text style={styles.scoringExample}>{rule.example}</Text></View></View>)}
          </ScrollView>
        </View>
      </View>
    </Modal>
    {progress !== null && <View style={styles.today}>
      <ProgressRing progress={progress} colors={colors} animKey={animKey} reduceMotion={reduceMotion} />
      <View style={styles.todayCopy}>
        <Text style={styles.todayValue}>{todayPoints} / {todayGoal}</Text>
        <Text style={styles.todayLabel}>{t.pointsLabel}</Text>
      </View>
    </View>}
    <Modal visible={selectedDate !== null} transparent animationType={reduceMotion ? 'none' : 'fade'} onRequestClose={() => setSelectedDate(null)} statusBarTranslucent navigationBarTranslucent>
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
            <TouchableOpacity style={styles.closeButton} onPress={() => setSelectedDate(null)} hitSlop={4} accessibilityLabel={t.close} accessibilityRole="button">
              <Text style={styles.closeGlyph}>×</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.rewardCopy}>
            <Text style={[styles.rewardStars, { color: colors.starGoldText }]} adjustsFontSizeToFit minimumFontScale={0.7} numberOfLines={1}>+{selectedStars} ★</Text>
            <Text style={styles.rewardSubtitle}>{t.rewardStarsReceived}</Text>
          </View>
          <View style={styles.pointsCard}>
            <Text style={styles.pointsValue} adjustsFontSizeToFit minimumFontScale={0.75} numberOfLines={1}>{selectedPoints} <Text style={styles.pointsGoal}>/ {selectedGoal}</Text></Text>
            <Text style={styles.pointsLabel}>{t.pointsLabel}</Text>
          </View>
          <TouchableOpacity style={[styles.dismissButton, { backgroundColor: colors.rewardCta }]} onPress={() => setSelectedDate(null)} activeOpacity={0.8} accessibilityRole="button">
            <Text style={styles.dismissButtonText}>{t.rewardDismiss}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  </View>;
});

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    card: { marginHorizontal: Spacing.lg, marginTop: 14, padding: Spacing.lg, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: Radii.xl, ...Shadows.light },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }, headerTitle: { flex: 1 }, headerActions: { alignItems: 'flex-end' }, yearWrap: { alignItems: 'flex-end', gap: 2 }, yearText: { color: C.primaryText, fontSize: 13, fontFamily: FontFamily.extraBold }, legendButton: { width: 16, height: 16, borderRadius: 8, borderWidth: 1, borderColor: C.muted, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }, legendButtonText: { color: C.inkDark, fontSize: 10, lineHeight: 12, fontFamily: FontFamily.extraBold },
    totalRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 2 }, total: { color: C.inkDark, fontSize: 52, lineHeight: 56, letterSpacing: -2.5, fontFamily: FontFamily.extraBold }, totalLabel: { color: C.muted, fontSize: 12, fontFamily: FontFamily.bold },
    rewardRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: Spacing.md }, rewardPill: { maxWidth: '100%', flexShrink: 1, backgroundColor: C.surface2, borderRadius: Radii.pill, paddingHorizontal: 11, paddingVertical: 7 }, rewardText: { flexShrink: 1, color: C.inkDark, fontSize: 13, fontFamily: FontFamily.bold },
    gridRow: { flexDirection: 'row' }, rail: { width: 22, marginTop: 19, gap: 3 }, dayLabel: { height: 13, color: C.faint, fontSize: 9, lineHeight: 13, fontFamily: FontFamily.semiBold }, months: { height: 19, position: 'relative' }, month: { position: 'absolute', width: 22, color: C.faint, fontSize: 9, lineHeight: 10, fontFamily: FontFamily.semiBold }, weeks: { flexDirection: 'row', gap: 3 }, week: { gap: 3 }, cell: { width: 13, height: 13, borderRadius: 4, overflow: 'hidden' }, emptyCell: {}, todayCell: { borderWidth: 2, borderStyle: 'solid', borderColor: C.primary },
    legend: { marginTop: Spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }, legendLabel: { color: C.faint, fontSize: 10, fontFamily: FontFamily.medium }, legendCell: { width: 11, height: 11, borderRadius: 4 },
    today: { borderTopWidth: 1, borderTopColor: C.line, marginTop: Spacing.md, paddingTop: Spacing.md, flexDirection: 'row', alignItems: 'center', gap: 11 }, todayCopy: { flex: 1 }, todayLabel: { color: C.ink2, fontSize: 11, fontFamily: FontFamily.extraBold, marginTop: 1 }, todayValue: { color: C.inkDark, fontSize: 18, fontFamily: FontFamily.extraBold },
    modal: { flex: 1, justifyContent: 'flex-end' }, legendModal: { flex: 1, justifyContent: 'center', padding: Spacing.lg }, backdrop: { ...StyleSheet.absoluteFill, backgroundColor: C.scrim }, sheet: { alignSelf: 'center', width: '100%', maxWidth: 480, overflow: 'hidden', backgroundColor: C.surface, borderTopLeftRadius: Radii.xxl, borderTopRightRadius: Radii.xxl, paddingTop: 12, paddingHorizontal: Spacing.lg, paddingBottom: Spacing.lg, gap: Spacing.sm }, legendSheet: { alignSelf: 'center', width: '100%', maxWidth: 480, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: Radii.xl, padding: Spacing.lg, ...Shadows.medium }, scoringSheetContainer: { alignSelf: 'center', width: '100%', maxWidth: 480, maxHeight: '90%', overflow: 'hidden', backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: Radii.xl, ...Shadows.medium }, scoringSheet: { flexShrink: 1 }, scoringSheetContent: { padding: Spacing.lg }, legendTitle: { flex: 1, color: C.inkDark, fontSize: 20, lineHeight: 26, fontFamily: FontFamily.extraBold }, legendSubtitle: { color: C.muted, fontSize: 13, lineHeight: 17, fontFamily: FontFamily.regular, marginTop: 2 }, legendDivider: { height: 1, backgroundColor: C.line, marginVertical: Spacing.md }, legendItem: { minHeight: 48, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: C.line, gap: Spacing.sm }, legendItemLast: { borderBottomWidth: 0 }, scoringSubtitle: { color: C.muted, fontSize: 13, lineHeight: 17, fontFamily: FontFamily.regular, marginTop: -Spacing.sm }, scoringSection: { color: C.primaryText, fontSize: 12, letterSpacing: .4, fontFamily: FontFamily.extraBold, marginTop: Spacing.sm }, scoringDivider: { height: StyleSheet.hairlineWidth, backgroundColor: C.line }, scoringNumber: { width: 26, height: 26, borderRadius: 13, overflow: 'hidden', textAlign: 'center', color: C.onAccent, backgroundColor: C.primary, fontSize: 14, lineHeight: 26, fontFamily: FontFamily.extraBold }, starBadge: { width: 26, height: 26, borderRadius: 13, overflow: 'hidden', textAlign: 'center', color: C.onAccent, backgroundColor: C.starGold, fontSize: 14, lineHeight: 26, fontFamily: FontFamily.extraBold }, scoringCopy: { flex: 1 }, scoringExample: { color: C.muted, fontSize: 13, lineHeight: 17, fontFamily: FontFamily.regular, marginTop: 1 }, legendItemColor: { width: 30, height: 30, borderRadius: Radii.sm }, emptyLegendCell: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.line2 }, legendRange: { color: C.inkDark, fontSize: 15, fontFamily: FontFamily.extraBold }, legendUnit: { color: C.muted, fontSize: 13, fontFamily: FontFamily.medium, marginLeft: -4 }, legendHint: { flex: 1, color: C.faint, fontSize: 12, textAlign: 'right', fontFamily: FontFamily.medium }, legendGridTitle: { color: C.faint, fontSize: 11, lineHeight: 14, fontFamily: FontFamily.extraBold }, legendSample: { flexDirection: 'row', gap: 8, marginTop: Spacing.sm }, legendSampleCell: { width: 34, height: 34, borderRadius: Radii.sm }, legendItemText: { flex: 1, color: C.inkDark, fontSize: 15, fontFamily: FontFamily.extraBold }, legendCloseButton: { width: 32, height: 32, borderRadius: 16, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }, legendCloseGlyph: { color: C.muted, fontSize: 22, lineHeight: 24, fontFamily: FontFamily.regular }, rewardGlow: { position: 'absolute', top: 0, left: 0, right: 0 }, grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: C.line2 }, sheetHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md }, sheetTitleCopy: { flex: 1, minHeight: 44, justifyContent: 'center' }, sheetDate: { color: C.inkDark, fontSize: 17, lineHeight: 24, fontFamily: FontFamily.bold, marginTop: 3 }, closeButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }, closeGlyph: { color: C.muted, fontSize: 28, lineHeight: 28, fontFamily: FontFamily.regular }, rewardCopy: { alignItems: 'center', paddingVertical: Spacing.xs }, rewardStars: { fontSize: 50, lineHeight: 54, fontFamily: FontFamily.extraBold, letterSpacing: -2 }, rewardSubtitle: { color: C.muted, fontSize: 14, fontFamily: FontFamily.bold, marginTop: 2 }, pointsCard: { minHeight: 70, borderWidth: 1, borderColor: C.line, borderRadius: Radii.md, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.md }, pointsValue: { color: C.inkDark, fontSize: 24, fontFamily: FontFamily.extraBold, letterSpacing: -.7 }, pointsGoal: { color: C.muted, fontSize:14, fontFamily: FontFamily.bold }, pointsLabel: { color: C.muted, fontSize: 11, fontFamily: FontFamily.extraBold, marginTop: 2 }, dismissButton: { minHeight: 52, borderRadius: Radii.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.lg }, dismissButtonText: { color: '#141816', fontSize: 16, fontFamily: FontFamily.extraBold }, // rewardCta fill stays bright yellow in both themes, so its text stays fixed dark ink (same value onAccent uses for the same reason) instead of theme-adaptive C.inkDark, which flips to near-white in dark mode
  });
}

const styles = StyleSheet.create({
  ring: { width: 54, height: 54, alignItems: 'center', justifyContent: 'center' },
  ringValue: { position: 'absolute', fontSize: 11, fontFamily: FontFamily.extraBold },
});
