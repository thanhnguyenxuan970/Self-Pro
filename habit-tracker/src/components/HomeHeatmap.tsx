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
import { boostPalette, formatCountdown, secsRemaining, type BoostPalette, type BoostPhase } from '../game/boost';

type Props = {
  days: HeatmapDay[]; streak: number; goal: number; colors: AppColors; todayPoints?: number;
  rankEmoji?: string; lifetimeStars?: number; rankName?: string; streakRef?: (node: View | null) => void;
  scoringGuideVisible?: boolean; onScoringGuideClose?: () => void;
  boostVisual?: { phase: BoostPhase; multiplier: number; expiresAt: number | null } | null;
};

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);
const HEATMAP_ANIMATE_WEEKS = 16;

// Entry-animated progress ring: the primary arc sweeps from empty up to its
// current fraction on mount and every time Home regains focus. Reduce-motion
// paints the final frame directly.
function ProgressRing({ progress, colors, accentColor, animKey, reduceMotion }: { progress: number; colors: AppColors; accentColor: string; animKey: number; reduceMotion: boolean }) {
  const size = 44;
  const radius = 17;
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
        cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={accentColor} strokeWidth={5}
        strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={dashOffset}
        rotation="-90" origin={`${size / 2}, ${size / 2}`}
      />
    </Svg>
    <Text style={[styles.ringValue, { color: colors.inkDark }]}>{progress >= 1 ? '✓' : `${Math.round(progress * 100)}%`}</Text>
  </View>;
}

function AnimatedCount({ value, suffix, style, animKey, reduceMotion }: { value: number; suffix: string; style: object; animKey: number; reduceMotion: boolean }) {
  const progress = useRef(new Animated.Value(reduceMotion ? value : 0)).current;
  const [displayValue, setDisplayValue] = useState(reduceMotion ? value : 0);
  useEffect(() => {
    if (reduceMotion) { progress.setValue(value); setDisplayValue(value); return; }
    progress.setValue(0);
    setDisplayValue(0);
    const listener = progress.addListener(({ value: next }) => setDisplayValue(Math.round(next)));
    const animation = Animated.timing(progress, { toValue: value, delay: 120, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: false });
    animation.start(({ finished }) => { if (finished) setDisplayValue(value); });
    return () => { progress.removeListener(listener); animation.stop(); };
  }, [animKey, progress, reduceMotion, value]);
  return <Text style={style} numberOfLines={1}>{displayValue}{suffix}</Text>;
}

const BoostCountdown = React.memo(function BoostCountdown({ expiresAt, style, color }: { expiresAt: number | null; style: object; color: string }) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (expiresAt === null) return;
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);
  return <Text style={[style, { color }]}>{formatCountdown(secsRemaining(nowMs, expiresAt))}</Text>;
});

// Heatmap cells "fill in" with their colour in a diagonal wave: each coloured
// box starts empty, then its shade pops in (opacity + scale), delayed by its
// distance from the top-left corner (col + row). Replayed on focus via animKey.
// Reduce-motion shows every cell filled at rest.
const AnimatedWeeks = React.memo(function AnimatedWeeks({ weeks, styles, shades, today, pointsByDate, onSelect, animKey, reduceMotion, todayBorderColor }: {
  weeks: ReturnType<typeof buildHeatmapWeeks>; styles: ReturnType<typeof makeStyles>;
  shades: string[]; today: string; pointsByDate: Map<string, number>;
  onSelect: (date: string) => void; animKey: number; reduceMotion: boolean; todayBorderColor: string;
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
          <AnimatedTouchable
            key={cell.date}
            style={[styles.cell, { backgroundColor: shades[0] }, cell.date === today && styles.todayCell, cell.date === today && { borderColor: todayBorderColor }]}
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
          </AnimatedTouchable>
        );
      })}
    </View>
  ))}</View>;
});

