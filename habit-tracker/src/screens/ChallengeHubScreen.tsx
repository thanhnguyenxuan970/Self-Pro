import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Toast from 'react-native-toast-message';
import { AppColors, FontFamily, Radii, Shadows, Spacing, Typography } from '../config/theme';
import { useScreenCommons } from '../hooks/useScreenCommons';
import { useActiveChallenges, useChallengeHistory, useChallengeRollover, useDeleteChallenge, useLogChallengeDay, useRestartChallenge } from '../queries/useChallenge';
import { useTodayTasks } from '../queries/useToday';
import { requestAddActivity } from '../hooks/useAddActivityIntent';
import { challengeDate, isAtRisk } from '../lib/challenge';
import { ChallengeCard } from '../components/ChallengeCard';
import { ChallengeStatusPill } from '../components/ChallengeStatusPill';
import { useSelectionMode } from '../hooks/useSelectionMode';
import { challengeHubViewState } from '../utils/challengeHub';

export function ChallengeHubScreen() {
  const { userId, colors, t, styles } = useScreenCommons(makeStyles);
  const navigation = useNavigation();
  const { data: activeChallenges = [], isLoading: activeLoading } = useActiveChallenges(userId);
  const { data: history = [], isLoading: historyLoading } = useChallengeHistory(userId);
  const { data: tasks = [] } = useTodayTasks(userId);
  const rollover = useChallengeRollover(userId);
  const restartChallenge = useRestartChallenge(userId);
  const deleteChallenges = useDeleteChallenge(userId);
  const logDay = useLogChallengeDay(userId);
  const { selectionMode, selectedIds, enterSelection, toggleSelect, selectAll, cancelSelection } = useSelectionMode(history);
  const activeChallengeIds = activeChallenges.map(challenge => challenge.id).join(',');
  const today = challengeDate();
  // Tracked locally rather than off logDay.isPending/variables: logDay is one shared mutation
  // instance for every card in the list, so with two active challenges, tapping card B's Log
  // while card A's is still in flight would flip logDay.variables to B and make A's button look
  // idle again before A's own request has actually resolved.
  const [loggingId, setLoggingId] = useState<number | null>(null);
  const openActiveChallenge = useCallback((challengeId: number) => {
    (navigation as any).navigate('ChallengeDetail', { challengeId });
  }, [navigation]);

  async function handleLog(challengeId: number, taskTypeId: number | null) {
    // A linked challenge auto-completes from activity_log (see logChallengeDayForRow) — logging it
    // "for real" means logging the linked task itself, same branch ChallengeDetailScreen's sticky
    // CTA takes, not the manual-challenge mutation below (which is a no-op for a linked challenge).
    if (taskTypeId != null) {
      const linkedTaskName = tasks.find(task => task.id === taskTypeId)?.name;
      if (linkedTaskName != null) {
        requestAddActivity({ name: linkedTaskName, taskTypeId });
      } else {
        Toast.show({ type: 'error', text1: t.challengeLogLinkedTaskMissing, visibilityTime: 3500 });
      }
      return;
    }
    setLoggingId(challengeId);
    try {
      await logDay.mutateAsync(challengeId);
    } catch {
      // ALREADY_LOGGED_TODAY / NO_ACTIVE_CHALLENGE — button reflects the refreshed loggedToday state
    } finally {
      setLoggingId(null);
    }
  }

  function confirmDelete(ids: number[]) {
    Alert.alert(
      t.challengeDeleteTitle,
      ids.length === 1 ? t.challengeDeleteMsg : t.challengeDeleteNItems(ids.length),
      [
        { text: t.cancel, style: 'cancel' },
        {
          text: t.delete,
          style: 'destructive',
          onPress: () => deleteChallenges.mutateAsync(ids)
            .then(cancelSelection)
            .catch(() => Alert.alert(t.error, t.challengeDeleteFailed)),
        },
      ],
    );
  }

  useEffect(() => {
    if (activeChallengeIds) rollover.mutate();
    // Run when the active set first becomes available or its IDs change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChallengeIds]);

  // A native header (RootNavigator's modalHeaderOptions) replaced this screen's old
  // headerShown:false + hand-rolled back button, which left no back affordance beyond a
  // small unicode arrow below Android 14's predictive-back gesture. The "+" create action
  // now rides the header instead, matching ChallengeDetailScreen's headerRight pattern.
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={() => navigation.navigate('CreateChallenge' as never)}
          style={styles.headerAddButton}
          activeOpacity={0.8}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel={t.challengeCreateCta}
        >
          <Text style={styles.headerAddText}>＋</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, styles, t]);

  const isLoading = activeLoading || historyLoading;
  const monthFmt = useMemo(() => new Intl.DateTimeFormat(t.timeLocale, { month: 'short' }), [t.timeLocale]);
  const month = (date: string) => monthFmt.format(new Date(`${date}T00:00:00`)).replace('.', '');

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.loadingBox}><ActivityIndicator color={colors.primary} /></View>
      </SafeAreaView>
    );
  }

  const viewState = challengeHubViewState(activeChallenges.length > 0, history.length);
  const doneHistory = history.filter(h => h.status === 'done');
  const failedHistory = history.filter(h => h.status === 'failed');

  function renderHistoryRow(h: (typeof history)[number], i: number, total: number) {
    const historyMetaText = h.status === 'done'
      ? h.mode === 'weekly'
        ? t.challengeHistoryWeeklyDoneMeta(h.weekly_target ?? 0, h.total_weeks ?? 0, month(h.start_date))
        : t.challengeHistoryDoneMeta(h.target_days, month(h.start_date))
      : h.mode === 'weekly'
        ? t.challengeHistoryResetWeek(Math.ceil((h.reset_day ?? 0) / 7))
        : t.challengeHistoryReset(h.reset_day ?? 0);
    return (
      <View
        key={h.id}
        style={[styles.pastRow, i < total - 1 && styles.pastRowBorder, selectedIds.has(h.id) && styles.pastRowSelected]}
      >
        <TouchableOpacity
          style={styles.historyOpenButton}
          onPress={() => selectionMode ? toggleSelect(h.id) : (navigation as any).navigate('ChallengeDetail', { challengeId: h.id })}
          onLongPress={() => enterSelection(h.id)}
          delayLongPress={300}
          activeOpacity={0.7}
          accessibilityRole={selectionMode ? 'checkbox' : 'button'}
          accessibilityLabel={`${h.name}. ${historyMetaText}`}
          accessibilityState={selectionMode ? { checked: selectedIds.has(h.id) } : undefined}
        >
          {selectionMode && (
            <View style={[styles.checkbox, selectedIds.has(h.id) && styles.checkboxSelected]}>
              {selectedIds.has(h.id) && <Text style={styles.checkmark}>✓</Text>}
            </View>
          )}
          <View style={[styles.historyIcon, h.status === 'done' ? styles.doneIcon : styles.failedIcon]}>
            <Text>{h.status === 'done' ? '🏅' : '🧹'}</Text>
          </View>
          <View style={styles.historyCopy}>
            <Text style={styles.pastName} numberOfLines={1}>{h.name}</Text>
            <Text style={styles.historyMeta} numberOfLines={1}>{historyMetaText}</Text>
          </View>
        </TouchableOpacity>
        {!selectionMode && (
          <View style={styles.pastRowStatus}>
            <ChallengeStatusPill status={h.status === 'done' ? 'done' : 'failed'} />
            {h.status === 'failed' && (
              <TouchableOpacity
                onPress={async () => {
                  try {
                    const { id: challengeId, notificationDenied } = await restartChallenge.mutateAsync(h.id);
                    if (notificationDenied) {
                      Toast.show({ type: 'error', text1: t.reminderScheduleFailed, visibilityTime: 3500 });
                    }
                    (navigation as any).navigate('ChallengeDetail', { challengeId });
                  } catch (e: any) {
                    Alert.alert(t.error, e?.message === 'LINKED_TASK_ARCHIVED' ? t.challengeRestartLinkedTaskArchived : t.challengeRestartFailed);
                  }
                }}
                disabled={restartChallenge.isPending}
                style={[styles.retryButton, restartChallenge.isPending && styles.retryDisabled]}
                accessibilityRole="button"
                accessibilityLabel={t.challengeRestartCta}
              >
                <Text style={styles.retryButtonText} numberOfLines={1}>{t.challengeRestartCta}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
        {!selectionMode && (
          <TouchableOpacity
            onPress={() => confirmDelete([h.id])}
            disabled={deleteChallenges.isPending}
            style={styles.historyDeleteButton}
            hitSlop={4}
            accessibilityRole="button"
            accessibilityLabel={t.challengeDeleteCta}
          >
            <Text style={styles.historyDeleteIcon}>×</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {viewState === 'empty' ? (
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
            {viewState === 'history-only' && (
              <View style={styles.historyOnlyState}>
                <Text style={styles.emptyTitle}>{t.challengeNextTitle}</Text>
                <Text style={styles.emptyBody}>{t.challengeNextBody}</Text>
                <TouchableOpacity
                  style={styles.emptyCta}
                  onPress={() => navigation.navigate('CreateChallenge' as never)}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel={t.challengeCreateCta}
                >
                  <Text style={styles.emptyCtaText}>{t.challengeCreateCta}</Text>
                </TouchableOpacity>
              </View>
            )}
            {activeChallenges.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionLabel}>{t.challengeActiveSection}</Text>
                  <Text style={styles.sectionCount}>{activeChallenges.length}</Text>
                </View>
                {activeChallenges.map(active => (
                  <ChallengeCard
                    key={active.id}
                    name={active.name}
                    targetDays={active.targetDays}
                    dayIndex={active.dayIndex}
                    streak={active.streak}
                    atRisk={isAtRisk(active.mode, active.freezesLeft)}
                    freezesLeft={active.freezesLeft}
                    loggedToday={active.loggedToday}
                    startDate={active.startDate}
                    log={active.log}
                    today={today}
                    onPress={() => openActiveChallenge(active.id)}
                    onLog={() => handleLog(active.id, active.taskTypeId)}
                    logging={loggingId === active.id}
                  />
                ))}
              </View>
            )}

            {history.length > 0 && (
              <View style={styles.section}>
                {selectionMode && (
                  <View style={styles.historyActions}>
                    <TouchableOpacity onPress={selectAll} style={styles.historyAction} accessibilityRole="button" accessibilityLabel={t.all}>
                      <Text style={styles.historyActionText}>{t.all}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => confirmDelete(Array.from(selectedIds))}
                      style={styles.historyAction}
                      disabled={selectedIds.size === 0 || deleteChallenges.isPending}
                      accessibilityRole="button"
                      accessibilityLabel={t.deleteCount(selectedIds.size)}
                    >
                      <Text style={styles.historyDeleteText}>{t.deleteCount(selectedIds.size)}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={cancelSelection} style={styles.historyAction} accessibilityRole="button" accessibilityLabel={t.cancel}>
                      <Text style={styles.historyActionText}>{t.cancel}</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {doneHistory.length > 0 && (
                  <View style={styles.historySubsection}>
                    <View style={styles.sectionHeaderRow}>
                      <Text style={styles.sectionLabel}>{t.challengeCompletedSection}</Text>
                      <Text style={styles.sectionCount}>{doneHistory.length}</Text>
                    </View>
                    <View style={styles.pastCard}>
                      {doneHistory.map((h, i) => renderHistoryRow(h, i, doneHistory.length))}
                    </View>
                  </View>
                )}

                {failedHistory.length > 0 && (
                  <View style={styles.historySubsection}>
                    <View style={styles.sectionHeaderRow}>
                      <Text style={styles.sectionLabel}>{t.challengeFailedSection}</Text>
                      <Text style={styles.sectionCount}>{failedHistory.length}</Text>
                    </View>
                    <View style={[styles.pastCard, styles.pastCardSunken]}>
                      {failedHistory.map((h, i) => renderHistoryRow(h, i, failedHistory.length))}
                    </View>
                  </View>
                )}
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
    headerAddButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
    headerAddText: { ...Typography.title, color: C.primaryText, fontFamily: FontFamily.bold, lineHeight: 24 },
    emptyState: { alignItems: 'center', paddingTop: 60, paddingHorizontal: Spacing.lg },
    emptyTitle: { ...Typography.subheading, color: C.inkDark, marginBottom: Spacing.xs, textAlign: 'center' },
    emptyBody: { ...Typography.body, color: C.ink2, textAlign: 'center', marginBottom: Spacing.lg },
    emptyCta: { backgroundColor: C.primary, paddingVertical: 14, paddingHorizontal: Spacing.xl, borderRadius: Radii.pill },
    emptyCtaText: { ...Typography.bodyStrong, color: C.onAccent },
    historyOnlyState: { alignItems: 'center', paddingTop: Spacing.sm, paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xs },
    section: { gap: Spacing.lg },
    historySubsection: { gap: Spacing.sm },
    sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
    sectionLabel: { ...Typography.sectionLabel, color: C.ink2 },
    sectionCount: { ...Typography.caption, color: C.faint },
    historyActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
    historyAction: { minHeight: 48, justifyContent: 'center', paddingHorizontal: Spacing.xs },
    historyActionText: { ...Typography.caption, color: C.ink2, fontFamily: FontFamily.semiBold },
    historyDeleteText: { ...Typography.caption, color: C.dangerText, fontFamily: FontFamily.semiBold },
    pastCard: { backgroundColor: C.surface, borderRadius: Radii.lg, ...Shadows.light },
    pastCardSunken: { backgroundColor: C.surface2, shadowOpacity: 0, elevation: 0 },
    pastRow: { position: 'relative', flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, paddingRight: 48 },
    pastRowBorder: { borderBottomWidth: 1, borderBottomColor: C.line },
    pastRowSelected: { backgroundColor: C.primarySoft },
    historyOpenButton: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', marginVertical: -5 },
    historyIcon: { width: 34, height: 34, borderRadius: Radii.sm, alignItems: 'center', justifyContent: 'center', marginRight: Spacing.sm },
    doneIcon: { backgroundColor: C.starSoft },
    failedIcon: { backgroundColor: C.dangerSoft },
    historyCopy: { flex: 1, marginRight: Spacing.sm },
    pastName: { ...Typography.bodyStrong, color: C.inkDark },
    historyMeta: { ...Typography.caption, color: C.muted },
    pastRowStatus: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
    retryButton: { minHeight: 48, justifyContent: 'center' },
    retryButtonText: { ...Typography.caption, fontFamily: FontFamily.semiBold, color: C.primaryText },
    retryDisabled: { opacity: 0.55 },
    historyDeleteButton: { position: 'absolute', top: 4, right: 4, width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
    historyDeleteIcon: { fontSize: 24, lineHeight: 24, color: C.muted, fontFamily: FontFamily.regular },
    checkbox: { width: 22, height: 22, borderRadius: Radii.sm, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center', marginRight: Spacing.sm },
    checkboxSelected: { backgroundColor: C.primary, borderColor: C.primary },
    checkmark: { color: C.onAccent, fontFamily: FontFamily.bold },
  });
}
