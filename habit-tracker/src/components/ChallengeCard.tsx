import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { AppColors, FontFamily, Radii, Shadows, Spacing, Typography } from '../config/theme';
import { useTheme, useTranslations } from '../hooks/useSettings';
import { ChallengeStatusPill } from './ChallengeStatusPill';
import { ChallengeDayTrack } from './ChallengeDayTrack';
import type { DayEntryState } from '../lib/challenge';

type Props = {
  name: string;
  targetDays: number;
  dayIndex: number;
  streak: number;
  atRisk: boolean;
  freezesLeft: number;
  loggedToday: boolean;
  startDate: string;
  log: { date: string; state: DayEntryState }[];
  today: string;
  onPress: () => void;
  onLog: () => void;
  logging?: boolean;
};

export const ChallengeCard = React.memo(function ChallengeCard({
  name, targetDays, dayIndex, streak, atRisk, freezesLeft, loggedToday,
  startDate, log, today, onPress, onLog, logging = false,
}: Props) {
  const { colors: C } = useTheme();
  const t = useTranslations();
  const styles = useMemo(() => makeStyles(C), [C]);
  const dayNumber = Math.min(dayIndex + 1, targetDays);
  const dayAccessibilityLabel = t.challengeDayOf(dayNumber, targetDays);
  // accessibilityLabel on a touchable overrides its children's text for screen readers, so the
  // at-risk warning below (a plain <Text>) would otherwise never be announced — fold it in here.
  const cardAccessibilityLabel = atRisk
    ? `${name}, ${dayAccessibilityLabel}, ${t.challengeAtRiskWarning}`
    : `${name}, ${dayAccessibilityLabel}`;

  return (
    <View style={[styles.card, atRisk && styles.cardAtRisk]}>
      {atRisk && <View style={styles.riskEdge} />}

      <View style={styles.topRow}>
        <ChallengeStatusPill status="active" atRisk={atRisk} />
        {freezesLeft > 0 && (
          <View style={styles.skipBadge}>
            <Text style={styles.skipBadgeText}>{t.challengeSkipLeftBadge(freezesLeft)}</Text>
          </View>
        )}
        <Text style={styles.streak}>🔥 {streak}</Text>
      </View>

      <TouchableOpacity onPress={onPress} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={cardAccessibilityLabel}>
        <Text style={styles.name} numberOfLines={2}>{name}</Text>
        <View style={styles.progressRow}>
          <Text style={styles.dayLabel}>{t.challengeProgressLabel}</Text>
          <Text style={styles.dayValue}>{dayNumber}</Text>
          <Text style={styles.dayTotal}> / {targetDays}</Text>
        </View>
        <View style={styles.trackWrap}>
          <ChallengeDayTrack
            targetDays={targetDays}
            startDate={startDate}
            log={log}
            today={today}
            atRisk={atRisk}
            accessibilityLabel={dayAccessibilityLabel}
          />
        </View>
        {atRisk && <Text style={styles.warning}>{t.challengeAtRiskWarning}</Text>}
      </TouchableOpacity>

      <View style={styles.footerRow}>
        {loggedToday ? (
          <Text style={styles.loggedText}>✓ {t.challengeLoggedToday}</Text>
        ) : (
          <>
            <Text style={styles.notLoggedText}>{t.challengeNotLoggedToday}</Text>
            <TouchableOpacity
              style={[styles.logBtn, logging && styles.logBtnDisabled]}
              onPress={onLog}
              disabled={logging}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={t.challengeLogCta}
            >
              {logging
                ? <ActivityIndicator size="small" color={C.onAccent} />
                : <Text style={styles.logBtnText}>{t.challengeLogCta}</Text>}
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
});

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    card: {
      backgroundColor: C.surface, borderRadius: Radii.lg, padding: Spacing.md,
      position: 'relative', overflow: 'hidden', ...Shadows.light,
    },
    cardAtRisk: { paddingLeft: Spacing.md + 4 },
    riskEdge: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: C.danger },
    topRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, flexWrap: 'wrap' },
    skipBadge: { backgroundColor: C.surface2, borderRadius: Radii.pill, paddingVertical: 5, paddingHorizontal: 11 },
    skipBadgeText: { ...Typography.caption, color: C.ink2, fontFamily: FontFamily.semiBold },
    streak: {
      ...Typography.caption, color: C.inkDark, fontFamily: FontFamily.semiBold, marginLeft: 'auto',
    },
    name: { ...Typography.subheading, color: C.inkDark, marginTop: Spacing.md },
    progressRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: Spacing.xs },
    dayLabel: { ...Typography.secondary, color: C.muted, fontFamily: FontFamily.semiBold },
    dayValue: { fontSize: 38, lineHeight: 42, letterSpacing: -1, fontFamily: FontFamily.extraBold, color: C.primaryText, marginLeft: Spacing.sm },
    dayTotal: { ...Typography.subheading, color: C.muted, fontFamily: FontFamily.bold },
    trackWrap: { marginTop: Spacing.xs },
    warning: { ...Typography.caption, color: C.dangerText, fontFamily: FontFamily.semiBold, marginTop: Spacing.xs },
    footerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.sm },
    loggedText: { ...Typography.caption, color: C.primaryText, fontFamily: FontFamily.bold },
    notLoggedText: { ...Typography.caption, color: C.muted, flex: 1 },
    logBtn: {
      minHeight: 36, backgroundColor: C.primary, borderRadius: Radii.pill,
      paddingVertical: 8, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center',
    },
    logBtnDisabled: { opacity: 0.6 },
    logBtnText: { ...Typography.caption, color: C.onAccent, fontFamily: FontFamily.bold },
  });
}
