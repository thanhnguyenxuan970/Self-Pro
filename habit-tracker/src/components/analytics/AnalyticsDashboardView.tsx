import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { AnalyticsDashboard, AnalyticsRange } from '../../analytics/dashboardModel';
import { AppColors, FontFamily, Radii, Spacing } from '../../config/theme';

type Props = { data: AnalyticsDashboard; colors: AppColors; isDark: boolean; language: 'vi' | 'en'; range: AnalyticsRange; reduceMotion: boolean; animationKey: number };
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const copy = (vi: boolean) => vi ? {
  volume: 'KHỐI LƯỢNG', points: 'ĐIỂM', stars: 'SAO', goal: 'NGÀY ĐẠT MỤC TIÊU', chart: 'Điểm theo ngày', thisWeek: 'Tuần này', last: 'Trước đó', consistency: 'ĐỀU ĐẶN', rhythm: 'NHỊP ĐỘ', rhythmHint: '12 tuần gần đây', weekday: 'Theo thứ', hour: 'Theo giờ', composition: 'THÀNH PHẦN', share: 'TỶ LỆ', logs: 'LƯỢT', week: 'tuần này', days: 'ngày đạt mục tiêu', peak: 'đỉnh', goalLine: 'MỤC TIÊU 50', all: 'Tất cả thời gian', days30: '30 ngày', goalNote: (n: number, days: number, peak: string, value: number) => `${n} / ${days} ngày đạt mục tiêu · đỉnh ${peak}, ${value} điểm`, hourNote: 'đỉnh 20–24h'
} : {
  volume: 'VOLUME', points: 'POINTS', stars: 'STARS', goal: 'DAYS AT GOAL', chart: 'Points per day', thisWeek: 'This week', last: 'Last', consistency: 'CONSISTENCY', rhythm: 'RHYTHM', rhythmHint: '12-week averages', weekday: 'By weekday', hour: 'By hour', composition: 'COMPOSITION', share: 'SHARE', logs: 'N', week: 'this week', days: 'days at goal', peak: 'peak', goalLine: 'GOAL 50', all: 'All time', days30: '30 days', goalNote: (n: number, days: number, peak: string, value: number) => `${n} of ${days} days above goal · ${peak} ${value} pts`, hourNote: 'peak 20–24h'
};
const delta = (current: number, previous: number) => current - previous;

/** Drives an Animated.Value from 0 to 1 (or straight to 1 under reduce-motion)
 *  whenever `deps` changes. Shared by AnimatedBar and ProgressRing, which only
 *  differ in duration/delay/useNativeDriver. */
