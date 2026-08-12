import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { AppColors, FontFamily, Radii, Typography } from '../config/theme';
import { useTheme, useTranslations } from '../hooks/useSettings';
import type { ChallengeStatus } from '../lib/challenge';

type Props = {
  status: ChallengeStatus;
  atRisk?: boolean;
};

export const ChallengeStatusPill = React.memo(function ChallengeStatusPill({ status, atRisk = false }: Props) {
  const { colors: C } = useTheme();
  const t = useTranslations();
  const styles = useMemo(() => makeStyles(C), [C]);

  const label = status === 'active' ? t.challengeActiveSection : status === 'done' ? t.challengeStatusDone : t.challengeStatusFailed;
  const accessibilityLabel = atRisk ? `${label}, ${t.challengeAtRiskWarning}` : label;

  if (status === 'done') {
    return (
      <View style={[styles.pill, styles.donePill]} accessible accessibilityLabel={accessibilityLabel}>
        <Text style={[styles.text, styles.doneText]}>✓ {label}</Text>
      </View>
    );
  }

  if (status === 'failed') {
    return (
      <View style={[styles.pill, styles.failedPill]} accessible accessibilityLabel={accessibilityLabel}>
        <Text style={[styles.text, styles.failedText]}>✕ {label}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.pill, styles.activePill]} accessible accessibilityLabel={accessibilityLabel}>
      <View style={styles.dot} />
      <Text style={[styles.text, styles.activeText]}>{label}</Text>
    </View>
  );
});

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    pill: {
      flexDirection: 'row', alignItems: 'center', gap: 5,
      borderRadius: Radii.pill, paddingVertical: 5, paddingHorizontal: 11, alignSelf: 'flex-start',
    },
    text: { ...Typography.caption, fontFamily: FontFamily.bold },
    activePill: { backgroundColor: C.primarySoft },
    activeText: { color: C.primaryText },
    dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.primary },
    donePill: { backgroundColor: C.starSoft },
    doneText: { color: C.starGoldText },
    failedPill: { backgroundColor: C.dangerSoft },
    failedText: { color: C.dangerText },
  });
}
