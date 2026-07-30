import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { AppColors, FontFamily, Radii, Shadows, Spacing, Typography } from '../config/theme';
import { useTheme, useTranslations } from '../hooks/useSettings';

type Props = {
  name: string;
  targetDays: number;
  dayIndex: number;
  fraction: number;
  streak: number;
  onPress: () => void;
};

export function ChallengeCard({ name, targetDays, dayIndex, fraction, streak, onPress }: Props) {
  const { colors: C } = useTheme();
  const t = useTranslations();
  const styles = useMemo(() => makeStyles(C), [C]);
  const [showRule, setShowRule] = useState(false);
  const percent = Math.round(fraction * 100);
  const dayNumber = Math.min(dayIndex + 1, targetDays);

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <View>
          <TouchableOpacity
            style={styles.strictBadge}
            onPress={() => setShowRule(open => !open)}
            activeOpacity={0.8}
            hitSlop={{ top: 11, bottom: 11, left: 11, right: 11 }}
            accessibilityRole="button"
            accessibilityLabel={t.challengeStrictBadge}
            accessibilityState={{ expanded: showRule }}
          >
            <Text style={styles.strictBadgeText}>🔒 {t.challengeStrictBadge} ⓘ</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.streak}>🔥 {streak}</Text>
      </View>
      {showRule && (
        <View style={styles.ruleTooltip}>
          <Text style={styles.ruleText}>✅ {t.challengeRuleDaily}</Text>
          <Text style={styles.ruleText}>⛔ {t.challengeRuleReset}</Text>
        </View>
      )}
      <TouchableOpacity onPress={onPress} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={`${name}, ${t.challengeDayOf(dayNumber, targetDays)}`}>
        <Text style={styles.name} numberOfLines={2}>{name}</Text>
        <View style={styles.progressRow}>
          <Text style={styles.dayLabel}>{t.challengeProgressLabel}</Text>
          <Text style={styles.dayValue}>{dayNumber}</Text>
          <Text style={styles.dayTotal}> / {targetDays}</Text>
        </View>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${percent}%`, backgroundColor: C.primary }]} />
        </View>
        <View style={styles.footerRow}>
          <Text style={styles.viewCta}>{t.challengeViewCta} →</Text>
        </View>
      </TouchableOpacity>
    </View>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    card: { backgroundColor: C.surface, borderRadius: Radii.lg, padding: Spacing.md, ...Shadows.light },
    topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.xs },
    strictBadge: {
      backgroundColor: C.starSoft, paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radii.pill,
    },
    strictBadgeText: { ...Typography.caption, color: C.starGoldText, fontFamily: FontFamily.bold },
    ruleTooltip: { alignSelf: 'flex-start', maxWidth: 280, marginTop: Spacing.sm, backgroundColor: C.surface, borderColor: C.line, borderWidth: StyleSheet.hairlineWidth, borderRadius: Radii.md, padding: Spacing.sm, gap: 4, ...Shadows.medium },
    ruleText: { ...Typography.caption, color: C.inkDark, fontFamily: FontFamily.medium },
    streak: {
      ...Typography.caption, color: C.inkDark, fontFamily: FontFamily.semiBold,
      backgroundColor: C.surface2, paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radii.pill,
    },
    name: { ...Typography.subheading, color: C.inkDark, marginTop: Spacing.md },
    progressRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: Spacing.xs },
    dayLabel: { ...Typography.secondary, color: C.muted, fontFamily: FontFamily.semiBold },
    dayValue: { fontSize: 38, lineHeight: 42, letterSpacing: -1, fontFamily: FontFamily.extraBold, color: C.primary, marginLeft: Spacing.sm },
    dayTotal: { ...Typography.subheading, color: C.muted, fontFamily: FontFamily.bold },
    track: { height: 8, borderRadius: Radii.pill, backgroundColor: C.surface2, marginTop: Spacing.xs, overflow: 'hidden' },
    fill: { height: '100%', borderRadius: Radii.pill },
    footerRow: { marginTop: Spacing.sm, alignItems: 'flex-end' },
    viewCta: { ...Typography.caption, color: C.primary, fontFamily: FontFamily.semiBold, marginLeft: Spacing.sm },
  });
}
