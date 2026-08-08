import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { analyticsBarAccessibilityLabel, AnalyticsDashboard, AnalyticsRange } from '../../analytics/dashboardModel';
import { AppColors, FontFamily, Radii } from '../../config/theme';

type Props = { data: AnalyticsDashboard; colors: AppColors; isDark: boolean; language: 'vi' | 'en'; range: AnalyticsRange; reduceMotion: boolean; animationKey: number };
const copy = (vi: boolean) => vi ? {
  volume: 'KHỐI LƯỢNG', points: 'ĐIỂM', stars: 'SAO', goal: 'NGÀY ĐẠT', chart: 'Điểm theo ngày', thisWeek: 'Tuần này', last: 'Trước đó', consistency: 'ĐỀU ĐẶN', rhythm: 'NHỊP ĐỘ', weekday: 'Theo thứ', hour: 'Theo giờ', composition: 'THÀNH PHẦN', share: 'TỶ LỆ', logs: 'LƯỢT', all: 'Tất cả thời gian', goalNote: (n: number, days: number, peak: string, value: number) => `${n} / ${days} ngày đạt mục tiêu · đỉnh ${peak}, ${value} điểm`, monthNote: (n: number, days: number, zero: number, best: number) => `${n} / ${days} ngày đạt mục tiêu · ${zero} ngày 0 điểm · cao nhất ${best} điểm`, yearNote: (cleared: number, total: number, goal: string, change: number | null, from: string) => `${cleared} / ${total} tháng đạt mốc ${goal} điểm · ${change === null ? 'chưa đủ dữ liệu xu hướng' : change > 0 ? `tăng ${change}% từ ${from}` : change < 0 ? `giảm ${Math.abs(change)}% từ ${from}` : `không đổi từ ${from}`}`, hourNote: (start: string, end: number, share: number) => `đỉnh ${start}–${end}h · ${share}% số điểm`, hourSummary: (weakest: string, value: number, strongest: string, ratio: string | null, start: string, end: number, share: number) => `${weakest} là ngày có tổng điểm thấp nhất (${value} điểm)${ratio ? ` · ${strongest} cao hơn ${ratio} lần` : ''} · ${share}% số điểm tập trung trong khung ${start}–${end}h.`
} : {
  volume: 'VOLUME', points: 'POINTS', stars: 'STARS', goal: 'DAYS REACHED', chart: 'Points per day', thisWeek: 'This week', last: 'Last', consistency: 'CONSISTENCY', rhythm: 'RHYTHM', weekday: 'By weekday', hour: 'By hour', composition: 'COMPOSITION', share: 'SHARE', logs: 'N', all: 'All time', goalNote: (n: number, days: number, peak: string, value: number) => `${n} of ${days} days above goal · ${peak} ${value} pts`, monthNote: (n: number, days: number, zero: number, best: number) => `${n} of ${days} days above goal · ${zero} zero-days · best day ${best} pts`, yearNote: (cleared: number, total: number, goal: string, change: number | null, from: string) => `${cleared} of ${total} months cleared ${goal} pts · ${change === null ? 'not enough trend data' : change > 0 ? `up ${change}% since ${from}` : change < 0 ? `down ${Math.abs(change)}% since ${from}` : `flat since ${from}`}`, hourNote: (start: string, end: number, share: number) => `peak ${start}–${end}h · ${share}% of points`, hourSummary: (weakest: string, value: number, strongest: string, ratio: string | null, start: string, end: number, share: number) => `${weakest} is your lowest-output day (${value} pts)${ratio ? ` · ${strongest} is ${ratio}× higher` : ''} · ${share}% of points land in ${start}–${end}h.`
};
const delta = (current: number, previous: number) => current - previous;
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const MONTH_NAMES = {
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  vi: ['tháng 1', 'tháng 2', 'tháng 3', 'tháng 4', 'tháng 5', 'tháng 6', 'tháng 7', 'tháng 8', 'tháng 9', 'tháng 10', 'tháng 11', 'tháng 12'],
} as const;
const WEEKDAY_NAMES = {
  Mo: { en: 'Monday', vi: 'Thứ hai' }, Tu: { en: 'Tuesday', vi: 'Thứ ba' }, We: { en: 'Wednesday', vi: 'Thứ tư' },
  Th: { en: 'Thursday', vi: 'Thứ năm' }, Fr: { en: 'Friday', vi: 'Thứ sáu' }, Sa: { en: 'Saturday', vi: 'Thứ bảy' }, Su: { en: 'Sunday', vi: 'Chủ nhật' },
} as const;
const WEEKDAY_SHORT: Record<string, { en: string; vi: string }> = {
  Mo: { en: 'Mo', vi: 'T2' }, Tu: { en: 'Tu', vi: 'T3' }, We: { en: 'We', vi: 'T4' },
  Th: { en: 'Th', vi: 'T5' }, Fr: { en: 'Fr', vi: 'T6' }, Sa: { en: 'Sa', vi: 'T7' }, Su: { en: 'Su', vi: 'CN' },
};
const MONTH_SHORT: Record<'en' | 'vi', Record<string, string>> = {
  en: { Jan: 'Jan', Feb: 'Feb', Mar: 'Mar', Apr: 'Apr', May: 'May', Jun: 'Jun', Jul: 'Jul', Aug: 'Aug', Sep: 'Sep', Oct: 'Oct', Nov: 'Nov', Dec: 'Dec' },
  vi: { Jan: 'T1', Feb: 'T2', Mar: 'T3', Apr: 'T4', May: 'T5', Jun: 'T6', Jul: 'T7', Aug: 'T8', Sep: 'T9', Oct: 'T10', Nov: 'T11', Dec: 'T12' },
};

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
  // Height is set to its final value directly (not animated) so the entrance
  // can run on the native driver: growth is simulated with a bottom-anchored
  // scaleY instead of animating the height layout property.
  const fill = useFillAnimation({ reduceMotion, duration: 340, delay, useNativeDriver: true, deps: [animationKey, delay, reduceMotion, value] });
  const height = `${value > 0 ? Math.max(2, value / max * 100) : 0}%`;
  return <Animated.View style={[style, { backgroundColor: color, height, transform: [{ scaleY: fill }], transformOrigin: 'bottom' }]} />;
}

