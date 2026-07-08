import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { AppColors, FontFamily, Radii, Spacing, Typography } from '../config/theme';
import { useTheme, useTranslations } from '../hooks/useSettings';
import type { PaceState } from '../lib/challengeWeekly';

type Props = {
  weeklyTarget: number;
  sessionsDone: number;
  sessionsRemaining: number;
  daysRemaining: number;
  paceState: PaceState;
};

export function WeeklyPaceCard({ weeklyTarget, sessionsDone, sessionsRemaining, daysRemaining, paceState }: Props) {
  const { colors: C } = useTheme();
  const t = useTranslations();
  const styles = useMemo(() => makeStyles(C), [C]);

  const pillLabel = paceState === 'on_pace' ? t.challengePaceOnTrack
    : paceState === 'impossible' ? t.challengePaceImpossible
    : t.challengePaceBehind(sessionsRemaining, daysRemaining);

  const sentence = paceState === 'on_pace' ? t.challengePaceSentenceOnTrack
    : paceState === 'impossible' ? t.challengePaceSentenceImpossible
    : t.challengePaceSentenceBehind(sessionsRemaining, daysRemaining);

  const pillColor = paceState === 'impossible' ? C.danger : paceState === 'behind' ? C.starGold : C.primary;
  const pillBg = paceState === 'impossible' ? C.dangerSoft : paceState === 'behind' ? C.starSoft : C.primarySoft;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{t.challengePaceTitle}</Text>
        <View style={[styles.pill, { backgroundColor: pillBg }]}>
          <Text style={[styles.pillText, { color: pillColor }]}>{pillLabel}</Text>
        </View>
      </View>
      <View style={styles.segmentRow}>
        {Array.from({ length: weeklyTarget }, (_, i) => (
          <View
            key={i}
            style={[styles.segment, i < sessionsDone && { backgroundColor: C.primary }]}
            accessibilityElementsHidden
          />
        ))}
      </View>
      <Text style={styles.sentence}>{sentence}</Text>
    </View>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    card: {
      alignSelf: 'stretch', backgroundColor: C.surface, borderRadius: Radii.lg,
      padding: Spacing.md, gap: Spacing.sm,
    },
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    title: { ...Typography.sectionLabel, color: C.ink2 },
    pill: { borderRadius: Radii.pill, paddingVertical: 5, paddingHorizontal: 11 },
    pillText: { fontSize: 12, fontFamily: FontFamily.bold },
    segmentRow: { flexDirection: 'row', gap: 6 },
    segment: { flex: 1, height: 8, borderRadius: Radii.pill, backgroundColor: C.surface2 },
    sentence: { ...Typography.secondary, color: C.ink2 },
  });
}
