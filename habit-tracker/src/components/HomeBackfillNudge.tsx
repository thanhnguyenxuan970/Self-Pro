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
  onDismiss: () => void;
};

export function HomeBackfillNudge({ nudge, activeDates, today, weekStart, colors, t, onPress, onDismiss }: Props) {
  const styles = useMemo(() => makeStyles(colors), [colors]);
  if (nudge.state === 'HIDDEN') return null;
  const fixable = Math.min(nudge.pendingDates.length, nudge.remaining);
  const capped = nudge.state === 'PROMPT_CAPPED';
  const title = capped ? t.homeBackfillCappedTitle(nudge.pendingDates.length, fixable) : t.homeBackfillTitle(nudge.pendingDates.length);
  const subtitle = capped ? t.homeBackfillCappedBody : t.homeBackfillBody(nudge.pendingDates.length, nudge.reconnectable);
  const active = new Set(activeDates);
  const dates = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(`${weekStart}T12:00:00`);
    date.setDate(date.getDate() + index);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  });

  return <View style={[styles.card, capped && styles.cappedCard]} accessibilityLabel={title}>
    <View style={styles.copy}>
      <Text style={styles.eyebrow}>{t.homeBackfillEyebrow}</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
    </View>
    <View style={styles.weekStrip}>
      {dates.map((date, index) => {
        const pending = nudge.pendingDates.includes(date);
        const isToday = date === today;
        const future = date > today;
        return <View key={date} style={styles.dayWrap}>
          <Text style={styles.dayLabel}>{t.calDow[index]}</Text>
          <View style={[styles.day, active.has(date) && styles.dayDone, pending && styles.dayPending, isToday && styles.dayToday, future && styles.dayFuture]}>
            <Text style={[styles.dayValue, active.has(date) && styles.dayDoneText, pending && styles.dayPendingText]}>{active.has(date) ? '✓' : pending ? '+' : future ? '·' : '×'}</Text>
          </View>
        </View>;
      })}
    </View>
    <TouchableOpacity style={styles.dismiss} onPress={onDismiss} hitSlop={8} accessibilityRole="button" accessibilityLabel={t.homeBackfillDismiss}>
      <Text style={styles.dismissText}>×</Text>
    </TouchableOpacity>
    <TouchableOpacity style={styles.cta} onPress={onPress} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={t.homeBackfillCta(fixable)}>
      <Text style={styles.ctaText}>{t.homeBackfillCta(fixable)}</Text>
    </TouchableOpacity>
    <Text style={styles.quota}>{t.homeBackfillQuota(nudge.remaining)}</Text>
  </View>;
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    card: { marginHorizontal: Spacing.lg, marginTop: 12, padding: 14, paddingLeft: 18, backgroundColor: C.surface, borderRadius: Radii.lg, borderWidth: 1, borderColor: C.line, borderLeftWidth: 4, borderLeftColor: C.primary, ...Shadows.light },
    cappedCard: { borderLeftColor: C.starGold },
    copy: { paddingRight: 28 },
    eyebrow: { color: C.primary, fontFamily: FontFamily.bold, fontSize: 11, letterSpacing: 0.5, marginBottom: 3 },
    title: { color: C.inkDark, fontFamily: FontFamily.bold, fontSize: 15, lineHeight: 21 },
    subtitle: { color: C.ink2, fontFamily: FontFamily.regular, fontSize: 12, lineHeight: 18, marginTop: 4 },
    weekStrip: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
    dayWrap: { alignItems: 'center', gap: 3 },
    dayLabel: { color: C.muted, fontFamily: FontFamily.medium, fontSize: 10 },
    day: { width: 28, height: 28, borderRadius: Radii.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface2 },
    dayDone: { backgroundColor: C.primary },
    dayPending: { backgroundColor: C.surface, borderWidth: 1, borderStyle: 'dashed', borderColor: C.primary },
    dayToday: { borderWidth: 1.5, borderColor: C.primary },
    dayFuture: { opacity: 0.45 },
    dayValue: { color: C.muted, fontFamily: FontFamily.bold, fontSize: 13 },
    dayDoneText: { color: C.onAccent },
    dayPendingText: { color: C.primary },
    dismiss: { position: 'absolute', top: 6, right: 6, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    dismissText: { color: C.muted, fontFamily: FontFamily.bold, fontSize: 20 },
    cta: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, marginTop: 10, backgroundColor: C.primarySoft, borderRadius: Radii.pill },
    ctaText: { color: C.primary, fontFamily: FontFamily.bold, fontSize: 13 },
    quota: { position: 'absolute', right: 14, bottom: 14, color: C.muted, fontFamily: FontFamily.medium, fontSize: 11 },
  });
}