export const HomeHeatmap = React.memo(function HomeHeatmap({ days, streak, goal, colors, todayPoints, rankEmoji, lifetimeStars, rankName, streakRef, scoringGuideVisible = false, onScoringGuideClose, boostVisual = null }: Props) {
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
  const boostActive = boostVisual?.phase === 'active' || boostVisual?.phase === 'expiring';
  const boost = boostActive ? boostVisual : null;
  const palette = useMemo<BoostPalette | null>(() => boost ? boostPalette(colors) : null, [boost, colors]);
  const shades = useMemo(() => palette ? [colors.surface2, `${colors.primary}4D`, `${colors.primary}85`, `${colors.primary}BD`, colors.primary] : heatmapShades(colors), [colors, palette]);
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
  const badgeSheen = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduceMotion || !boostActive) {
      badgeSheen.setValue(0);
      return;
    }
    const loop = Animated.loop(Animated.sequence([
      Animated.delay(900),
      Animated.timing(badgeSheen, { toValue: 1, duration: 850, easing: Easing.linear, useNativeDriver: true }),
      Animated.timing(badgeSheen, { toValue: 0, duration: 0, useNativeDriver: true }),
      Animated.delay(1900),
    ]));
    loop.start();
    return () => loop.stop();
  }, [badgeSheen, boostActive, reduceMotion]);

  return <>
    {boostVisual?.phase === 'expiring' && palette ? <View style={[styles.urgentBanner, { backgroundColor: colors.dangerPress }]}>
      <Text style={styles.urgentBannerText}>{t.boostUrgency(boostVisual.multiplier)}</Text>
      <BoostCountdown expiresAt={boostVisual.expiresAt} style={styles.urgentBannerTime} color={colors.white} />
    </View> : null}
    <View style={[styles.card, boostActive && palette ? { borderColor: boostVisual?.phase === 'expiring' ? colors.dangerPress : palette.border, borderWidth: boostVisual?.phase === 'expiring' ? 2 : 1 } : null]}>
      {boostActive && palette ? <View pointerEvents="none" style={styles.boostGlow}>
        <Svg width={230} height={230}>
          <Defs><RadialGradient id="boost-heatmap-glow" cx="100%" cy="0%" r="100%"><Stop offset="0" stopColor={palette.fill} stopOpacity={0.32} /><Stop offset="1" stopColor={palette.fill} stopOpacity={0} /></RadialGradient></Defs>
          <Rect width="230" height="230" fill="url(#boost-heatmap-glow)" />
        </Svg>
      </View> : null}
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
      <View ref={streakRef} style={[styles.rewardPill, boostActive && palette ? { borderColor: palette.border, borderWidth: 1 } : null]}>
        <Text style={styles.rewardText}>{rankName ? `🔥 ${streak} · ★ ${Math.round(lifetimeStars ?? 0)} › ${rankEmoji} ${rankName}` : `🔥 ${streak}`}</Text>
      </View>
      {boostActive && palette ? <View style={[styles.boostBadge, { backgroundColor: palette.fill }]}>
        <Text style={[styles.boostBadgeText, { color: palette.ink }]}>{t.boostActiveBadge(boostVisual?.multiplier ?? 1)}</Text>
        <Animated.View pointerEvents="none" style={[styles.badgeSweep, { backgroundColor: `${colors.white}55`, transform: [{ translateX: badgeSheen.interpolate({ inputRange: [0, 1], outputRange: [-60, 86] }) }] }]} />
      </View> : null}
    </View>
    <View style={styles.gridRow}>
      <View style={styles.rail}>{t.calDow.map((label, i) => <Text key={i} style={styles.dayLabel}>{[0, 2, 4].includes(i) ? label : ''}</Text>)}</View>
      <ScrollView ref={scrollRef} horizontal showsHorizontalScrollIndicator={false} onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}>
        <View>
          <View style={styles.months}>{weeks.map((week, i) => {
            const month = week.find(cell => cell.month)?.month;
            return month ? <Text key={i} style={[styles.month, { left: i * 11.6 }]}>{month}</Text> : null;
          })}</View>
          <AnimatedWeeks
            weeks={weeks} styles={styles} shades={shades} today={today}
            pointsByDate={pointsByDate} onSelect={setSelectedDate}
            animKey={animKey} reduceMotion={reduceMotion}
            todayBorderColor={boostActive && palette ? palette.border : colors.primary}
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
      <ProgressRing progress={progress} colors={colors} accentColor={boostActive && palette ? palette.fill : colors.primary} animKey={animKey} reduceMotion={reduceMotion} />
      <View style={styles.todayCopy}>
        <View style={styles.todayValueRow}>
          <AnimatedCount value={todayPoints ?? 0} suffix={` / ${todayGoal}`} style={styles.todayValue} animKey={animKey} reduceMotion={reduceMotion} />
          {boostActive && palette ? <View style={[styles.todayRate, { backgroundColor: colors.primarySoft, borderColor: colors.primaryPress }]}><Text style={[styles.todayRateText, { color: colors.primaryText }]}>{t.boostRate(boostVisual?.multiplier ?? 1)}</Text></View> : null}
        </View>
        <Text style={styles.todayLabel}>{t.pointsLabel}</Text>
      </View>
      {boostActive && palette ? <View style={[styles.countdownPill, { backgroundColor: boostVisual?.phase === 'expiring' ? colors.dangerPress : colors.primarySoft }]}>
        <Text style={styles.countdownIcon}>⌛</Text>
        <BoostCountdown expiresAt={boostVisual.expiresAt} style={styles.countdown} color={boostVisual.phase === 'expiring' ? colors.white : colors.primaryText} />
      </View> : null}
    </View>}
    <Modal visible={selectedDate !== null} transparent animationType={reduceMotion ? 'none' : 'fade'} onRequestClose={() => setSelectedDate(null)} statusBarTranslucent navigationBarTranslucent>
      <View style={styles.modal}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setSelectedDate(null)} accessibilityLabel={t.close} accessibilityRole="button" />
        <View style={styles.sheet}>
          <Svg style={styles.rewardGlow} width="100%" height={210} pointerEvents="none">
            <Defs><RadialGradient id="reward-glow" cx="50%" cy="0%" rx="72%" ry="100%"><Stop offset="0" stopColor={colors.primary} stopOpacity={0.22} /><Stop offset="1" stopColor={colors.primary} stopOpacity={0} /></RadialGradient></Defs>
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
            <Text style={[styles.rewardStars, { color: colors.primaryText }]} adjustsFontSizeToFit minimumFontScale={0.7} numberOfLines={1}>+{selectedStars} ★</Text>
            <Text style={styles.rewardSubtitle}>{t.rewardStarsReceived}</Text>
          </View>
          <View style={styles.pointsCard}>
            <Text style={styles.pointsValue} adjustsFontSizeToFit minimumFontScale={0.75} numberOfLines={1}>{selectedPoints} <Text style={styles.pointsGoal}>/ {selectedGoal}</Text></Text>
            <Text style={styles.pointsLabel}>{t.pointsLabel}</Text>
          </View>
          <TouchableOpacity style={[styles.dismissButton, { backgroundColor: colors.primary }]} onPress={() => setSelectedDate(null)} activeOpacity={0.8} accessibilityRole="button">
            <Text style={[styles.dismissButtonText, { color: colors.onAccent }]}>{t.rewardDismiss}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  </View>
  </>;
});

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    card: { marginHorizontal: 14, marginTop: 7, paddingHorizontal: 15, paddingTop: 14, paddingBottom: 16, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: Radii.xl, overflow: 'hidden', ...Shadows.light }, boostGlow: { position: 'absolute', width: 230, height: 230, top: -8, right: -8 },
    urgentBanner: { marginHorizontal: Spacing.lg, marginTop: 8, minHeight: 44, borderRadius: Radii.md, paddingHorizontal: Spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm }, urgentBannerText: { color: C.white, fontSize: 12.5, fontFamily: FontFamily.extraBold, flex: 1 }, urgentBannerTime: { color: C.white, fontSize: 15, fontFamily: FontFamily.extraBold, fontVariant: ['tabular-nums'] },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }, headerTitle: { flex: 1 }, headerActions: { alignItems: 'flex-end' }, yearWrap: { alignItems: 'flex-end', gap: 2 }, yearText: { color: C.primaryText, fontSize: 13, fontFamily: FontFamily.extraBold }, legendButton: { width: 24, height: 24, borderRadius: 12, borderWidth: 1, borderColor: C.muted, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }, legendButtonText: { color: C.inkDark, fontSize: 13, lineHeight: 16, fontFamily: FontFamily.extraBold },
    totalRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 2 }, total: { color: C.inkDark, fontSize: 38, lineHeight: 44, letterSpacing: -2, fontFamily: FontFamily.extraBold }, totalLabel: { maxWidth: 110, color: C.muted, fontSize: 12.5, lineHeight: 16, fontFamily: FontFamily.bold },
    rewardRow: { flexDirection: 'column', alignItems: 'flex-start', gap: 8, marginBottom: Spacing.md }, rewardPill: { maxWidth: '100%', flexShrink: 1, backgroundColor: C.surface2, borderRadius: Radii.pill, paddingHorizontal: 11, paddingVertical: 7 }, rewardText: { flexShrink: 1, color: C.inkDark, fontSize: 12.5, fontFamily: FontFamily.bold }, boostBadge: { position: 'relative', overflow: 'hidden', borderRadius: Radii.pill, paddingHorizontal: 10, paddingVertical: 5 }, boostBadgeText: { fontSize: 12, fontFamily: FontFamily.extraBold, letterSpacing: 0.3 }, badgeSweep: { position: 'absolute', top: 0, bottom: 0, width: 24, transform: [{ skewX: '-18deg' }] },
    gridRow: { flexDirection: 'row' }, rail: { width: 20, marginTop: 16, gap: 2.6 }, dayLabel: { height: 11, color: C.faint, fontSize: 8.5, lineHeight: 11, fontFamily: FontFamily.semiBold }, months: { height: 16, position: 'relative' }, month: { position: 'absolute', width: 22, color: C.faint, fontSize: 9, lineHeight: 10, fontFamily: FontFamily.semiBold }, weeks: { flexDirection: 'row', gap: 2.6 }, week: { gap: 2.6 }, cell: { width: 9, height: 9, borderRadius: 2.5, overflow: 'hidden' }, emptyCell: {}, todayCell: { borderWidth: 1.6, borderStyle: 'solid', borderColor: C.primary },
    legend: { marginTop: Spacing.xs, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }, legendLabel: { color: C.faint, fontSize: 10, fontFamily: FontFamily.medium }, legendCell: { width: 11, height: 11, borderRadius: 4 },
    today: { borderTopWidth: 1, borderTopColor: C.line, marginTop: 9, paddingTop: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }, todayCopy: { flex: 1, minWidth: 0 }, todayValueRow: { flexDirection: 'row', alignItems: 'center', gap: 7 }, todayLabel: { color: C.ink2, fontSize: 11, fontFamily: FontFamily.extraBold, marginTop: 1 }, todayValue: { color: C.inkDark, fontSize: 19, fontFamily: FontFamily.extraBold }, todayRate: { borderWidth: 1, borderRadius: Radii.pill, paddingHorizontal: 6, paddingVertical: 2 }, todayRateText: { fontSize: 10.5, fontFamily: FontFamily.extraBold }, countdownPill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radii.pill, paddingHorizontal: 12, paddingVertical: 6 }, countdownIcon: { fontSize: 12, lineHeight: 16 }, countdown: { fontSize: 16, fontFamily: FontFamily.extraBold, letterSpacing: 0.25, fontVariant: ['tabular-nums'] },
    modal: { flex: 1, justifyContent: 'flex-end' }, legendModal: { flex: 1, justifyContent: 'center', padding: Spacing.lg }, backdrop: { ...StyleSheet.absoluteFill, backgroundColor: C.scrim }, sheet: { alignSelf: 'center', width: '100%', maxWidth: 480, overflow: 'hidden', backgroundColor: C.surface, borderTopLeftRadius: Radii.xxl, borderTopRightRadius: Radii.xxl, paddingTop: 12, paddingHorizontal: Spacing.lg, paddingBottom: Spacing.lg, gap: Spacing.sm }, legendSheet: { alignSelf: 'center', width: '100%', maxWidth: 480, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: Radii.xl, padding: Spacing.lg, ...Shadows.medium }, scoringSheetContainer: { alignSelf: 'center', width: '100%', maxWidth: 480, maxHeight: '90%', overflow: 'hidden', backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: Radii.xl, ...Shadows.medium }, scoringSheet: { flexShrink: 1 }, scoringSheetContent: { padding: Spacing.lg }, legendTitle: { flex: 1, color: C.inkDark, fontSize: 20, lineHeight: 26, fontFamily: FontFamily.extraBold }, legendSubtitle: { color: C.muted, fontSize: 13, lineHeight: 17, fontFamily: FontFamily.regular, marginTop: 2 }, legendDivider: { height: 1, backgroundColor: C.line, marginVertical: Spacing.md }, legendItem: { minHeight: 48, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: C.line, gap: Spacing.sm }, legendItemLast: { borderBottomWidth: 0 }, scoringSubtitle: { color: C.muted, fontSize: 13, lineHeight: 17, fontFamily: FontFamily.regular, marginTop: -Spacing.sm }, scoringSection: { color: C.primaryText, fontSize: 12, letterSpacing: .4, fontFamily: FontFamily.extraBold, marginTop: Spacing.sm }, scoringDivider: { height: StyleSheet.hairlineWidth, backgroundColor: C.line }, scoringNumber: { width: 26, height: 26, borderRadius: 13, overflow: 'hidden', textAlign: 'center', color: C.onAccent, backgroundColor: C.primary, fontSize: 14, lineHeight: 26, fontFamily: FontFamily.extraBold }, starBadge: { width: 26, height: 26, borderRadius: 13, overflow: 'hidden', textAlign: 'center', color: C.onAccent, backgroundColor: C.starGold, fontSize: 14, lineHeight: 26, fontFamily: FontFamily.extraBold }, scoringCopy: { flex: 1 }, scoringExample: { color: C.muted, fontSize: 13, lineHeight: 17, fontFamily: FontFamily.regular, marginTop: 1 }, legendItemColor: { width: 30, height: 30, borderRadius: Radii.sm }, emptyLegendCell: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.line2 }, legendRange: { color: C.inkDark, fontSize: 15, fontFamily: FontFamily.extraBold }, legendUnit: { color: C.muted, fontSize: 13, fontFamily: FontFamily.medium, marginLeft: -4 }, legendHint: { flex: 1, color: C.faint, fontSize: 12, textAlign: 'right', fontFamily: FontFamily.medium }, legendGridTitle: { color: C.faint, fontSize: 11, lineHeight: 14, fontFamily: FontFamily.extraBold }, legendSample: { flexDirection: 'row', gap: 8, marginTop: Spacing.sm }, legendSampleCell: { width: 34, height: 34, borderRadius: Radii.sm }, legendItemText: { flex: 1, color: C.inkDark, fontSize: 15, fontFamily: FontFamily.extraBold }, legendCloseButton: { width: 32, height: 32, borderRadius: 16, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }, legendCloseGlyph: { color: C.muted, fontSize: 22, lineHeight: 24, fontFamily: FontFamily.regular }, rewardGlow: { position: 'absolute', top: 0, left: 0, right: 0 }, grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: C.line2 }, sheetHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md }, sheetTitleCopy: { flex: 1, minHeight: 44, justifyContent: 'center' }, sheetDate: { color: C.inkDark, fontSize: 17, lineHeight: 24, fontFamily: FontFamily.bold, marginTop: 3 }, closeButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }, closeGlyph: { color: C.muted, fontSize: 28, lineHeight: 28, fontFamily: FontFamily.regular }, rewardCopy: { alignItems: 'center', paddingVertical: Spacing.xs }, rewardStars: { fontSize: 50, lineHeight: 54, fontFamily: FontFamily.extraBold, letterSpacing: -2 }, rewardSubtitle: { color: C.muted, fontSize: 14, fontFamily: FontFamily.bold, marginTop: 2 }, pointsCard: { minHeight: 70, borderWidth: 1, borderColor: C.line, borderRadius: Radii.md, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.md }, pointsValue: { color: C.inkDark, fontSize: 24, fontFamily: FontFamily.extraBold, letterSpacing: -.7 }, pointsGoal: { color: C.muted, fontSize:14, fontFamily: FontFamily.bold }, pointsLabel: { color: C.muted, fontSize: 11, fontFamily: FontFamily.extraBold, marginTop: 2 }, dismissButton: { minHeight: 52, borderRadius: Radii.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.lg }, dismissButtonText: { color: '#141816', fontSize: 16, fontFamily: FontFamily.extraBold }, // rewardCta fill stays bright yellow in both themes, so its text stays fixed dark ink (same value onAccent uses for the same reason) instead of theme-adaptive C.inkDark, which flips to near-white in dark mode
  });
}

const styles = StyleSheet.create({
  ring: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  ringValue: { position: 'absolute', fontSize: 11, fontFamily: FontFamily.extraBold },
});