function useFillAnimation(opts: {
  reduceMotion: boolean; duration: number; delay?: number; useNativeDriver: boolean; deps: React.DependencyList;
}): Animated.Value {
  const { reduceMotion, duration, delay = 0, useNativeDriver, deps } = opts;
  const fill = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  useEffect(() => {
    if (reduceMotion) { fill.setValue(1); return; }
    fill.setValue(0);
    const animation = Animated.timing(fill, { toValue: 1, delay, duration, easing: Easing.out(Easing.cubic), useNativeDriver });
    animation.start();
    return () => animation.stop();
    // deps is caller-provided; fill/duration/delay/useNativeDriver are covered via deps or stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return fill;
}

function AnimatedBar({ value, max, color, style, reduceMotion, animationKey, delay = 0 }: { value: number; max: number; color: string; style: object; reduceMotion: boolean; animationKey: number; delay?: number }) {
  const fill = useFillAnimation({ reduceMotion, duration: 460, delay, useNativeDriver: false, deps: [animationKey, delay, reduceMotion, value] });
  const height = fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', `${value > 0 ? Math.max(2, value / max * 100) : 0}%`] });
  return <Animated.View style={[style, { backgroundColor: color, height }]} />;
}

function ProgressRing({ value, color, track, reduceMotion, animationKey, label }: { value: number; color: string; track: string; reduceMotion: boolean; animationKey: number; label: string }) {
  const size = 68, radius = 28, circumference = 2 * Math.PI * radius;
  const fill = useFillAnimation({ reduceMotion, duration: 620, useNativeDriver: true, deps: [animationKey, reduceMotion, value] });
  const dashOffset = fill.interpolate({ inputRange: [0, 1], outputRange: [circumference, circumference * (1 - Math.min(1, value / 100))] });
  return <View accessibilityLabel={`${label}: ${value}%`}><Svg width={size} height={size}><Circle cx={34} cy={34} r={radius} fill="none" stroke={track} strokeWidth={8} /><AnimatedCircle cx={34} cy={34} r={radius} fill="none" stroke={color} strokeWidth={8} strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={dashOffset} rotation="-90" origin="34, 34" /></Svg></View>;
}

export function AnalyticsDashboardView({ data, colors: C, isDark, language, range, reduceMotion, animationKey }: Props) {
  const s = useMemo(() => styles(C, isDark), [C, isDark]);
  const t = copy(language === 'vi');
  const max = Math.max(1, data.goal, ...data.bars.flatMap(bar => [bar.current, bar.previous])) * 1.2;
  const peak = data.bars.reduce((best, bar) => bar.current > best.current ? bar : best, data.bars[0]);
  const weekdayMax = Math.max(1, ...data.weekday.map(day => day.value));
  const hourMax = Math.max(1, ...data.hours.map(hour => hour.value));
  const totalLogs = Math.max(1, data.composition.reduce((total, row) => total + row.count, 0));
  const showPrevious = range === 'W';
  const metric = (value: number, previous: number, label: string, suffix = '') => <View style={s.metric} key={label}><Text style={s.metricLabel}>{label}</Text><Text style={s.metricValue}>{value}{suffix}</Text><Text style={[s.delta, delta(value, previous) < 0 && s.deltaBad]}>{delta(value, previous) >= 0 ? '▲' : '▼'}{Math.abs(delta(value, previous))}</Text></View>;
  return <View>
    <Text style={s.section}>{t.volume}</Text>
    <View style={s.metrics}>{metric(data.points, data.previousPoints, t.points)}{metric(data.stars, data.previousStars, t.stars)}{metric(data.daysAtGoal, 0, t.goal, `/${data.possibleDays}`)}</View>
    <View style={s.card}>
      <View style={s.chartHeader}><Text style={s.cardTitle}>{range === 'Y' ? (language === 'vi' ? 'Điểm theo tháng' : 'Points per month') : t.chart}</Text><Text style={s.legend}><Text style={s.dotCurrent}>●</Text> {range === 'W' ? t.thisWeek : range === 'M' ? (language === 'vi' ? 'Tháng này' : 'This month') : (language === 'vi' ? 'Năm nay' : 'This year')}  <Text style={s.dotPrevious}>●</Text> {t.last}</Text></View>
      <View style={s.chart}>
        {data.goal > 0 && <><View style={[s.goalLine, { bottom: `${(data.goal / max) * 100}%` }]} /><Text style={[s.goalText, { bottom: `${(data.goal / max) * 100}%` }]}>{language === 'vi' ? `MỤC TIÊU ${data.goal}` : `GOAL ${data.goal}`}</Text></>}
        {data.bars.map((bar, index) => <View style={s.barCol} key={index}><View style={s.barPair}>{showPrevious && <AnimatedBar value={bar.previous} max={max} color={C.faint} style={s.barPrevious} reduceMotion={reduceMotion} animationKey={animationKey} delay={index * 30} />}<AnimatedBar value={bar.current} max={max} color={data.goal > 0 && bar.current < data.goal ? '#76672A' : C.starGoldText} style={[s.barCurrent, !showPrevious && s.barCurrentSolo]} reduceMotion={reduceMotion} animationKey={animationKey} delay={index * 30 + (showPrevious ? 70 : 0)} /></View><Text style={s.barLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{bar.label}</Text></View>)}
      </View>
      <View style={s.rule} /><Text style={s.note}>{t.goalNote(data.daysAtGoal, data.possibleDays, peak?.label ?? '', peak?.current ?? 0)}</Text>
    </View>
    <Text style={s.section}>{t.consistency}</Text>
    <View style={s.card}><View style={s.rings}>{[[data.consistency.week, t.week], [data.consistency.month, t.days30], [data.consistency.all, t.all]].map(([value, label], index) => <View style={s.ringItem} key={String(label)}><ProgressRing value={Number(value)} label={String(label)} color={index === 2 ? C.inkDark : C.starGoldText} track={C.surface3} reduceMotion={reduceMotion} animationKey={animationKey} /><Text style={s.ringLabel}>{label}</Text></View>)}</View></View>
    <View style={s.sectionHeader}><Text style={s.sectionHeaderTitle}>{t.rhythm}</Text><Text style={s.sectionHint}>{t.rhythmHint}</Text></View>
    <View style={s.card}><Text style={s.cardTitle}>{t.weekday}</Text>{data.weekday.map(day => <View style={s.rhythmRow} key={day.label}><Text style={s.rhythmLabel}>{day.label}</Text><View style={s.rhythmTrack}><View style={[s.rhythmFill, { width: `${day.value / weekdayMax * 100}%`, backgroundColor: day.label === 'Sa' ? C.danger : C.starGoldText }]} /></View><Text style={s.rhythmValue}>{day.value}</Text></View>)}
      <View style={s.rule} /><View style={s.chartHeader}><Text style={s.cardTitle}>{t.hour}</Text><Text style={s.legend}>{t.hourNote}</Text></View><View style={s.hours}>{data.hours.map(hour => <View style={s.hourCol} key={hour.label}><View style={[s.hourBar, { height: `${Math.max(4, hour.value / hourMax * 100)}%` }]} /><Text style={s.hourLabel}>{hour.label}</Text></View>)}</View>
    </View>
    <View style={s.sectionHeader}><Text style={s.sectionHeaderTitle}>{t.composition}</Text><Text style={s.sectionHint}>{totalLogs} {t.logs.toLowerCase()} {t.week}</Text></View>
    <View style={s.card}><View style={s.compHead}><Text style={s.compName}>{language === 'vi' ? 'THÓI QUEN' : 'HABIT'}</Text><Text style={s.compMeta}>{t.share}   {t.logs}   Δ WK</Text></View>{data.composition.map(row => <View style={s.compRow} key={row.name}><Text style={s.compName} numberOfLines={1}>{row.name}</Text><View style={s.compTrack}><View style={[s.compFill, { width: `${row.count / Math.max(1, data.composition[0]?.count ?? 1) * 100}%` }]} /></View><Text style={s.compCount}>{row.count}</Text><Text style={[s.compDelta, row.count < row.previous && s.deltaBad]}>{row.count - row.previous >= 0 ? '+' : ''}{row.count - row.previous}</Text></View>)}</View>
  </View>;
}

function styles(C: AppColors, isDark: boolean) { const card = isDark ? C.surface2 : C.surface; return StyleSheet.create({
  sectionHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 20, marginBottom: 9 }, section: { color: C.starGoldText, fontFamily: FontFamily.bold, fontSize: 12, marginTop: 20, marginBottom: 9, letterSpacing: .3 }, sectionHeaderTitle: { color: C.starGoldText, fontFamily: FontFamily.bold, fontSize: 12, letterSpacing: .3 }, sectionHint: { color: C.muted, fontFamily: FontFamily.regular, fontSize: 11 },
  metrics: { backgroundColor: card, borderColor: C.line, borderWidth: 1, borderRadius: Radii.lg, flexDirection: 'row', overflow: 'hidden' }, metric: { flex: 1, padding: 13, borderRightColor: C.line, borderRightWidth: 1 }, metricLabel: { color: C.muted, fontFamily: FontFamily.bold, fontSize: 10 }, metricValue: { color: C.starGoldText, fontFamily: FontFamily.extraBold, fontSize: 26, marginTop: 3 }, delta: { color: C.primary, fontFamily: FontFamily.bold, fontSize: 11 }, deltaBad: { color: C.danger }, card: { backgroundColor: card, borderColor: C.line, borderWidth: 1, borderRadius: Radii.lg, padding: 14, marginBottom: 2 }, cardTitle: { color: C.inkDark, fontFamily: FontFamily.bold, fontSize: 14 }, chartHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }, legend: { color: C.muted, fontFamily: FontFamily.regular, fontSize: 10 }, dotCurrent: { color: C.starGoldText }, dotPrevious: { color: C.faint }, chart: { height: 180, marginTop: 14, paddingRight: 54, borderBottomColor: C.line2, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around', position: 'relative' }, goalLine: { borderTopColor: C.starGoldText, borderTopWidth: 1, borderStyle: 'dashed', left: 0, position: 'absolute', right: 0 }, goalText: { color: C.starGoldText, elevation: 1, fontFamily: FontFamily.bold, fontSize: 9, position: 'absolute', right: 0, zIndex: 1 }, barCol: { alignItems: 'center', flex: 1, height: '100%', justifyContent: 'flex-end' }, barPair: { alignItems: 'flex-end', flexDirection: 'row', height: '100%', justifyContent: 'center', width: '100%' }, barCurrent: { backgroundColor: C.starGoldText, borderTopLeftRadius: 3, borderTopRightRadius: 3, marginLeft: 3, width: 8 }, barCurrentSolo: { marginLeft: 0, width: 10 }, barPrevious: { backgroundColor: C.faint, borderTopLeftRadius: 3, borderTopRightRadius: 3, width: 8 }, barLabel: { color: C.muted, fontFamily: FontFamily.bold, fontSize: 10, marginTop: 8 }, rule: { backgroundColor: C.line, height: 1, marginTop: 14 }, note: { color: C.ink2, fontFamily: FontFamily.regular, fontSize: 11, lineHeight: 16, marginTop: 10 }, rings: { flexDirection: 'row', justifyContent: 'space-around' }, ringItem: { alignItems: 'center' }, ring: { alignItems: 'center', borderRadius: 30, borderWidth: 6, height: 58, justifyContent: 'center', width: 58 }, ringValue: { color: C.inkDark, fontFamily: FontFamily.extraBold, fontSize: 16 }, ringLabel: { color: C.muted, fontFamily: FontFamily.regular, fontSize: 10, marginTop: 7 }, rhythmRow: { alignItems: 'center', flexDirection: 'row', marginTop: 9 }, rhythmLabel: { color: C.muted, fontFamily: FontFamily.bold, fontSize: 10, width: 28 }, rhythmTrack: { backgroundColor: C.surface3, borderRadius: 5, flex: 1, height: 9 }, rhythmFill: { borderRadius: 5, height: 9 }, rhythmValue: { color: C.inkDark, fontFamily: FontFamily.bold, fontSize: 11, textAlign: 'right', width: 30 }, hours: { alignItems: 'flex-end', flexDirection: 'row', height: 80, justifyContent: 'space-around', marginTop: 8 }, hourCol: { alignItems: 'center', height: '100%', justifyContent: 'flex-end', width: 28 }, hourBar: { backgroundColor: C.starGoldText, borderTopLeftRadius: 2, borderTopRightRadius: 2, width: '100%' }, hourLabel: { color: C.muted, fontFamily: FontFamily.regular, fontSize: 9, marginTop: 5 }, compHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 7 }, compMeta: { color: C.muted, fontFamily: FontFamily.bold, fontSize: 9 }, compRow: { alignItems: 'center', flexDirection: 'row', marginTop: 11 }, compName: { color: C.inkDark, flex: 1, fontFamily: FontFamily.bold, fontSize: 12 }, compTrack: { backgroundColor: C.surface3, borderRadius: 4, height: 6, width: 76 }, compFill: { backgroundColor: C.starGoldText, borderRadius: 4, height: 6 }, compCount: { color: C.inkDark, fontFamily: FontFamily.bold, textAlign: 'right', width: 34 }, compDelta: { color: C.primary, fontFamily: FontFamily.bold, textAlign: 'right', width: 31 },
}); }
