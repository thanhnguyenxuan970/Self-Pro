import React, { useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { AppColors, FontFamily, Radii, Shadows, Spacing, Typography } from '../config/theme';
import { useScreenCommons } from '../hooks/useScreenCommons';
import { useActiveChallenge, useChallengeHistory, useChallengeRollover } from '../queries/useChallenge';
import { ChallengeCard } from '../components/ChallengeCard';

export function ChallengeHubScreen() {
  const { userId, colors, t, styles } = useScreenCommons(makeStyles);
  const navigation = useNavigation();

  const { data: active, isLoading: activeLoading } = useActiveChallenge(userId);
  const { data: history = [], isLoading: historyLoading } = useChallengeHistory(userId);
  const rollover = useChallengeRollover(userId);

  useEffect(() => {
    if (active) rollover.mutate();
    // Run once per mount to catch missed days — not on every `active` refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isLoading = activeLoading || historyLoading;

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={styles.loadingBox}><ActivityIndicator color={colors.primary} /></View>
      </SafeAreaView>
    );
  }

  const showEmpty = !active && history.length === 0;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <View style={styles.headerRow}>
        <TouchableOpacity
          onPress={() => navigation.navigate('CreateChallenge' as never)}
          style={styles.addBtn}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel={t.challengeCreateCta}
        >
          <Text style={styles.addBtnText}>＋</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {showEmpty ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>{t.challengeEmptyTitle}</Text>
            <Text style={styles.emptyBody}>{t.challengeEmptyBody}</Text>
            <TouchableOpacity
              style={styles.emptyCta}
              onPress={() => navigation.navigate('CreateChallenge' as never)}
              activeOpacity={0.85}
              accessibilityRole="button"
            >
              <Text style={styles.emptyCtaText}>{t.challengeCreateCta}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {active && (
              <ChallengeCard
                name={active.name}
                dayIndex={active.dayIndex}
                targetDays={active.targetDays}
                fraction={active.fraction}
                streak={active.streak}
                status="active"
                onPress={() => (navigation as any).navigate('ChallengeDetail', { challengeId: active.id })}
              />
            )}

            {history.length > 0 && (
              <View style={styles.pastSection}>
                <Text style={styles.sectionLabel}>{t.challengePastSection}</Text>
                <View style={styles.pastCard}>
                  {history.map((h, i) => (
                    <TouchableOpacity
                      key={h.id}
                      style={[styles.pastRow, i < history.length - 1 && styles.pastRowBorder]}
                      onPress={() => (navigation as any).navigate('ChallengeDetail', { challengeId: h.id })}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                    >
                      <Text style={styles.pastName} numberOfLines={1}>{h.name}</Text>
                      <Text style={[styles.pastStatus, h.status === 'done' ? { color: colors.primary } : { color: colors.danger }]}>
                        {h.status === 'done' ? t.challengeStatusDone : t.challengeStatusFailed}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bgBase },
    loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      paddingHorizontal: Spacing.lg,
      paddingTop: Spacing.md,
      paddingBottom: Spacing.sm,
    },
    addBtn: {
      width: 44, height: 44, borderRadius: Radii.pill,
      backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center',
    },
    addBtnText: { fontSize: 20, fontFamily: FontFamily.semiBold, color: C.primary },
    scrollContent: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xl, gap: Spacing.lg },
    emptyState: { alignItems: 'center', paddingTop: 60, paddingHorizontal: Spacing.lg },
    emptyTitle: { ...Typography.subheading, color: C.inkDark, marginBottom: Spacing.xs, textAlign: 'center' },
    emptyBody: { ...Typography.body, color: C.ink2, textAlign: 'center', marginBottom: Spacing.lg },
    emptyCta: {
      backgroundColor: C.primary, paddingVertical: 14, paddingHorizontal: Spacing.xl,
      borderRadius: Radii.pill,
    },
    emptyCtaText: { ...Typography.bodyStrong, color: C.white },
    pastSection: { gap: Spacing.sm },
    sectionLabel: { ...Typography.sectionLabel, color: C.ink2 },
    pastCard: {
      backgroundColor: C.surface, borderRadius: Radii.lg, ...Shadows.light,
    },
    pastRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: Spacing.md, paddingVertical: Spacing.md,
    },
    pastRowBorder: { borderBottomWidth: 1, borderBottomColor: C.line },
    pastName: { ...Typography.body, color: C.inkDark, flex: 1, marginRight: Spacing.sm },
    pastStatus: { ...Typography.caption, fontFamily: FontFamily.semiBold },
  });
}