function ProgressRing({ value, color, track, label, textStyle, reduceMotion, animationKey, delay }: { value: number; color: string; track: string; label: string; textStyle: object; reduceMotion: boolean; animationKey: number; delay: number }) {
  const size = 68, radius = 28, circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - Math.min(1, value / 100));
  const fill = useFillAnimation({ reduceMotion, duration: 820, delay, useNativeDriver: true, deps: [animationKey, delay, reduceMotion, value] });
  const animatedDashOffset = fill.interpolate({ inputRange: [0, 1], outputRange: [circumference, dashOffset] });
  return (
    <View accessible accessibilityLabel={`${label}: ${value}%`} style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={34} cy={34} r={radius} fill="none" stroke={track} strokeWidth={8} />
        <AnimatedCircle cx={34} cy={34} r={radius} fill="none" stroke={color} strokeWidth={8} strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={animatedDashOffset} rotation="-90" origin="34, 34" />
      </Svg>
      <AnimatedMetricValue value={value} suffix="%" style={textStyle} reduceMotion={reduceMotion} animationKey={animationKey} delay={delay} />
    </View>
  );
}

function AnimatedRhythmFill({ value, max, color, reduceMotion, animationKey, delay }: { value: number; max: number; color: string; reduceMotion: boolean; animationKey: number; delay: number }) {
  const fill = useFillAnimation({ reduceMotion, duration: 400, delay, useNativeDriver: true, deps: [animationKey, delay, reduceMotion, value] });
  return <Animated.View style={{ backgroundColor: color, borderRadius: 5, height: 9, width: `${value / max * 100}%`, transform: [{ scaleX: fill }], transformOrigin: 'left' }} />;
}

