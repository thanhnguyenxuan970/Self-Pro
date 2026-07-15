import React, { useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { AppColors, FontFamily, Radii, Shadows, Spacing, Typography } from '../config/theme';
import { useScreenCommons } from '../hooks/useScreenCommons';
import { useActiveChallenge, useChallengeHistory, useChallengeRollover, useRestartChallenge } from '../queries/useChallenge';
import { ChallengeCard } from '../components/ChallengeCard';

export function ChallengeHubScreen() {
  const { userId, colors, t, styles } = useScreenCommons(makeStyles);
  const navigation = useNavigation();
  const { data: active, isLoading: activeLoading } = useActiveChallenge(userId);
  const { data: history = [], isLoading: historyLoading } = useChallengeHistory(userId);
  const rollover = useChallengeRollover(userId);
  const restartChallenge = useRestartChallenge(userId);

  useEffect(() => {
    if (active) rollover.mutate();
    // Run once per mount to catch missed days, not on every active refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isLoading = activeLoading || historyLoading;
  const month = (date: string) => new Intl.DateTimeFormat(t.timeLocale, { month: 'short' })
    .format(new Date(`${date}T00:00:00`)).replace('.', '');

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.loadingBox}><ActivityIndicator color={colors.primary} /></View>
      </SafeAreaView>
    );
  }

  const showEmpty = !active && history.length === 0;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.canGoBack() ? navigation.goBack() : navigation.navigate('MainTabs' as never)}
            style={styles.backButton}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={t.back}
          >
            <Text style={styles.backButtonText}>←</Text>
          </TouchableOpacity>
          <View>
            <Text style={styles.brand}>HABI</Text>
            <Text style={styles.title}>{t.screenChallengeHub}</Text>
          </View>
          <TouchableOpacity
            onPress={() => navigation.navigate('CreateChallenge' as never)}
            style={styles.addButton}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={t.challengeCreateCta}
          >
            <Text style={styles.addButtonText}>＋</Text>
          </TouchableOpacity>
        </View>

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
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>{t.challengeActiveSection}</Text>
                <ChallengeCard
                  name={active.name}
                  targetDays={active.targetDays}
                  dayIndex={active.dayIndex}
                  fraction={active.fraction}
                  streak={active.streak}
                  onPress={() => (navigation as any).navigate('ChallengeDetail', { challengeId: active.id })}
                />
              </View>
            )}

            {history.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>{t.challengeCompletedSection}</Text>
                <View style={styles.pastCard}>
                  {history.map((h, i) => (
                    <View
                      key={h.id}
                      style={[styles.pastRow, i < history.length - 1 && styles.pastRowBorder]}
                    >
                      <TouchableOpacity
                        style={styles.historyOpenButton}
                        onPress={() => (navigation as any).navigate('ChallengeDetail', { challengeId: h.id })}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityLabel={h.name}
                      >
                        <View style={[styles.historyIcon, h.status === 'done' ? styles.doneIcon : styles.failedIcon]}>
                          <Text>{h.status === 'done' ? '🏅' : '🧹'}</Text>
                        </View>
                        <View style={styles.historyCopy}>
                          <Text style={styles.pastName} numberOfLines={1}>{h.name}</Text>
                          <Text style={styles.historyMeta} numberOfLines={1}>
                            {h.status === 'done'
                              ? h.mode === 'weekly'
                                ? t.challengeHistoryWeeklyDoneMeta(h.weekly_target ?? 0, h.total_weeks ?? 0, month(h.start_date))
                                : t.challengeHistoryDoneMeta(h.target_days, month(h.start_date))
                              : h.mode === 'weekly'
                                ? t.challengeHistoryResetWeek(Math.ceil((h.reset_day ?? 0) / 7))
                                : t.challengeHistoryReset(h.reset_day ?? 0)}
                          </Text>
                        </View>
                      </TouchableOpacity>
                      {h.status === 'done' ? (
                        <Text style={[styles.pastStatus, { color: colors.primary }]} numberOfLines={1}>{t.challengeHistoryDone}</Text>
                      ) : (
                        <TouchableOpacity
                          onPress={async () => {
                            const challengeId = await restartChallenge.mutateAsync(h.id);
                            (navigation as any).navigate('ChallengeDetail', { challengeId });
                          }}
                          disabled={active != null || restartChallenge.isPending}
                          style={[styles.retryButton, (active != null || restartChallenge.isPending) && styles.retryDisabled]}
                          accessibilityRole="button"
                          accessibilityLabel={t.challengeRestartCta}
                        >
                          <Text style={[styles.pastStatus, { color: colors.primary }]} numberOfLines={1}>{t.challengeRestartCta}</Text>
                        </TouchableOpacity>
                      )}
                    </View>
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
    scrollContent: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, paddingBottom: Spacing.xl, gap: Spacing.lg },
    header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    backButtonText: { ...Typography.title, color: C.inkDark },
    brand: { ...Typography.caption, color: C.muted, fontFamily: FontFamily.bold, letterSpacing: 0.8 },
    title: { ...Typography.title, color: C.inkDark, fontSize: 28, lineHeight: 34 },
    addButton: { width: 44, height: 44, marginLeft: 'auto', borderRadius: Radii.md, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
    addButtonText: { color: C.onAccent, fontSize: 34, lineHeight: 38, fontFamily: FontFamily.regular },
    emptyState: { alignItems: 'center', paddingTop: 60, paddingHorizontal: Spacing.lg },
    emptyTitle: { ...Typography.subheading, color: C.inkDark, marginBottom: Spacing.xs, textAlign: 'center' },
    emptyBody: { ...Typography.body, color: C.ink2, textAlign: 'center', marginBottom: Spacing.lg },
    emptyCta: { backgroundColor: C.primary, paddingVertical: 14, paddingHorizontal: Spacing.xl, borderRadius: Radii.pill },
    emptyCtaText: { ...Typography.bodyStrong, color: C.white },
    section: { gap: Spacing.sm },
    sectionLabel: { ...Typography.sectionLabel, color: C.ink2, fontFamily: FontFamily.bold, letterSpacing: 0.3 },
    pastCard: { backgroundColor: C.surface, borderRadius: Radii.lg, ...Shadows.light },
    pastRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: Spacing.md },
    pastRowBorder: { borderBottomWidth: 1, borderBottomColor: C.line },
    historyOpenButton: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', marginVertical: -5 },
    historyIcon: { width: 34, height: 34, borderRadius: Radii.sm, alignItems: 'center', justifyContent: 'center', marginRight: Spacing.sm },
    doneIcon: { backgroundColor: C.starSoft },
    failedIcon: { backgroundColor: C.surface2 },
    historyCopy: { flex: 1, marginRight: Spacing.sm },
    pastName: { ...Typography.bodyStrong, color: C.inkDark },
    historyMeta: { ...Typography.caption, color: C.muted },
    pastStatus: { ...Typography.caption, fontFamily: FontFamily.semiBold },
    retryButton: { minHeight: 44, justifyContent: 'center' },
    retryDisabled: { opacity: 0.55 },
  });
}
