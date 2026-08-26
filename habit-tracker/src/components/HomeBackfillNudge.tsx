import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { AppColors, FontFamily, Radii, Shadows, Spacing } from '../config/theme';
import type { Strings } from '../config/i18n';
import type { HomeBackfillNudge as Nudge } from '../game/homeBackfillNudge';

type Props = {
  nudge: Nudge;
  activeDates: Iterable<string>;
  today: string;
  weekStart: string;
  colors: AppColors;
  t: Strings;
  onPress: () => void;
  onDatePress: (date: string) => void;
  opensCalendar: boolean;
  onDismiss: () => void;
};

export const HomeBackfillNudge = React.memo(function HomeBackfillNudge({ nudge, activeDates, today, weekStart, colors, t, onPress, onDatePress, opensCalendar, onDismiss }: Props) {
  const styles = useMemo(() => makeStyles(colors), [colors]);
  if (nudge.state === 'HIDDEN') return null;
  const fixable = Math.min(nudge.pendingDates.length, nudge.remaining);
  const capped = nudge.state === 'PROMPT_CAPPED';
  const ctaLabel = opensCalendar ? t.calendarTitle : t.homeBackfillCta(fixable);
  const title = capped ? t.homeBackfillCappedTitle(nudge.pendingDates.length, fixable) : t.homeBackfillTitle(nudge.pendingDates.length);
  const active = new Set(activeDates);
  const pendingSet = new Set(nudge.pendingDates);
  const dates = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(`${weekStart}T12:00:00`);
    date.setDate(date.getDate() + index);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  });

  return <View style={[styles.card, capped && styles.cappedCard]} accessibilityLabel={title}>
    <View style={styles.header}>
      <View style={[styles.icon, capped && styles.cappedIcon]}><Text style={styles.iconText}>{capped ? '⌛' : '🔥'}</Text></View>
      <View style={styles.copy}>
      <Text style={[styles.eyebrow, capped && styles.cappedText]}>{t.homeBackfillEyebrow}</Text>
      <Text style={styles.title}>{title}</Text>
      </View>
    </View>
    <View style={styles.weekStrip}>
      {dates.map((date, index) => {
        const pending = pendingSet.has(date);
        const isToday = date === today;
        const future = date > today;
        const cell = <View style={[styles.day, active.has(date) && styles.dayDone, pending && styles.dayPending, isToday && styles.dayToday, future && styles.dayFuture]}>
          <Text style={[styles.dayValue, active.has(date) && styles.dayDoneText, pending && styles.dayPendingText]}>{active.has(date) ? '✓' : pending ? '+' : future ? '·' : '×'}</Text>
        </View>;
        return <View key={date} style={styles.dayWrap}>
          <Text style={styles.dayLabel}>{t.calDow[index]}</Text>
          {pending ? <TouchableOpacity onPress={() => onDatePress(date)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`${t.backfillEligible} ${date}`}>{cell}</TouchableOpacity> : cell}
        </View>;
      })}
    </View>
    <TouchableOpacity style={styles.dismiss} onPress={onDismiss} hitSlop={8} accessibilityRole="button" accessibilityLabel={t.homeBackfillDismiss}>
      <Text style={styles.dismissText}>×</Text>
    </TouchableOpacity>
    <View style={styles.footer}><TouchableOpacity style={[styles.cta, capped && styles.cappedCta]} onPress={onPress} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={ctaLabel}>
      <Text style={styles.ctaText}>{ctaLabel}</Text>
    </TouchableOpacity><View style={styles.quota}><Text style={styles.quotaText}>{t.homeBackfillQuota(nudge.remaining)}</Text>{[0, 1].map(i => <View key={i} style={[styles.dot, i >= nudge.remaining && styles.dotOff]} />)}</View></View>
  </View>;
});

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    card: { marginHorizontal: Spacing.lg, marginTop: 12, padding: 14, paddingLeft: 18, backgroundColor: C.surface, borderRadius: Radii.lg, borderWidth: 1, borderColor: C.line, borderLeftWidth: 4, borderLeftColor: C.primary, ...Shadows.light },
    cappedCard: { borderLeftColor: C.starGold },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingRight: 30 },
    icon: { width: 52, height: 52, borderRadius: Radii.md, alignItems: 'center', justifyContent: 'center', backgroundColor: C.primarySoft },
    cappedIcon: { backgroundColor: C.starSoft }, iconText: { fontSize: 25 },
    copy: { flex: 1 },
    eyebrow: { color: C.primaryText, fontFamily: FontFamily.bold, fontSize: 11, letterSpacing: 0.5, marginBottom: 3 },
    cappedText: { color: C.starGoldText },
    title: { color: C.inkDark, fontFamily: FontFamily.bold, fontSize: 15, lineHeight: 21 },
    weekStrip: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
    dayWrap: { alignItems: 'center', gap: 3 },
    dayLabel: { color: C.muted, fontFamily: FontFamily.medium, fontSize: 10 },
    day: { width: 28, height: 28, borderRadius: Radii.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface2 },
    dayDone: { backgroundColor: C.primary },
    dayPending: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.primaryPress },
    dayToday: { borderWidth: 1.5, borderColor: C.primaryPress },
    dayFuture: { opacity: 0.45 },
    dayValue: { color: C.muted, fontFamily: FontFamily.bold, fontSize: 13 },
    dayDoneText: { color: C.onAccent },
    dayPendingText: { color: C.primaryText },
    dismiss: { position: 'absolute', top: 6, right: 6, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    dismissText: { color: C.muted, fontFamily: FontFamily.bold, fontSize: 20 },
    footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
    cta: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 18, backgroundColor: C.primarySoft, borderRadius: Radii.pill },
    cappedCta: { backgroundColor: C.starSoft },
    ctaText: { color: C.primaryText, fontFamily: FontFamily.bold, fontSize: 13 },
    quota: { flexDirection: 'row', alignItems: 'center', gap: 5 }, quotaText: { color: C.muted, fontFamily: FontFamily.medium, fontSize: 11 },
    dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.primary }, dotOff: { backgroundColor: C.line2 },
  });
}
