import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { AnalyticsDashboard, AnalyticsRange } from '../../analytics/dashboardModel';
import { AppColors, FontFamily, Radii } from '../../config/theme';

type Props = { data: AnalyticsDashboard; colors: AppColors; isDark: boolean; language: 'vi' | 'en'; range: AnalyticsRange; reduceMotion: boolean; animationKey: number };
const copy = (vi: boolean) => vi ? {
  volume: 'KHỐI LƯỢNG', points: 'ĐIỂM', stars: 'SAO', goal: 'NGÀY ĐẠT MỤC TIÊU', chart: 'Điểm theo ngày', thisWeek: 'Tuần này', last: 'Trước đó', consistency: 'ĐỀU ĐẶN', rhythm: 'NHỊP ĐỘ', weekday: 'Theo thứ', hour: 'Theo giờ', composition: 'THÀNH PHẦN', share: 'TỶ LỆ', logs: 'LƯỢT', all: 'Tất cả thời gian', goalNote: (n: number, days: number, peak: string, value: number) => `${n} / ${days} ngày đạt mục tiêu · đỉnh ${peak}, ${value} điểm`, hourNote: 'đỉnh 20–24h'
} : {
  volume: 'VOLUME', points: 'POINTS', stars: 'STARS', goal: 'DAYS AT GOAL', chart: 'Points per day', thisWeek: 'This week', last: 'Last', consistency: 'CONSISTENCY', rhythm: 'RHYTHM', weekday: 'By weekday', hour: 'By hour', composition: 'COMPOSITION', share: 'SHARE', logs: 'N', all: 'All time', goalNote: (n: number, days: number, peak: string, value: number) => `${n} of ${days} days above goal · ${peak} ${value} pts`, hourNote: 'peak 20–24h'
};
const delta = (current: number, previous: number) => current - previous;

/** Drives the daily-chart bars from 0 to their data value. */
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

function ProgressRing({ value, color, track, label, textStyle }: { value: number; color: string; track: string; label: string; textStyle: object }) {
  const size = 68, radius = 28, circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - Math.min(1, value / 100));
  return (
    <View accessibilityLabel={`${label}: ${value}%`} style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={34} cy={34} r={radius} fill="none" stroke={track} strokeWidth={8} />
        <Circle cx={34} cy={34} r={radius} fill="none" stroke={color} strokeWidth={8} strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={dashOffset} rotation="-90" origin="34, 34" />
      </Svg>
      <Text style={textStyle}>{Math.round(value)}%</Text>
    </View>
  );
}