function AnimatedMetricValue({ value, suffix, style, reduceMotion, animationKey, delay = 0 }: { value: number; suffix: string; style: object; reduceMotion: boolean; animationKey: number; delay?: number }) {
  const progress = useRef(new Animated.Value(reduceMotion ? value : 0)).current;
  const [displayValue, setDisplayValue] = React.useState(reduceMotion ? value : 0);
  useEffect(() => {
    if (reduceMotion) { progress.setValue(value); setDisplayValue(value); return; }
    progress.setValue(0);
    setDisplayValue(0);
    const listener = progress.addListener(({ value: next }) => setDisplayValue(Math.round(next)));
    const animation = Animated.timing(progress, { toValue: value, delay, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: false });
    animation.start(({ finished }) => { if (finished) setDisplayValue(value); });
    return () => { progress.removeListener(listener); animation.stop(); };
  }, [animationKey, delay, progress, reduceMotion, value]);
  return <Text style={style} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{displayValue}{suffix}</Text>;
}

export const AnalyticsDashboardView = React.memo(function AnalyticsDashboardView({ data, colors, isDark, language, range, reduceMotion, animationKey }: Props) {
  const C = useMemo(() => ({ ...colors, starGoldText: colors.primary, starGoldMuted: colors.primaryLine }), [colors]);
  const s = useMemo(() => styles(C, isDark, colors.starGoldText), [C, colors.starGoldText, isDark]);
  const t = useMemo(() => copy(language === 'vi'), [language]);
  const chartGoal = range === 'Y' ? data.goal * 30 : data.goal;
  const chartMax = Math.max(chartGoal * 2, (Math.floor(Math.max(chartGoal, ...data.bars.flatMap(bar => [bar.current, bar.previous])) / (chartGoal * 2)) + 1) * chartGoal * 2);
  const peak = data.bars.reduce((best, bar) => bar.current > best.current ? bar : best, data.bars[0]);
  const weekdayMax = Math.max(1, ...data.weekday.map(day => day.value));
  const lowestWeekdayIndex = data.weekday.reduce((lowest, day, index) => day.value < data.weekday[lowest].value ? index : lowest, 0);
  const hourMax = Math.max(1, ...data.hours.map(hour => hour.value));
  const totalLogs = data.composition.reduce((total, row) => total + row.count, 0);
  const monthZeroDays = data.bars.filter(bar => bar.current === 0).length;
  const completedYearBars = range === 'Y' ? data.bars.slice(0, new Date().getMonth()) : data.bars;
  const monthsCleared = completedYearBars.filter(bar => bar.current >= chartGoal).length;
  const firstActiveIndex = completedYearBars.findIndex(bar => bar.current > 0);
  const lastActiveIndex = completedYearBars.reduce((last, bar, index) => bar.current > 0 ? index : last, -1);
  const yearChange = range === 'Y' && firstActiveIndex >= 0 && lastActiveIndex > firstActiveIndex
    ? Math.round((completedYearBars[lastActiveIndex].current - completedYearBars[firstActiveIndex].current) / completedYearBars[firstActiveIndex].current * 100)
    : null;
  const yearFrom = firstActiveIndex >= 0 ? MONTH_NAMES[language][firstActiveIndex] ?? '' : '';
  const hourPeak = data.hours.reduce((best, hour) => hour.value > best.value ? hour : best, data.hours[0]);
  const hourTotal = data.hours.reduce((total, hour) => total + hour.value, 0);
  const hourStart = Number(hourPeak.label);
  const hourEnd = hourStart + 4;
  const hourShare = Math.round(hourPeak.value / Math.max(1, hourTotal) * 100);
  const weekdayLowest = data.weekday.reduce((lowest, day) => day.value < lowest.value ? day : lowest, data.weekday[0]);
  const weekdayHighest = data.weekday.reduce((highest, day) => day.value > highest.value ? day : highest, data.weekday[0]);
  const weekdayRatio = weekdayHighest.value > weekdayLowest.value && weekdayLowest.value > 0
    ? weekdayHighest.value / weekdayLowest.value
    : null;
  const weekdayRatioText = weekdayRatio === null || Math.round(weekdayRatio * 10) <= 10 ? null : language === 'vi' ? weekdayRatio.toFixed(1).replace('.', ',') : weekdayRatio.toFixed(1);
  const weekdayName = (label: string) => WEEKDAY_NAMES[label as keyof typeof WEEKDAY_NAMES]?.[language] ?? label;
  const chartLabel = (label: string) => range === 'W'
    ? WEEKDAY_SHORT[label]?.[language] ?? label
    : range === 'Y' ? MONTH_SHORT[language][label] ?? label : label;
  const showPrevious = range === 'W';
  const barWidth = range === 'M' ? 5 : range === 'Y' ? 10 : 7;
  const chartHeight = 188;
  const chartTop = 14;
  const chartLabelHeight = 22;
  const chartY = (value: number) => chartLabelHeight + value / chartMax * (chartHeight - chartTop - chartLabelHeight);
  const chartNumber = (value: number) => value >= 1000 ? `${value / 1000}k` : String(value);
  const rangeLabels = range === 'W'
    ? { first: language === 'vi' ? 'tuần này' : 'this week', second: language === 'vi' ? '30 ngày' : '30 days', rhythm: language === 'vi' ? '12 tuần gần đây' : '12-week averages', period: language === 'vi' ? 'tuần này' : 'this week', delta: 'WK' }
    : range === 'M'
      ? { first: language === 'vi' ? 'tháng này' : 'this month', second: language === 'vi' ? 'tháng trước' : 'prev month', rhythm: language === 'vi' ? '4 tuần gần đây' : '4-week averages', period: language === 'vi' ? 'tháng này' : 'this month', delta: 'MO' }
      : { first: language === 'vi' ? 'năm nay' : 'this year', second: language === 'vi' ? 'tháng tốt nhất' : 'best month', rhythm: language === 'vi' ? '52 tuần gần đây' : '52-week averages', period: language === 'vi' ? 'năm nay' : 'this year', delta: 'YR' };
  const metric = (value: number, previous: number, label: string, suffix: string, tone: 'primary' | 'gold' | 'ink', delay: number) => <View style={[s.metric, tone === 'primary' && s.metricPrimary]} key={label}><Text style={[s.metricLabel, tone === 'primary' && s.metricPrimaryText]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>{label}</Text><AnimatedMetricValue value={value} suffix={suffix} style={[s.metricValue, tone === 'primary' && s.metricPrimaryText, tone === 'gold' && s.metricGold, tone === 'ink' && s.metricInk]} reduceMotion={reduceMotion} animationKey={animationKey} delay={delay} /><Text style={[s.delta, delta(value, previous) < 0 && s.deltaBad, tone === 'primary' && s.metricPrimaryText]}>{delta(value, previous) >= 0 ? '▲' : '▼'}{Math.abs(delta(value, previous))}</Text></View>;
  const consistency = [[data.consistency.week, rangeLabels.first], [data.consistency.month, rangeLabels.second], [data.consistency.all, t.all]] as const;
  const consistencyValues = consistency.map(([value]) => Number(value));
  const consistencyMin = Math.min(...consistencyValues);
  const consistencyMax = Math.max(...consistencyValues);
  const consistencyColor = (value: number) => value === consistencyMax ? C.starGoldText : value === consistencyMin ? C.line2 : C.starGoldMuted;
  const chartNote = range === 'M'
    ? t.monthNote(data.daysAtGoal, data.possibleDays, monthZeroDays, peak?.current ?? 0)
    : range === 'Y'
      ? t.yearNote(monthsCleared, data.bars.length, (chartGoal).toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US'), yearChange, yearFrom)
      : t.goalNote(data.daysAtGoal, data.possibleDays, chartLabel(peak?.label ?? ''), peak?.current ?? 0);
  const hourSummary = t.hourSummary(weekdayName(weekdayLowest.label), weekdayLowest.value, weekdayName(weekdayHighest.label), weekdayRatioText, String(hourStart), hourEnd, hourShare);
  return <View>
    <Text style={s.section}>{t.volume}</Text>
    <View style={[s.metrics, { marginBottom: 14 }]}>{metric(data.points, data.previousPoints, t.points, '', 'primary', 0)}{metric(data.stars, data.previousStars, t.stars, '', 'gold', 70)}{metric(data.daysAtGoal, data.previousDaysAtGoal, t.goal, `/${data.possibleDays}`, 'ink', 140)}</View>
    <View style={s.card}>
      <View style={s.chartHeader}><Text style={s.cardTitle}>{range === 'Y' ? (language === 'vi' ? 'Điểm theo tháng' : 'Points per month') : t.chart}</Text><Text style={s.legend}><Text style={s.dotCurrent}>●</Text> {range === 'W' ? t.thisWeek : range === 'M' ? (language === 'vi' ? 'Tổng theo ngày' : 'Daily total') : (language === 'vi' ? 'Tổng theo tháng' : 'Monthly total')}{showPrevious && <><Text style={s.dotPrevious}> ●</Text> {t.last}</>} <Text style={s.dotBelow}>●</Text> {language === 'vi' ? 'Dưới mục tiêu' : 'Below goal'}</Text></View>
      <View style={[s.chart, { height: chartHeight, paddingTop: chartTop, paddingBottom: chartLabelHeight, paddingLeft: 34, paddingRight: 0 }]}>
        {[0, 50, 100].map((percent) => <View key={percent} pointerEvents="none" style={{ borderTopColor: C.line, borderTopWidth: 1, borderStyle: 'dotted', bottom: chartY(chartMax * percent / 100), left: 34, position: 'absolute', right: 0 }} />)}
        <Text pointerEvents="none" style={{ color: C.muted, fontFamily: FontFamily.regular, fontSize: 9, left: 0, position: 'absolute', textAlign: 'right', bottom: chartY(chartMax) - 7, width: 30 }}>{chartNumber(chartMax)}</Text>
        <Text pointerEvents="none" style={{ color: C.muted, fontFamily: FontFamily.regular, fontSize: 9, left: 0, position: 'absolute', textAlign: 'right', bottom: chartY(chartMax / 2) - 7, width: 30 }}>{chartNumber(chartMax / 2)}</Text>
        <Text pointerEvents="none" style={{ color: C.muted, fontFamily: FontFamily.regular, fontSize: 9, left: 0, position: 'absolute', textAlign: 'right', bottom: chartY(0) - 2, width: 30 }}>0</Text>
        {chartGoal > 0 && <><View style={[s.goalLine, { bottom: chartY(chartGoal), left: 34 }]} /><Text style={[s.goalText, { backgroundColor: isDark ? C.surface2 : C.surface, bottom: chartY(chartGoal), left: 32, paddingHorizontal: 3, right: undefined }]}>{language === 'vi' ? `MỤC TIÊU ${chartNumber(chartGoal)}` : `GOAL ${chartNumber(chartGoal)}`}</Text></>}
        {data.bars.map((bar, index) => <View
          style={s.barCol}
          key={index}
          accessible
          accessibilityRole="image"
          accessibilityLabel={analyticsBarAccessibilityLabel(language, chartLabel(bar.label), bar.current, bar.previous, chartGoal, showPrevious)}
        ><View style={s.barPair}>{showPrevious && <AnimatedBar value={bar.previous} max={chartMax} color={C.surface3} style={s.barPrevious} reduceMotion={reduceMotion} animationKey={animationKey} delay={index * 12} />}<AnimatedBar value={bar.current} max={chartMax} color={chartGoal > 0 && bar.current < chartGoal ? C.starGoldMuted : C.starGoldText} style={[s.barCurrent, !showPrevious && s.barCurrentSolo, { width: barWidth }]} reduceMotion={reduceMotion} animationKey={animationKey} delay={index * 12 + (showPrevious ? 30 : 0)} /></View></View>)}
        <View pointerEvents="none" style={[s.xAxisLabels, { height: chartLabelHeight }]}>{data.bars.map((bar, index) => <View style={s.xAxisColumn} key={`label-${index}`}><Text style={s.barLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.9}>{chartLabel(bar.label)}</Text></View>)}</View>
      </View>
      <View style={s.rule} /><Text style={s.note}>{chartNote}</Text>
    </View>
    <Text style={s.section}>{t.consistency}</Text>
    <View style={s.card}><View style={s.rings}>{consistency.map(([value, label], index) => <View style={s.ringItem} key={String(label)}><ProgressRing value={Number(value)} label={String(label)} color={consistencyColor(Number(value))} track={C.surface3} textStyle={s.ringValue} reduceMotion={reduceMotion} animationKey={animationKey} delay={160 + index * 35} /><Text style={s.ringLabel}>{label}</Text></View>)}</View></View>
    <View style={s.sectionHeader}><Text style={s.sectionHeaderTitle}>{t.rhythm}</Text><Text style={s.sectionHint}>{rangeLabels.rhythm}</Text></View>
    <View style={s.card}><Text style={s.cardTitle}>{t.weekday}</Text>{data.weekday.map((day, index) => <View style={s.rhythmRow} key={day.label}><Text style={s.rhythmLabel}>{chartLabel(day.label)}</Text><View style={s.rhythmTrack}><AnimatedRhythmFill value={day.value} max={weekdayMax} color={index === lowestWeekdayIndex ? C.ink2 : C.starGoldText} reduceMotion={reduceMotion} animationKey={animationKey} delay={index * 45} /></View><Text style={s.rhythmValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{day.value}</Text></View>)}
      <View style={s.rule} /><View style={s.chartHeader}><Text style={s.cardTitle}>{t.hour}</Text><Text style={s.legend}>{t.hourNote(String(hourStart), hourEnd, hourShare)}</Text></View><View style={s.hours}>{data.hours.map((hour, index) => <View accessible accessibilityLabel={`${hour.label}: ${hour.value}`} style={s.hourCol} key={hour.label}><View style={s.hourBarArea}><AnimatedBar value={hour.value} max={hourMax} color={hour.value === hourMax ? C.starGoldText : C.starGoldMuted} style={s.hourBar} reduceMotion={reduceMotion} animationKey={animationKey} delay={index * 50} /></View><Text style={s.hourLabel}>{hour.label}</Text></View>)}</View><View style={s.rule} /><Text style={s.note}>{hourSummary}</Text>
    </View>
    <View style={s.sectionHeader}><Text style={s.sectionHeaderTitle}>{t.composition}</Text><Text style={s.sectionHint}>{totalLogs} {language === 'vi' ? 'lượt' : 'logs'} {rangeLabels.period}</Text></View>
    <View style={s.card}><View style={s.compHead}><Text style={s.compName}>{language === 'vi' ? 'THÓI QUEN' : 'HABIT'}</Text><Text style={s.compMeta}>{t.share}   {t.logs}   Δ {rangeLabels.delta}</Text></View>{data.composition.map(row => <View style={s.compRow} key={row.name}><Text style={s.compName} numberOfLines={1}>{row.name}</Text><View style={s.compTrack}><View style={[s.compFill, { width: `${row.count / Math.max(1, data.composition[0]?.count ?? 1) * 100}%` }]} /></View><Text style={s.compCount}>{row.count}</Text><Text style={[s.compDelta, row.count < row.previous && s.deltaBad]}>{row.count - row.previous >= 0 ? '+' : ''}{row.count - row.previous}</Text></View>)}</View>
  </View>;
});

function styles(C: AppColors, isDark: boolean, metricGoldText: string) { const card = isDark ? C.surface2 : C.surface; return StyleSheet.create({
  sectionHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 20, marginBottom: 9 }, section: { color: C.starGoldText, fontFamily: FontFamily.bold, fontSize: 10, marginTop: 18, marginBottom: 8, letterSpacing: .3 }, sectionHeaderTitle: { color: C.starGoldText, fontFamily: FontFamily.bold, fontSize: 12, letterSpacing: .3 }, sectionHint: { color: C.muted, fontFamily: FontFamily.regular, fontSize: 11 },
  metrics: { backgroundColor: card, borderColor: C.line, borderWidth: 1, borderRadius: Radii.lg, flexDirection: 'row', overflow: 'hidden' }, metric: { flex: 1, padding: 13, borderRightColor: C.line, borderRightWidth: 1 }, metricPrimary: { backgroundColor: C.starGoldText }, metricLabel: { color: C.muted, fontFamily: FontFamily.bold, fontSize: 9, height: 12, lineHeight: 12 }, metricPrimaryText: { color: C.onAccent }, metricValue: { color: C.starGoldText, fontFamily: FontFamily.extraBold, fontSize: 24, letterSpacing: -1, marginTop: 3 }, metricGold: { color: metricGoldText }, metricInk: { color: C.inkDark }, delta: { color: C.successText, fontFamily: FontFamily.bold, fontSize: 10 }, deltaBad: { color: C.dangerText }, card: { backgroundColor: card, borderColor: C.line, borderWidth: 1, borderRadius: Radii.lg, padding: 14, marginBottom: 2 }, cardTitle: { color: C.inkDark, fontFamily: FontFamily.bold, fontSize: 14 }, chartHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }, legend: { color: C.muted, flexShrink: 1, fontFamily: FontFamily.regular, fontSize: 10, textAlign: 'right' }, dotCurrent: { color: C.starGoldText }, dotPrevious: { color: C.surface3 }, dotBelow: { color: C.starGoldMuted }, chart: { height: 188, marginTop: 14, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around', position: 'relative' }, goalLine: { borderTopColor: C.starGoldText, borderTopWidth: 1, borderStyle: 'dashed', left: 0, position: 'absolute', right: 0 }, goalText: { color: C.starGoldText, elevation: 1, fontFamily: FontFamily.bold, fontSize: 9, position: 'absolute', right: 0, zIndex: 1 }, barCol: { alignItems: 'center', flex: 1, height: '100%', justifyContent: 'flex-end', minHeight: 0 }, barPair: { alignItems: 'flex-end', flex: 1, flexDirection: 'row', justifyContent: 'center', minHeight: 0, width: '100%' }, xAxisLabels: { bottom: 0, flexDirection: 'row', left: 34, position: 'absolute', right: 0 }, xAxisColumn: { alignItems: 'center', flex: 1, justifyContent: 'center' }, barCurrent: { backgroundColor: C.starGoldText, borderTopLeftRadius: 3, borderTopRightRadius: 3, marginLeft: 3, width: 8 }, barCurrentSolo: { marginLeft: 0, width: 10 }, barPrevious: { backgroundColor: C.surface3, borderTopLeftRadius: 3, borderTopRightRadius: 3, width: 8 }, barLabel: { color: C.muted, fontFamily: FontFamily.bold, fontSize: 12, height: 16, lineHeight: 16 }, rule: { backgroundColor: C.line, height: 1, marginTop: 14 }, note: { color: C.ink2, fontFamily: FontFamily.regular, fontSize: 11, lineHeight: 16, marginTop: 10 }, rings: { flexDirection: 'row', justifyContent: 'space-around' }, ringItem: { alignItems: 'center' }, ringValue: { color: C.inkDark, fontFamily: FontFamily.extraBold, fontSize: 16 }, ringLabel: { color: C.muted, fontFamily: FontFamily.regular, fontSize: 10, marginTop: 7 }, rhythmRow: { alignItems: 'center', flexDirection: 'row', marginTop: 9 }, rhythmLabel: { color: C.muted, fontFamily: FontFamily.bold, fontSize: 10, width: 28 }, rhythmTrack: { backgroundColor: C.surface3, borderRadius: 5, flex: 1, height: 9 }, rhythmValue: { color: C.inkDark, fontFamily: FontFamily.bold, textAlign: 'right', width: 30 }, hours: { alignItems: 'flex-end', flexDirection: 'row', height: 80, justifyContent: 'space-around', marginTop: 8 }, hourCol: { alignItems: 'center', height: '100%', justifyContent: 'flex-end', width: 28 }, hourBarArea: { alignItems: 'center', flex: 1, justifyContent: 'flex-end', minHeight: 0, width: '100%' }, hourBar: { backgroundColor: C.starGoldText, borderTopLeftRadius: 2, borderTopRightRadius: 2, width: '100%' }, hourLabel: { color: C.muted, fontFamily: FontFamily.regular, fontSize: 9, marginTop: 5 }, compHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 7 }, compMeta: { color: C.muted, fontFamily: FontFamily.bold, fontSize: 9 }, compRow: { alignItems: 'center', flexDirection: 'row', marginTop: 11 }, compName: { color: C.inkDark, flex: 1, fontFamily: FontFamily.bold, fontSize: 12 }, compTrack: { backgroundColor: C.surface3, borderRadius: 4, height: 6, width: 76 }, compFill: { backgroundColor: C.starGoldText, borderRadius: 4, height: 6 }, compCount: { color: C.inkDark, fontFamily: FontFamily.bold, textAlign: 'right', width: 34 }, compDelta: { color: C.successText, fontFamily: FontFamily.bold, textAlign: 'right', width: 31 },
}); }
