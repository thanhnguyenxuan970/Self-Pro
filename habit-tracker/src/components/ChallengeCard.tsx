import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { AppColors, FontFamily, Radii, Shadows, Spacing, Typography } from '../config/theme';
import { useTheme, useTranslations } from '../hooks/useSettings';

type Props = {
  name: string;
  dayIndex: number;
  targetDays: number;
  fraction: number;
  streak: number;
  status: 'active' | 'done' | 'failed';
  onPress: () => void;
};

export function ChallengeCard({ name, dayIndex, targetDays, fraction, streak, status, onPress }: Props) {
  const { colors: C } = useTheme();
  const t = useTranslations();
  const styles = useMemo(() => makeStyles(C), [C]);

  const dayLabel = t.challengeDayOf(Math.min(dayIndex + 1, targetDays), targetDays);
  const badgeColor = status === 'done' ? C.primary : status === 'failed' ? C.danger : undefined;
  const badgeText = status === 'done' ? t.challengeStatusDone : status === 'failed' ? t.challengeStatusFailed : dayLabel;

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${badgeText}`}
    >
      <View style={styles.row}>
        <Text style={styles.name} numberOfLines={1}>{name}</Text>
        <Text style={[styles.badge, badgeColor && { color: badgeColor }]}>{badgeText}</Text>
      </View>
      {status === 'active' && (
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${Math.round(fraction * 100)}%`, backgroundColor: C.primary }]} />
        </View>
      )}
      <View style={styles.footerRow}>
        <Text style={styles.streak}>🔥 {streak}</Text>
        <Text style={styles.viewCta}>{t.challengeViewCta} →</Text>
      </View>
    </TouchableOpacity>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    card: {
      backgroundColor: C.surface,
      borderRadius: Radii.lg,
      padding: Spacing.md,
      ...Shadows.light,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: Spacing.sm,
    },
    name: { ...Typography.bodyStrong, color: C.inkDark, flex: 1 },
    badge: { ...Typography.caption, color: C.ink2, fontFamily: FontFamily.semiBold },
    track: {
      height: 8,
      borderRadius: Radii.pill,
      backgroundColor: C.surface2,
      marginTop: Spacing.sm,
      overflow: 'hidden',
    },
    fill: { height: '100%', borderRadius: Radii.pill },
    footerRow: { marginTop: Spacing.sm, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    streak: { ...Typography.caption, color: C.ink2, fontFamily: FontFamily.semiBold },
    viewCta: { ...Typography.caption, color: C.primary, fontFamily: FontFamily.semiBold },
  });
}