export function AnalyticsDashboardView({ data, colors, isDark, language, range, reduceMotion, animationKey }: Props) {
  const C = useMemo(() => ({ ...colors, starGoldText: colors.primary, starGoldMuted: colors.primaryLine }), [colors]);
  const s = useMemo(() => styles(C, isDark), [C, isDark]);
  const t = copy(language === 'vi');
  const chartMax = Math.max(data.goal * 2, Math.ceil(Math.max(data.goal, ...data.bars.flatMap(bar => [bar.current, bar.previous])) / (data.goal * 2)) * data.goal * 2);
  const peak = data.bars.reduce((best, bar) => bar.current > best.current ? bar : best, data.bars[0]);
  const weekdayMax = Math.max(1, ...data.weekday.map(day => day.value));
  const hourMax = Math.max(1, ...data.hours.map(hour => hour.value));
  const totalLogs = data.composition.reduce((total, row) => total + row.count, 0);
  const showPrevious = range === 'W';
  const rangeLabels = range === 'W'
    ? { first: language === 'vi' ? 'tuần này' : 'this week', second: language === 'vi' ? '30 ngày' : '30 days', rhythm: language === 'vi' ? '12 tuần gần đây' : '12-week averages', period: language === 'vi' ? 'tuần này' : 'this week', delta: 'WK' }
    : range === 'M'
      ? { first: language === 'vi' ? 'tháng này' : 'this month', second: language === 'vi' ? 'tháng trước' : 'prev month', rhythm: language === 'vi' ? '4 tuần gần đây' : '4-week averages', period: language === 'vi' ? 'tháng này' : 'this month', delta: 'MO' }
      : { first: language === 'vi' ? 'năm nay' : 'this year', second: language === 'vi' ? 'tháng tốt nhất' : 'best month', rhythm: language === 'vi' ? '52 tuần gần đây' : '52-week averages', period: language === 'vi' ? 'năm nay' : 'this year', delta: 'YR' };
  const metric = (value: number, previous: number, label: string, suffix = '') => <View style={s.metric} key={label}><Text style={s.metricLabel}>{label}</Text><Text style={s.metricValue}>{value}{suffix}</Text><Text style={[s.delta, delta(value, previous) < 0 && s.deltaBad]}>{delta(value, previous) >= 0 ? '▲' : '▼'}{Math.abs(delta(value, previous))}</Text></View>;
  return <View>
    <Text style={s.section}>{t.volume}</Text>
    <View style={[s.metrics, { marginBottom: 14 }]}>{metric(data.points, data.previousPoints, t.points)}{metric(data.stars, data.previousStars, t.stars)}{metric(data.daysAtGoal, data.previousDaysAtGoal, t.goal, `/${data.possibleDays}`)}</View>
    <View style={s.card}>
      <View style={s.chartHeader}><Text style={s.cardTitle}>{range === 'Y' ? (language === 'vi' ? 'Điểm theo tháng' : 'Points per month') : t.chart}</Text><Text style={s.legend}><Text style={s.dotCurrent}>●</Text> {range === 'W' ? t.thisWeek : range === 'M' ? (language === 'vi' ? 'Tổng theo ngày' : 'Daily total') : (language === 'vi' ? 'Tổng theo tháng' : 'Monthly total')}{showPrevious && <><Text style={s.dotPrevious}> ●</Text> {t.last}</>} <Text style={s.dotBelow}>●</Text> {language === 'vi' ? 'Dưới mục tiêu' : 'Below goal'}</Text></View>
      <View style={[s.chart, { height: 235, paddingLeft: 26, paddingRight: 0 }]}>
        {[0, 50, 100].map((percent) => <View key={percent} pointerEvents="none" style={{ borderTopColor: C.line, borderTopWidth: 1, borderStyle: 'dotted', bottom: `${percent}%`, left: 0, position: 'absolute', right: 0 }} />)}
        <Text pointerEvents="none" style={{ color: C.muted, fontFamily: FontFamily.regular, fontSize: 9, left: 0, position: 'absolute', top: -7 }}>{chartMax}</Text>
        <Text pointerEvents="none" style={{ color: C.muted, fontFamily: FontFamily.regular, fontSize: 9, left: 0, position: 'absolute', top: '47%' }}>{chartMax / 2}</Text>
        <Text pointerEvents="none" style={{ color: C.muted, fontFamily: FontFamily.regular, fontSize: 9, left: 0, position: 'absolute', bottom: -2 }}>0</Text>
        {data.goal > 0 && <><View style={[s.goalLine, { bottom: `${(data.goal / chartMax) * 100}%` }]} /><Text style={[s.goalText, { backgroundColor: isDark ? C.surface2 : C.surface, bottom: `${(data.goal / chartMax) * 100}%`, left: 24, paddingHorizontal: 3, right: undefined }]}>{language === 'vi' ? `MỤC TIÊU ${data.goal}` : `GOAL ${data.goal}`}</Text></>}
        {data.bars.map((bar, index) => <View style={s.barCol} key={index}><View style={s.barPair}>{showPrevious && <AnimatedBar value={bar.previous} max={chartMax} color={C.faint} style={s.barPrevious} reduceMotion={reduceMotion} animationKey={animationKey} delay={index * 30} />}<AnimatedBar value={bar.current} max={chartMax} color={data.goal > 0 && bar.current < data.goal ? C.starGoldMuted : C.starGoldText} style={[s.barCurrent, !showPrevious && s.barCurrentSolo]} reduceMotion={reduceMotion} animationKey={animationKey} delay={index * 30 + (showPrevious ? 70 : 0)} /></View><Text style={s.barLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{bar.label}</Text></View>)}
      </View>
      <View style={s.rule} /><Text style={s.note}>{t.goalNote(data.daysAtGoal, data.possibleDays, peak?.label ?? '', peak?.current ?? 0)}</Text>
    </View>
    <Text style={s.section}>{t.consistency}</Text>
    <View style={s.card}><View style={s.rings}>{[[data.consistency.week, rangeLabels.first], [data.consistency.month, rangeLabels.second], [data.consistency.all, t.all]].map(([value, label], index) => <View style={s.ringItem} key={String(label)}><ProgressRing value={Number(value)} label={String(label)} color={index === 2 ? C.inkDark : C.starGoldText} track={C.surface3} textStyle={s.ringValue} /><Text style={s.ringLabel}>{label}</Text></View>)}</View></View>
    <View style={s.sectionHeader}><Text style={s.sectionHeaderTitle}>{t.rhythm}</Text><Text style={s.sectionHint}>{rangeLabels.rhythm}</Text></View>
    <View style={s.card}><Text style={s.cardTitle}>{t.weekday}</Text>{data.weekday.map(day => <View style={s.rhythmRow} key={day.label}><Text style={s.rhythmLabel}>{day.label}</Text><View style={s.rhythmTrack}><View style={[s.rhythmFill, { width: `${day.value / weekdayMax * 100}%`, backgroundColor: day.dayOfWeek === 6 ? C.danger : C.starGoldText }]} /></View><Text style={s.rhythmValue}>{day.value}</Text></View>)}
      <View style={s.rule} /><View style={s.chartHeader}><Text style={s.cardTitle}>{t.hour}</Text><Text style={s.legend}>{t.hourNote}</Text></View><View style={s.hours}>{data.hours.map(hour => <View style={s.hourCol} key={hour.label}><View style={[s.hourBar, { height: `${Math.max(4, hour.value / hourMax * 100)}%` }]} /><Text style={s.hourLabel}>{hour.label}</Text></View>)}</View>
    </View>
    <View style={s.sectionHeader}><Text style={s.sectionHeaderTitle}>{t.composition}</Text><Text style={s.sectionHint}>{totalLogs} {language === 'vi' ? 'lượt' : 'logs'} {rangeLabels.period}</Text></View>
    <View style={s.card}><View style={s.compHead}><Text style={s.compName}>{language === 'vi' ? 'THÓI QUEN' : 'HABIT'}</Text><Text style={s.compMeta}>{t.share}   {t.logs}   Δ {rangeLabels.delta}</Text></View>{data.composition.map(row => <View style={s.compRow} key={row.name}><Text style={s.compName} numberOfLines={1}>{row.name}</Text><View style={s.compTrack}><View style={[s.compFill, { width: `${row.count / Math.max(1, data.composition[0]?.count ?? 1) * 100}%` }]} /></View><Text style={s.compCount}>{row.count}</Text><Text style={[s.compDelta, row.count < row.previous && s.deltaBad]}>{row.count - row.previous >= 0 ? '+' : ''}{row.count - row.previous}</Text></View>)}</View>
  </View>;
}

function styles(C: AppColors, isDark: boolean) { const card = isDark ? C.surface2 : C.surface; return StyleSheet.create({
  sectionHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 20, marginBottom: 9 }, section: { color: C.starGoldText, fontFamily: FontFamily.bold, fontSize: 12, marginTop: 20, marginBottom: 9, letterSpacing: .3 }, sectionHeaderTitle: { color: C.starGoldText, fontFamily: FontFamily.bold, fontSize: 12, letterSpacing: .3 }, sectionHint: { color: C.muted, fontFamily: FontFamily.regular, fontSize: 11 },
  metrics: { backgroundColor: card, borderColor: C.line, borderWidth: 1, borderRadius: Radii.lg, flexDirection: 'row', overflow: 'hidden' }, metric: { flex: 1, padding: 13, borderRightColor: C.line, borderRightWidth: 1 }, metricLabel: { color: C.muted, fontFamily: FontFamily.bold, fontSize: 10 }, metricValue: { color: C.starGoldText, fontFamily: FontFamily.extraBold, fontSize: 26, marginTop: 3 }, delta: { color: C.primaryPress, fontFamily: FontFamily.bold, fontSize: 11 }, deltaBad: { color: C.danger }, card: { backgroundColor: card, borderColor: C.line, borderWidth: 1, borderRadius: Radii.lg, padding: 14, marginBottom: 2 }, cardTitle: { color: C.inkDark, fontFamily: FontFamily.bold, fontSize: 14 }, chartHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }, legend: { color: C.muted, flexShrink: 1, fontFamily: FontFamily.regular, fontSize: 10, textAlign: 'right' }, dotCurrent: { color: C.starGoldText }, dotPrevious: { color: C.muted }, dotBelow: { color: C.starGoldMuted }, chart: { height: 180, marginTop: 14, paddingRight: 54, borderBottomColor: C.line2, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around', position: 'relative' }, goalLine: { borderTopColor: C.starGoldText, borderTopWidth: 1, borderStyle: 'dashed', left: 0, position: 'absolute', right: 0 }, goalText: { color: C.starGoldText, elevation: 1, fontFamily: FontFamily.bold, fontSize: 9, position: 'absolute', right: 0, zIndex: 1 }, barCol: { alignItems: 'center', flex: 1, height: '100%', justifyContent: 'flex-end' }, barPair: { alignItems: 'flex-end', flexDirection: 'row', height: '100%', justifyContent: 'center', width: '100%' }, barCurrent: { backgroundColor: C.starGoldText, borderTopLeftRadius: 3, borderTopRightRadius: 3, marginLeft: 3, width: 8 }, barCurrentSolo: { marginLeft: 0, width: 10 }, barPrevious: { backgroundColor: C.faint, borderTopLeftRadius: 3, borderTopRightRadius: 3, width: 8 }, barLabel: { color: C.muted, fontFamily: FontFamily.bold, fontSize: 10, marginTop: 8 }, rule: { backgroundColor: C.line, height: 1, marginTop: 14 }, note: { color: C.ink2, fontFamily: FontFamily.regular, fontSize: 11, lineHeight: 16, marginTop: 10 }, rings: { flexDirection: 'row', justifyContent: 'space-around' }, ringItem: { alignItems: 'center' }, ringValue: { color: C.inkDark, fontFamily: FontFamily.extraBold, fontSize: 16 }, ringLabel: { color: C.muted, fontFamily: FontFamily.regular, fontSize: 10, marginTop: 7 }, rhythmRow: { alignItems: 'center', flexDirection: 'row', marginTop: 9 }, rhythmLabel: { color: C.muted, fontFamily: FontFamily.bold, fontSize: 10, width: 28 }, rhythmTrack: { backgroundColor: C.surface3, borderRadius: 5, flex: 1, height: 9 }, rhythmFill: { borderRadius: 5, height: 9 }, rhythmValue: { color: C.inkDark, fontFamily: FontFamily.bold, textAlign: 'right', width: 30 }, hours: { alignItems: 'flex-end', flexDirection: 'row', height: 80, justifyContent: 'space-around', marginTop: 8 }, hourCol: { alignItems: 'center', height: '100%', justifyContent: 'flex-end', width: 28 }, hourBar: { backgroundColor: C.starGoldText, borderTopLeftRadius: 2, borderTopRightRadius: 2, width: '100%' }, hourLabel: { color: C.muted, fontFamily: FontFamily.regular, fontSize: 9, marginTop: 5 }, compHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 7 }, compMeta: { color: C.muted, fontFamily: FontFamily.bold, fontSize: 9 }, compRow: { alignItems: 'center', flexDirection: 'row', marginTop: 11 }, compName: { color: C.inkDark, flex: 1, fontFamily: FontFamily.bold, fontSize: 12 }, compTrack: { backgroundColor: C.surface3, borderRadius: 4, height: 6, width: 76 }, compFill: { backgroundColor: C.starGoldText, borderRadius: 4, height: 6 }, compCount: { color: C.inkDark, fontFamily: FontFamily.bold, textAlign: 'right', width: 34 }, compDelta: { color: C.primaryPress, fontFamily: FontFamily.bold, textAlign: 'right', width: 31 },
}); }
